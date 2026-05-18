/**
 * Template: `merchant-form` pattern.
 *
 * For payment providers where the MERCHANT renders an HTML form that
 * the customer's browser auto-POSTs to the provider. Hidden form
 * fields carry merchant ID, order amount, signed integrity hash, etc.
 * After payment the provider POSTs an async callback (Notify URL)
 * with the same signing scheme, AND redirects the customer to a
 * Return URL with similarly-signed params.
 *
 * Examples of providers that match this shape:
 *   - ECPay 綠界 (CheckMacValue: SHA-256 of sorted params + HashKey + HashIV)
 *   - PayUni 統一金流 (AES-256 encrypted payload + SHA-256 hash)
 *   - NewebPay 藍新金流 (similar AES-encrypted envelope)
 *   - Many Asia-Pacific / TW / SEA payment gateways
 *   - Some "iframe redirect" providers can also use this pattern
 *
 * Differences from `redirect-checkout`:
 *   - No SDK install needed; provider docs give you the form spec
 *   - Signature/encryption is computed locally per request
 *   - Both Notify URL (async) AND Return URL (sync) require
 *     server-side signature verification
 *
 * To wire a real provider:
 *   1. Copy this file to `src/payment/providers/<provider>.ts`
 *   2. Fill in the TODOs against the provider's docs URL — pay
 *      special attention to the signing/encryption scheme; bugs here
 *      mean spoofable callbacks.
 *   3. Update `src/payment/index.ts` to instantiate this class
 *   4. Declare the provider's secrets in `wrangler.toml` (MERCHANT_ID,
 *      HASH_KEY, HASH_IV, etc.) + set with `wrangler secret put`
 *
 * Mantle reads this template at install time, picks it as the base
 * for form-POST providers, and writes the real impl in the user's
 * session.
 */

import type {
  PaymentProvider,
  StartCheckoutArgs,
  StartCheckoutResult,
  CallbackEvent,
  ReturnVerification,
} from "../../provider.js";

export interface MerchantFormConfig {
  readonly merchantId: string;
  readonly hashKey: string;
  readonly hashIv: string;
  readonly environment: "stage" | "production";
  // The provider's checkout endpoint URL — usually two: stage + prod.
  readonly endpoints: {
    readonly stage: string;
    readonly production: string;
  };
}

export class MerchantFormTemplate implements PaymentProvider {
  constructor(private readonly _config: MerchantFormConfig) {}

  async startCheckout(_args: StartCheckoutArgs): Promise<StartCheckoutResult> {
    // TODO: build the provider's form per docs.
    //   1. Collect required fields: merchantId, orderId (echoed back),
    //      amount, itemDescription, returnUrl, notifyUrl, currency,
    //      customer email, ... — names vary per provider.
    //   2. Compute the integrity signature.
    //      - Plain-hash style (ECPay-like):
    //        SHA-256 of `HashKey=...&<sorted-params>&HashIV=...`
    //        URL-encoded per provider spec.
    //      - Encrypted-payload style (PayUni-like):
    //        AES-256-CBC encrypt JSON of params with HashKey + HashIV,
    //        base64. Then SHA-256 of the encrypted blob + keys for
    //        a separate `HashInfo` field.
    //   3. Return form HTML with hidden inputs + a tiny inline
    //      script that submits onload. Endpoint URL from
    //      `endpoints[environment]`.
    void this._config;
    throw new Error("merchant-form template — provider impl missing");
    // Real shape (plain-hash style):
    //   const params = { MerchantID: ..., OrderID: args.orderId, ... };
    //   const sig = sha256(stringify({ HashKey: this._config.hashKey, ...params, HashIV: this._config.hashIv }));
    //   const html = renderForm({ ...params, CheckMacValue: sig }, endpoints[env]);
    //   return { kind: "form", html };
  }

  async parseCallback(_request: Request): Promise<CallbackEvent> {
    // TODO: verify signature first; reject if mismatch.
    //   - Plain-hash style: parse form-urlencoded body; recompute
    //     CheckMacValue from remaining fields + HashKey + HashIV;
    //     constant-time compare. Reject if not equal.
    //   - Encrypted-payload style: extract EncryptInfo + HashInfo;
    //     verify HashInfo matches recomputed SHA-256 over
    //     EncryptInfo + keys; decrypt EncryptInfo to get the JSON
    //     payload.
    //
    // Then map provider status codes to CallbackEvent.status:
    //   - ECPay RtnCode === "1" → succeeded
    //   - PayUni Status === "S" → succeeded
    //   - Failure codes → "failed"
    //   - Timeout / cancel codes → "expired"
    //
    // Extract orderId from the merchant-supplied field (usually
    // OrderID, CustomField1, MerTradeNo — whatever you set at
    // startCheckout).
    //
    // Populate CallbackEvent:
    //   - eventId: provider's transaction reference (ECPay TradeNo,
    //     PayUni TradeSeq). Used for once-and-only-once dedup so it
    //     must be unique per callback delivery.
    //   - paymentIntentId: usually same as eventId for merchant-form
    //     providers (no separate event-stream id). Recorded on the
    //     order row.
    //   - customerEmail: from the provider's email field if it
    //     surfaces in the notify body (varies). Optional — consumer
    //     falls back to the stashed cart's email.
    //   - provider: stable name string ("ecpay" / "payuni" / etc.).
    throw new Error("merchant-form template — provider impl missing");
  }

  async verifyReturn(_request: Request): Promise<ReturnVerification> {
    // For merchant-form providers, the return URL is typically signed
    // with the same scheme as the async callback. You MUST verify it
    // server-side — the customer's browser is untrusted; an attacker
    // could craft a fake "success" return URL.
    //
    // Same signature check as parseCallback. Return the payment
    // status as the return-URL params claim.
    throw new Error("merchant-form template — provider impl missing");
  }
}
