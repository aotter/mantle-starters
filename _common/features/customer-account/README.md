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
| `src/features/customer-account/linkedAccounts.ts` | feature source | `listLinkedAccountsFor` / `unlinkProviderFor` wrappers + `renderLinkedAccountsSection` embeddable HTML fragment (#235) |
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

## Wiring email delivery (#219)

The feature ships magic-link and email-OTP auth methods, but does NOT
ship an email sender. The starter chooses one — Resend / Postmark /
SendGrid / SMTP all implement the SDK's narrow
[`EmailSender`](https://github.com/aotter/mantle/blob/develop/packages/mantle-runtime/src/domain/port/EmailSender.ts)
port:

```ts
interface EmailSender {
  send(args: {
    to: string;
    subject: string;
    text: string;
    html?: string;
    locale: string;     // BCP 47
    category?: string;  // e.g. "auth.email-otp.sign-in"
  }): Promise<void>;
}
```

For local dev, fall back to the SDK's
[`ConsoleEmailSender`](https://github.com/aotter/mantle/blob/develop/packages/adapters/cloudflare/src/auth/ConsoleEmailSender.ts):
magic-links and OTP codes print to the worker log instead of going
out over the network, so sign-in still completes without a provider
account.

### Recipe: Resend

[Resend](https://resend.com/) is the Workers-friendly default — REST
API, no Node SDK, no npm dep to pin. The whole adapter fits in ~50
lines. Drop this into `src/auth/senders/resend.ts` in your starter:

```ts
import type { EmailSender, EmailSendArgs } from "@aotter/mantle-runtime";

export interface ResendSenderConfig {
  /** Resend API key (https://resend.com/api-keys). */
  readonly apiKey: string;
  /** RFC 5322 `From:` header. Must be a verified domain on Resend. */
  readonly from: string;
}

export class ResendEmailSender implements EmailSender {
  constructor(private readonly config: ResendSenderConfig) {}

  async send(args: EmailSendArgs): Promise<void> {
    // args.locale is intentionally not forwarded to Resend — the
    // EmailSender port lets a sender branch on locale (template
    // lookup etc.), but for a pure pass-through provider the
    // upstream caller already built the localized `subject`/`text`/
    // `html`. If you swap in templated subjects per locale, read
    // args.locale here.
    const body: Record<string, unknown> = {
      from: this.config.from,
      to: [args.to],
      subject: args.subject,
      text: args.text,
    };
    if (args.html) body.html = args.html;
    if (args.category) {
      // Resend tag values are restricted to [A-Za-z0-9_-] — strip
      // dots / colons / slashes that the SDK uses in category strings
      // like "auth.email-otp.sign-in" so the API call doesn't 422.
      const safeValue = args.category.replace(/[^A-Za-z0-9_-]/g, "_");
      body.tags = [{ name: "category", value: safeValue }];
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      // Truncate the body so we don't dump a huge HTML error page into
      // the worker log; 512 bytes is enough to identify the failure.
      // The recipient's full address is intentionally omitted from the
      // error to keep PII out of logs — log the domain part only so
      // ops can still classify failures by destination.
      const detail = (await res.text().catch(() => "")).slice(0, 512);
      const toDomain = args.to.split("@")[1] ?? "?";
      throw new Error(
        `Resend send failed for <…@${toDomain}> (${res.status}): ${detail}`,
      );
    }
  }
}
```

Then wire it through `createAuth` with the dev-fallback:

```ts
import { ConsoleEmailSender } from "@aotter/mantle/cloudflare";
import { ResendEmailSender } from "./auth/senders/resend.js";
import { buildFeatureAuthMethods } from "./.mantle/generated.auth-methods.js";

const customerEmailSender = env.RESEND_API_KEY && env.EMAIL_FROM
  ? new ResendEmailSender({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM })
  : new ConsoleEmailSender();

const auth = createAuth({
  /* ... */,
  methods: [
    /* archetype/staff methods first */
    ...buildFeatureAuthMethods(env, customerEmailSender),
  ],
});
```

### Env wiring

Add `RESEND_API_KEY` (secret) and `EMAIL_FROM` (plain) to your
Worker's env:

```toml
# wrangler.toml — non-secret defaults
[vars]
EMAIL_FROM = "Acme <auth@example.com>"
```

```sh
# .dev.vars (gitignored — local secret + dev fallback)
RESEND_API_KEY="re_xxxxxxxxxxxx"
EMAIL_FROM="Acme <auth@example.com>"
```

Production secrets land via `wrangler secret put RESEND_API_KEY`. Add
`RESEND_API_KEY=` (blank) to `.dev.vars.example` so contributors know
to set it locally; never check the real key in. The dev fallback to
`ConsoleEmailSender` kicks in when `RESEND_API_KEY` is absent — magic
links print to the worker log, so contributors can still complete
sign-in without provisioning a Resend account.

Production shops can swap providers by reimplementing the same
`EmailSender` interface — no SDK or feature changes required.

### Why not bundle Resend as an SDK / feature dep?

Provider choice belongs in starter space, not the SDK or this
feature's `src/`. A pinned `resend` npm dep would (1) commit every
adopter to that vendor, (2) compete with the SDK's port boundary
(the SDK's job is the interface, not any one impl), and (3) make
Postmark / SendGrid recipes second-class. The raw `fetch` snippet
above is roughly the same length as the official Resend client for
this use case but ships zero deps.

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

The helper emits a `<div data-account-slot>` for the swap target plus
an inline `<script>` that bootstraps every slot on the page (header +
mobile drawer = two slots, both auto-bound).

**One config per page**: the bootstrap installs its document-level
listeners and reads its config closure once. Two `renderAccountSlot`
calls on the same page render their respective server-side anonymous
markup, but the client-side refresh always rebuilds from the FIRST
call's options (sign-in label, account href, etc.). For the storefront
chrome + mobile drawer case this is intentional — both slots want the
same labels. Diverge via CSS, not via separate `opts` per slot.

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

## Linked-accounts section helper (#235)

`linkedAccounts.ts` exports a service-layer pair + a render helper
so adopters can embed a "Sign-in methods" section into `/account`
home (or a separate settings page) without re-implementing the
listing/unlink HTML.

```ts
import {
  listLinkedAccountsFor,
  unlinkProviderFor,
  renderLinkedAccountsSection,
} from "./features/customer-account/linkedAccounts.js";
```

The default `renderAccountHome` call already embeds the section
inline (pass `showLinkedAccountsSection: false` to suppress).

### Magic-link is always available — render an implicit row

Email-OTP / magic-link sign-ins **do not write to the `account`
table** (see the SDK's `Auth.unlinkAccount` JSDoc). `listLinkedAccounts`
therefore returns ONLY the social providers the user linked. A
magic-link-only user otherwise sees an empty section and might
think they have no way to sign back in.

`renderLinkedAccountsSection` solves this by always rendering a
final row keyed to the user's email — labelled "Email magic-link
— always available" by default — with no unlink form attached.
Adopters who localize the section pass `magicLinkLabel` /
`heading` / `unlinkLabel`.

Corollary: `unlinkAccount` does NOT need a "last sign-in method"
guard in adopter code. Magic-link via the user's verified email is
the safety net as long as the starter's `auth.methods` array
declares it (which `buildFeatureAuthMethods` does by default).

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
