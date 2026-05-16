# `clam-mantle-starters/transaction`

`transaction` archetype starter for clam-mantle v0.1.0 — small-scale
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
  this lands, the directory exists but `npx create-clam-mantle transaction`
  refuses).

## Getting started

```bash
pnpm install
pnpm validate
pnpm typecheck

# Live dev (requires no payment provider wiring yet — ref handlers
# throw "not implemented" until PR 2):
pnpm dev

# Integration smoke (PR 1: view REST + HTTP Trigger dispatch +
# MCP auth gates):
pnpm test:integration
```

Real-user installs go through the Mantle install Skill — see the
[Mantle install brief](https://raw.githubusercontent.com/AotterClam/clam-mantle/main/skills/install/SKILL.md)
and this starter's [`SKILL.md`](SKILL.md), which carries the payment
provider interview + scaffolding procedure.

## See also

- [`SKILL.md`](SKILL.md) — Mantle's install-time interview + provider wiring
- [`src/payment/providers/README.md`](src/payment/providers/README.md) — provider templates explained
- [`skills/extend`](https://raw.githubusercontent.com/AotterClam/clam-mantle/main/skills/extend/SKILL.md) — adding Schemas / Views / Procedures / Triggers
