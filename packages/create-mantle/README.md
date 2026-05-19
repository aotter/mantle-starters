# `@aotterclam/create-mantle`

Scaffolder for mantle v0.1.0 consumer projects. It is distributed as a
tarball attached to `mantle-starters` GitHub releases, not as an npm
package. The package name and `create-mantle` bin exist so `npx` can run
the GitHub release tarball directly.

```bash
npx https://github.com/AotterClam/mantle-starters/releases/latest/download/aotterclam-create-mantle.tgz \
  <archetype> \
  --project-name <name> \
  --brand "<brand>" \
  --description "<one-line>" \
  --locales "zh-TW,en" \
  --github-owner <gh-login> \
  --summary "<Mantle's one-line install description>" \
  [--theme <theme-key>] \
  [--ref <git-ref>]
```

Recommended end-user path: open [mantle.aotterclam.ai](https://mantle.aotterclam.ai/), pick an archetype and theme, then paste the generated prompt into Claude Code / Cursor / Codex. The Mantle install skill in [`AotterClam/mantle`](https://github.com/AotterClam/mantle/tree/develop/skills/install) invokes this package after it interviews the user for brand, locales, audience, and deployment intent.

## What it does

1. Fetches `sources.json` from `AotterClam/mantle-starters` at the requested ref (default `develop`) — resolves archetype -> starter path + (optional) theme overlay. Falls back to a bundled stale snapshot if GH is unreachable.
2. Downloads a tarball of `mantle-starters` at the same ref.
3. Extracts and merges into the destination directory in this order: `_common/` → `<archetype>/` → each archetype overlay (in order) → (optional) `themes/<theme-key>/`. Later layers overwrite earlier files on conflict.
4. Substitutes `{{PLACEHOLDER}}` macros per ADR-0016.
5. Renames `<file>.template` → `<file>` (so `_common/AGENTS.md.template` lands as `AGENTS.md`).
6. Fails fast if any `{{PLACEHOLDER}}` remains.
7. Runs `git init` (no remote) and `pnpm install`.
8. Prints a JSON `RUN_NOTES` shape on stdout — the Mantle install skill reads this to know what to do next.

## CLI flags

| Flag | Required | Default | Notes |
|---|---|---|---|
| (positional `<archetype>`) | yes | — | `presence` / `publication` / `intake` / `transaction` / `blank`. Roadmap keys refused. |
| `--project-name` | yes | — | Lowercase, hyphenated. Becomes wrangler worker name. |
| `--brand` | yes | — | Public display name. |
| `--description` | yes | — | One-line public description. |
| `--locales` | yes | — | Comma-separated BCP 47 list. First is canonical. |
| `--canonical-locale` | no | first `--locales` | Override canonical locale explicitly. |
| `--github-owner` | yes | — | Becomes `ADMIN_GITHUB_LOGIN`. |
| `--summary` | yes | — | Mantle's one-line install summary; lands in `mantle/site.md` `revisions[0].summary`. |
| `--theme` | no | none | Theme overlay key resolved against `sources.themes`. |
| `--ref` | no | `develop` | Git ref for both `sources.json` and the tarball. `--starter-ref` retained as alias. |

## RUN_NOTES JSON shape

```json
{
  "archetype": "presence",
  "theme": null,
  "starter_source": "AotterClam/mantle-starters/publication",
  "theme_source": null,
  "overlays": [],
  "files_written": ["AGENTS.md", "mantle/site.md", "package.json", "..."],
  "next_step": "Mantle: replace HTML comments in mantle/site.md with prose from interview; then commit + invoke provision skill."
}
```

With a theme applied:

```json
{
  "archetype": "publication",
  "theme": "l4-editorial-warm",
  "starter_source": "AotterClam/mantle-starters/publication",
  "theme_source": "AotterClam/mantle-starters/themes/l4-editorial-warm",
  ...
}
```

## Source map: runtime fetch

`sources.json` lives at the root of [`AotterClam/mantle-starters`](https://github.com/AotterClam/mantle-starters) and is fetched at runtime. Schema:

```json
{
  "archetypes": {
    "presence":    { "path": "presence" },
    "publication": { "path": "publication" },
    "intake":      { "path": "intake" },
    "transaction": { "path": "transaction" },
    "blank":       { "path": "blank" }
  },
  "themes": {
    "l4-minimal-ink":       { "path": "themes/l4-minimal-ink" },
    "l4-editorial-warm":    { "path": "themes/l4-editorial-warm" },
    "l4-editorial-journal": { "path": "themes/l4-editorial-journal" },
    "l4-playful-pop":       { "path": "themes/l4-playful-pop" }
  },
  "roadmap": ["reservation", "community", "membership"]
}
```

Adding an archetype or theme = update `sources.json` in `mantle-starters`. This package does not need a new version unless the merge logic itself changes.

Fetch failures (network down, GH unreachable, schema invalid) fall back to a bundled snapshot in `src/sources.ts` (`STALE_FALLBACK_SOURCES`); a warning lands on stderr.

## Source layering

```
_common/<file>          → <file>
<archetype>/<file>      → <file>      (overwrites _common on conflict)
overlays[i]/<file>      → <file>      (overwrites earlier on conflict; in order)
themes/<theme>/<file>   → <file>      (last; theme wins on conflict)
```

`_common/` carries the AGENTS.md + mantle/site.md backbone; archetype dirs carry the runtime code, manifests, and scripts; theme overlays touch `src/theme/` only.

## Local dev

```bash
pnpm install
pnpm build
pnpm test
```

The test suite uses an offline fixture tree (no network, no `gh auth`) — it constructs a fake extracted tarball under a temp dir and runs the local install path directly. See `test/install.test.ts`. Network paths (`fetchSourcesJson`) are tested with mocked `fetch`.

## Replaces

The manual `curl … | tar -xzf …` + `pnpm run setup:site` ritual that used to live in `skills/install/SKILL.md`. After this package ships, the install Skill invokes a single non-interactive `npx` and reads the RUN_NOTES instead.

The starters' own `setup:site` script keeps working for in-project reconfiguration; it just stops being the install-time entry point.

## See also

- [ADR-0016](https://github.com/AotterClam/mantle/blob/develop/docs/adr/0016-site-semantic-layer.md) — placeholder macro list + update workflow
- [ADR-0013](https://github.com/AotterClam/mantle/blob/develop/docs/adr/0013-agent-provisioned-consumer-projects.md) — the broader agent-provisioned install flow
- [Epic #116](https://github.com/AotterClam/mantle/issues/116) — v0.0.9 install UX pivot (Mantle scope narrow + 1:1 starter + theme overlay; this package is sub-issue #121)
- [`AotterClam/mantle-starters`](https://github.com/AotterClam/mantle-starters) — public starters monorepo this package dispatches against
