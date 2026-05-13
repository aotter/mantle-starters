# PR 5 review — `feat/transaction-pr5-templates-and-flip`

Baseline: `pnpm typecheck` clean; `pnpm validate` 0 errors / 1 expected warning (locale CLI-skip).
Range: `origin/main..HEAD` — 21503c4 on top of the PR 4 follow-up.

This is the flip-to-`ready` PR, so anything labelled MAJOR should land *before* merge.
Cosmetic / nit-level issues are intentionally absent (simplifier owns those).

---

## MAJOR — must address before merge

### M1. `/api/cart/add` and `/api/checkout/start` have **no CSRF protection**
These are the first browser-origin POST endpoints in the whole `mantle-starters`
repo. `mountServerEndpoints` in `@aotter/mantle-cloudflare` does not add an
Origin / Sec-Fetch / token CSRF gate — I grepped the dist (`csrf|sec-fetch|same-?site`
all empty). `publication` has no public POSTs to compare against, so this is a
*new* posture decision being shipped silently with the readiness flip.

Concrete impact:

- `/api/cart/add` accepts `application/json`. An attacker-controlled page can
  POST with `Content-Type: text/plain` and a JSON-shaped body — CORS preflight
  is skipped, the handler still parses it via `c.req.json()`, and any victim
  who once visited the shop has a `cartId` in localStorage that the attacker
  doesn't even need (any UUID is accepted, KV write happens, cart shows up if
  the attacker can later trick the victim into checkout).
- `/api/checkout/start` is gated by Turnstile (`TURNSTILE_SECRET_KEY` optional
  — if unset, `verifyTurnstile` is permissive — confirm in `turnstile.ts`), so
  the CSRF blast radius there is "burn a Turnstile token + reserve real
  inventory under a victim's cartId." Still bad.

Minimum fix (v0.1, no infra changes): Origin / Sec-Fetch-Site check in each
handler, rejecting anything that isn't `same-origin` against `PUBLIC_ORIGIN`.
Two lines per handler. Document the posture in `SKILL.md` so adopters wiring
real domains know what's gating them.

If we want to ship as-is, the v0.1 docs need an explicit "this starter has no
CSRF defenses — anyone embedding the shop in an iframe / cross-origin POSTing
to /api/cart/add can affect the user's cart" warning. I'd rather fix in code.

### M2. `orderStatus.tsx` "clear stale cart" call is a no-op masquerading as cleanup
```js
fetch("/api/cart/get?cartId=…").catch(() => {});
```
This is a *read*, not a clear. There is no `cart/clear` endpoint in this PR.
After a successful order the customer's localStorage `cartId` still points at
a fully-populated KV cart for the 7-day TTL — so the cart icon in the header
keeps showing items until either expiry or the customer manually adds another.

Either:
1. Add a `POST /api/cart/clear` Trigger (matches the manifest-first posture)
   and call it here, OR
2. At minimum, `localStorage.removeItem("cartId")` client-side so the next
   page-load mints a fresh empty cart. Cheap, no server roundtrip needed.

Pick (2) if PR 5 is meant to be the last PR; otherwise (1) is the architecture-
clean answer.

---

## MINOR — fix or defer with a note

### m1. `productList.tsx` ProductListItem has no `description` — but the route hands `p.description` to the **detail** template
Not a bug in PR 5 strictly, but worth flagging: `productDetail.tsx` renders
`{p.description}` as a JSX child, which hono escapes — so no XSS there. The
"untrusted product description body" path is **safe**. Same for `p.title` in
the Layout `<title>{props.title}</title>` — JSX-escaped, fine.

### m2. `/api/cart/get` info-disclosure model is the cartId-as-bearer-token pattern, undocumented
A stolen `cartId` (XSS in the customer's own session, or a shared URL
during checkout) gives full cart contents — but **not** customer email, since
email is collected at `checkoutStart` and goes into the *orderCart* stash
keyed by `orderId`, not the cart KV. So the cart-cookie leak surface is just
`{ productSlug, qty }`. Acceptable.

The `cartId` is `c_<crypto.randomUUID()>` — 122 bits, not guessable.
**Document the cartId-as-bearer model in SKILL.md** so an adopter changing
this doesn't accidentally make it weaker.

### m3. `/order/:orderId` is also a bearer-token URL — exposes customerEmail + items
`readOrderStatus` returns `customerEmail`, line items, payment provider, and
payment intent id, gated only by knowing the orderId (`o_<uuid>` — fine for
guessability). Customers commonly screenshot / share order URLs to friends or
in forum posts. **Document this in `SKILL.md` "Privacy model"** — single
short paragraph. The Procedure manifest already says "the orderId acts as
the shared secret" but the customer-facing template (`/order/:orderId`)
doesn't acknowledge it.

