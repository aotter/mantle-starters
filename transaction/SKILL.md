---
archetype: transaction
status: ready
starter_repo: aotter/mantle-starters
starter_path: transaction
overlays: []
scale_limit: 100  # orders/day; advisory — Mantle informs user
---

# `transaction` archetype

Follow [the install SKILL](../SKILL.md). Use your normal coding-agent register throughout install, provision, and provider wiring.

## What this is

Small-scale shop on Cloudflare: products + cart + payment + orders. Sized for **≤100 orders/day**. The starter is provider-agnostic by design — it ships a `PaymentProvider` interface and **no implementation**. You wire the actual provider (Stripe / Paddle / ECPay / PayUni / etc.) in the user's session during install, based on their answer to a single interview probe.

Two architectural pieces beyond the standard publication shape:

- **`InventoryActor` DurableObject** (one per tenant) holds inventory state + find-and-modify locks for once-and-only-once payment-callback processing.
- **`payment-callback-queue` + `order-work-queue`** Workers Queues run at `max_concurrency: 1` for strict serial processing. The HTTP webhook handler verifies the provider's signature and ships to queue; the consumer does the actual work (lock acquire → order INSERT → inventory commit → mark completed) under the DO lock.

## Interview probes (run in this order)

### 1. Order volume — the gate

> "Roughly how many orders per day do you expect?"

- **≤ 100/day**: proceed with `transaction`.
- **> 100/day**: refuse warmly, route to `commerce-pro` (roadmap; high-volume / multi-region / sharded inventory). Single-DO inventory + serialized queues are the bottleneck above this scale.

### 2. Payment provider

> "Which payment provider? (Stripe / Paddle / ECPay 綠界 / PayUni 統一金流 / something else)"

The starter recognizes two integration patterns and ships a template for each at `src/payment/providers/_templates/`:

| Template | Pattern | Common providers |
|---|---|---|
| `redirect-checkout.ts` | Merchant calls provider API → gets URL → redirects customer. Webhook is the source of truth. | Stripe Checkout, Paddle, Lemon Squeezy |
| `merchant-form.ts` | Merchant renders HTML form → customer's browser auto-POSTs to provider. Both async callback AND customer-facing return URL are signed; both verified server-side. | ECPay (綠界), PayUni (統一金流), NewebPay, most APAC/TW gateways |

Pick the closer template based on the provider's docs. Both templates implement `PaymentProvider` (`src/payment/provider.ts`) with three method stubs: `startCheckout`, `parseCallback`, `verifyReturn`.

### 3. Inventory model

> "Do you want to track inventory counts (reject orders when out of stock), or are products always available (digital / made-to-order / etc.)?"

Per-product setting via the `inventoryMode` Schema field: `tracked` or `untracked`.

**Compatibility constraint — tracked + provider type:** Tracked inventory relies on the `InventoryActor`'s 10-minute reservation TTL. If the customer pays via an **immediate-capture** flow (Stripe Checkout cards, Paddle, Lemon Squeezy, ECPay credit-card, PayUni credit-card — anything where the success callback fires within seconds), tracked mode works as advertised: reservation holds until `commit(orderId)` lands.

If the customer pays via a **delayed-settlement** flow (Stripe ACH / SEPA / Bacs / iDEAL bank transfer, ECPay ATM转账, PayUni ATM, BLIK delayed) the success callback can land **hours or days later** — past the 10-minute reservation window. By then the reservation has been auto-released; `commit(orderId)` becomes a no-op and the order row is created without decrementing stock. Result: stock oversells.

If the user's provider answer includes delayed-settlement methods AND they want tracked inventory, either:
  1. Disable the delayed methods at the provider dashboard (cards only), OR
  2. Mark inventory as `untracked` and gate availability some other way (manual restock on each order, batch processing, etc.).

This constraint lifts in `commerce-pro` (roadmap) which models a `pending → reserved → committed` order state separate from the inventory reservation.

### 4. Currency

> "Which currency? (USD / TWD / JPY / EUR / ...)"

Site-wide single currency; baked into `site_config.currency` + `mantle/site.md` at install. **Multi-currency is v0.3+ territory** — different starter entirely.

### 5. Refunds (just inform; not a decision)

Tell the user upfront: **v0.1.0 refunds are manual** via the provider's dashboard. There's no in-admin refund flow. If they need automated refunds / disputes / partial fulfillment, that's `commerce-pro` (roadmap).

## Site defaults

- **Mood default:** clear / functional / trust-forward. Customers giving you money are paying for confidence.
- **Ready-state wording:** open-for-business. (zh-TW illustrative: "可以開始收單了", "上架了"; pick the natural verb that says "we're open to take orders".)
- **Avoid:** anything that implies more sophistication than the system delivers ("scalable platform", "enterprise commerce"). Be honest about scale.

## Post-deploy first content task

Use this only after production provision and owner sign-in. It is not an
install-time prompt and should not block scaffold or deploy.

```text
打開後台。先列出 products collection（應該是空的）。然後幫我把第一個商品的草稿補上：name, price, 一段話的商品描述。先 draft，等我看過再 publish — publish 之後客人就看得到了。
```

