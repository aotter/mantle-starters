/**
 * FakeProvider — minimal in-process PaymentProvider for offline tests.
 *
 * Ships in `_templates/` (not in the wired-provider slot) because
 * it's intentionally NOT a real-payment integration. The integration
 * smoke (`test/integration/smoke.ts`) wires this when the
 * `FAKE_PAYMENT_PROVIDER` env var is set; production installs use a
 * real provider written by Mantle per the SKILL procedure.
 *
 * Behavior:
 *   - startCheckout returns { kind: "redirect", url } where the URL
 *     is a self-referential callback against the worker — the test
 *     harness POSTs to it to simulate the provider's async callback.
 *   - parseCallback decodes a plain JSON body { eventId, orderId,
 *     status, amount }. No signature verification — this is the test
 *     fixture, the test harness controls both sides.
 *   - verifyReturn parses ?orderId=&status= query params. Same trust
 *     model: tests only.
 *
 * Real-payment guard: throws on `parseCallback` if env says we're not
 * in test mode. (The dev flow STILL throws "PaymentProvider not
 * configured" via src/payment/index.ts unless FAKE_PAYMENT_PROVIDER
 * is explicitly set.)
 */

import type {
  PaymentProvider,
  StartCheckoutArgs,
  StartCheckoutResult,
  CallbackEvent,
  ReturnVerification,
} from "../../provider.js";

export interface FakeProviderConfig {
  /** Where the test harness should POST its simulated callback. */
  readonly callbackUrl: string;
}

export class FakeProvider implements PaymentProvider {
  constructor(private readonly _config: FakeProviderConfig) {}

  async startCheckout(args: StartCheckoutArgs): Promise<StartCheckoutResult> {
    // The "redirect" URL is the worker's own callback endpoint, with
    // the orderId embedded as a query param. The test harness reads
    // this URL out of the response and POSTs a fake event body to it
    // to drive the async callback flow.
    const url = new URL(this._config.callbackUrl);
    url.searchParams.set("fake_order_id", args.orderId);
    url.searchParams.set("fake_amount_minor", String(
      args.items.reduce((sum, i) => sum + i.priceMinor * i.qty, 0),
    ));
    url.searchParams.set("fake_currency", args.currency);
    return { kind: "redirect", url: url.toString() };
  }

  async parseCallback(request: Request): Promise<CallbackEvent> {
    const body = (await request.json()) as {
      eventId?: string;
      orderId?: string;
      status?: "succeeded" | "failed" | "expired";
      amount?: { minor?: number; currency?: string };
      paymentIntentId?: string;
      customerEmail?: string;
    };
    if (!body.eventId || !body.orderId || !body.status || !body.amount) {
      throw new Error(
        "FakeProvider.parseCallback: missing field — body must be { eventId, orderId, status, amount: { minor, currency }, paymentIntentId?, customerEmail? }",
      );
    }
    return {
      eventId: body.eventId,
      orderId: body.orderId,
      status: body.status,
      amount: {
        minor: body.amount.minor ?? 0,
        currency: body.amount.currency ?? "USD",
      },
      paymentIntentId: body.paymentIntentId ?? body.eventId,
      customerEmail: body.customerEmail,
      provider: "fake",
    };
  }

  async verifyReturn(request: Request): Promise<ReturnVerification> {
    const url = new URL(request.url);
    const orderId = url.searchParams.get("orderId");
    if (!orderId) {
      throw new Error("FakeProvider.verifyReturn: missing ?orderId");
    }
    const status = url.searchParams.get("status");
    const normalized: "succeeded" | "failed" | "pending" =
      status === "succeeded" || status === "failed" ? status : "pending";
    return { orderId, status: normalized };
  }
}
