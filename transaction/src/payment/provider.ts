/**
 * PaymentProvider — generic payment integration contract.
 *
 * The transaction starter does NOT assume Stripe. Different markets
 * use different providers (Stripe / ECPay / PayUni / etc.) with
 * different integration shapes. This interface covers both common
 * patterns:
 *
 *   - Stripe-style: customer redirects to a hosted checkout page;
 *     webhook is the source of truth for payment status.
 *   - ECPay / PayUni / many TW providers: server returns an HTML
 *     form that auto-submits to the provider; provider POSTs an
 *     async callback to a notify URL AND redirects the customer
 *     back to a return URL with payment status params (both
 *     verified server-side).
 *
 * One provider is wired at install time via `src/payment/index.ts`.
 * To add a new provider: copy `providers/stripe.ts` as a starting
 * point, implement against the provider's docs, swap the import in
 * `index.ts`.
 *
 * Note: this lives in the STARTER, not in `@aotterclam/clam-cms-*`.
 * The SDK has no opinion on payments.
 */

export interface CartItem {
  readonly productSlug: string;
  readonly qty: number;
  readonly priceMinor: number;
  readonly title: string;
}

export interface StartCheckoutArgs {
  readonly orderId: string;
  readonly items: ReadonlyArray<CartItem>;
  readonly customerEmail: string;
  readonly currency: string;
  /** Where the provider sends the customer after payment (any status). */
  readonly returnUrl: string;
  /** Where the provider POSTs the async server-server callback. */
  readonly notifyUrl: string;
}

export type StartCheckoutResult =
  | { readonly kind: "redirect"; readonly url: string }
  | { readonly kind: "form"; readonly html: string };

export interface CallbackEvent {
  /** Provider's unique ID for this event — used for dedup. */
  readonly eventId: string;
  /** Our order ID (provider echoes it via merchant metadata field). */
  readonly orderId: string;
  readonly status: "succeeded" | "failed" | "expired";
  readonly amount: { readonly minor: number; readonly currency: string };
  /**
   * Provider's identifier for the payment record itself (Stripe
   * payment_intent, ECPay TradeNo, etc.). May equal eventId for
   * providers that don't separate event-stream IDs from payment IDs.
   * Persisted to the order row for forensics + customer-service.
   */
  readonly paymentIntentId: string;
  /**
   * Customer email, when the provider carries it. Stripe / ECPay /
   * PayUni all do; some local-rail providers may not. The starter
   * reads its primary source from the checkoutStart cart stash; this
   * field is a fallback when the cart stash has expired.
   */
  readonly customerEmail?: string;
  /**
   * Provider name (e.g. "stripe", "ecpay", "fake"). Set by the
   * adapter; the consumer persists it on the order row for
   * forensics / dashboards across providers.
   */
  readonly provider: string;
}

export interface ReturnVerification {
  readonly orderId: string;
  readonly status: "succeeded" | "failed" | "pending";
}

export interface PaymentProvider {
  /**
   * Build the customer-facing payment flow entry. Returns either:
   *   - kind: "redirect" → frontend does `window.location = url`
   *   - kind: "form"     → frontend renders the HTML; the form auto-
   *                        submits to the provider on load
   */
  startCheckout(args: StartCheckoutArgs): Promise<StartCheckoutResult>;

  /**
   * Verify + parse an async server-server callback from the provider.
   * MUST verify signature; throws on invalid. Returns the normalized
   * event for the consumer (deduped via eventId by the lock DO).
   */
  parseCallback(request: Request): Promise<CallbackEvent>;

  /**
   * Verify the customer's synchronous return-to-merchant.
   * Stripe-style providers may just trust the redirect (webhook is
   * truth); TW providers (ECPay, PayUni) sign the return URL params
   * and require server-side verification.
   *
   * Returns the order's payment status AS THE PROVIDER SEES IT NOW —
   * not necessarily what we've persisted. Used for the post-checkout
   * landing page ("payment received" / "payment pending" / "failed").
   */
  verifyReturn(request: Request): Promise<ReturnVerification>;
}
