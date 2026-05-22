# CLAUDE.md — orientation for AI contributors to a `transaction` site

This file is the entry point for an AI agent (Claude, Cursor, etc.)
opening a freshly-scaffolded `transaction` site. The conventions
below are NOT optional polish — they're the ones the upstream
adopters learned the hard way and would have wanted to know on day 1.

For the install / interview contract that scaffolded this site, see
[`SKILL.md`](SKILL.md) (Mantle install voice) and
[`AGENTS.md`](AGENTS.md) (per-site cached interview answers).

## The two daily-driver rules

**1. `pnpm install --frozen-lockfile` for every install.**

`pnpm install` without the flag will quietly regenerate
`pnpm-lock.yaml` against any dep version that's been published since
the lockfile was committed. CI runs `--frozen-lockfile` and rejects
drift, so the drift only surfaces in CI long after you've deployed
the local-only state. The fix is always "go look at the lockfile
diff" but the symptoms (deploy fails, local works) are confusing.
Run with the flag from the start; pin per
[`packageManager`](./package.json) + [`.nvmrc`](./.nvmrc).

**2. Never `innerHTML +=` server-trusted strings in storefront JS.**

Inline page scripts can `innerHTML = "..."` user-facing notice strips
without escaping — `window.__escapeHtml` exists for exactly that
purpose, and any error/success path that renders into a `.notice`
element must route through it. Concatenating raw `res.text()` lets
operator-controlled CMS strings (or malformed JSON envelopes from
upstream) break out of the markup; the same applies to
`document.write` with anything you didn't build server-side.

For JSON-in-`<script>` (`window.__pdpData = ...`), use the pattern:

```ts
JSON.stringify(data).replace(/</g, "\\u003c")
```

The literal `</script>` inside operator-controlled strings (a product
description, a category title, etc.) otherwise terminates the
inline-script element. The replacement is one line, completely free
of side effects, and the only correct default.

## Media uploads — use declared purposes only

`siteDefaults.media.purposes` in [`src/mantleConfig.ts`](src/mantleConfig.ts) declares the closed set of upload purposes this starter accepts. Currently:

- `product-cover` — `products.coverAssetId` (list view + PDP fallback).
- `product-image` — `products.images[].assetId` (PDP gallery slides).
- `page-image`    — `page-translations.blocks[].imageAssetId` and `.cards[].sideImageAssetId` (block-based pages).

When you call `create_media_upload` over MCP, the tool's description (visible via `tools/list`) inlines the per-purpose mime + maxBytes summary. **Never invent ad-hoc purpose strings** — they fail closed with `MEDIA_PURPOSE_REJECTED`, and the storage-key layout depends on a known purpose prefix for the orphan sweeper. If your asset doesn't fit one of the declared purposes, add a new one to `mantleConfig.ts` with its own mime set + caps; don't shoehorn it under an existing purpose with a too-loose cap.

Variant requirements + caps are server-enforced: `MEDIA_VARIANTS_INCOMPLETE` (missing required mime), `MEDIA_VARIANT_SIZE_EXCEEDED` (over `maxBytes[mime]`), `MEDIA_VARIANTS_SUSPICIOUS_SIZE` (modern format ≥ fallback size — uploader skipped optimization). The `@aotter/mantle-media-tools` agent CLI produces compliant variant bundles.

## Architecture seams

The starter is a Cloudflare Worker + Hono + Better Auth + a single
`InventoryActor` Durable Object. Cart state lives in KV, inventory
state in the DO, orders in D1. The seams are:

- **Cart hot path** — `KV cart:<cartId>` is the source of truth for a
  pending cart. `addToCart` / `set-qty` / `checkoutStart` /
  `readCart` all read + write the same `CartState` shape. If you
  change the cart's in-memory shape, **factor a shared `_cartState.ts`
  helper first** — in-flight carts written before your migration
  will otherwise crash checkout. (This was learned the hard way on
  the SPU/SKU refactor downstream.)

- **Inventory gate** — `tracked` products go through
  `_stockCheck.ts`'s `checkSingleItemStock` BEFORE the KV write, not
  just at `checkoutStart` reserve time. Users hit "out of stock" at
  the add-to-cart click, not three pages later. Customer-facing
  message stays vague (`STOCK_ERROR_MESSAGE`); exact counts in logs
  only.

- **Payment provider** — `src/payment/provider.ts` is the contract;
  implementations live in `src/payment/providers/<provider>.ts`.
  Wired during install via the SKILL.md interview. NEVER bake
  provider-specific assumptions into handlers — `checkoutStart` and
  `checkoutConfirm` only know the abstract `PaymentProvider`.

## Working with the `_stockCheck` gate

The gate exists at three call sites:

- `addToCart` — checks the resulting line qty (existing + delta).
- `checkoutStart` — bulk-reserves via `InventoryActor.reserve`.
- `/api/cart/set-qty` (when adopters wire it) — same pattern as
  `addToCart`.

If you add a fourth, follow the same pattern: catch the structured
`InsufficientItem` shortfall, log it server-side with full detail,
throw `STOCK_ERROR_MESSAGE` to the client.

## Block-based pages

`page-translations.blocks` is an ordered array of typed blocks
(`hero`, `features`, `prose`, `cta`, `media`). The dispatcher in
`src/templates/_blocks.ts` switches on `type`. Adding a new block
type is two changes: add it to the `enum` in `manifests/pages.yaml`
and add a `case` in `_blocks.ts`. Don't reach for these for
schema-driven pages with rich first-class data (a product, an order,
a hero with a typed product feature) — those want their own
template.

## Local CI parity

```bash
pnpm install --frozen-lockfile   # 1
pnpm check                       # 2: validate + typecheck
pnpm test:integration            # 3 (when present)
```

Run all three before pushing. The deploy workflow in CI runs the
same gates; passing locally means you won't be debugging in CI.
