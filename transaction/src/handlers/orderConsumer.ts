/**
 * Queue consumers for the transaction starter.
 *
 *   - `payment_callback_queue` (max_concurrency: 1) — verified
 *     provider callbacks from `checkoutConfirm`. Consumer does the
 *     heavy work under the InventoryActor lock.
 *
 *   - `order_work_queue` (max_concurrency: 1) — downstream effects
 *     (email, fulfillment notify, inventory snapshot) plus the
 *     cron-driven `inventory.reconcile.tick` (sweeper + per-product
 *     snapshot fan-out).
 *
 * Cloudflare Queues semantics: at-least-once, message.id stable
 * across retries. ack = return cleanly; throw = retry with backoff.
 * Hard-fail = msg.ack() before throwing (so the per-message retry
 * counter doesn't tick — useful for unrecoverable shape errors).
 */

import type { CallbackEvent } from "../payment/provider.js";
import {
  getInventoryActor,
  inventoryActorClient,
  type InventoryActorClient,
} from "../durableObjects/InventoryActor.js";
import { upsertInventorySnapshot } from "./snapshotInventory.js";

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
    if (lock.alreadyCompleted) {
      // Work already finished; nothing to do. Outer loop acks.
      return;
    }
    // `pending` state — a previous attempt crashed mid-work, OR
    // the sweeper hasn't cleared a stale lock yet. Falling through
    // and re-doing the side effects is SAFE because they're idempotent:
    //   - commitOrder uses INSERT OR IGNORE on a deterministic
    //     entries.id derived from event.orderId
    //   - releaseIfReserved is a no-op (PR 2 doesn't carry
    //     reservationId through provider metadata)
    //   - the downstream ORDER_WORK_QUEUE.send is OK to fire twice
    //     (orderWorkConsumer in PR 3 dedups its own work)
    // After re-doing the work we re-call markCompleted; the second
    // write is overwrite-same-state (storage.put is unconditional),
    // which closes the loop.
    console.warn(
      `[payment-callback-consumer] event=${event.eventId} lock pending — retrying work (previous attempt likely crashed)`,
    );
  }
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
  // The order row's id is derived from event.orderId (NOT event.id)
  // so:
  //   - Two arrivals of the SAME event.id → INSERT OR IGNORE same
  //     entry, no dupe.
  //   - Two DIFFERENT events for the same order (e.g. a retried
  //     webhook with a fresh event.id, same payment_intent / orderId)
  //     → still no dupe; the deterministic id deduplicates at the
  //     order level, not the event level.
  //   - This also enables direct getEntry lookup in readOrderStatus
  //     and checkoutReturn (no 1000-row scan).
  const now = Date.now();
  const entryId = orderEntryId(event.orderId);
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

/**
 * Build the deterministic D1 entry id for an order. Used by
 * `commitOrder` to write + by `readOrderStatus` / `checkoutReturn`
 * to look up. Keeping the rule in one place — if it changes, every
 * site that does a direct lookup needs to follow.
 */
