/**
 * checkoutReturn — customer's synchronous return from the payment
 * provider. Verifies the return signature (per provider) and reads
 * the order's current status from D1.
 *
 * Stripe-like providers: verifyReturn is mostly a trust-the-DB
 * lookup (webhook is truth). Merchant-form providers (ECPay /
 * PayUni): verifyReturn signature-checks the return URL params, so
 * a forged "success" URL is rejected.
 *
 * Order may not exist yet — the async callback could still be in
 * flight. Frontend interprets `!exists` as "processing" and polls
 * read-order-status.
 */

import type { AnyHandler, CmsRuntime } from "@aotterclam/clam-cms-runtime";
import { buildPaymentProvider, type PaymentEnv } from "../payment/index.js";

export interface CheckoutReturnEnv extends PaymentEnv {
  readonly DB: D1Database;
}

export interface CheckoutReturnInput {
  /** Stringified request URL OR raw form body — the provider's docs
   *  dictate. Most return-URL flows are GET so the full URL carries
   *  the signed params. */
  readonly requestUrl?: string;
  /** For POST-back providers, the body string. */
  readonly requestBody?: string;
  readonly orderId?: string;
}

export interface CheckoutReturnOutput {
  readonly orderId: string;
  readonly providerStatus: "succeeded" | "failed" | "pending";
  readonly exists: boolean;
  readonly orderStatus?: string;
}

export function buildCheckoutReturn(env: CheckoutReturnEnv): AnyHandler {
  return (async (input: CheckoutReturnInput, ctx: HandlerContext) => {
    if (!input.requestUrl && !input.orderId) {
      throw new Error(
        "checkoutReturn: provide either requestUrl (with signed params) or orderId",
      );
    }
    let providerStatus: "succeeded" | "failed" | "pending" = "pending";
    let orderId = input.orderId ?? "";
    if (input.requestUrl) {
      const provider = buildPaymentProvider(env);
      // Wrap the URL in a Request so the provider's signature check
      // can inspect both URL and headers/body. For GET return URLs
      // the headers don't carry meaningful state; body is empty.
      const req = new Request(input.requestUrl, {
        method: input.requestBody ? "POST" : "GET",
        ...(input.requestBody ? { body: input.requestBody } : {}),
      });
      const verified = await provider.verifyReturn(req);
      providerStatus = verified.status;
      orderId = verified.orderId;
    }
    const existing = await lookupOrder(ctx.runtime, orderId);
    return {
      orderId,
      providerStatus,
      exists: existing !== null,
      ...(existing ? { orderStatus: existing.orderStatus } : {}),
    } satisfies CheckoutReturnOutput;
  }) as unknown as AnyHandler;
}

async function lookupOrder(
  runtime: CmsRuntime,
  orderId: string,
): Promise<{ orderId: string; orderStatus: string } | null> {
  if (!orderId) return null;
  const orders = await runtime.listEntries.execute({
    collection: "orders",
    status: "published",
    limit: 1000,
  });
  const hit = orders.find(
    (o) => (o.data as { orderNumber?: string }).orderNumber === orderId,
  );
  if (!hit) return null;
  const d = hit.data as { orderNumber?: string; orderStatus?: string };
  return {
    orderId: d.orderNumber ?? orderId,
    orderStatus: d.orderStatus ?? "placed",
  };
}

// ── type stubs ───────────────────────────────────────────────────────
type D1Database = unknown;
interface HandlerContext {
  readonly runtime: CmsRuntime;
}