### m4. Inline `<script>` and `<style>` defeat any future strict-CSP rollout
Every template ships inline JS via `raw(...)`. Adopters who want
`Content-Security-Policy: script-src 'self'` will need to either inject a
nonce per response or refactor to external files. A `// CSP note` in
`layout.tsx` header comment would save someone a half-day later.

The `escapeHtml` functions inside the inline JS bodies are fine — they cover
`& < > " '` which is sufficient for HTML body/attr context (they're used via
`.innerHTML` building so attr/body interpolation is correctly handled). I
walked each template's `escapeHtml(item.title)`, `escapeHtml(item.productSlug)`,
`escapeHtml(data.currency)`, `escapeHtml(data.customerEmail)`,
`escapeHtml(err.message)`, `escapeHtml(orderId)` — all correct.

The orderId interpolation in `orderStatus.tsx` uses `JSON.stringify` for
`window.__orderId = …` — also correct (JSON-encoded string literal can't
break out unless orderId contained `</script>` literally; the URL routing
won't pass that through anyway).

### m5. No rate limiting on `/api/cart/add`
Anonymous unbounded — one cartId can accumulate ≤99 of one slug per call but
unlimited slug rows. KV write per call. At ≤100 orders/day scale this is
fine, but a single attacker can write tens of thousands of KV entries by
churning random `cartId`s. v0.1 fix: note in `SKILL.md` that adopters with
public addresses should put CF Rate Limiting in front. Cheap doc-only fix.

### m6. OrderStatus polling: 60 reads/customer is fine at scale; but `/api/order/status` should set `Cache-Control: no-store`
Right now it returns plain `c.json(...)` — depending on CF's default cache
behaviour the polling responses could in theory be cached briefly along the
edge once `exists: true` lands. Defensive `c.header("cache-control", "no-store")`.

SSE / websocket is not worth it at ≤100 orders/day. Polling is the right call.

### m7. `readCart.enrichItems` silently drops unpublished products
UX gap, not a security issue: customer's total drops with no notice. Add a
"this item is no longer available" row in the cart template, or — simpler —
have `enrichItems` return `{ items, removed: [...] }` and let the template
render a `notice` for `removed`. The code comment in `readCart.ts` already
admits the issue; the template should surface it.

### m8. `/api/cart/get` returns 404 on empty cart with `{exists: false, …}` body
Mildly weird HTTP semantics — the resource exists (the cart endpoint is
findable), the cart is just empty. Recommendation: return 200 with `exists:
false`, or 204. Templates already branch on `res.status === 404` so changing
this is a contract bump; leave for v0.2 if not addressing M1/M2.

---

## INFO — non-blocking

### i1. Inline CSS bundle ~3.2 kB per HTML response
Stated cost in `layout.tsx` ("Inline CSS keeps the entire shipping surface
readable"). Acceptable for reference templates; not worth extracting.

### i2. `sources.json` consistency — clean
`transaction` is in `archetypes{}` and out of `roadmap[]`. Cross-checked:
`packages/create-mantle/src/sources.ts` `STALE_FALLBACK_SOURCES` still has
`transaction` in `roadmap` (intentional — bundled snapshot is conservative,
per the file's own docstring), and `test/sources.test.ts` still uses
`{roadmap: ["transaction"]}` as a *test fixture* (not a registry). No theme
registry references transaction. No further updates needed in this repo.

The `create-mantle` package will publish its own bump when the live fetch
flow becomes the only path (separate epic). Don't touch it here.

### i3. Smoke gaps — top 3
1. **No POST smoke for `/api/cart/get` empty-vs-populated branch** — only the
   404 path is exercised. Add one that calls `/api/cart/add` then GETs and
   asserts `exists:true` + items length.
2. **No template-XSS regression test** — install a product with a title like
   `<script>alert(1)</script>`, GET `/product/<slug>`, assert the title is
   escaped (`&lt;script&gt;` in body). Cheap insurance.
3. **No CSRF smoke** (if M1 fix lands) — POST `/api/cart/add` with `Origin:
   evil.example` and expect 403.

---

## Ship recommendation

**Block on M1 + M2.** M1 is the readiness-flip security regression — once
this PR merges, real users install a starter with browser POSTs that anyone
can fire cross-origin. The minimum-viable fix is two-line Origin checks +
one paragraph in `SKILL.md`; an hour of work, not a rearchitect. M2 is a
visible UX bug (cart stays full after checkout) and a one-line localStorage
clear fixes it.

Once M1 + M2 land, ship it. Everything else is minor / doc-fix territory
that can ride a follow-up PR. The PR is otherwise structurally clean: SSR
escaping is correctly delegated to hono/jsx everywhere except inside `raw()`
blocks (which are static strings, no interpolation), inline-script
`escapeHtml` covers the right charset, `cartId` and `orderId` entropy is
adequate, and the readiness flip in `sources.json` is consistent with the
rest of the registry.

Delete this file before merge per PR 3 / PR 4 hygiene.
