/**
 * Provider selector. Starter ships provider-blank — Mantle wires the
 * real provider in `src/payment/providers/<name>.ts` during install
 * (see `SKILL.md` § "Payment provider wiring"). Until that runs,
 * this file fails loud.
 *
 * One exception: integration tests can route through FakeProvider by
 * setting `FAKE_PAYMENT_PROVIDER=1` (the test wrangler profile sets
 * this). FakeProvider has no signature verification; throws if used
 * outside test mode.
 *
 * Mantle's install procedure replaces this whole file:
 *   1. Pick a template (redirect-checkout / merchant-form) per the
 *      user's provider choice.
 *   2. Implement the real provider in src/payment/providers/<name>.ts.
 *   3. Replace the import + instantiation below.
 *   4. Update PaymentEnv to list the provider's secrets.
 *   5. Declare the secrets in wrangler.toml + set via `wrangler secret put`.
 */

import type { PaymentProvider } from "./provider.js";
import { FakeProvider } from "./providers/_templates/fake.js";

export interface PaymentEnv {
  /** Test-only — when set ("1") in `[env.test]` wrangler.toml, the
   *  FakeProvider wires up so smoke tests can drive the end-to-end
   *  happy path without a real provider account. NEVER set this in
   *  production. */
  readonly FAKE_PAYMENT_PROVIDER?: string;
  /** Worker public origin. Used by FakeProvider to point its
   *  simulated redirect at the worker's own callback path. */
  readonly PUBLIC_ORIGIN?: string;
  // Mantle replaces this when wiring a real provider. Examples:
  //   readonly STRIPE_SECRET_KEY: string;
  //   readonly STRIPE_WEBHOOK_SECRET: string;
  //   readonly ECPAY_MERCHANT_ID: string;
  //   readonly ECPAY_HASH_KEY: string;
  //   readonly ECPAY_HASH_IV: string;
}

export function buildPaymentProvider(env: PaymentEnv): PaymentProvider {
  if (env.FAKE_PAYMENT_PROVIDER === "1") {
    const origin = env.PUBLIC_ORIGIN ?? "http://localhost:8788";
    return new FakeProvider({
      callbackUrl: `${origin}/api/payment/callback`,
    });
  }
  throw new Error(
    "PaymentProvider not configured. Run the install skill (Mantle) " +
      "to wire a provider, or implement PaymentProvider in " +
      "src/payment/providers/<provider>.ts and replace this stub.",
  );
}
