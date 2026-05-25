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

## checkoutStart integration

`getDefaultAddress(profile)` returns the default address row (or
`undefined`) so the checkout form can pre-fill. The order-commit
path then snapshots the chosen address onto the order entry's
`shippingAddress` field (already declared in `orders.yaml`).
Wiring that is out of scope for this overlay PR — a separate PR
against the transaction archetype source covers it.

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
