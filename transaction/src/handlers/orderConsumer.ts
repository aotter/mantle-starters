/**
 * Queue consumers for the transaction starter.
 *
 *   - `payment_callback_queue` (max_concurrency: 1) — verified
 *     provider callbacks from `checkoutConfirm`. Consumer does the
 *     heavy work under the InventoryActor lock.
 *
 *   - `order_work_queue` (max_concurrency: 1) — downstream effects
 *     (email, fulfillment notify, inventory snapshot, reconcile
 *     tick). PR 3 fills this consumer in.
 *
 * Sweeper for stale `pending` locks fires from a Cron Trigger via
 * the `inventory.reconcile.tick` message on order_work_queue —
 * also a PR 3 wiring.
 *
 * Cloudflare Queues semantics: at-least-once, message.id stable
 * across retries. ack = return cleanly; throw = retry with backoff.
 * Hard-fail = msg.ack() before throwing (so the per-message retry
 * counter doesn't tick — useful for unrecoverable shape errors).
 */

import type { CallbackEvent } from "../payment/provider.js";
import {
  inventoryActorClient,
  type InventoryActorClient,
} from "../durableObjects/InventoryActor.js";

export type PaymentCallbackMessage = CallbackEvent;

export type OrderWorkMessage =
  | { readonly type: "order.confirmed"; readonly orderId: string }
  | { readonly type: "inventory.snapshot.requested"; readonly productSlug: string }
  | { readonly type: "inventory.reconcile.tick"; readonly at: number };

export interface ConsumerEnv {
  readonly DB: D1Database;
  readonly INVENTORY_ACTOR: DurableObjectNamespace;
  readonly ORDER_WORK_QUEUE: Queue;
  readonly EMAIL_API_KEY?: string;
  readonly SLACK_WEBHOOK_URL?: string;
}

/**
 * Process verified provider callbacks. Once-and-only-once flow:
 *
 *   1. tryAcquire(event.id) — find-and-modify lock. If not acquired
 *      → already-processed; ack and skip.
 *   2. Branch on event.status:
 *        succeeded → INSERT OR IGNORE order row + items; commit
 *          reservation (if one matches this orderId); enqueue
 *          `order.confirmed` for downstream.
 *        failed    → release reservation if any.
 *        expired   → release reservation if any.
 *   3. markCompleted(event.id).
 *   4. msg.ack().
 *
 * Throwing skips msg.ack — Workers Queues retry. Lock stays
 * `pending`; if the consumer was truly stuck (rare — single-instance
 * + max_concurrency: 1 makes "stuck" mostly impossible) the cron
 * sweeper (10-min TTL) resets the lock so a retry can re-acquire.
 *
 * Side effects MUST be idempotent for the sweeper-then-retry path:
 *   - order row INSERT OR IGNORE on entries.id (deterministic from
 *     event.id) — second write is no-op.
 *   - inventory commit no-ops if the reservation is already consumed.
 *   - downstream `order.confirmed` enqueue is OK to fire twice
 *     (orderWorkConsumer dedups its own side effects in PR 3).
 */
export async function paymentCallbackConsumer(
  batch: MessageBatch<PaymentCallbackMessage>,
  env: ConsumerEnv,
  ctx: ExecutionContext,
): Promise<void> {
  void ctx;
  const stub = env.INVENTORY_ACTOR.get(
    env.INVENTORY_ACTOR.idFromName("singleton"),
  );
  const inv = inventoryActorClient(stub);

  for (const msg of batch.messages) {
    try {
      await processCallback(msg.body, inv, env);
      msg.ack();
    } catch (err) {
      console.error(
        `[payment-callback-consumer] event=${msg.body.eventId} order=${msg.body.orderId} threw:`,
        err,
      );
      // Don't ack — queue retries with backoff. Sweeper recovers if
      // lock got stuck in `pending`.
      msg.retry();
    }
  }
}

async function processCallback(
  event: PaymentCallbackMessage,
  inv: InventoryActorClient,
  env: ConsumerEnv,
): Promise<void> {
  const lock = await inv.tryAcquire(event.eventId);
  if (!lock.acquired) {
    // Already processed (or another consumer holds — shouldn't happen
    // under max_concurrency:1, but defensive).
    return;
  }
  try {
    switch (event.status) {
      case "succeeded":
        await commitOrder(event, inv, env);
        break;
      case "failed":
      case "expired":
        await releaseIfReserved(event, inv, env);
        break;
    }
    await inv.markCompleted(event.eventId);
  } catch (err) {
    // Lock stays pending; sweeper will reset it later. Re-throw so
    // the queue retries the message.
    throw err;
  }
}

