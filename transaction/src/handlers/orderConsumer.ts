/**
 * Queue consumers for the transaction starter.
 *
 *   - `payment-callback-queue` (max_concurrency: 1) — verified
 *     provider callbacks from `checkoutConfirm`. Consumer does the
 *     heavy work under the InventoryActor lock.
 *
 *   - `order-work-queue` (max_concurrency: 1) — downstream effects
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
import {
  deleteOrderCart,
  readOrderCart,
  type OrderCart,
} from "./orderCart.js";

export type PaymentCallbackMessage = CallbackEvent;

export type OrderWorkMessage =
  | { readonly type: "order.confirmed"; readonly orderId: string }
  | { readonly type: "inventory.snapshot.requested"; readonly productSlug: string }
  | { readonly type: "inventory.reconcile.tick"; readonly at: number };

/**
 * Persisted line item on the order row. `priceMinorAtPurchase` is the
 * snapshot of `priceMinor` from the cart stash at commit time — once
 * the order row is written it stays stable even if product price
 * changes later.
 */
export interface OrderLineItem {
  readonly productSlug: string;
  readonly qty: number;
  readonly priceMinorAtPurchase: number;
  readonly title?: string;
}

/**
 * Canonical shape of the `data` field on an `orders` collection entry.
 * Single source of truth — `commitOrder` writes it, `readOrderStatus`
 * + `handleOrderConfirmed` read subsets of it. Adding a field is one
 * place; all consumers see it via this interface.
 *
 * Optional everywhere because parsed D1 rows may legitimately predate
 * a schema change; readers fall back per-field.
 */
export interface OrderRowData {
  readonly orderNumber?: string;
  readonly orderStatus?: string;
  readonly currency?: string;
  readonly totalMinor?: number;
  readonly subtotalMinor?: number;
  readonly taxMinor?: number;
  readonly customerEmail?: string;
  readonly customerName?: string;
  readonly paymentProvider?: string;
  readonly paymentIntentId?: string;
  readonly items?: ReadonlyArray<OrderLineItem>;
  readonly placedAt?: number;
  readonly confirmation_emailed_at?: number;
}

/**
 * Typed wrapper around `queue.send()` — producers must pass an
 * `OrderWorkMessage`, so a typo'd `type` string is a compile error at
 * the call site instead of a silent runtime no-op. Pair with the
 * consumer's switch-default → DLQ for any malformed message that
 * slips in from outside the type system (e.g. an upstream worker).
 */
export async function sendOrderWork(
  queue: Queue,
  msg: OrderWorkMessage,
): Promise<void> {
  await queue.send(msg);
}

export interface ConsumerEnv {
  readonly DB: D1Database;
  readonly KV: KVNamespace;
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
 *     event.orderId) — second write is no-op.
 *   - inventory commit no-ops if the reservation is already consumed.
 *   - downstream `order.confirmed` enqueue is OK to fire twice
 *     (orderWorkConsumer dedups via confirmation_emailed_at).
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
    //   - inv.commit(orderId) + inv.release(orderId) are no-ops if
    //     the reservation is already gone
    //   - deleteOrderCart on KV is a no-op if the cart was already
    //     dropped by a prior attempt
    //   - the downstream ORDER_WORK_QUEUE.send is OK to fire twice
    //     (orderWorkConsumer dedups via confirmation_emailed_at)
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
  // Reads the checkoutStart cart stash from KV to write a full order
  // row (line items, customer email, subtotal). The provider's event
  // carries enough to do dedup (eventId) + amount validation, but the
  // line items + email need a server-side source — the KV stash IS
  // that source.
  //
  // Once-and-only-once guarantees compose:
  //   - tryAcquire(event.eventId) at the caller deduplicates webhook
  //     retries (different eventIds for the same orderId still hit
  //     INSERT OR IGNORE below).
  //   - INSERT OR IGNORE on the deterministic entries.id derived from
  //     event.orderId makes the order row write idempotent.
  //   - inv.commit(orderId) is idempotent (no-op if already
  //     committed).
  //   - deleteOrderCart at the end is also a no-op on second arrival.
  const cart = await readOrderCart(env.KV, event.orderId);
  const now = Date.now();
  const entryId = orderEntryId(event.orderId);
  const orderData = buildOrderRowData(event, cart, now);
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

  // inv.commit + deleteOrderCart are idempotent (no-op if the
  // reservation / stash were already cleared by a prior attempt or
  // by the 10-min reservation alarm). Untracked products carry no
  // reservation, so commit is also a no-op for them.
  await inv.commit(event.orderId);
  await deleteOrderCart(env.KV, event.orderId);

  // Safe to send twice — orderWorkConsumer dedups via the order
  // row's `confirmation_emailed_at` marker.
  await sendOrderWork(env.ORDER_WORK_QUEUE, {
    type: "order.confirmed",
    orderId: event.orderId,
  });
}

