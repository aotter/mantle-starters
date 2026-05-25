# `customer-profile` feature overlay

Customer profile + shipping-address book for the storefront's
`/account` surface. KV-backed (one `profile:<userId>` row per
user), form-POST UI, no JS required. Depends on the
`customer-account` feature for the session helper.

## Why KV, not the entries lifecycle

1. **Private user data** — keeping profile out of the entries
   table preserves the customer/admin boundary. The admin editor
   shouldn't wander into addresses.
2. **O(1) lookup by userId** — the entries path needs a
   parameterized View or a `listEntries` scan per load.
3. **Single user-owned blob** — no draft → publish lifecycle, no
   audit history, no admin editor needed. Cart already uses KV
   with the same contract; adding a second KV surface is
   consistent.

## What the scaffolder ships when this feature is selected

| Path in scaffolded project | Origin | Notes |
|---|---|---|
| `src/features/customer-profile/profile.ts` | feature source | Types + `loadCustomerProfile` / `addAddress` / `removeAddress` / `setDefaultAddress` / `getDefaultAddress` |
| `src/features/customer-profile/renderProfile.ts` | feature source | `GET /account/profile` server-rendered list + add form |
| `src/features/customer-profile/handleProfileMutation.ts` | feature source | POST handlers for `/account/profile/{add,remove,default}`; ok-/err-via-query-param redirect-back |

## Address-list invariants

- The first address auto-promotes to `defaultAddressId`. A
  single-address user doesn't need to click "set default" before
  checkout can use it.
- Removing the default promotes the **newest remaining** address.
- Removing the last address clears `defaultAddressId`.
- The KV row is rejected (silently dropped + treated as empty) if
  it doesn't have the basic address shape — guards against
  manually-edited rows or schema drift across migrations.

## Wiring contract

The feature does NOT auto-register HTTP routes. The host starter
wires four routes (one read + three writes) into its Hono app:

```ts
import { renderProfile } from "./features/customer-profile/renderProfile.js";
import {
  handleAddAddress,
  handleRemoveAddress,
  handleSetDefaultAddress,
} from "./features/customer-profile/handleProfileMutation.js";

// CSRF the writes alongside cart / checkout routes.
app.use("/account/profile/add", csrfGuard);
app.use("/account/profile/remove", csrfGuard);
app.use("/account/profile/default", csrfGuard);

app.get("/account/profile", (c) =>
  renderProfile({
    request: c.req.raw,
    auth,
    kv: (c.env as Env).KV,
  }));
app.post("/account/profile/add", (c) =>
  handleAddAddress(c.req.raw, auth, (c.env as Env).KV));
app.post("/account/profile/remove", (c) =>
  handleRemoveAddress(c.req.raw, auth, (c.env as Env).KV));
app.post("/account/profile/default", (c) =>
  handleSetDefaultAddress(c.req.raw, auth, (c.env as Env).KV));
```

## Localization knobs

`renderProfile` accepts adopter-specified country list + a flag to
toggle the district (區) field visibility. TW shops keep the
default `[{ code: "TW", label: "Taiwan" }]` + `showDistrict: true`;
international shops pass their own list.

```ts
renderProfile({
  request: c.req.raw,
  auth,
  kv: (c.env as Env).KV,
  countries: [
    { code: "TW", label: "台灣" },
    { code: "JP", label: "日本" },
    { code: "US", label: "United States" },
  ],
  showDistrict: false, // hide for non-TW shops
});
```

Form labels (`Recipient name`, `Phone`, `City`, etc.) are
hard-coded English in v1; adopters who need full TW Chinese
translation copy the rendered HTML into their template and
substitute. A follow-up issue can plumb a label map through.

## checkoutStart integration (#240)

The transaction archetype already threads
`CheckoutStartInput.shippingAddress` → `OrderCart.shippingAddress`
→ `OrderRowData.shippingAddress`, and the checkout template pre-
fills its fields from `defaultAddress` + `userEmail` context. Two
adopter wire-up steps complete the loop:

### 1. Pre-fill the form on GET /checkout

