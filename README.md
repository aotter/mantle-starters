# mantle-starters

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

Public monorepo of mantle starter templates.

This repo is consumed by the `@aotterclam/create-mantle` npx package
at install time. End users usually should not clone this repo directly:
they start from [mantle.aotterclam.ai](https://mantle.aotterclam.ai/),
paste the generated prompt into Claude Code / Cursor / Codex, and the
install Skill in [`AotterClam/mantle`](https://github.com/AotterClam/mantle)
invokes `create-mantle`. The scaffolder downloads a tagged tarball of
this repo, merges `_common/` + `<archetype>/` + optional theme overlays
into the user's empty directory, then initializes their own Git repo.

Premium / per-customer starters live in the private sibling
[`AotterClam/mantle-starters-premium`](https://github.com/AotterClam/mantle-starters-premium).
That repo mirrors `_common/`; sync strategy is TBD.

## How to install

Recommended path:

1. Open [mantle.aotterclam.ai](https://mantle.aotterclam.ai/).
2. Pick an archetype and optional theme.
3. Paste the generated prompt into Claude Code / Cursor / Codex.

That route runs the [`mantle` install Skill](https://github.com/AotterClam/mantle/tree/develop/skills/install), which interviews the user for brand, locales, audience, and deployment intent before invoking the scaffolder.

### Direct scaffolder call

The agent-driven flow (paste the landing prompt into Claude Code /
Cursor / Codex) is the recommended path because the install Skill
interviews the user for brand / locales / audience before running the
command. If you're already past the interview or testing this repo and want to invoke the
scaffolder directly, the command shape is:

```bash
npx @aotterclam/create-mantle@alpha <archetype> \
  --project-name "<my-site>" \
  --brand "<My Brand>" \
  --description "<one-line site description>" \
  --locales "en,zh-TW" \
  --github-owner "<your-github-login>" \
  --summary "<install-moment marker>"
  # optional: --theme <theme>     (l4-minimal-ink | l4-editorial-warm | l4-editorial-journal | l4-playful-pop)
```

`<archetype>` is one of: `presence`, `publication`, `intake`,
`transaction`, `blank`. The CLI fetches `sources.json` at runtime,
downloads the matching starter tarball, merges `_common/` +
`<archetype>/` + optional `themes/<theme>/`, fills `{{BRAND}}` /
`{{LOCALES}}` / `{{DESCRIPTION}}` placeholders, runs `git init` +
`pnpm install`, and prints RUN_NOTES JSON. After it returns, `cd
<my-site>` and follow that directory's own README for the local-dev
Quickstart.

For SDK/runtime internals, release policy, and agent skills, go back to
[`AotterClam/mantle`](https://github.com/AotterClam/mantle). This repo is
only the starter source and scaffolder package.

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
└── sources.json               ← archetype + theme dispatch (runtime-fetched)
```

Each archetype has its own top-level directory — there is no shared base
+ archetype overlay. The 1:1 split keeps each starter independently
readable, validatable, and forkable.

## Source map (`sources.json`)

`sources.json` at the repo root is the authoritative dispatch from
archetype / theme key → starter directory + theme overlays.
`create-mantle` fetches it at runtime
(`raw.githubusercontent.com/AotterClam/mantle-starters/<ref>/sources.json`)
on every install. Adding an archetype or theme = update this file; no
`create-mantle` republish needed unless merge logic changes.

## Install merge order

For each install, `create-mantle` extracts files in this order
(later files overwrite earlier files on conflict):

1. `_common/<file>` → `<file>` (`.template` suffix stripped)
2. `<archetype>/<file>` → `<file>`
3. Each theme overlay listed in the request, in order

Then `{{PLACEHOLDER}}` macros are substituted across the result. See
[`AotterClam/mantle` ADR-0016](https://github.com/AotterClam/mantle/blob/develop/docs/adr/0016-site-semantic-layer.md)
for the macro list.

## Adding a starter

1. Create a new top-level directory in this repo (e.g. `membership/`).
2. Add the starter sources. Keep the directory standalone — no
   `workspace:*` deps; pin `@aotterclam/mantle-*` to the published
   version that this starter ships against.
3. Add a corresponding entry to `sources.json` under `archetypes:`.
   Runtime fetch picks it up on the next install — no
   `create-mantle` republish required unless merge logic changes.

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

The root CI runs the workspace checks across starters and the
scaffolder, but each starter remains a standalone consumer project.
Runtime code lives upstream in the `AotterClam/mantle` packages; this
repo only pins and consumes those published packages.

## License

[MIT](./LICENSE) — see each starter for its own LICENSE if
present.
