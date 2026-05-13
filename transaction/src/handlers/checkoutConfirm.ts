/**
 * checkoutConfirm — async callback / webhook handler.
 *
 * Flow uses two pieces of infrastructure for once-and-only-once:
 *
 *   1. **Queue with max_concurrency=1 / max_batch_size=1** — webhooks
 *      from the payment provider land on `payment_callback_queue`;
 *      we never process two callbacks concurrently. This eliminates
 *      the "two retries in flight" race entirely; lock contention is
 *      gone before it starts. HTTP handler (this file) verifies
 *      signature then ships to queue + returns 200 to the provider
 *      in ~10ms.
 *
 *   2. **Find-and-modify lock on InventoryActor** — `tryAcquire` is
 *      the gate. First processing of an event.id gets `acquired:true`;
 *      retries (queue redelivery if consumer threw, or duplicate
 *      events from the provider itself) get `acquired:false`. Sweeper
 *      (10min) resets stale `pending` so a crashed consumer doesn't
 *      strand work.
 *
 * Side effects MUST be idempotent — sweeper is a backstop, not a
 * substitute for idempotency. Specifically:
 *   - order INSERT keyed on `orderId` with `ON CONFLICT IGNORE` (or
 *     equivalent — D1 has no ON CONFLICT IGNORE syntax for this; use
 *     SELECT-then-INSERT or `INSERT OR IGNORE`).
 *   - inventory commit keyed on `reservationId` — idempotent in
 *     InventoryActor.commit().
 *   - queue.send of "order.confirmed" — okay to send twice; the
 *     `orderConsumer` dedupes its own work via the order's
 *     `confirmation_emailed_at` column or similar.
 *
 * Bug class this prevents: customer charged but order missing. The
 * cause would be marking event seen → side effect throws → return
 * 500 → provider retries → sees "already seen" → no-op → order
 * never written. With this design the lock holds in `pending`, not
 * `completed`, until side effects succeed.
 *
 * Note: this file is the HTTP handler that queues the callback. The
 * queue consumer that does the actual work lives in `orderConsumer.ts`.
 */

import type { AnyHandler } from "@aotterclam/clam-cms-runtime";

export interface CheckoutConfirmEnv {
  readonly INVENTORY_ACTOR: DurableObjectNamespace;
  readonly PAYMENT_CALLBACK_QUEUE: Queue;
  readonly DB: D1Database;
  // Plus the provider's own env vars; see src/payment/index.ts
}

/**
 * HTTP-side: verify the provider's callback signature, ship the
 * verified envelope to the callback queue, return 200 to the provider.
 *
 * The actual side effects (lock acquire → order write → inventory
 * commit → mark completed) happen in `orderConsumer.ts` against the
 * `payment_callback_queue` topic.
 */
export const checkoutConfirm: AnyHandler = (async (_input: unknown, _ctx: unknown) => {
  // 1. const event = await paymentProvider.parseCallback(request);  // throws on bad signature
  // 2. await env.PAYMENT_CALLBACK_QUEUE.send(event);
  // 3. return 200 (HTTP layer; the JSON-RPC Procedure return).
  // Provider stops retrying once it sees 200.
  throw new Error("not implemented (PR 1 scaffold)");
}) as unknown as AnyHandler;

type DurableObjectNamespace = unknown;
type Queue = unknown;
type D1Database = unknown;
