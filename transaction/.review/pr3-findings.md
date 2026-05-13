# PR 3 review — correctness / safety / design

Branch `feat/transaction-pr3-downstream-and-sweeper` @ `3907f05` on top of `origin/main @ ad49aa1`.
`pnpm typecheck` clean. `pnpm validate` 0 errors / 1 unrelated locale warning.

## [MAJOR] `handleOrderConfirmed` Slack-then-mark window can double-notify

`orderConsumer.ts` L318 posts to Slack *before* L335 writes `confirmation_emailed_at`. Worker timeout / unhandled rejection in `fetch` (the `try/catch` only covers thrown errors, not the await itself) between those lines → mark never lands → queue retries → Slack fires twice. The marker is the only dedup gate but it's written after the side effect it guards.

Why this matters: PR description claims "idempotent via `confirmation_emailed_at`"; in practice idempotent only on the happy path. Once email integration replaces the Slack placeholder this becomes a duplicate-email bug.

Suggested fix: mark first, then notify — or use a separate `slack_notified_at` key set right before the POST.

## [MAJOR] `restockProduct` has no defense-in-depth on the auth gate

Handler trusts the runtime to enforce `requires.auth.all: [{ ctx.staff: [owner] }]` and never re-checks. Any bypass — manifest edit drops the gate, a future MCP path loses scope context, a forker copies the handler into an ungated Procedure — yields unbounded `inv.restock()` with caller-supplied `addQty`. No rate limit, no audit log, no upper bound.

Why this matters: this is reference code forkers copy. The manifest gate is invisible from the handler. One copy-paste and the staff-only restock is a public stock-inflation endpoint.

Suggested fix: assert `ctx.staff` in-handler and/or cap `addQty`.

## [MAJOR] `OrderWorkMessage` switch has no exhaustiveness check

`orderWorkConsumer` switch (L255–265) has no `default`/`assertNever`. Add a fourth message type without touching the switch → no compile error, no runtime error, `msg.ack()` at L266 fires unconditionally, message silently disappears. Producers `send()` raw objects with no runtime validation; a typo'd `type: "order.confimed"` silently no-ops and is ack'd.

Why this matters: once-and-only-once depends on the queue not silently dropping. The current design swallows shape errors instead of DLQ'ing them.

Suggested fix: `default: const _: never = msg.body; throw new Error(...)` plus a runtime guard at consumer entry.

## [MINOR] `inventory.reconcile.tick` fan-out can stack on a slow consumer

Cron fires every 5min and enqueues one snapshot per tracked product into the same single-concurrency queue. If product count grows or `inv.snapshot()` slows, tick N+1's fan-out lands before tick N drains → queue depth compounds. Output stays correct (snapshots are idempotent) but the queue fills with stale work, potentially eating the 15-min retry budget for legitimate messages. `at: number` on the tick looks like a dedup field but is unread.

Suggested fix: skip fan-out for products with `updatedAt` within last <5min, or guard the tick via a DO-stored `last_tick_at`.

## [MINOR] Duplicate snapshot-write code path

`snapshotInventory.ts` and `orderConsumer.ts handleSnapshotRequested` write the same `entries` row with the same id format via slightly different SQL. The standalone handler is registered (`handlers/index.ts` L37) but never invoked — the consumer branch inlines. Two sources of truth for one write; the `restockedAt` field declared in `inventory.yaml` Schema is written by neither.

Suggested fix: have `handleSnapshotRequested` call `buildSnapshotInventory` via `invokeHandler` (same pattern `src/index.ts` uses for GET routes).

## [MINOR] Sweeper-then-retry path covers only crash-before-markCompleted

`paymentCallbackConsumer` comments describe consumer-crash-mid-work but not `markCompleted` itself failing after side effects completed. Path is fine — lock stuck pending → sweeper resets at 10min → retry re-runs idempotent side effects (and re-fires `order.confirmed`, where the MAJOR #1 double-fire window applies again).

Suggested fix: addresses itself when #1 is fixed; worth a comment.

## [QUESTION] Ship `enqueueOrderConfirmed` if it's never invoked?

For: zero cost, lifecycle hook lights up the day staff-side `createEntry` is wired. Against: dead code teaches forkers that the lifecycle hook fires when it doesn't (commitOrder direct-D1 bypass); only the handler JSDoc warns. Recommendation: ship with a one-line note on the `010-orders-enqueue-confirmation` Trigger in `orders.yaml` saying "inactive in v0.1 — commitOrder bypasses lifecycle."

## [NIT] Smoke test coverage gaps (top 3)

1. No assertion that `order.confirmed` actually runs after checkoutConfirm. Test #5 polls for `orderStatus=placed` but never checks `confirmation_emailed_at` — the most load-bearing new branch is untested end-to-end.
2. `restockProduct` only tests the unauthenticated rejection — no signed-in happy-path that confirms the snapshot row's `available` advanced.
3. `/__scheduled` test accepts 404 and only verifies the handler didn't crash. Fan-out (sweeper + per-product snapshot enqueues) is not exercised.

## [QUESTION] D1 schema mapping — nothing material

`inventory_snapshots` declared in `inventory.yaml` Schema ✓. `orders` declared in `orders.yaml` Schema ✓. `entry_inv_<slug>` and `entry_<orderId>` prefixes don't collide.

## Ship recommendation

**Hold for rework on the three MAJORs.** #1 (Slack-before-mark) is a real duplicate-notification path with a sub-second window on every run that gets worse once email replaces Slack. #2 (no defense-in-depth on restock) is the kind of pattern reference-code forkers will copy badly. #3 (exhaustiveness) is three lines and prevents silent message-loss. Everything else is "ship with follow-up issues filed."
