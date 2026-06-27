# Contributing to mantle-starters

This repo holds the blank starter source, type bundle overlays, vendored Kiwa source, and the provision bundles consumed by Mantle landing.

Start here before changing code or docs. For project-wide doctrine, read the parent repo's [`CLAUDE.md`](https://github.com/aotter/mantle/blob/main/CLAUDE.md).

## Project shape

- **`develop` is the integration branch for all PRs.** It's the repo's default branch — `gh repo clone` lands you on it.
- `main` is release-only and moves through `develop → main` release merges, mirroring the parent `mantle` repo's branch model.
- PRs target `develop`, not `main`.
- Merge completed PRs with `gh pr merge --merge --delete-branch`. Do not squash; reviewable commits are preserved.
- Feature work should normally start from an issue unless it is a tiny docs or hygiene fix.

## Local setup

Requirements:

- Node.js >= 22
- pnpm >= 9

`blank/` is the only standalone starter project. Root scripts build and check the provision bundle.

## Branches

Cut branches from `develop`:

```bash
git fetch origin
git checkout -b feat/issue-NN-topic origin/develop
```

Use these prefixes:

- `feat/issue-NN-topic` — user-visible features (new overlay, Kiwa source, bundle capability).
- `fix/issue-NN-topic` — bug fixes (broken validate, broken provision bundle).
- `docs/issue-NN-topic` — documentation-only changes.
- `chore/issue-NN-topic` — tooling, metadata, dependency, maintenance.
- `starter/<archetype>/<short-slug>` — starter-scoped work that doesn't fit a feat/fix bucket (e.g. content refresh on `publication`).

## Commits

Use conventional commits:

- `feat(scope): short summary`
- `fix(scope): short summary`
- `docs(scope): short summary`
- `chore(scope): short summary`
- `test(scope): short summary`

When an AI agent authored or substantially rewrote a commit, add a co-author trailer:

```text
Co-Authored-By: Claude <noreply@anthropic.com>
```

## Adding a type overlay

First launch uses a generated `provision-bundles/<type>.json`. New
type-specific work belongs in a small overlay source, not a full starter
directory.

An overlay should contain only what the user's coding agent needs next:

- `manifests/*.yaml` with the smallest useful 4-atoms model.
- `handoff.md` for the agent.
- `seed-prompt.md` when example data helps.
- `layout.md` when route/layout guidance helps.

Then:

1. Add or update the smallest overlay under `overlays/<name>/`.
2. Smoke-test the generated bundle: `pnpm build:provision-bundle`,
   `pnpm check:provision-bundle`, and `pnpm smoke:provision-bundle`.

### EN-only SKILLs

`SKILL.md` and any skill prompts in this repo are written in **English only**. They instruct the consuming agent to render output in the user's language. Do not embed zh-TW (or other non-English) example bodies in skill files; the language is a runtime concern, not a source-file concern.

## Adding visual source

Theme work is post-launch source editing, not a first-run picker. Put
shared Kiwa source under `kiwa/` through `scripts/sync-kiwa.mjs`, and
put generated-repo guidance in `mantle:theme`.

## Issues

Use the GitHub issue templates:

- **Bug report** — broken, surprising, or unsafe behavior in the blank starter, overlays, Kiwa source, or provision bundle. (Engine / runtime bugs go on the parent repo.)
- **Feature request** — a concrete capability for the blank starter, overlays, Kiwa source, or provision bundle.
- **New overlay** — propose a new type bundle overlay.

Apply at least one `starter:*` or `area:*` label.

## Pull requests

Open PRs against `develop`. A useful PR body includes:

- Summary of the change.
- Why the change is needed.
- Scope and non-goals.
- Test plan with commands actually run (`blank` validate/typecheck, bundle checks, or overlay smoke).
- Follow-ups that should not block this PR.
- Related issues.

Use [`.github/pull_request_template.md`](./.github/pull_request_template.md). Link issues with `Closes #NN` when fully resolved, `Refs #NN` otherwise.

**Don't add `CHANGELOG.md` entries per PR.** The PR title + body + commit messages are the source of truth for what changed. Changelog entries are written at release time, aggregating the merged-since-last-tag commit log into Keep-a-Changelog buckets. Per-PR entries are noise — they bloat unboundedly, force conflict-merging every release-cycle, and duplicate information that's already in git. See § Release process below for who writes the entry and when.

## Release process

Mantle landing consumes `provision-bundles/<type>.json` from the selected starters ref.

Release process:

1. Land changes on `develop`.
2. Write the `CHANGELOG.md` entry for the new version. Aggregate the `git log` since the previous tag into Keep-a-Changelog buckets (`Added` / `Changed` / `Deprecated` / `Removed` / `Fixed` / `Security`). Prefix scope when relevant: `**transaction**: ...`. Cross-link the closing PR + issue. The entry lives under a new `## [vX.Y.Z] — YYYY-MM-DD` heading; no `[Unreleased]` placeholder.
3. Pre-v0.1 alpha cadence: tag `v<version>` directly from `develop` (e.g. `v0.0.11-alpha.15`). Promotion to `main` happens when an alpha graduates to beta/stable — `main` updates intentionally lag the alpha cadence so the canonical "released" pointer doesn't churn daily. (Mirrors the parent `mantle` repo's release-process.md § "Pre-v0.1 alpha cadence".)
4. CI release workflow builds and attaches private helper package tarballs when present.

Per-starter `@aotter/mantle-*` version pins move on their own cadence — independent of the tarball tag.

## Architecture gates

- Each starter is **standalone**. No `workspace:*` cross-deps. Bump `@aotter/mantle-*` deps explicitly per starter.
- `blank/` is the shared first-launch source base. Type-specific starter work belongs in `overlays/<type>/`.
- Landing provisions from the generated `provision-bundles/<type>.json`; do not add a second overlay step to generated repos.
- Macro expansion (`{{SITE_NAME}}`, `{{ARCHETYPE}}`, …) is governed by [ADR-0016](https://github.com/aotter/mantle/blob/main/docs/adr/0016-site-semantic-layer.md) on the parent repo. Unfilled macros in the scaffolded output are a release blocker.

## Security

Do not file public issues for vulnerabilities. See [`SECURITY.md`](./SECURITY.md).
