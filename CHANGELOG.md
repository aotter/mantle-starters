# Changelog

All notable changes to this repository will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

The repository version reflects the `create-mantle` scaffolder tarball attached to each GitHub release. Individual starter packages pin `@aotter/mantle-*` versions independently inside their own `package.json`.

## [Unreleased]

### Fixed

- **`transaction`**: storefront client JS was rendering the raw HTTP
  error response body straight into the `.notice.error` strip, so
  users saw the JSON envelope braces — e.g. `{"error":"Out of
  stock"}` instead of just `Out of stock`. New
  `window.__parseErrorMessage` bootstrap helper extracts the `.error`
  field from a JSON body and falls back to the raw text on parse
  failure (covers 5xx with non-JSON bodies). Wired into
  `productDetail.tsx` and `checkout.tsx`. Closes
  aotter/mantle-starters#164. Refs aotter/project-toa-shop#14.

### Added

- **`transaction`**: stock-availability gate for `tracked` products at
  `addToCart` time, not just at `checkoutStart` reserve time. New
  `src/handlers/_stockCheck.ts` helper calls
  `InventoryActor.snapshot(slug)` and returns a structured
  `InsufficientItem` shortfall. `addToCart` sums existing-in-cart qty
  + incoming delta before the check so repeated adds on the same line
  can't drift past availability. `checkoutStart` replaces its open-
  coded English `Error` with the shared `STOCK_ERROR_MESSAGE`
  constant (vague-by-design: exact counts can leak inventory state).
  Adopters localizing the storefront override the constant in their
  fork. Closes aotter/mantle-starters#163. Refs aotter/project-toa-shop#14.

### Added

- **`transaction`**: block-based `page-translations` schema with five
  block types — `hero`, `features`, `prose`, `cta`, `media` — and a
  block-aware `/p/:slug` route. The renderer dispatches on the block's
  `type` discriminator and threads `runtime.media.resolveMany` so
  image fields (referenced by `*AssetId` via `x-mantle-ref:
  media_assets`) emit `<picture>` with avif/webp/jpeg variants. The
  existing markdown `body` field stays as the fallback render path for
  simple text-only pages.
- **`transaction`**: `src/templates/_picture.ts` — `pictureTag(asset, …)`
  + `pictureFromAssetId(id, …, assets)` primitives for emitting
  `<picture>` from `MediaAsset.variants[]`. Zero starter-specific
  logic; mirrors `pickPrimaryVariant` from the SDK runtime.
- **`transaction`**: `src/templates/_blocks.ts` — block dispatcher +
  neutral default CSS. Color tokens via CSS custom properties
  (`--block-ink`, `--block-surface`, `--block-accent`, etc.) so an
  adopter can re-skin via a theme file without touching the block
  markup. Closes aotter/mantle-starters#162. Refs aotter/project-toa-shop#14.
- Initial OSS community-health files: `LICENSE` (MIT), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `SUPPORT.md`, `AGENTS.md`, `CODEOWNERS`, issue templates, PR template, Dependabot config.
- Repo metadata: 18 custom labels (`area:*`, `starter:*`, `status:roadmap`, `release-gate`, `needs-discussion`, `dependencies`); description and topics updated.

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
