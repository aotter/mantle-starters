/**
 * checkoutConfirm — async callback / webhook handler. HTTP-side
 * thin wrapper:
 *
 *   1. PaymentProvider.parseCallback(request) verifies signature.
 *      Throws on bad signature → 400 to provider.
 *   2. env.PAYMENT_CALLBACK_QUEUE.send(parsedEvent) — defers heavy
 *      work to the queue consumer (paymentCallbackConsumer in
 *      orderConsumer.ts). Queue is `max_concurrency: 1` so callback
 *      processing is strictly serial.
 *   3. Return 200 in <10 ms; provider stops retrying.
 *
 * Heavy work (lock acquire → order INSERT → inventory commit →
 * mark completed) lives in `paymentCallbackConsumer`. Two pieces of
 * infrastructure protect against once-and-only-once failures:
 *
 *   - Queue serialization eliminates "two retries in flight" race.
 *   - InventoryActor.tryAcquire find-and-modify lock dedups by
 *     event.id. Sweeper (10-min `pending` TTL, cron every 5 min)
 *     recovers if the consumer crashes mid-work — but consumer-side
 *     side effects MUST be idempotent for sweeper to be safe (order
 *     INSERT uses INSERT OR IGNORE; inventory commit no-ops if the
 *     reservation is already consumed).
 *
 * Bug class this prevents: customer charged but order missing. The
 * naive fix ("mark seen on first arrival, skip on retry") loses the
 * order if step 3 throws mid-work. With the queue + lock layout,
 * the consumer's throw → queue retries → lock still `pending` →
 * sweeper or next attempt re-acquires → idempotent side effects
 * succeed second time around.
 */

import type { AnyHandler } from "@aotter/mantle-runtime";
import { buildPaymentProvider, type PaymentEnv } from "../payment/index.js";

export interface CheckoutConfirmEnv extends PaymentEnv {
  readonly PAYMENT_CALLBACK_QUEUE: Queue;
}

export interface CheckoutConfirmInput {
  /** Raw request URL — the provider's callback path. */
  readonly requestUrl: string;
  /** Provider sends a signed body (form-urlencoded or JSON). */
  readonly requestBody: string;
  /** Verbatim headers from the inbound webhook (signature header
   *  lives here for Stripe-style providers). */
  readonly requestHeaders: Record<string, string>;
  /** HTTP method. Most providers POST. */
  readonly requestMethod?: string;
}

export function buildCheckoutConfirm(env: CheckoutConfirmEnv): AnyHandler {
  return (async (input: CheckoutConfirmInput) => {
    const provider = buildPaymentProvider(env);
    const req = new Request(input.requestUrl, {
      method: input.requestMethod ?? "POST",
      headers: input.requestHeaders,
      body: input.requestBody,
    });
    // verifySignature → parseEvent. Throws on bad signature, which
    // surfaces as a 500 to the provider; some providers will retry,
    // some will give up. Either way we did the right thing.
    const event = await provider.parseCallback(req);
    await env.PAYMENT_CALLBACK_QUEUE.send(event);
    return { ack: true, eventId: event.eventId };
  }) as unknown as AnyHandler;
}

type Queue = {
  send<T>(message: T): Promise<unknown>;
};
