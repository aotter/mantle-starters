# Changelog

All notable changes to this repository will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

The repository version tracks the blank provision bundle consumed by Mantle landing. Individual starter packages pin `@aotter/mantle-*` versions independently inside their own `package.json`.

## [v0.0.11-alpha.30] — 2026-06-19

### Removed

- **\_common scaffold**: stop generating `mantle/site.md`. First-run
  state now lives in `.mantle/launch-state.json` and `AGENTS.md`, so
  the old letter/semantic prose surface cannot block deterministic
  provision.

### Changed

- **Repo-local skills**: `mantle:development`, `mantle:provision`, and
  `mantle:update` now read launch-state / AGENTS context instead of
  `mantle/site.md`.
- **Provision script**: `provision:up` updates `AGENTS.md` only; it no
  longer rewrites `mantle/site.md` revisions.

## [v0.0.11-alpha.17] — 2026-06-09

### Added

- **Publication starter**: include the theme override contract file so generated
  publication projects can resolve landing-selected themes without a missing
  `src/Theme.ts`.

### Changed

- **create-mantle**: support a separate `--admin-github-login` answer from
  `--github-owner`, so landing provisioning can install into an org while making
  the signed-in GitHub user the Mantle admin.
- **create-mantle**: substitute placeholders in `.dev.vars.example` files, which
  keeps generated starter env examples aligned with the landing-provided answers.
- **All archetypes**: starter package versions move to `0.0.11-alpha.17` while
  keeping `@aotter/mantle*` SDK/runtime pins on `0.0.11-alpha.16`.

## [v0.0.11-alpha.16] — 2026-05-25

### Added

- **Customer-account feature**: header session-slot helper
  `renderAccountSlot(opts)` — drop a `<div data-account-slot>` plus
  inline bootstrap into the storefront chrome and the slot probes
  `/api/auth/get-session` to render either an anonymous "Sign in"
  link or a signed-in dropdown (account home / linked accounts /
  sign-out). Document-level event delegation, idempotent across
  multiple slots, restores focus to the trigger on Escape. README
  documents the HttpOnly cookie sniff trap (#218).
- **Customer-account feature**: README recipe for Resend
  `EmailSender` — ~50 LOC pure `fetch`, no pinned `resend` npm dep,
  with `ConsoleEmailSender` dev fallback (#219).
- **Transaction starter**: dev-only ECPay callback shim
  (`enqueueDevCallback`) hard-gated on `MANTLE_LOCAL_DEV === "1"`.
  Synthesizes a successful `CallbackEvent` from the cart stash so
  local merchant-form checkout commits without a public webhook
  URL (#220).
- **Transaction starter**: customer-account order attribution.
  `orders.userId` (optional column, snapshotted at commit time),
  `OrderCart.userId`, `TxHandlerContext.user` / `staff` plumbing,
  guest orders write `userId: null` explicitly. Skips snapshot
  when `ctx.staff` is set so staff-assisted checkouts don't
  mis-attribute (#175 subset).
- **Transaction starter**: members-only checkout gate.
  `CHECKOUT_POLICY=members-only` env var enforces a signed-in
  customer session at `/api/checkout/start` (HTML → 302,
  XHR → 401 JSON). Default `"open"` is a no-op (#210).
- **Transaction starter**: `loadOrdersByUser(runtime, userId,
  limit?)` — cursored pagination over orders with a 10k-row scan
  cap and a console warn pointing at the right answer (userId-
  indexed View) for high-volume shops (#175 / #210).
- **Transaction starter**: carousel module with event delegation.
  `renderCarousel({ id, slides })`, `renderSlides`, `renderDots`,
  `CAROUSEL_JS`. One document-level click + ArrowLeft/Right
  keyboard handler; `innerHTML` rewrites of the track / dots are
  safe (fix for the NodeList-caching bug in toa-shop's prior
  carousel) (#166 item 4).
- **\_common/scripts**: parameterized `migrate-media.mjs` — three
  resumable phases (plan / encode / upload) gluing
  `@aotter/mantle-media-tools` to a config-driven workflow.
  Atomic state writes, env-only bearer preferred, cross-platform
  `basename`, row-context error reporting (#221).

### Changed

- **All archetypes**: dev guardrails. `.nvmrc` pinning Node 22,
  `.npmrc` `engine-strict=true`, README install commands use
  `pnpm install --frozen-lockfile` with a blockquote explaining
  why CI parity matters (#166 item 3).
- **Transaction starter**: `transaction/README.md` gains a
  "Customer accounts + members-only checkout" section laying out
  the data spine, the four adopter wire-up steps after scaffolding
  with the feature, and the golden E2E flow.

### Bumped

- `@aotter/mantle*` workspace pin to `0.0.11-alpha.16` across all
  starters (auto-fanout via aotter/mantle's release.yml).

## [v0.0.8-alpha] — 2026-05-13

### Added

- Initial public release of the starter monorepo.
- 5 available archetypes:
  - `blank/` — headless API + MCP only (drop-in backend for BYO frontends).
  - `publication/` — owner-published content (pages, articles, docs-lite, contact form).
  - `presence/` — landing-page / brand-presence.
  - `intake/` — publication + structured leads.
  - `transaction/` — micro-shop catalog + order intake.
- 3 roadmap stubs (in `sources.json` roadmap list): `reservation`, `community`, `membership`.
- 4 theme overlays: `l4-minimal-ink`, `l4-editorial-warm`, `l4-editorial-journal`, `l4-playful-pop`.
- `_common/` shared backbone (`AGENTS.md.template`, `mantle/site.md.template`, `.gitignore.template`).
- `packages/create-mantle/` scaffolder, attached as a tarball asset on each GitHub release.

### Notes

- Tarball uploaded manually for this release. A CI release workflow (build + attach + sha256) lands in a follow-up PR.
