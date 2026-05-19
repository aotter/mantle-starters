# Contributing to mantle-starters

This repo holds the public starter scaffolds + the `create-mantle` scaffolder for the [mantle](https://github.com/AotterClam/mantle) project. Most consumers never see this repo directly — they run the scaffolder from the GitHub release tarball.

Start here before changing code or docs. For project-wide doctrine, read the parent repo's [`CLAUDE.md`](https://github.com/AotterClam/mantle/blob/main/CLAUDE.md).

## Project shape

- **`main` is the only long-lived branch.** This repo ships from `main` directly — there is no `develop` integration branch.
- Why divergent from the parent? The parent `mantle` repo uses `develop → main` because engine versioning is staged. This repo's release cadence is tied to scaffolder tarball tags, which are cheap to roll back, so the extra branch buys nothing.
- PRs target `main`.
- Merge completed PRs with `gh pr merge --merge --delete-branch`. Do not squash; reviewable commits are preserved.
- Feature work should normally start from an issue unless it is a tiny docs or hygiene fix.

## Local setup

Requirements:

- Node.js >= 22 (the `create-mantle` scaffolder package itself runs on Node >= 20)
- pnpm >= 9

Each subdirectory under this monorepo is a **standalone project**. There is no monorepo-wide `pnpm install` — `cd` into the starter or `packages/create-mantle/` you're touching.

## Branches

Cut branches from `main`:

```bash
git fetch origin
git checkout -b feat/issue-NN-topic origin/main
```

Use these prefixes:

- `feat/issue-NN-topic` — user-visible features (new archetype, new theme, scaffolder capability).
- `fix/issue-NN-topic` — bug fixes (broken validate, broken scaffolder run).
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

## Adding a starter archetype

Archetypes graduate in two stages: **roadmap stub** → **ready**.

### 1. Roadmap stub (entry on the roadmap list)

1. Add the archetype name to the `roadmap` array in [`sources.json`](./sources.json).
2. Create `<archetype>/SKILL.md` with a refuse-path message (the scaffolder reads this when a user asks for a not-yet-ready archetype).
3. Open a `[Starter]` issue using the "New starter archetype" template.

### 2. Promote to ready

To graduate, the directory must contain:

- `package.json` (pinned `@aotterclam/mantle-*` versions; no `workspace:*` deps — each starter is standalone).
- `wrangler.toml` (Cloudflare Worker entry).
- `manifests/` (CLAM atom manifests — Schema / View / Procedure / Trigger).
- `src/index.ts` (Worker entry; mounts runtime + auth).
- `SKILL.md` (agent brief; EN-only — see "EN-only SKILLs" below).
- `README.md` (what-you-get / what-you-don't-get; on par with `publication/README.md`).
- `.dev.vars.example` and `.dev.vars.test.example` (env-var skeleton; **no real secrets**).
- `.gitignore`.

Then:

1. Move the archetype name from `roadmap` to `archetypes` in `sources.json`.
2. Run per-starter tests locally: `cd <archetype>/ && pnpm install && pnpm validate && pnpm typecheck`.
3. Smoke-test the scaffolder against your archetype: `cd packages/create-mantle && pnpm test`.

### EN-only SKILLs

`SKILL.md` and any skill prompts in this repo are written in **English only**. They instruct the consuming agent to render output in the user's language. Do not embed zh-TW (or other non-English) example bodies in skill files; the language is a runtime concern, not a source-file concern.

## Adding a theme

Themes are visual overlays. They live under `themes/<key>/` and contain only files that go *under* `src/theme/` in a scaffolded project — never a full starter scaffold.

1. Pick a key following `l<tier>-<mood>` (e.g. `l4-minimal-ink`, `l3-editorial-bold`).
2. Add `themes/<key>/src/theme/tokens.ts` plus any optional component / template overrides.
3. Add a corresponding entry in [`sources.json`](./sources.json) under `themes`.

See [`themes/README.md`](./themes/README.md) for the existing palette and conventions.

## Issues

Use the GitHub issue templates:

- **Bug report** — broken, surprising, or unsafe behavior in a starter or the scaffolder. (Engine / runtime bugs go on the parent repo.)
- **Feature request** — a concrete capability for an existing starter or the scaffolder.
- **New starter archetype** — propose a new archetype or graduate a roadmap stub.

Apply at least one `starter:*` or `area:*` label.

## Pull requests

Open PRs against `main`. A useful PR body includes:

- Summary of the change.
- Why the change is needed.
- Scope and non-goals.
- Test plan with commands actually run (per-starter validate + typecheck; scaffolder tests if you touched it).
- Follow-ups that should not block this PR.
- Related issues.

Use [`.github/pull_request_template.md`](./.github/pull_request_template.md). Link issues with `Closes #NN` when fully resolved, `Refs #NN` otherwise.

## Release process

The `create-mantle` scaffolder is attached to each GitHub release as a
tarball. Consumers run it via:

```bash
npx https://github.com/AotterClam/mantle-starters/releases/latest/download/aotterclam-create-mantle.tgz <archetype> ...
```

Release process:

1. Land changes on `main`.
2. Tag `v<version>` from `main` (e.g. `v0.0.11-alpha`).
3. CI release workflow builds the scaffolder and attaches a `pnpm pack` tarball + sha256 to the GitHub release.

Per-starter `@aotterclam/mantle-*` version pins move on their own cadence — independent of the tarball tag.

## Architecture gates

- Each starter is **standalone**. No `workspace:*` cross-deps. Bump `@aotterclam/mantle-*` deps explicitly per starter.
- `_common/` is **merge-first**: every file in `_common/` ends up in every scaffold (unless overridden by the archetype). Anything starter-specific belongs in `<archetype>/`, not `_common/`.
- `sources.json` is the **only** dispatch surface. The scaffolder does not introspect directory names; if it's not in `sources.json`, it doesn't exist.
- Macro expansion (`{{SITE_NAME}}`, `{{ARCHETYPE}}`, …) is governed by [ADR-0016](https://github.com/AotterClam/mantle/blob/main/docs/adr/0016-site-semantic-layer.md) on the parent repo. Unfilled macros in the scaffolded output are a release blocker.

## Security

Do not file public issues for vulnerabilities. See [`SECURITY.md`](./SECURITY.md).