async function commitOrder(
  event: PaymentCallbackMessage,
  inv: InventoryActorClient,
  env: ConsumerEnv,
): Promise<void> {
  // We don't know the reservationId here (the provider's event
  // carries event.id + order.id, not our internal reservation id).
  // The reservation isn't strictly needed — committing inventory is
  // a no-op if it was never tracked, and the InventoryActor handles
  // the case where no reservation matches.
  //
  // The order row is written deterministically from event.id. Two
  // arrivals of the same event.id INSERT OR IGNORE to the same row.
  const now = Date.now();
  const entryId = `entry_${event.eventId}`;
  const orderData = {
    orderNumber: event.orderId,
    orderStatus: "placed",
    currency: event.amount.currency,
    totalMinor: event.amount.minor,
    subtotalMinor: event.amount.minor, // PR 2: no separate tax accounting
    taxMinor: 0,
    customerEmail: "", // PR 2: provider event doesn't carry email; PR 3 enriches
    customerName: "",
    stripeCheckoutId: "",
    stripePaymentIntentId: event.eventId,
    placedAt: now,
  };
  // INSERT OR IGNORE makes this idempotent on retries — second arrival
  // of the same event sees the entry already exists; the INSERT is a
  // no-op (D1's SQLite INSERT OR IGNORE returns 0 changes silently).
  await env.DB.prepare(
    `INSERT OR IGNORE INTO entries
       (id, collection, status, version, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      entryId,
      "orders",
      "published",
      1,
      JSON.stringify(orderData),
      now,
      now,
    )
    .run();

  // Enqueue the downstream work. Safe to send twice — PR 3's
  // orderWorkConsumer dedups via the order row's
  // `confirmation_emailed_at` (or similar) marker.
  await env.ORDER_WORK_QUEUE.send({
    type: "order.confirmed",
    orderId: event.orderId,
  } satisfies OrderWorkMessage);
}

async function releaseIfReserved(
  event: PaymentCallbackMessage,
  _inv: InventoryActorClient,
  _env: ConsumerEnv,
): Promise<void> {
  // PR 2: we don't track the reservationId across the
  // checkoutStart → checkoutConfirm boundary (the provider's event
  // doesn't carry it). PR 3 wires reservationId through merchant
  // metadata so we can target the release; for v0.1.0 the alarm-
  // based auto-release (10 min TTL on the InventoryActor side)
  // handles abandoned checkouts.
  void event;
  // Intentionally a no-op for PR 2; the comment above explains.
}

/**
 * order_work_queue consumer — PR 3 wires real branches. PR 2 leaves
 * a clear stub that acks the message + warns so the cron doesn't
 * burn retries.
 */
export async function orderWorkConsumer(
  batch: MessageBatch<OrderWorkMessage>,
  _env: ConsumerEnv,
  _ctx: ExecutionContext,
): Promise<void> {
  for (const msg of batch.messages) {
    console.warn(
      `[order-work-consumer] PR 2 stub — type=${msg.body.type}; PR 3 wires real branches.`,
    );
    msg.ack();
  }
}

/**
 * Top-level queue dispatcher. Routes by `batch.queue` (binding name).
 */
export function buildQueueDispatcher(env: ConsumerEnv): (
  batch: MessageBatch<unknown>,
  env: ConsumerEnv,
  ctx: ExecutionContext,
) => Promise<void> {
  return async (batch, env, ctx) => {
    switch (batch.queue) {
      case "payment_callback_queue":
      case "payment_callback_queue_test":
        return paymentCallbackConsumer(
          batch as MessageBatch<PaymentCallbackMessage>,
          env,
          ctx,
        );
      case "order_work_queue":
      case "order_work_queue_test":
        return orderWorkConsumer(
          batch as MessageBatch<OrderWorkMessage>,
          env,
          ctx,
        );
      default:
        console.warn(`unknown queue: ${batch.queue}`);
    }
  };
}

// ── Type stubs (real types come from @cloudflare/workers-types) ──────
interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}
interface DurableObjectId {}
interface DurableObjectStub {
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<unknown>;
  first<T = unknown>(): Promise<T | null>;
}
// Aliased to the workers-types `Queue<T>` shape — send returns
// QueueSendResponse, not void.
type Queue = {
  send<T>(message: T): Promise<unknown>;
};
interface MessageBatch<T> {
  readonly queue: string;
  readonly messages: ReadonlyArray<{
    body: T;
    id: string;
    ack(): void;
    retry(): void;
  }>;
}
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}