(EN illustrative:)
```text
Open the admin and list the products collection (should be empty). Then draft the first product: name, price, a short description. Leave as draft — once you publish it, customers see it live.
```

## Payment provider wiring (your job during install)

Run AFTER `create-mantle` scaffolds the directory and BEFORE provision. The starter's `src/payment/index.ts` is a fail-loud stub that throws "PaymentProvider not configured" until you replace it.

### Step 1 — pick the template

Based on the user's provider answer + the provider's docs, pick `redirect-checkout.ts` or `merchant-form.ts` from `src/payment/providers/_templates/`. If neither fits cleanly (some providers blend both patterns), pick the closer one and adapt; the interface is what matters.

### Step 2 — copy + adapt

```bash
cp src/payment/providers/_templates/<template>.ts src/payment/providers/<provider>.ts
```

Read the provider's docs URL (in the template's header comment, or find it). Fill in the TODOs in each method:

- `startCheckout` — call the provider's "create checkout" API; return either `{kind:"redirect", url}` or `{kind:"form", html}` per pattern.
- `parseCallback` — verify signature first; throw on bad. Then parse the verified body, branch on provider status code, return `CallbackEvent`.
- `verifyReturn` — for hosted-checkout providers usually a trust-the-DB lookup; for merchant-form providers a full signature-check of the return URL params.

For Stripe-likes: `pnpm add stripe` and call the SDK directly. For TW providers, no SDK is needed — build forms + signatures from the docs.

### Step 3 — wire `src/payment/index.ts`

Replace the fail-loud stub:

```ts
import type { PaymentProvider } from "./provider.js";
import { YourProvider } from "./providers/<provider>.js";

export interface PaymentEnv {
  readonly PROVIDER_SECRET_KEY: string;     // adjust per provider
  readonly PROVIDER_WEBHOOK_SECRET: string;
}

export function buildPaymentProvider(env: PaymentEnv): PaymentProvider {
  return new YourProvider({ /* config from env */ });
}
```

### Step 4 — declare env vars in `wrangler.toml`

Add the provider's secret bindings (commented section at the bottom of `wrangler.toml` shows the pattern). The actual values get set via `wrangler secret put` during provision; never commit them.

### Step 5 — record in `mantle/site.md`

Add a frontmatter entry so a future Mantle session knows which provider is wired:

```yaml
payment_provider: stripe   # or ecpay | payuni | <custom-name>
```

Append a `## history` line: "Wired <provider> at install per user choice."

### Step 6 — validate

`pnpm validate && pnpm typecheck`. The starter should compile cleanly with the wired provider; live testing happens after provision.

## Refuse paths

- **Volume too high (>100/day).** → `commerce-pro` (roadmap).
- **Buyer accounts / saved carts / order history.** → `community` / `membership` (roadmap; blocked on v0.2 buyer auth).
- **Subscriptions / recurring billing.** → `subscription` (roadmap).
- **Multi-currency / tax compliance.** → `commerce-pro` (roadmap, v0.3).

For all of these: refuse warmly in the user's language; record the deferred future in `mantle/site.md` `futures:`.

## Schema/View/Procedure shape

What ships:

- **Schemas**: `products`, `product-translations`, `orders`, `order_items`, `inventory_snapshots`.
- **Views**: `products-public`, `product-by-slug`, `orders-recent` (staff), `order-by-number`, `inventory-low` (staff).
- **Procedures**: `add-to-cart`, `checkout-start`, `checkout-confirm`, `checkout-return`, `read-order-status`, `snapshot-inventory`, `restock-product` (staff-only via `requires.auth.all: [{ ctx.staff: [owner] }]`), `enqueue-order-confirmed`.
- **Triggers**: 3 HTTP routes (`POST /api/cart/add`, `POST /api/checkout/start`, `POST /api/payment/callback`, `POST /api/staff/restock`) + `orders.after_create` lifecycle.
- **DurableObject**: `InventoryActor` (1 per tenant).
- **Queues**: `payment-callback-queue` + `order-work-queue` (both `max_concurrency: 1`).
- **Cron**: every 5min `inventory.reconcile.tick` (sweeper + snapshot).

GET-style endpoints (`/api/payment/return`, `/api/order/status`) are mounted as custom Hono routes in `src/index.ts`, not HTTP Triggers — v0.1 Triggers are locked to POST/PUT/PATCH/DELETE.

The agent-author surface stays inside v0.1 manifest grammar — no DRAFT keys, no new closed enums.

## See also

- [`skills/extend`](https://raw.githubusercontent.com/aotter/mantle/main/skills/extend/SKILL.md) — adding additional Schemas / Views / Procedures / Triggers after install.
- [`skills/customize-design`](https://raw.githubusercontent.com/aotter/mantle/main/skills/customize-design/SKILL.md) — theming the product / cart / checkout pages (PR 4).
- [`src/payment/providers/README.md`](src/payment/providers/README.md) — provider wiring details + the two pattern templates.
