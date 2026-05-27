# `mantle-starters/transaction`

> **This README ships with your scaffolded project.** If you're reading
> it on GitHub at `aotter/mantle-starters/transaction`, the
> Getting-started block below **does not work on a raw clone** —
> `src/mantleConfig.ts` contains literal `{{BRAND}}` / `{{LOCALES}}` /
> `{{DESCRIPTION}}` placeholders that the `create-mantle` scaffolder
> substitutes at install time. A fresh-clone `pnpm dev` throws
> `SyntaxError: Expected property name or '}' in JSON` at boot.
>
> **To evaluate this starter end-to-end**, scaffold a throwaway site:
>
> ```bash
> cd /tmp
> npx https://github.com/aotter/mantle-starters/releases/download/v0.0.11-alpha.13/aotter-create-mantle.tgz transaction \
>   --project-name eval-transaction \
>   --brand "Eval Transaction" \
>   --description "Throwaway transaction mantle evaluation" \
>   --locales "en" \
>   --github-owner "<your-github-login>" \
>   --summary "Evaluate transaction starter"
> cd /tmp/eval-transaction
> # then follow the Getting-started block below in that directory
> ```
>
> Or paste the two-URL prompt from the Mantle landing page into
> your agent. See the [top-level README](../README.md) for the template
> model.

`transaction` archetype starter for mantle v0.1.0 — small-scale
shop (≤100 orders/day): products + cart + payment + orders. Backed
by Cloudflare Workers + D1 + KV + DurableObjects + Queues.

**Provider-agnostic by design.** The starter ships a `PaymentProvider`
interface and **no implementation**; Mantle (the install Skill) wires
the real provider (Stripe / Paddle / ECPay / PayUni / custom) in the
user's session at install time based on a single interview probe.

For brand-presence sites, use [`presence/`](../presence/). For
publishing sites, use [`publication/`](../publication/). For lead
capture without payment, use [`intake/`](../intake/).

## Architectural overview

| Piece | Where | Purpose |
|---|---|---|
| `InventoryActor` DO | `src/durableObjects/InventoryActor.ts` | Single DO per tenant. Holds find-and-modify locks for once-and-only-once payment-callback processing + atomic inventory reserve/commit/release. |
| `payment-callback-queue` | `wrangler.toml` + `src/handlers/orderConsumer.ts` | Workers Queue at `max_concurrency: 1`. HTTP handler verifies provider signature and queues; consumer does the real work under the DO lock. |
| `order-work-queue` | same | Workers Queue for downstream effects: email confirmation, fulfillment notify, inventory snapshot, reconcile tick. |
| `PaymentProvider` interface | `src/payment/provider.ts` | Three-method contract: `startCheckout`, `parseCallback`, `verifyReturn`. The starter is provider-blank; Mantle scaffolds an impl at install. |
| Two pattern templates | `src/payment/providers/_templates/` | `redirect-checkout.ts` (hosted-checkout style: Stripe / Paddle / Lemon Squeezy) + `merchant-form.ts` (merchant-rendered form: ECPay / PayUni / NewebPay). Coding agents read these to learn the shape; Mantle copies the closer one and adapts. |
| Cron sweeper | `wrangler.toml [triggers].crons` | Every 5 min → `order-work-queue:inventory.reconcile.tick` → sweeps stale `pending` locks (10 min TTL) so crashed-consumer work can retry. |

## Scale contract

This starter is sized for **≤100 orders/day** (~4-5 orders/hour at
peak). Single InventoryActor + `max_concurrency: 1` queues serialize
all work. Above that scale, contention bottlenecks the checkout path
and customers see queueing latency.

Mantle's install interview asks "roughly how many orders per day?"
and routes >100 to `commerce-pro` (roadmap — sharded DOs, multi-region,
higher-throughput design).

## Design choice + limits

Four concurrency / consistency hazards exist in any shop-like system.
Naming them up front so the choices below have something to defend.

| Hazard | What goes wrong without protection |
|---|---|
| **R1 — webhook retry** | Payment provider re-delivers a callback; two consumers try to mark the same order paid. |
| **R2 — synchronous race** | Two customers click "checkout" within ms on the last unit in stock; both decrement, oversell. |
| **R3 — multi-item bundle** | A cart with several items: stock for some is fine, others not. Either all reserve or none. |
| **R4 — TTL release** | A pending reservation never completes; held stock needs to return. |

