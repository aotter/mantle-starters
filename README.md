# clam-mantle-starters

Public monorepo of clam-mantle v0.1.0 starter templates.

This repo is consumed by the `@aotterclam/create-clam-mantle` npx package
at install time (Epic [`AotterClam/clam-mantle#97`](https://github.com/AotterClam/clam-mantle/issues/97)).
End users do not clone this repo directly. They land on
[clam-mantle-landing](https://github.com/AotterClam/clam-mantle-landing),
paste a two-URL prompt into Claude Code / Cursor / Codex, and the
install Skill invokes `create-clam-mantle`, which downloads a tagged
tarball of this repo, merges `_common/` + `<archetype>/` into the
user's empty directory, then initializes their own Git repo.

Premium / per-customer starters live in the private sibling
[`AotterClam/clam-mantle-starters-premium`](https://github.com/AotterClam/clam-mantle-starters-premium).
That repo mirrors `_common/`; sync strategy is TBD.

## Layout

```
clam-mantle-starters/
├── _common/                   ← shared backbone, merged into every install
│   ├── AGENTS.md.template     ← cross-tool agent entry
│   ├── mantle/
│   │   └── site.md.template   ← Mantle's semantic layer
│   └── .gitignore.template
├── presence/                  ← landing-page / brand-presence starter
├── publication/               ← owner-published-content starter
├── intake/                    ← publication + structured `leads` Schema
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
`create-clam-mantle` fetches it at runtime
(`raw.githubusercontent.com/AotterClam/clam-mantle-starters/<ref>/sources.json`)
on every install. Adding an archetype or theme = update this file; no
`create-clam-mantle` republish needed unless merge logic changes.

## Install merge order

For each install, `create-clam-mantle` extracts files in this order
(later files overwrite earlier files on conflict):

1. `_common/<file>` → `<file>` (`.template` suffix stripped)
2. `<archetype>/<file>` → `<file>`
3. Each theme overlay listed in the request, in order

Then `{{PLACEHOLDER}}` macros are substituted across the result. See
[`AotterClam/clam-mantle` ADR-0016](https://github.com/AotterClam/clam-mantle/blob/develop/docs/adr/0016-site-semantic-layer.md)
for the macro list.

## Adding a starter

1. Create a new top-level directory in this repo (e.g. `membership/`).
2. Add the starter sources. Keep the directory standalone — no
   `workspace:*` deps; pin `@aotterclam/clam-mantle-*` to the published
   version that this starter ships against.
3. Add a corresponding entry to `sources.json` under `archetypes:`.
   Runtime fetch picks it up on the next install — no
   `create-clam-mantle` republish required unless merge logic changes.

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

There is no cross-starter build at the monorepo root by design;
starters do not share runtime code (that lives upstream in the
`AotterClam/clam-mantle` packages).

## License

[MIT](publication/LICENSE) — see each starter for its own LICENSE if
present.
