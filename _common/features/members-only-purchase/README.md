# `members-only-purchase` feature overlay

Optional toggle for the `transaction` archetype: when enabled,
customers must complete sign-in before `/api/checkout/start` is
allowed. The feature depends on `customer-account` so the sign-in
flow + session helpers are guaranteed available.

## What the scaffolder ships when this feature is selected

| Path in scaffolded project | Origin | Notes |
|---|---|---|
| `src/features/members-only-purchase/checkoutPolicy.ts` | feature source | `getCheckoutPolicy(env)` and `enforceCheckoutPolicy(request, env, auth)` helpers |
| `src/features/customer-account/...` | dependency (auto-included) | Sign-in pages, session helpers, linked-accounts API |
| `src/.mantle/generated.auth-methods.ts` | scaffolder (via customer-account) | Magic-link + email-OTP entries |

The feature contributes only an `env` declaration to glue
(`CHECKOUT_POLICY: string`, default `"open"`). Everything else is
source code the host starter imports directly.

## Wiring contract

At the top of the starter's `/api/checkout/start` handler, call the
gate before any payment-provider work:

```ts
import { enforceCheckoutPolicy } from "./features/members-only-purchase/checkoutPolicy.js";

app.post("/api/checkout/start", async (c) => {
  const env = c.env as { CHECKOUT_POLICY?: string };
  const guard = await enforceCheckoutPolicy(c.req.raw, env, auth);
  if (guard) return guard;
  // …existing checkout-start logic…
});
```

That's the whole integration. `enforceCheckoutPolicy` short-circuits
to `null` when policy is `"open"`, so leaving the line in even with
the toggle off is a no-op — adopters don't have to conditionally
include it.

## Policy values

- `CHECKOUT_POLICY=open` (default) — anonymous checkout permitted.
  Standard guest-purchase flow.
- `CHECKOUT_POLICY=members-only` — sign-in required before checkout
  starts. Browser navigations get a 302 redirect to
  `/account/sign-in?return_to=/checkout`; XHR / fetch requests get a
  401 JSON response with a structured `signInUrl` field so the SPA can
  decide whether to redirect or show an inline message.

Unknown values fall back to `"open"` with a `console.warn` so a
misconfigured env doesn't silently break checkout in production.

## What's NOT in scope

- **`orders.userId` foreign key** — adopters who want to attribute
  orders to their customer rows can add this as a separate schema
  manifest extension. The runtime enforcement here is at checkout-
  start; the order row's data shape is the transaction archetype's
  concern, not this feature's.
- **Re-wrapping `addToCart`** — cart accumulation stays anonymous so
  guests can browse + add. The members-only gate only fires when the
  user tries to convert the cart into an order.
- **Per-product members-only flags** — site-wide policy only. A future
  feature can layer a per-SKU `members-only: true` flag if needed.

## Compose schemaVersion

`_compose/glue.json` declares `"schemaVersion": 2` because the
dependency (`customer-account`) is a v2 feature. The dependency is
declared via `registryDependencies: ["customer-account"]` in
`sources.json`, so the resolver auto-includes it.