This starter protects against all four with **one DurableObject +
two `max_concurrency: 1` queues**:

| Hazard | Protected by |
|---|---|
| R1 | `payment-callback-queue` (consumer serialization) + `InventoryActor.tryAcquire(workId)` (storage-level idempotency) |
| R2 | `InventoryActor.reserve()` — DO is single-threaded per instance, so concurrent `stub.fetch()` calls queue up inside the DO |
| R3 | `reserve()` checks + decrements every item in one DO method (multi-key atomic by construction) |
| R4 | DO Alarm (`expiresAt`) fires per-reservation; sweeper also runs as a backstop |

**Why one DO per tenant, not one DO per product?** Sharding by SKU
(`stub = INVENTORY_ACTOR.idFromName(productSlug)`) would scale linearly
with catalog size but breaks R3 — multi-item carts can't be reserved
atomically across DO instances. At ≤100 orders/day, one DO covers the
contention; the multi-item bundle is the dominant constraint.

**Why queues at all when DO already serializes?** Two reasons:

1. **Native webhook-retry semantics.** Cloudflare Queues give you
   `max_retries / retry_delay / dead_letter_queue` for free; the
   `payment-callback-queue` config (30 retries × 30s = ~15 min window)
   intentionally exceeds `InventoryActor.PENDING_LOCK_TTL_MS` so the
   sweeper + queue retry recover a crashed consumer without DLQ.
2. **Buffer between fast webhook delivery and slow inventory work.**
   The HTTP handler verifies the provider signature and queues; the
   consumer does the heavier reserve/commit work under the DO lock.
   Decoupling lets the webhook 200 OK fast (providers retry aggressively
   on slow responses).

**What this starter does NOT scale to:**

- **More than ~200 reserve req/s sustained.** DO storage operations
  cap at roughly that per single instance.
- **More than ~200 callback msg/s sustained.** `max_concurrency: 1`
  means one consumer at a time.
- **Multi-tenant within one Worker.** Each tenant = its own deploy;
  the `INVENTORY_ACTOR.idFromName("singleton")` pattern assumes one
  catalog per Worker.

**Graduation path** (what to change when you outgrow this shape):

| Symptom | Fix |
|---|---|
| Checkout latency rises during sales | Shard `InventoryActor` per SKU (`idFromName(productSlug)`); accept that multi-item bundles need a coordinator pattern (saga / Outbox), or run them sequentially with compensating release on partial failure. |
| Webhook consumer backlog | Raise `max_concurrency` on `payment-callback-queue`; re-verify R1 idempotency holds when consumers run in parallel (the DO `tryAcquire` lock still works because DO is the actual serialization point, not the queue). |
| Order count outgrows D1 IOPS | Move catalog + orders to Hyperdrive-backed PostgreSQL (mantle v0.2+); InventoryActor stays as the consistency layer. |
| Need geo-redundancy | Move to `commerce-pro` starter (roadmap) — multi-region DOs + replicated read views. |

The `commerce-pro` migration is the explicit "you've outgrown this"
exit; it isn't a config flip, it's a different starter you re-scaffold
into. Mantle's install Skill flags the size threshold during interview.

## PR series status

The transaction starter lands across four phased PRs in the v0.1.0
cycle:

- **PR 1 — scaffold** (this PR). Manifests + DO/handler skeletons +
  payment interface + two pattern templates + integration smoke.
  Compiles + validates; ref handlers throw "not implemented".
- **PR 2 — payment + idempotent callback consumer**. The find-and-modify
  lock pattern in `InventoryActor`; `paymentCallbackConsumer` under
  the lock; `addToCart` / `checkoutStart` / `checkoutReturn` /
  `readOrderStatus` ref handlers; end-to-end test via a FakeProvider
  fixture (no live provider needed).
- **PR 3 — downstream + cron**. `orderWorkConsumer` (email,
  fulfillment, snapshot, reconcile tick); `enqueueOrderConfirmed`;
  `snapshotInventory`; `restockProduct`; cron sweeper invoked via
  reconcile tick.
