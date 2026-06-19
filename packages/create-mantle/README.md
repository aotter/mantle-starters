# `@aotter/create-mantle`

Scaffolder for mantle v0.1.0 consumer projects. It is distributed as a
tarball attached to `mantle-starters` GitHub releases, not as an npm
package. The package name and `create-mantle` bin exist so `npx` can run
the GitHub release tarball directly.

```bash
npx https://github.com/aotter/mantle-starters/releases/download/v0.0.11-alpha.17/aotter-create-mantle.tgz \
  <archetype> \
  --project-name <name> \
  --brand "<brand>" \
  --description "<one-line>" \
  --locales "zh-TW,en" \
  --github-owner <gh-login-or-org> \
  --admin-github-login <gh-login> \
  --summary "<Mantle's one-line install description>" \
  [--theme <theme-key>] \
  [--feature <name[,name:variant]>] \
  [--ref <git-ref>]
```

Use a versioned release URL for alpha builds. GitHub does not resolve
prereleases through `/releases/latest/`.

Recommended end-user path: open the Mantle landing page, answer the launch
questions, sign in with GitHub, then paste the generated launch command into
Claude Code / Cursor / Codex. The Mantle install skill in
[`aotter/mantle`](https://github.com/aotter/mantle/tree/develop/skills/install)
invokes this package with `launch --session <url>` so the landing session
authorizes scaffold values before the agent continues to provision.

## What it does

1. Fetches `sources.json` from `aotter/mantle-starters` at the requested ref
   (default `main`) — resolves archetype -> starter path + requested feature
   overlays + optional theme overlay. Falls back to a bundled stale snapshot if
   GH is unreachable.
2. Downloads a tarball of `mantle-starters` at the same ref.
3. Extracts and merges into the destination directory in this order: `_common/`
   → `<archetype>/` → selected feature overlays in dependency order →
   (optional) `themes/<theme-key>/`. Later layers overwrite earlier files only
   for registered composable targets; other feature conflicts fail.
4. Substitutes `{{PLACEHOLDER}}` macros per ADR-0016.
5. Renames `<file>.template` → `<file>` (so `_common/AGENTS.md.template`
   lands as `AGENTS.md`, and repo-local `mantle:*` skill templates land under
   `.agent/` + `.claude/`).
6. Fails fast if any `{{PLACEHOLDER}}` remains.
7. Runs `git init` (no remote) and `pnpm install`.
8. Prints a JSON `RUN_NOTES` shape on stdout — the Mantle install skill reads this to validate locally and continue to provision.

## CLI flags

| Flag | Required | Default | Notes |
|---|---|---|---|
| (positional `<archetype>`) | yes | — | `presence` / `publication` / `intake` / `transaction` / `blank`. Roadmap keys refused. |
| `--project-name` | yes | — | Lowercase, hyphenated. Becomes wrangler worker name. |
| `--brand` | yes | — | Public display name. |
| `--description` | yes | — | One-line public description. |
| `--locales` | yes | — | Comma-separated BCP 47 list. First is canonical. |
| `--canonical-locale` | no | first `--locales` | Override canonical locale explicitly. |
| `--github-owner` | yes | — | GitHub account or organization that will own the repo. |
| `--admin-github-login` | no | `--github-owner` | First site admin's GitHub login. Set this when the repo owner is an organization. |
| `--summary` | yes | — | Mantle's one-line install summary; lands in `.mantle/launch-state.json`. |
| `--theme` | no | none | Theme overlay key resolved against `sources.themes`. |
| `--feature` / `--features` | no | none | Source-first feature recipes. Repeat or comma-separate. Variants use `name:variant`. |
| `--ref` | no | `main` | Git ref for both `sources.json` and the tarball. `--starter-ref` retained as alias. |

## RUN_NOTES JSON shape

```json
{
  "archetype": "presence",
  "theme": null,
  "features": [],
  "starter_source": "aotter/mantle-starters/presence",
  "theme_source": null,
  "overlays": [],
  "files_written": [
    ".agent/skills/mantle-development/SKILL.md",
    ".agent/skills/mantle-update/SKILL.md",
    "AGENTS.md",
    "package.json",
    "..."
  ],
  "next_step": "Run local validation, create the private GitHub repo, then follow the repo-local mantle:provision skill for Cloudflare first deploy."
}
```

With a theme applied:

```json
{
  "archetype": "publication",
  "theme": "l4-editorial-warm",
  "features": [
    {
      "name": "contact",
      "type": "registry:feature",
      "variant": null,
      "path": "_common/features/contact",
      "registry_dependencies": []
    }
  ],
  "starter_source": "aotter/mantle-starters/publication",
  "theme_source": "aotter/mantle-starters/themes/l4-editorial-warm",
  ...
}
```

## Source map: runtime fetch

`sources.json` lives at the root of [`aotter/mantle-starters`](https://github.com/aotter/mantle-starters) and is fetched at runtime. Schema:

```json
{
  "archetypes": {
    "presence":    { "path": "presence" },
    "publication": { "path": "publication" },
    "intake":      { "path": "intake" },
    "transaction": { "path": "transaction" },
    "blank":       { "path": "blank" }
  },
  "features": {
    "contact": {
      "path": "_common/features/contact",
      "applicableArchetypes": ["publication", "presence", "intake"]
    },
    "customer-account": {
      "path": "_common/features/customer-account",
      "applicableArchetypes": ["transaction"]
    },
    "members-only-purchase": {
      "path": "_common/features/members-only-purchase",
      "applicableArchetypes": ["transaction"],
      "registryDependencies": ["customer-account"]
    },
    "customer-profile": {
      "path": "_common/features/customer-profile",
      "applicableArchetypes": ["transaction"],
      "registryDependencies": ["customer-account"]
    },
    "media-r2": {
      "path": "_common/features/media-r2",
      "applicableArchetypes": ["transaction", "publication", "intake"]
    }
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

Adding an archetype, feature, or theme = update `sources.json` in
`mantle-starters`. This package does not need a new version unless the merge
logic itself changes.

Fetch failures (network down, GH unreachable, schema invalid) fall back to a bundled snapshot in `src/sources.ts` (`STALE_FALLBACK_SOURCES`); a warning lands on stderr.

## Source layering

```
_common/<file>            → <file>
<archetype>/<file>        → <file>      (overwrites _common on conflict)
features[i]/<file>        → <file>      (feature order is dependency order)
themes/<theme>/<file>     → <file>      (last; bounded to src/theme/**)
```

`_common/` carries the AGENTS.md backbone, plus repo-local
`mantle:*` agent skills under `.agent/` and `.claude/`; archetype dirs carry the runtime
code, manifests, and scripts; feature overlays copy source and compose
registered integration targets; theme overlays touch `src/theme/` only.

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

- [ADR-0016](https://github.com/aotter/mantle/blob/develop/docs/adr/0016-site-semantic-layer.md) — placeholder macro list + update workflow
- [ADR-0013](https://github.com/aotter/mantle/blob/develop/docs/adr/0013-agent-provisioned-consumer-projects.md) — the broader agent-provisioned install flow
- [Epic #116](https://github.com/aotter/mantle/issues/116) — v0.0.9 install UX pivot (Mantle scope narrow + 1:1 starter + theme overlay; this package is sub-issue #121)
- [CLI and skill taxonomy](../../docs/cli-skill-taxonomy.md) — create-time scaffolder vs authoring CLI vs starter lifecycle scripts
- [`aotter/mantle-starters`](https://github.com/aotter/mantle-starters) — public starters monorepo this package dispatches against