/**
 * Build the order row's `data` field. Pure function — splits out for
 * testability + so the cart-missing fallback path stays obvious.
 *
 * The cart can be missing in two cases:
 *   1. The KV TTL (7d) elapsed before the callback fired — possible
 *      for very-slow bank-transfer methods.
 *   2. The callback fired AFTER a prior successful commit (idempotent
 *      retry) — the first commit already deleted the stash.
 *
 * In case 1, we lose line-item granularity but still record the
 * payment + amount + customer email. In case 2, INSERT OR IGNORE
 * upstream means this `data` is never written. We don't distinguish
 * the cases here.
 *
 * NOTE: failed/expired callbacks do NOT delete the stash (see
 * `releaseIfReserved`). Stripe payment intents can transition through
 * `requires_payment_method` (a `failed`-shaped event) and back to
 * `succeeded` with a new event_id; we want the retry to still find
 * the cart so the eventual order row has line items.
 */
function buildOrderRowData(
  event: PaymentCallbackMessage,
  cart: OrderCart | null,
  now: number,
): OrderRowData {
  const items: OrderLineItem[] =
    cart?.items.map((i) => ({
      productSlug: i.productSlug,
      qty: i.qty,
      priceMinorAtPurchase: i.priceMinor,
      title: i.title,
    })) ?? [];
  return {
    orderNumber: event.orderId,
    orderStatus: "placed",
    currency: event.amount.currency,
    totalMinor: event.amount.minor,
    subtotalMinor: cart?.subtotalMinor ?? event.amount.minor,
    taxMinor: 0,
    customerEmail: cart?.customerEmail ?? event.customerEmail ?? "",
    customerName: "",
    paymentProvider: event.provider,
    paymentIntentId: event.paymentIntentId,
    items,
    placedAt: now,
  };
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
  inv: InventoryActorClient,
  _env: ConsumerEnv,
): Promise<void> {
  // Reservation is keyed by orderId (see InventoryActor); release is
  // idempotent — no-op if the reservation was already released by
  // the 10-min TTL alarm OR by a prior failed/expired callback for
  // the same order.
  //
  // We deliberately do NOT delete the KV cart stash here. Stripe
  // payment intents can move through `failed`-shaped events (e.g.
  // `requires_payment_method` after a declined card) and later
  // `succeed` with a fresh event_id on the same orderId; the eventual
  // commitOrder still needs the cart for line-item granularity. The
  // 7-day TTL on the stash bounds the leak; if nothing succeeds in
  // that window the stash expires on its own.
  await inv.release(event.orderId);
}

/**
 * order-work-queue consumer — real branches per message type:
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
 * `order-work-dlq` for observability.
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
  const parsed = JSON.parse(row.data) as OrderRowData;
  if (parsed.confirmation_emailed_at) {
    // Idempotent skip — duplicate message after the first run.
    return;
  }

  // Mark BEFORE side effect — at-most-once for notifications. If the
  // marker write succeeds and the Slack post fails, the queue retries,
  // sees the marker, and skips. We accept the rare lost-notification
  // case to guarantee no duplicate-notification case. The reverse
  // ordering would re-fire Slack on every retry between Slack-success
  // and marker-write — unacceptable once Slack becomes email.
  const now = Date.now();
  const next = { ...parsed, confirmation_emailed_at: now };
  await env.DB.prepare(
    `UPDATE entries SET data = ?, updated_at = ? WHERE id = ? AND collection = ?`,
  )
    .bind(JSON.stringify(next), now, orderEntryId(orderId), "orders")
    .run();

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
      // Don't fail the whole message on Slack outages — the marker
      // is already written, so retrying wouldn't re-send anyway.
      console.warn(`[order-work-consumer] slack notify failed:`, err);
    }
  }
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
      await sendOrderWork(env.ORDER_WORK_QUEUE, {
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
      case "payment-callback-queue":
      case "payment-callback-queue-test":
        return paymentCallbackConsumer(
          batch as MessageBatch<PaymentCallbackMessage>,
          env,
          ctx,
        );
      case "order-work-queue":
      case "order-work-queue-test":
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

