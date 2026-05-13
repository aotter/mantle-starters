/**
 * Provider selector — INTENTIONALLY EMPTY in the shipped starter.
 *
 * This starter is provider-blank: no Stripe / ECPay / PayUni
 * implementation ships. The transaction install Skill (lives at
 * `clam-cms-starters/transaction/SKILL.md` when this is the ready
 * archetype) tells Mantle to:
 *
 *   1. Ask the user which payment provider they want (Stripe /
 *      ECPay / PayUni / custom).
 *   2. Scaffold `src/payment/providers/<provider>.ts` inside the
 *      user's repo during install, implementing PaymentProvider
 *      against the provider's docs.
 *   3. Replace this file's export to instantiate the new provider.
 *   4. Document the required env vars in `mantle/site.md`; the user
 *      sets them via `wrangler secret put` during provision.
 *
 * Until Mantle runs the install step above, this file is a stub
 * that fails-loud at boot — `pnpm dev` (or first request) throws
 * with a clear "provider not configured" message rather than
 * pretending to work.
 *
 * Why no default impl: keeping the starter provider-agnostic means
 * no Stripe bias for non-US markets and no .example files that rot.
 * Adding a new provider doesn't need a starter PR — only a SKILL
 * update that teaches Mantle the new provider's shape.
 */

import type { PaymentProvider } from "./provider.js";

export interface PaymentEnv {
  // Mantle replaces this when it wires the chosen provider.
  // Example after Stripe wiring:
  //   readonly STRIPE_SECRET_KEY: string;
  //   readonly STRIPE_WEBHOOK_SECRET: string;
}

export function buildPaymentProvider(_env: PaymentEnv): PaymentProvider {
  throw new Error(
    "PaymentProvider not configured. Run the install skill (Mantle) " +
      "to wire a provider, or implement PaymentProvider in " +
      "src/payment/providers/<provider>.ts and replace this stub.",
  );
}
