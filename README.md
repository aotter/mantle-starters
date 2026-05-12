# mantle-starters

Public monorepo of mantle v0.1.0 starter templates.

This repo is consumed by the `@aotter/create-mantle` npx package
at install time (Epic [`aotter/mantle#97`](https://github.com/aotter/mantle/issues/97)).
End users do not clone this repo directly. They land on
[mantle-landing](https://github.com/aotter/mantle-landing),
paste a two-URL prompt into Claude Code / Cursor / Codex, and the
install Skill invokes `create-mantle`, which downloads a tagged
tarball of this repo, merges `_common/` + `<archetype>/` into the
user's empty directory, then initializes their own Git repo.

Premium / per-customer starters live in the private sibling
[`aotter/mantle-starters-premium`](https://github.com/aotter/mantle-starters-premium).
That repo mirrors `_common/`; sync strategy is TBD.

## Layout

```
mantle-starters/
├── _common/                   ← shared backbone, merged into every install
│   ├── AGENTS.md.template     ← cross-tool agent entry (~30 lines)
│   ├── mantle/
│   │   └── site.md.template   ← Mantle's semantic layer (~300 lines)
│   └── .gitignore.template
├── publication/               ← owner-published-content starter
│   ├── manifests/
│   ├── scripts/
│   ├── src/
│   ├── package.json
│   └── wrangler.toml
└── blank/                     ← headless API + MCP starter
    ├── manifests/
    ├── scripts/
    ├── src/
    ├── package.json
    └── wrangler.toml
```

## Source map (`sources.json`)

`sources.json` at the repo root is the authoritative dispatch from
archetype / theme key → starter directory + overlays. `create-mantle`
fetches it at runtime (`raw.githubusercontent.com/aotter/mantle-starters/<ref>/sources.json`)
on every install. Adding an archetype or theme = update this file; no
`create-mantle` republish needed unless merge logic changes.

The current shape predates the 1:1 starter split — `presence` and
`publication` both resolve to `publication/`, and `intake` carries an
overlay that does not yet exist (the merger silently skips missing
overlay paths). After the split lands the paths get updated; consumers
pick up the change on the next install.

## Install merge order

For each archetype, `create-mantle` extracts files in this order
(later files overwrite earlier files on conflict):

1. `_common/<file>` → `<file>` (`.template` suffix stripped)
2. `<archetype>/<file>` → `<file>`
3. Each overlay listed in the archetype's source-map entry, in order

Then `{{PLACEHOLDER}}` macros are substituted across the result. See
[`aotter/mantle` ADR-0016](https://github.com/aotter/mantle/blob/develop/docs/adr/0016-site-semantic-layer.md)
for the macro list.

## Adding a starter

1. Create a new top-level directory in this repo (e.g. `presence/`).
2. Add the starter sources. Keep the directory standalone — no
   `workspace:*` deps; pin `@aotter/mantle-*` to the published
   version that this starter ships against.
3. If the starter needs to extend `_common/AGENTS.md` or
   `_common/mantle/site.md`, add `overlay/AGENTS.md.append` and/or
   `overlay/mantle/site.md.append` per ADR-0016.
4. Add a corresponding entry to `sources.json` at this repo's root.
   Runtime fetch picks it up on the next install — no `create-mantle`
   republish required unless merge logic changes.

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
`aotter/mantle` packages).

## License

[MIT](publication/LICENSE) — see each starter for its own LICENSE if
present.