- **PR 4 — templates + sources.json flip**. Product list / product
  detail / cart / checkout / order confirmation page templates;
  `transaction/SKILL.md` flipped from roadmap-refuse to ready;
  `sources.json` adds transaction to the `archetypes` dict (until
  this lands, the directory exists but `npx create-mantle transaction`
  refuses).

## Getting started

```bash
pnpm install --frozen-lockfile
cp .dev.vars.example .dev.vars
```

> `--frozen-lockfile` matches what CI runs. Without it, a local install
> can silently regenerate `pnpm-lock.yaml` against newer dep versions,
> CI then runs against the stale committed lockfile, and you discover
> the drift in a deploy that worked locally but failed in CI. The
> first time this happens you lose an evening; the workflow rule
> avoids that.

Edit `.dev.vars` and fill in `BETTER_AUTH_SECRET=` — without it the worker
returns `auth_not_configured` on every request. Generate a value:

```bash
openssl rand -hex 32
# copy the output, paste it after `BETTER_AUTH_SECRET=` in .dev.vars
```

**`transaction` is stricter than the other starters about auth at boot.**
Unlike `publication` / `presence` / `intake`, the `transaction` worker
requires `BETTER_AUTH_SECRET` **plus** at least one registered auth method
to boot even for public read routes — `getApp` builds Better Auth at boot
and Better Auth refuses an empty methods list. The fastest way through is
to register a local-dev GitHub OAuth App at
<https://github.com/settings/developers> (Homepage `http://localhost:8787`,
Callback `http://localhost:8787/api/auth/callback/github`) and paste the
three values (`GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` /
`ADMIN_GITHUB_LOGIN`) into `.dev.vars`. `TURNSTILE_SECRET_KEY=dev-stub` is
fine for local development.

Seed the demo catalog and start the dev server:

```bash
pnpm validate
pnpm typecheck

# One-time: seed dev D1 with demo products so `/` renders a catalog
# instead of "No products yet."
pnpm fixture

# Live dev (ref handlers throw "not implemented" until PR 2; checkout
# end-to-end needs a payment provider wired up):
pnpm dev           # safe wrangler dev — http://127.0.0.1:8787

# Integration smoke (PR 1: view REST + HTTP Trigger dispatch +
# MCP auth gates):
pnpm test:integration
```

Open <http://localhost:8787>. Without `pnpm fixture` the catalog is
empty and the storefront shows the "No products yet. Sign in as staff
to add some." placeholder — true but unhelpful for first-look impressions.
The fixture seeds three demo products (two untracked, one tracked with
zero stock) so the grid + product detail + cart flows all have something
to exercise.

`pnpm validate` defaults to the **preview** phase — grammar + cross-Schema only,
exits 0 on a fresh scaffold even when the Mantle welcome letter is still
unfilled. Before deploying, run the strict gate:

```bash
pnpm validate:deploy   # = `mantle validate --phase deploy`
```

It re-enables `MANTLE_LETTER_NOT_WRITTEN` and any future pre-deploy-only
checks. `pnpm deploy` chains it in front of `wrangler deploy` automatically,
so the manual form is only needed for an ahead-of-time check.

Real-user installs go through the Mantle install Skill — see the
[Mantle install brief](https://raw.githubusercontent.com/aotter/mantle/main/skills/install/SKILL.md)
and this starter's [`SKILL.md`](SKILL.md), which carries the payment
provider interview + scaffolding procedure.

## Customer accounts + members-only checkout (#210)

The transaction archetype is wired to consume the `customer-account`
and `members-only-purchase` feature overlays as soon as they're
selected at scaffold time. Without them, checkout stays anonymous-
with-email (`customerEmail` on the order row) and there's no
`/account` surface. With them, you get:

- Passwordless customer sign-in (magic-link + email-OTP) at
  `/account/sign-in`
- `/account` dashboard rendering the buyer's order history (filtered
  by `userId`)
- `/account/settings/linked-accounts` for social link / unlink
- An optional `CHECKOUT_POLICY=members-only` gate that requires a
  signed-in customer before `/api/checkout/start` proceeds

### Data spine (shipped in archetype source — no scaffolder step)

The archetype source already carries:

| Path | Purpose |
|---|---|
| `manifests/orders.yaml` | `userId` column on `orders` (optional, snapshot at commit) |
| `src/handlers/checkoutStart.ts` | Snapshots `ctx.user.id` onto the cart stash when a customer is signed in (and not a staff member acting on their behalf) |
| `src/handlers/orderConsumer.ts` | Copies `userId` from cart stash to `OrderRowData` at commit; writes `null` explicitly for guest orders |
| `src/handlers/listOrdersByUser.ts` | `loadOrdersByUser(runtime, userId, limit?)` — server-side query helper |
| `src/handlers/checkoutPolicy.ts` | `enforceCheckoutPolicy(req, env, auth)` — gate honoured at the route layer in `src/index.ts` |

Wire-up is the responsibility of the scaffolder when the
`customer-account` feature is selected — the source files
(`renderSignIn.ts`, `renderAccountHome.ts`, `renderLinkedAccounts.ts`,
`linkedAccountsApi.ts`, `session.ts`, `accountSlot.ts`) land under
`src/features/customer-account/`. The adopter then plugs them into
the chrome + routes.

### Adopter wiring (after scaffolding with the feature)

1. **Auth methods** — splice `buildFeatureAuthMethods` into the
   `createAuth` call:

   ```ts
   import { ConsoleEmailSender } from "@aotter/mantle/cloudflare";
   import { ResendEmailSender } from "./auth/senders/resend.js"; // see customer-account README
   import { buildFeatureAuthMethods } from "./.mantle/generated.auth-methods.js";

   const customerEmailSender =
     env.RESEND_API_KEY && env.EMAIL_FROM
       ? new ResendEmailSender({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM })
       : new ConsoleEmailSender();

   const auth = createAuth({
     /* ... */,
     methods: [
       /* archetype/staff methods first */,
       ...buildFeatureAuthMethods(env, customerEmailSender),
     ],
   });
   ```

2. **HTTP routes** — under the existing `mountServerEndpoints(app, cms)`
   call:

   ```ts
   import { renderSignIn } from "./features/customer-account/renderSignIn.js";
   import { renderAccountHome } from "./features/customer-account/renderAccountHome.js";
   import { renderLinkedAccounts } from "./features/customer-account/renderLinkedAccounts.js";
   import {
     handleListLinkedAccounts,
     handleUnlinkAccount,
   } from "./features/customer-account/linkedAccountsApi.js";
   import { loadOrdersByUser } from "./handlers/listOrdersByUser.js";

   app.get("/account/sign-in", (c) => renderSignIn({ request: c.req.raw, auth }));
   app.get("/account", async (c) => {
     const session = await auth.getSession(c.req.raw);
     const runtime = await cms.get();
     const orders = session
       ? (await loadOrdersByUser(runtime, session.user.id, 20)).rows
       : [];
     return renderAccountHome({
       request: c.req.raw,
       auth,
       orders: orders.map((o) => ({
         id: o.orderNumber,
         status: o.orderStatus,
         createdAt: new Date(o.placedAt),
         total: `${o.currency} ${(o.totalMinor / 100).toFixed(2)}`,
       })),
     });
   });
   app.get("/account/settings/linked-accounts", (c) =>
     renderLinkedAccounts({ request: c.req.raw, auth }));
   app.get("/account/api/linked-accounts", (c) =>
     handleListLinkedAccounts(c.req.raw, auth));
   app.post("/account/api/linked-accounts/unlink", (c) =>
     handleUnlinkAccount(c.req.raw, auth));
   ```

3. **Chrome session indicator** — drop `renderAccountSlot()` into the
   shared layout (`src/templates/layout.tsx`):

   ```ts
   import { renderAccountSlot } from "./features/customer-account/accountSlot.js";

   <header>
     <a class="brand" href="/">My Shop</a>
     <nav>{/* … site links … */}</nav>
     {/* injects the slot + inline script that swaps on /api/auth/get-session */}
     {renderAccountSlot({ signInLabel: "登入" })}
   </header>
   ```

