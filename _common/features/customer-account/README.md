# `customer-account` feature overlay

Passwordless customer sign-in (magic-link + email-OTP) plus a minimal
`/account` dashboard and a linked-accounts settings page. Targets the
`transaction` archetype but the source files (`session.ts`,
`linkedAccountsApi.ts`, the three `render*.ts` helpers) are
archetype-agnostic — any starter wiring Better Auth via the
`createAuth` SDK facade can consume them.

## What the scaffolder ships when this feature is selected

| Path in scaffolded project | Origin | Notes |
|---|---|---|
| `src/features/customer-account/session.ts` | feature source | `getCustomerSession` + `requireCustomerSession` helpers |
| `src/features/customer-account/linkedAccountsApi.ts` | feature source | JSON API for `GET /account/api/linked-accounts` + `POST .../unlink` |
| `src/features/customer-account/renderSignIn.ts` | feature source | `GET /account/sign-in` HTML renderer |
| `src/features/customer-account/renderAccountHome.ts` | feature source | `GET /account` HTML renderer |
| `src/features/customer-account/renderLinkedAccounts.ts` | feature source | `GET /account/settings/linked-accounts` HTML renderer |
| `src/features/customer-account/accountSlot.ts` | feature source | `renderAccountSlot(opts)` — header-chrome session-slot helper (#218) |
| `src/.mantle/generated.auth-methods.ts` | scaffolder | `buildFeatureAuthMethods(env, sender)` returns `[magic-link, email-otp]` |

## Wiring contract

The feature does NOT auto-register HTTP routes — Better Auth's mount
already owns `/api/auth/*`, but the user-facing pages and the
linked-accounts JSON API have to be wired by the host starter. The
expected wiring (added by the transaction archetype in a subsequent PR)
looks roughly like:

```ts
import {
  handleListLinkedAccounts,
  handleUnlinkAccount,
} from "./features/customer-account/linkedAccountsApi.js";
import { renderSignIn } from "./features/customer-account/renderSignIn.js";
import { renderAccountHome } from "./features/customer-account/renderAccountHome.js";
import { renderLinkedAccounts } from "./features/customer-account/renderLinkedAccounts.js";
import { buildFeatureAuthMethods } from "./.mantle/generated.auth-methods.js";

// In createAuth(...):
const auth = createAuth({
  /* ... */,
  methods: [
    /* archetype/staff methods first */
    ...buildFeatureAuthMethods(env, customerEmailSender),
  ],
});

// In the Hono / handler dispatcher:
app.get("/account/sign-in", (c) => renderSignIn({ request: c.req.raw, auth }));
app.get("/account", (c) => renderAccountHome({ request: c.req.raw, auth }));
app.get("/account/settings/linked-accounts", (c) =>
  renderLinkedAccounts({ request: c.req.raw, auth }));
app.get("/account/api/linked-accounts", (c) =>
  handleListLinkedAccounts(c.req.raw, auth));
app.post("/account/api/linked-accounts/unlink", (c) =>
  handleUnlinkAccount(c.req.raw, auth));
```

## What's NOT in scope here

- **OAuth provider wiring (GitHub / Google / Apple)** — adopters add `kind: "social"` entries via the starter's own `methods[]` array. `buildFeatureAuthMethods` only ships the passwordless email pair so the feature is sender-only by default; socials are starter-owned config (clientId / clientSecret).
- **Adding a linked-social flow on the settings page** — Better Auth's `linkSocial` requires client-side coordination (`auth.linkSocial({ provider })` against the BA client SDK). The v1 template lists existing linked accounts and offers unlink only. Add-flow is a follow-up.
- **`members-only-purchase`** — separate feature (PR-G) that depends on this one and wraps `checkoutStart` with `requireCustomerSession`.
- **Schema migrations** (e.g. `orders.userId`) — also separate; the feature does not declare any Schema manifests today.

## Auth method order

`auth_methods.entries` in `_compose/glue.json` lists magic-link first,
then email-OTP. The starter splices this list onto the end of its own
`methods[]` via `...buildFeatureAuthMethods(env, sender)`, so any
staff-side socials configured first stay first. Order matters for
Better Auth's same-email auto-link rule — the first verified-email
method wins the user row.

## Header session-slot helper (#218)

The feature also exports a layout-fragment helper for the storefront
chrome — drop the result of `renderAccountSlot()` into your `<header>`
template and the slot's inline script handles probing
`/api/auth/get-session`, swapping markup based on the response, and
wiring the sign-out POST.

```ts
import { renderAccountSlot } from "./features/customer-account/accountSlot.js";

// In your chrome template:
const headerHtml = `
  <header>
    <a class="brand" href="/">My Shop</a>
    <nav>… site links …</nav>
    ${renderAccountSlot({ signInLabel: "登入" })}
  </header>
`;
```

The helper emits a `<span data-account-slot>` for the swap target plus
an inline `<script>` that bootstraps every slot on the page (header +
mobile drawer = two slots, both auto-bound).

Hooks for branding:

- `data-account-slot-anon` — the anonymous "Sign in" anchor
- `data-account-slot-trigger` — the signed-in dropdown trigger button
- `data-account-slot-menu` — the dropdown's `<div role="menu">`
- `data-account-slot-signout` — the sign-out `<form>` inside the menu

Style by attribute selector (`[data-account-slot-trigger] { … }`) or
add classnames at render time via `slot.querySelector(...)`.

After a sign-in flow that does NOT go through the slot's own
`<form>` (e.g. magic-link redirect lands back on `/`), call
`window.refreshAccountSlot()` from your page's success handler to
re-run the probe.

### HttpOnly cookie trap — DO NOT sniff `document.cookie`

The Better Auth session cookie is **HttpOnly**: JavaScript cannot read
it via `document.cookie`. A common copy-paste failure is to gate the
session probe behind:

```js
// !! DON'T !! — the regex always misses because the cookie is HttpOnly
if (!/(?:^|; )(?:better-auth\.session_token|__Secure-better-auth\.session_token)=/.test(document.cookie || "")) {
  return;
}
```

That early-return always fires, so the chrome shows the anonymous
markup even when the user is signed in server-side. The helper above
always round-trips to `/api/auth/get-session` — that's the only
reliable signal. If anonymous-traffic chatter against `/api/auth/*`
becomes a real concern, the SDK-side fix is a non-HttpOnly
session-present sentinel cookie (tracked separately as a future
mantle change); local workarounds are not.

## Compose schemaVersion

`_compose/glue.json` declares `"schemaVersion": 2` because
`auth_methods` is a v2 compose target. A scaffolder that only supports
v1 will hard-fail with "scaffolder upgrade required" rather than
silently dropping the auth methods.
