/**
 * Template: `redirect-checkout` pattern.
 *
 * For payment providers where the provider HOSTS the checkout page;
 * the merchant calls a provider API to create a checkout session,
 * gets a URL, and redirects the customer to that URL. After payment
 * the provider redirects back to a merchant-controlled return URL
 * AND fires an async webhook the merchant verifies.
 *
 * Examples of providers that match this shape:
 *   - Stripe Checkout (`stripe.checkout.sessions.create` → session.url)
 *   - Paddle (`pay.paddle.com/checkout/...`)
 *   - Lemon Squeezy (`api.lemonsqueezy.com/v1/checkouts`)
 *   - Most card-processor SaaS with hosted-checkout flow
 *
 * To wire a real provider:
 *   1. Copy this file to `src/payment/providers/<provider>.ts`
 *   2. `pnpm add <provider-sdk>` (e.g. `pnpm add stripe`)
 *   3. Fill in the TODOs against the provider's docs
 *   4. Update `src/payment/index.ts` to instantiate this class
 *   5. Declare the provider's secrets in `wrangler.toml` + set with
 *      `wrangler secret put <NAME>` during provision
 *
 * Mantle reads this template at install time, picks it as the base
 * for hosted-checkout providers, and writes the real impl in the
 * user's session.
 */

import type {
  PaymentProvider,
  StartCheckoutArgs,
  StartCheckoutResult,
  CallbackEvent,
  ReturnVerification,
} from "../../provider.js";

export interface RedirectCheckoutConfig {
  readonly apiKey: string;          // provider's secret API key
  readonly webhookSecret: string;   // provider's webhook signing secret
  // Most hosted-checkout providers also need:
  // readonly publishableKey?: string;  // if frontend needs it for embedded elements
}

export class RedirectCheckoutTemplate implements PaymentProvider {
  constructor(private readonly _config: RedirectCheckoutConfig) {}

  async startCheckout(_args: StartCheckoutArgs): Promise<StartCheckoutResult> {
    // TODO: call provider's "create checkout session" API.
    //   - Pass args.items as line items
    //   - Pass args.customerEmail for receipt + prefill
    //   - Pass args.returnUrl as success_url + cancel_url
    //   - Pass args.notifyUrl as webhook endpoint (one-time setup
    //     usually; some providers configure this at the dashboard)
    //   - Stash args.orderId in metadata so the webhook can echo it
    //
    // Return the redirect URL from the response.
    void this._config;
    throw new Error("redirect-checkout template — provider impl missing");
    // Real shape:
    //   const session = await sdk.checkout.sessions.create({
    //     line_items: args.items.map(...),
    //     customer_email: args.customerEmail,
    //     success_url: args.returnUrl + "?id={CHECKOUT_SESSION_ID}",
    //     cancel_url:  args.returnUrl + "?cancelled=1",
    //     metadata: { orderId: args.orderId },
    //   });
    //   return { kind: "redirect", url: session.url };
  }

  async parseCallback(_request: Request): Promise<CallbackEvent> {
    // TODO: verify provider's webhook signature.
    //   - Stripe: `sdk.webhooks.constructEvent(rawBody, sigHeader, secret)`
    //   - Paddle: HMAC-SHA256 against signing secret
    //   - Lemon Squeezy: HMAC-SHA256 in X-Signature header
    //
    // Then branch on event type:
    //   - succeeded → status: "succeeded"
    //   - failed → status: "failed"
    //   - expired / cancelled → status: "expired"
    //   - everything else → throw to skip (queue consumer acks)
    //
    // Extract orderId from event.data.object.metadata.orderId (or
    // wherever this provider stashes merchant-supplied metadata).
    //
    // Populate CallbackEvent:
    //   - eventId: provider's event-stream id (Stripe `evt_...`)
    //   - paymentIntentId: payment identifier (Stripe `pi_...`,
    //     Paddle transaction id) — distinct from eventId so the order
    //     row records the payment, not the webhook delivery.
    //   - customerEmail: from event.data.object.customer_email (or
    //     equivalent). Optional — the consumer falls back to the
    //     stashed cart's email.
    //   - provider: a stable name string ("stripe" / "paddle" / etc.)
    //     used by the order row for forensics.
    throw new Error("redirect-checkout template — provider impl missing");
  }

  async verifyReturn(_request: Request): Promise<ReturnVerification> {
    // For redirect-checkout providers, the return URL is best-effort
    // (the webhook is the source of truth). We just look up the order
    // in our D1 (which the webhook handler has already written) and
    // report its current status.
    //
    // No signature verification on the return URL for this pattern —
    // unless the provider signs return-URL params (rare). The risk of
    // trusting the return URL is that an attacker could craft a fake
    // "success" URL and trick the customer-facing UI; but the actual
    // order state in D1 is webhook-driven, so the worst case is a UI
    // glitch.
    throw new Error("redirect-checkout template — provider impl missing");
  }
}