4. **Members-only checkout** — set the env var. The route handler in
   this archetype already calls `enforceCheckoutPolicy` before the
   manifest-declared Trigger fires; no extra wiring needed.

   ```toml
   # wrangler.toml
   [vars]
   CHECKOUT_POLICY = "members-only"
   ```

   > **Fail-open caveat**: an unknown `CHECKOUT_POLICY` value (typo —
   > `"member-only"`, `"signed-in"`, etc.) silently falls back to
   > `"open"` with a `console.warn`. Double-check the env value
   > matches `"members-only"` exactly when you flip the gate on.

### Golden end-to-end flow

1. Visitor lands on `/` — anonymous chrome.
2. Adds to cart — cart cookie carries an anon `cartId`.
3. Clicks "Checkout" — under `CHECKOUT_POLICY=members-only`, gets
   302'd to `/account/sign-in?return_to=/checkout` (HTML) or 401
   JSON with `signInUrl` (XHR).
4. Signs in via magic-link / email-OTP. The bootstrap script in the
   chrome slot probes `/api/auth/get-session` and swaps the slot.
5. Returns to `/checkout`. `checkoutStart` runs with `ctx.user.id`
   populated; the cart stash carries `userId`; the order row commits
   with `userId` set.
6. Provider redirect → return → `enqueueDevCallback` (in local dev)
   → consumer commits → `/order/:id` renders.
7. Visits `/account` — sees the order in the history list (filtered
   by `userId`).

### Deferred / out of scope for alpha.16

- **Cart-binding (anon → user) on sign-in** — current behaviour: the
  cart cookie keeps its anon `cartId` after sign-in. Adopters who
  want cross-device cart merge add a Better Auth `signIn.after` hook
  + KV rename. Tracked in #175.
- **Customer profile / addresses Schema** — out of scope for
  alpha.16. The order row's `shippingAddress` field already accepts
  free-shape JSON from the provider; a real `customer-profile`
  schema lands when the addresses UI does.
- **MCP customer surface tools** — exposing customer-account
  Procedures on the public MCP surface needs the `mcp` Trigger
  source (#281, landed in alpha.16) plus follow-up wiring. Not
  blocking the storefront flow.

## Local-dev callback shim (`MANTLE_LOCAL_DEV`)

Merchant-form payment providers (ECPay, PayUni, NewebPay, most APAC
gateways) send the success notification to a server-to-server URL the
provider can reach. Localhost is not reachable without a tunnel
(`cloudflared` / `ngrok`), so the `PAYMENT_CALLBACK_QUEUE` never
receives the verified envelope, `orderConsumer` never commits the
order row, and the customer-return page polls `readOrderStatus`
forever showing "處理中…".

Set `MANTLE_LOCAL_DEV=1` in `.dev.vars` and the customer-return
handler synthesizes a successful `CallbackEvent` off the cart stash
and pushes it to the same queue the real webhook would target. The
queue consumer dedupes by `eventId`, so an accidental double-fire
(real webhook lands later somehow) is safe.

**Production guard**: the shim is hard-gated on
`env.MANTLE_LOCAL_DEV === "1"` inside
[`src/payment/devCallbackShim.ts`](src/payment/devCallbackShim.ts).
A missing env var, an empty value, or any string other than `"1"`
short-circuits the helper. The call site in `src/index.ts` invokes
the helper inside the same handler whether dev or prod — relying on
the helper's own guard, not a duplicate `if` block at the call site,
to keep the gate logic in one place.

When to use it:
- ECPay / PayUni / NewebPay / similar merchant-form providers during
  local development.
- Not needed for Stripe Checkout or hosted-checkout providers — those
  use synchronous return verification (`verifyReturn`) that already
  works on localhost.

How to disable: remove `MANTLE_LOCAL_DEV` from your `.dev.vars` (or
set it to anything other than `"1"`). The shim becomes a no-op.

## See also

- [`SKILL.md`](SKILL.md) — Mantle's install-time interview + provider wiring
- [`src/payment/providers/README.md`](src/payment/providers/README.md) — provider templates explained
- [`skills/extend`](https://raw.githubusercontent.com/aotter/mantle/main/skills/extend/SKILL.md) — adding Schemas / Views / Procedures / Triggers
- [`reservation/`](../reservation/) — sibling starter (roadmap, v0.2) for time-bounded bookings. Same DO + Queue shape; documented as a forward-spec.