export function orderEntryId(orderId: string): string {
  return `entry_${orderId}`;
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
 * order_work_queue consumer — real branches per message type:
 *
 *   - `order.confirmed`: send the confirmation email + fulfillment
 *     notify; mark `confirmation_emailed_at` on the order row to dedup.
 *   - `inventory.snapshot.requested`: InventoryActor.snapshot →
 *     upsert inventory_snapshots row in D1 (so staff Views see fresh
 *     totals).
 *   - `inventory.reconcile.tick`: cron-driven. Sweeps stale `pending`
 *     locks (10-min TTL) and fans out one snapshot.requested per
 *     tracked product.
 *
 * Throwing skips msg.ack — the queue retries per wrangler.toml
 * (30 attempts × 30s delay). Terminal failures land in
 * `order_work_dlq` for observability.
 */
export async function orderWorkConsumer(
  batch: MessageBatch<OrderWorkMessage>,
  env: ConsumerEnv,
  ctx: ExecutionContext,
): Promise<void> {
  void ctx;
  const inv = getInventoryActor(env);

  for (const msg of batch.messages) {
    try {
      switch (msg.body.type) {
        case "order.confirmed":
          await handleOrderConfirmed(msg.body.orderId, env);
          break;
        case "inventory.snapshot.requested":
          await handleSnapshotRequested(msg.body.productSlug, inv, env);
          break;
        case "inventory.reconcile.tick":
          await handleReconcileTick(inv, env);
          break;
        default: {
          // Compile-time exhaustiveness: adding a fourth message type
          // without updating this switch becomes a type error here.
          // Runtime fall-through (e.g. a producer typo) routes to DLQ
          // via retry instead of silently ack-and-drop.
          const _exhaustive: never = msg.body;
          throw new Error(
            `[order-work-consumer] unknown message type: ${JSON.stringify(_exhaustive)}`,
          );
        }
      }
      msg.ack();
    } catch (err) {
      console.error(`[order-work-consumer] type=${msg.body.type} threw:`, err);
      msg.retry();
    }
  }
}

interface StoredOrderData {
  readonly confirmation_emailed_at?: number;
  readonly customerEmail?: string;
  readonly totalMinor?: number;
  readonly currency?: string;
}

async function handleOrderConfirmed(
  orderId: string,
  env: ConsumerEnv,
): Promise<void> {
  const row = await env.DB.prepare(
    `SELECT data FROM entries WHERE id = ? AND collection = ? LIMIT 1`,
  )
    .bind(orderEntryId(orderId), "orders")
    .first<{ data: string } | null>();
  if (!row) {
    // Order row not yet committed — shouldn't happen with
    // max_concurrency:1 + per-queue ordering, but the queue's
    // backoff handles the race if it does.
    throw new Error(`handleOrderConfirmed: order entry not found for ${orderId}; retry`);
  }
  const parsed = JSON.parse(row.data) as StoredOrderData;
  if (parsed.confirmation_emailed_at) {
    // Idempotent skip — duplicate message after the first run.
    return;
  }

  // v0.1 placeholder side effects: log + optional Slack webhook.
  // Real email integration is downstream of EMAIL_API_KEY + a
  // provider SDK; intentionally left to the adopter.
  console.log(
    `[order-work-consumer] order.confirmed orderId=${orderId} total=${parsed.totalMinor} ${parsed.currency}`,
  );
  if (env.SLACK_WEBHOOK_URL) {
    try {
      await fetch(env.SLACK_WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: `New order ${orderId}: ${parsed.totalMinor} ${parsed.currency}`,
        }),
      });
    } catch (err) {
      // Don't fail the whole message on Slack outages — that would
      // re-fire the order notification forever.
      console.warn(`[order-work-consumer] slack notify failed:`, err);
    }
  }

  const now = Date.now();
  const next = { ...parsed, confirmation_emailed_at: now };
  await env.DB.prepare(
    `UPDATE entries SET data = ?, updated_at = ? WHERE id = ? AND collection = ?`,
  )
    .bind(JSON.stringify(next), now, orderEntryId(orderId), "orders")
    .run();
}

async function handleSnapshotRequested(
  productSlug: string,
  inv: InventoryActorClient,
  env: ConsumerEnv,
): Promise<void> {
  const { available, reserved } = await inv.snapshot(productSlug);
  await upsertInventorySnapshot(env.DB, productSlug, available, reserved);
}

async function handleReconcileTick(
  inv: InventoryActorClient,
  env: ConsumerEnv,
): Promise<void> {
  // Sweep first: recover any `pending` locks past the 10-min TTL
  // (rare under max_concurrency:1; the queue's 30 × 30s retry
  // budget normally outlasts a stuck consumer).
  const swept = await inv.sweepStaleLocks();
  if (swept.resetCount > 0 || swept.gcCount > 0) {
    console.log(
      `[order-work-consumer] sweep: reset=${swept.resetCount} gc=${swept.gcCount}`,
    );
  }

  // Fan out one snapshot per tracked product. Untracked products
  // have no inventory state to snapshot.
  const rows = await env.DB.prepare(
    `SELECT data FROM entries WHERE collection = ? AND status = ?`,
  )
    .bind("products", "published")
    .all<{ data: string }>();
  for (const r of rows.results ?? []) {
    const p = JSON.parse(r.data) as { slug?: string; inventoryMode?: string };
    if (p.inventoryMode === "tracked" && p.slug) {
      await env.ORDER_WORK_QUEUE.send({
        type: "inventory.snapshot.requested",
        productSlug: p.slug,
      });
    }
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

