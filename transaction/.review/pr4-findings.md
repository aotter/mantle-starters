# PR #28 — feat/transaction-pr4-commerce-correctness — review findings

Baseline: `pnpm typecheck` clean, `pnpm validate` 0 errors. Branch at 5597d01.

## 1. orderId collision can silently corrupt reservations — [MINOR]

`generateOrderId` is `o_<ts_36>_<Math.random base36 × 8 chars>` ≈ 41 bits, non-CSPRNG. Birthday-paradox bucket is per-ms. At 100 orders/day collisions are astronomically unlikely, but if one ever hits: `inv.reserve()` silently **overwrites** `reservation:<orderId>` (InventoryActor.ts:186), losing the prior order's release pointer. Its stock is double-decremented from `available`; the auto-release alarm fires on the survivor; the prior reservation leaks until cron or operator intervention.

Why it matters: uniqueness was cosmetic before this PR; now it's load-bearing for inventory accounting.

Suggested fix: `crypto.randomUUID()`, or have `reserve()` reject when the key already exists (turns silent corruption into a loud throw).

## 2. KV stash race — [NIT]

Order is `reserve → stash → provider.startCheckout`. Stash-fail → 10-min auto-release covers it; customer retry creates a fresh orderId. Provider-fail-after-stash leaks stash for 24h, harmless. Ordering is correct.

Suggested fix: nothing material. A one-line comment that the order is load-bearing would help future refactor.

## 3. 24h KV TTL vs slow async payments — [MAJOR if Stripe with bank-debit/SEPA is in-scope, else MINOR]

Stripe ACH/SEPA/Bacs settle in 3-7+ days. Past 24h, `readOrderCart()` returns null and `buildOrderRowData` falls back to event-only data: `items: []`, `subtotalMinor === amount.minor`, `customerEmail === event.customerEmail ?? ""`. Worse for tracked products: the 10-min reservation alarm has long fired → `inv.commit` is a no-op → the stock the customer paid for is back in `available` and re-sellable.

`redirect-checkout.ts` names Stripe; an adopter wiring Stripe with delayed payment methods gets this as their default failure mode and won't notice until reconciliation.

Suggested fix: pick one — (a) doc in `orderCart.ts` + checkoutStart "synchronous payment methods only for v0.1; delayed/async out of scope", or (b) raise TTL to 14d AND extend the reservation horizon for tracked products to match. (b) is the real fix; (a) is the minimum viable.

## 4. commitOrder 4-step compose — [QUESTION]

INSERT OR IGNORE → inv.commit → deleteOrderCart → sendOrderWork. All individually idempotent. The interesting case: INSERT succeeds, `inv.commit` succeeds on the DO but the client sees a transport error. Retry: row already there, INSERT no-ops; second `inv.commit` finds no reservation → no-op. Accounting invariant `available + reserved == known_stock` holds because the decrement happened at reserve time, not commit time. Compose is sound.

Suggested fix: nothing. The docblock already states this.

## 5. Failed/expired callback drops cart stash — [MINOR]

`releaseIfReserved` deletes the stash. Argument is "providers don't go failed → succeeded for the same payment." Stripe contradicts: the same PaymentIntent can be retried by the customer (`payment_intent.payment_failed` then later `payment_intent.succeeded`) — different eventIds, same orderId. Our dedup is keyed on eventId, so the succeeded event will reprocess. Stash is gone → empty-items order row.

ECPay/PayUni allocate a new TradeNo per retry, so the merchant-form bucket is fine.

Suggested fix: drop the `deleteOrderCart` call inside `releaseIfReserved` and let the 24h TTL handle cleanup. One-line change.

## 6. customerEmail trust + fallback priority — [QUESTION]

Priority `cart.customerEmail ?? event.customerEmail ?? ""` is correct: cart comes from our verified checkoutStart input, event comes from a provider-asserted (potentially payer-edited) value. Stripe Checkout lets the payer change email post-redirect. The real security boundary is upstream — checkoutStart accepts arbitrary customerEmail with no proof-of-control. That's a v0.1 scope choice (anonymous-with-email; documented in orders.yaml).

Suggested fix: one-line note in orders.yaml schema docblock that customerEmail is "supplied at checkoutStart, not provider-attested." Otherwise nothing material.

## 7. /__test/restock blast radius — [MINOR]

Gated on `FAKE_PAYMENT_PROVIDER=1`, same flag as FakeProvider. If the flag leaks to prod, real payments are already broken (FakeProvider accepts trivially-spoofed callbacks) — restock bypass is the second-biggest hole, not the first. Bundling them under the same switch is honest.

Suggested fix: optional `console.warn` per request when the flag is active, so logs scream if it ever ships.

## 8. Orders schema migration — [NIT]

Dropped `stripeCheckoutId`/`stripePaymentIntentId` from `required`, added `paymentProvider`/`paymentIntentId`. Existing data: none (manifest is `status: roadmap`). No migration story needed. When the starter moves to `status: ready`, drop-required changes WILL need a story — note it in the next-phase plan.

## 9. Smoke gaps — three priority misses

1. **Idempotency on the tracked path** — existing dup-callback check uses an untracked product. Replay the `evt_e2e_*` event, assert `snapshot(productSlug)` counters don't move on the second commit (catches a regression if `inv.commit` ever stopped being idempotent).
2. **Failed-callback for a tracked, reserved order** — the existing failed/expired tests use phantom orderIds never reserved. Reserve → fail → assert inventory returns to `available`, doesn't strand in `reserved`.
3. **Cart-stash-missing fallback** — manually KV-delete `order:cart:<id>` between checkoutStart and callback, assert the order lands with `items:[]` + event-supplied email. Locks in the documented degraded behavior so a future refactor doesn't silently change the fallback shape.

---

## Ship recommendation

**Ship after addressing 2 items**: (1) swap to `crypto.randomUUID()` — small change, eliminates a silent-corruption class. (3) at minimum, document the >24h async-payment gap loudly in `orderCart.ts` / `checkoutStart.ts`; raise TTL + reservation horizon if Stripe delayed methods are in v0.1 scope. Items 5 and 6 are one-line follow-ups; the rest are fine-as-is.
