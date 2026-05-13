/**
 * Queue consumers for the transaction starter.
 *
 * Two queues, both `max_concurrency: 1 / max_batch_size: 1` for
 * serial processing (no two messages of the same type race; <100
 * orders/day fits comfortably).
 *
 *   - `payment_callback_queue` — payment-provider async callbacks
 *     (Stripe webhook / ECPay AsyncCallback / PayUni NotifyURL).
 *     HTTP handler pre-verified signature; consumer does the heavy
 *     lifting under the find-and-modify lock.
 *
 *   - `order_work_queue` — downstream effects: send confirmation
 *     email, fulfillment notify, inventory snapshot, reconcile tick
 *     (driven by a Cron Trigger).
 *
 * Sweeper is invoked from `order_work_queue` via a Cron-driven
 * `inventory.reconcile.tick` message every 5 minutes. The sweeper
 * resets InventoryActor `pending` locks past their TTL (10 min) so
 * crashed-consumer work can retry on the next queue redelivery.
 *
 * Cloudflare Queues semantics: at-least-once, message id stable
 * across retries. ack = return cleanly; throw = retry with backoff.
 * Hard-fail-no-retry = msg.ack() before throwing (so the retry
 * counter doesn't tick).
 *
 * No human auth context here — service-principal flow. Consumers
 * call DOs + D1 + the payment provider directly.
 */

import type { CallbackEvent } from "../payment/provider.js";

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
  // Payment provider env per src/payment/index.ts
}

/**
 * Consumer for `payment_callback_queue`. Runs the once-and-only-once
 * order creation flow:
 *
 *   1. `tryAcquire(event.id)` — find-and-modify lock on InventoryActor.
 *      Not acquired → already-processed (or another consumer holds);
 *      ack and return.
 *   2. Branch on event.status:
 *      - succeeded → commit reservation; INSERT OR IGNORE order row;
 *        send `order.confirmed` to ORDER_WORK_QUEUE.
 *      - failed    → release reservation; no order row.
 *      - expired   → release reservation; no order row.
 *   3. `markCompleted(event.id)` — flip the lock to completed.
 *   4. msg.ack().
 *
 * On throw: msg.retry() implicit; queue redelivers; lock stays
 * `pending`; if consumer was actually stuck, sweeper (10min) resets
 * the lock so the retry can re-acquire. Idempotent side effects (step
 * 2) survive double-execution if the sweeper false-positives.
 */
export async function paymentCallbackConsumer(
  batch: MessageBatch<PaymentCallbackMessage>,
  env: ConsumerEnv,
  ctx: ExecutionContext,
): Promise<void> {
  void batch;
  void env;
  void ctx;
  throw new Error(
    "transaction-starter: paymentCallbackConsumer is a PR 1 scaffold stub; " +
      "live implementation lands in PR 2.",
  );
}

/**
 * Consumer for `order_work_queue`. Branches on message type:
 *
 *   - "order.confirmed" → email + fulfillment notify + analytics.
 *     Idempotent via order row's `confirmation_emailed_at` (set after
 *     successful email; skip if non-null).
 *   - "inventory.snapshot.requested" → read InventoryActor.snapshot()
 *     for productSlug; UPSERT inventory_snapshots row.
 *   - "inventory.reconcile.tick" → walk all tracked products in D1;
 *     enqueue a `inventory.snapshot.requested` for each. Also call
 *     `InventoryActor.sweepStaleLocks()` to recover from any crashed
 *     payment-callback consumers.
 */
export async function orderWorkConsumer(
  batch: MessageBatch<OrderWorkMessage>,
  env: ConsumerEnv,
  ctx: ExecutionContext,
): Promise<void> {
  void batch;
  void env;
  void ctx;
  throw new Error(
    "transaction-starter: orderWorkConsumer is a PR 1 scaffold stub; " +
      "live implementation lands in PR 3.",
  );
}

/**
 * Top-level queue dispatcher for the Worker's default export. Routes
 * by `batch.queue` (the binding name) — see wrangler.toml.
 */
export function buildQueueDispatcher(env: ConsumerEnv): (
  batch: MessageBatch<unknown>,
  env: ConsumerEnv,
  ctx: ExecutionContext,
) => Promise<void> {
  void env;
  return async (batch, env, ctx) => {
    switch (batch.queue) {
      case "payment_callback_queue":
        return paymentCallbackConsumer(
          batch as MessageBatch<PaymentCallbackMessage>,
          env,
          ctx,
        );
      case "order_work_queue":
        return orderWorkConsumer(
          batch as MessageBatch<OrderWorkMessage>,
          env,
          ctx,
        );
      // Also: case "clam_internal" → re-uses the adapter's
      // createQueueHandler<Env>(cmsRef) for the runtime's
      // DeferredHookDispatcher. The starter top-level wires that in
      // alongside this dispatcher.
      default:
        console.warn(`unknown queue: ${batch.queue}`);
    }
  };
}

// ---- type stubs (real types come from @cloudflare/workers-types) ----
type DurableObjectNamespace = unknown;
type Queue = unknown;
type D1Database = unknown;
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
