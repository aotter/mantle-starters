/**
 * Local-dev callback shim (#220). Merchant-form payment providers
 * (ECPay, PayUni, NewebPay) send the success notification to a
 * server-to-server URL the provider can reach; localhost is not
 * reachable without a tunnel. Without that webhook the
 * `PAYMENT_CALLBACK_QUEUE` never gets the verified envelope, the
 * order row is never committed, and the customer-return page polls
 * forever showing "處理中…".
 *
 * `enqueueDevCallback` synthesizes a successful CallbackEvent off
 * the cart stash and pushes it to the same queue the real webhook
 * would target. The queue consumer dedupes by `eventId`, so an
 * accidental double-fire (e.g. the customer reloads the return page
 * after a real callback already landed) is a no-op.
 *
 * **Production guard**: this helper is a no-op unless
 * `env.MANTLE_LOCAL_DEV === "1"`. The gate lives ONLY inside this
 * helper — call sites invoke `await enqueueDevCallback(env, id)`
 * unconditionally and trust the early return. Keeping the gate in
 * exactly one place means there's no second `if (env.MANTLE_LOCAL_DEV
 * === "1")` block that could drift from this one.
 */
import type { Env } from "../mantleConfig.js";
import type { CallbackEvent } from "./provider.js";
import { readOrderCart } from "../handlers/orderCart.js";

const DEV_PROVIDER_TAG = "dev-shim";

/**
 * Enqueue a synthesized "succeeded" CallbackEvent for `orderId`.
 * Reads the enriched cart stash to populate `amount` and
 * `customerEmail`; falls back to a 0-minor event when the stash has
 * expired so the consumer still runs (the order will be partially
 * populated, sufficient for the local-dev "did checkout commit?"
 * smoke test).
 *
 * Idempotent: the synthesized `eventId` is deterministic
 * (`dev-shim:<orderId>`), so re-running the customer-return flow
 * doesn't double-credit the order.
 */
export async function enqueueDevCallback(
  env: Env,
  orderId: string,
): Promise<{ readonly enqueued: boolean; readonly reason?: string }> {
  if (env.MANTLE_LOCAL_DEV !== "1") {
    return { enqueued: false, reason: "MANTLE_LOCAL_DEV !== \"1\"" };
  }
  if (!orderId) return { enqueued: false, reason: "missing orderId" };

  const cart = await readOrderCart(env.KV, orderId);
  if (!cart) {
    // Stash expired / never written — the consumer still runs but
    // commits a 0-minor order row. Log loudly so the dev notices
    // this isn't representative of a real checkout.
    console.warn(
      `[devCallbackShim] no order:cart stash for ${orderId}; falling back to 0/TWD. Order row will be partially populated.`,
    );
  }
  const event: CallbackEvent = {
    eventId: `${DEV_PROVIDER_TAG}:${orderId}`,
    orderId,
    status: "succeeded",
    amount: cart
      ? { minor: cart.subtotalMinor, currency: cart.currency }
      : { minor: 0, currency: "TWD" },
    paymentIntentId: `${DEV_PROVIDER_TAG}-${orderId}`,
    ...(cart?.customerEmail ? { customerEmail: cart.customerEmail } : {}),
    provider: DEV_PROVIDER_TAG,
  };

  try {
    await env.PAYMENT_CALLBACK_QUEUE.send(event);
    return { enqueued: true };
  } catch (err) {
    // Don't throw — the customer-return handler still wants to land
    // the browser on /order/:id even if the shim fails. The consumer
    // will simply never see the synthesized event; the operator can
    // re-fire by reloading the return URL.
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[devCallbackShim] enqueue failed for ${orderId}: ${msg}`);
    return { enqueued: false, reason: msg };
  }
}