```ts
import { renderCheckout } from "./templates/checkout.js";
import {
  loadCustomerProfile,
  getDefaultAddress,
} from "./features/customer-profile/profile.js";

app.get("/checkout", async (c) => {
  const session = await auth.getSession(c.req.raw);
  let userEmail: string | undefined;
  let defaultAddress: ShippingAddress | undefined;
  let profileIsEmpty = false;
  if (session) {
    userEmail = session.user.email;
    const profile = await loadCustomerProfile((c.env as Env).KV, session.user.id);
    defaultAddress = getDefaultAddress(profile);
    profileIsEmpty = profile.addresses.length === 0;
  }
  const site = await (await cms.get()).siteConfig.load();
  return c.html(renderCheckout({ site, userEmail, defaultAddress, profileIsEmpty }));
});
```

### 2. Save the typed address on first POST /api/checkout/start

The submit handler in `checkout.tsx` already sends
`body.shippingAddress` + `body.saveAddress`. Add a pre-Trigger
middleware that fires the save best-effort:

```ts
import { saveFirstAddressIfEmpty } from "./features/customer-profile/profile.js";

app.use("/api/checkout/start", async (c, next) => {
  const session = await auth.getSession(c.req.raw);
  if (!session) return next();
  // Clone the body so the downstream Trigger handler can still
  // read it — request bodies are single-use streams.
  const cloned = c.req.raw.clone();
  const body = (await cloned.json().catch(() => ({}))) as {
    shippingAddress?: ShippingAddress;
    saveAddress?: boolean;
  };
  if (body.saveAddress && body.shippingAddress) {
    try {
      await saveFirstAddressIfEmpty(
        (c.env as Env).KV,
        session.user.id,
        body.shippingAddress,
      );
    } catch (err) {
      // Don't block checkout on a profile-save failure.
      console.warn("[customer-profile] first-address save failed:", err);
    }
  }
  await next();
});
```

`saveFirstAddressIfEmpty` is a no-op when the profile already has
addresses, so repeat checkouts never overwrite an existing default.

> **Middleware ordering**: register this BEFORE `mountServerEndpoints`
> in your `src/index.ts`. The middleware uses `c.req.raw.clone()` to
> peek at the body without consuming it; any earlier middleware
> that reads the original body would leave the downstream
> Trigger handler with an exhausted stream.

> **First-checkout race**: load → check empty → save is not atomic.
> Two concurrent first-checkouts (rare — usually the same user on
> two tabs) can both pass the empty check and end up with two
> address rows; the second becomes the default. Acceptable at the
> starter's sizing per the "best-effort" contract; if a real
> contention case emerges, route through a `ProfileActor` Durable
> Object keyed by `userId`.



## Race / limits posture

- **KV is eventually consistent** — `addAddress` / `removeAddress`
  / `setDefaultAddress` each do a load-modify-store cycle without
  CAS / etag. Two-tab concurrent adds can lose the second
  address. Acceptable at the storefront's editing cadence; if real
  contention emerges, swap the KV row for a `ProfileActor` Durable
  Object keyed by `userId`.
- **Field length cap 255 chars** — every string field
  (`recipientName`, `phone`, `street`, etc.) is truncated server-
  side to 255 chars before writing. Prevents accidental KV bloat;
  adopters who need longer fields (multi-line street with company
  name) raise the cap in `handleProfileMutation.ts`.

## What's NOT in scope

- **Edit-in-place** of an existing address — v1 is add / remove
  only. Adopters who need edit can layer a "remove + re-add"
  flow client-side or open a follow-up.
- **Phone / postal-code validation** beyond presence — different
  countries have different formats. Adopters add at the form
  layer.
- **CS / staff tool** to view or edit a customer's profile —
  separate support tool that reads the same KV key.

## Compose schemaVersion

`_compose/glue.json` declares `"schemaVersion": 2` for parity with
the sibling overlays — the feature contributes no glue entries
today (no env, no auth methods, no manifests), but the schema bump
keeps it eligible for future targets without a re-version.
