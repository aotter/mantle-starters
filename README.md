# mantle-starters

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

Public monorepo of mantle starter templates.

This repo is consumed by the `create-mantle` scaffolder tarball attached
to each GitHub release. End users usually should not clone this repo
directly: they start from
the Mantle landing page, paste the
generated prompt into Claude Code / Cursor / Codex, and the install Skill
in [`aotter/mantle`](https://github.com/aotter/mantle) invokes
the release tarball. The scaffolder downloads a tagged tarball of this
repo, merges `_common/` + `<archetype>/` + optional theme overlays into
the user's empty directory, then initializes their own Git repo.

Premium / per-customer starters live in the private sibling
[`aotter/mantle-starters-premium`](https://github.com/aotter/mantle-starters-premium).
That repo mirrors `_common/`; sync strategy is TBD.

## How to install

Recommended path:

1. Open the Mantle landing page.
2. Pick an archetype, optional theme, and optional feature overlays.
3. Paste the generated prompt into Claude Code / Cursor / Codex.

That route runs the [`mantle` install Skill](https://github.com/aotter/mantle/tree/develop/skills/install), which interviews the user for brand, locales, audience, and deployment intent before invoking the scaffolder.

### Direct scaffolder call

The agent-driven flow (paste the landing prompt into Claude Code /
Cursor / Codex) is the recommended path because the install Skill
interviews the user for brand / locales / audience before running the
command. If you're already past the interview or testing this repo and want to invoke the
scaffolder directly, the command shape is:

```bash
npx https://github.com/aotter/mantle-starters/releases/download/v0.0.11-alpha.17/aotter-create-mantle.tgz <archetype> \
  --project-name "<my-site>" \
  --brand "<My Brand>" \
  --description "<one-line site description>" \
  --locales "en,zh-TW" \
  --github-owner "<your-github-login>" \
  --summary "<install-moment marker>"
  # optional: --theme <theme>     (l4-minimal-ink | l4-editorial-warm | l4-editorial-journal | l4-playful-pop)
  # optional: --feature <feature> (repeat or comma-separate; e.g. contact, customer-account)
```

Use a versioned release URL while Mantle is on alpha prereleases. GitHub's
`/releases/latest/` endpoint ignores prereleases, so it returns 404 when
there is no stable release yet.

`<archetype>` is one of: `presence`, `publication`, `intake`,
`transaction`, `blank`. The CLI fetches `sources.json` at runtime,
downloads the matching starter tarball, merges `_common/` +
`<archetype>/` + selected feature overlays + optional `themes/<theme>/`,
fills `{{BRAND}}` / `{{LOCALES}}` / `{{DESCRIPTION}}` placeholders,
runs `git init` + `pnpm install`, and prints RUN_NOTES JSON. After it
returns, `cd <my-site>` and follow that directory's own README for the
local-dev Quickstart.

For SDK/runtime internals, release policy, and agent skills, go back to
[`aotter/mantle`](https://github.com/aotter/mantle). This repo is
only the starter source and scaffolder implementation.

## Layout

```
mantle-starters/
├── _common/                   ← shared backbone, merged into every install
│   ├── AGENTS.md.template     ← cross-tool agent entry
│   ├── mantle/
│   │   └── site.md.template   ← Mantle's semantic layer
│   └── .gitignore.template
├── presence/                  ← landing-page / brand-presence starter
├── publication/               ← owner-published-content starter
├── intake/                    ← publication + structured `leads` Schema
├── transaction/               ← small catalog + cart + order workflow
├── reservation/               ← roadmap note; routes to intake for v0.1
├── community/                 ← roadmap placeholder
├── membership/                ← roadmap placeholder
├── blank/                     ← headless API + MCP starter
├── themes/                    ← theme overlays (artist-designed; v0.0.9+)
└── sources.json               ← archetype + feature + theme dispatch
```

Each archetype has its own top-level directory, but `_common/` is the
shared backbone. The pattern is intentionally shadcn-like: common
primitives and workflow scripts live once, while each archetype keeps
its domain-specific composition readable and forkable.

## Provisioning Backbone

Every active archetype receives the shared `_common/scripts/provision.mjs`
runner during scaffolding and exposes:

```bash
pnpm run provision:plan
pnpm run provision:up
```

The shared flow keeps the user's first Cloudflare deploy dashboard-led:
the agent pushes the repo, the user creates a Worker from GitHub, and
Cloudflare auto-provisions id-less D1/KV/R2 bindings. After the first
deploy, the coding agent runs `pnpm exec wrangler login` and
`provision:up` to write non-secret config and Worker secrets. Do not
fork this flow per archetype unless the archetype needs an explicit
feature provision step under `scripts/.mantle-provision.mjs`.

## Claude Plugin Marketplace

This repository is also a Claude Code plugin marketplace:

```text
/plugin marketplace add aotter/mantle-starters
```

The first plugin is `mantle-companion-upload`, an operator-side helper
for uploading chat/local image files into a deployed Mantle site without
pushing large base64 payloads through MCP tool arguments. It wraps the
existing Mantle media upload session flow:

```text
create_media_upload -> signed upload URLs -> commit_media_upload
```

See [`plugins/mantle-companion-upload`](plugins/mantle-companion-upload)
for install and pairing details.

## Source map (`sources.json`)

`sources.json` at the repo root is the authoritative dispatch from
archetype / feature / theme key → source directory.
`create-mantle` fetches it at runtime
(`raw.githubusercontent.com/aotter/mantle-starters/<ref>/sources.json`)
on every install. Adding an archetype, feature, or theme = update this
file; no SDK publish is needed unless merge logic changes.

## Install merge order

For each install, `create-mantle` extracts files in this order
(later files overwrite earlier files on conflict):

1. `_common/<file>` → `<file>` (`.template` suffix stripped)
2. `<archetype>/<file>` → `<file>`
3. Selected feature overlays, in dependency order
4. Each theme overlay listed in the request, in order

Then `{{PLACEHOLDER}}` macros are substituted across the result. See
[`aotter/mantle` ADR-0016](https://github.com/aotter/mantle/blob/develop/docs/adr/0016-site-semantic-layer.md)
for the macro list.

## Adding a starter

1. Create a new top-level directory in this repo (e.g. `membership/`).
2. Add the starter sources. Keep the directory standalone — no
   `workspace:*` deps; pin `@aotter/mantle-*` to the published
   version that this starter ships against.
3. Add a corresponding entry to `sources.json` under `archetypes:`.
   Runtime fetch picks it up on the next install — no
   `create-mantle` republish required unless merge logic changes.

## Starter Lockfiles

Every starter carries its own standalone `pnpm-lock.yaml` because
`create-mantle` scaffolds a new consumer project outside this monorepo.
Do not regenerate those lockfiles from inside the workspace; workspace
catalog resolution can hide stale standalone locks.

When changing starter dependencies, the root catalog, or any
`@aotter/mantle*` version, run:

```bash
pnpm refresh:starter-locks
```

That script scaffolds each archetype into a temp directory, resolves the
lockfile as a standalone project, then copies the generated lockfile back
to the starter directory. CI runs the same flow in check mode:

```bash
pnpm check:starter-locks
```

If this check fails, do not hand-edit `pnpm-lock.yaml`; run the refresh
script and commit the resulting lockfile changes.

## Adding a theme

1. Create a new directory under `themes/<key>/` (e.g.
   `themes/l4-minimal-ink/`).
2. Add `src/theme/tokens.ts` and any optional component/template
   overrides. The theme only contains files that go *under* `src/theme/`
   — not a full starter scaffold.
3. Add a corresponding entry to `sources.json` under `themes:`.

## Per-starter testing

Each subdirectory is a standalone project. Inside it:

```bash
pnpm install
pnpm validate
pnpm typecheck
pnpm dev
```

`pnpm dev` runs the starter's safe Wrangler wrapper: it binds to
`localhost:8787`, keeps inspector port selection out of the way, and
stores Wrangler HOME/XDG/log/state files under project-local ignored
directories.
Use `localhost`, not `127.0.0.1`, in browser URLs and OAuth app settings so
cookies, callbacks, and local onboarding state all share the same origin.

The root CI runs the workspace checks across starters and the
scaffolder, but each starter remains a standalone consumer project.
Runtime code lives upstream in the `aotter/mantle` packages; this
repo only pins and consumes those published packages.

## License

[MIT](./LICENSE) — see each starter for its own LICENSE if
present.
