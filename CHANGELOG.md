# Changelog

All notable changes to this repository will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

The repository version reflects the `create-mantle` scaffolder tarball attached to each GitHub release. Individual starter packages pin `@aotterclam/mantle-*` versions independently inside their own `package.json`.

## [Unreleased]

### Added

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
