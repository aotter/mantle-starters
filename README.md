# mantle-starters

Blank-first starter source for Mantle provisioning.

Current launch contract:

- `blank/` is the only first-launch base.
- `provision-bundles/blank.json` is the bundle landing fetches.
- `overlays/<type>/` contains small post-launch type intent overlays.
- `kiwa/` vendors selected free Kiwa source for deterministic generated
  repos.
- No first-run theme picker, full archetype starter fork, or Kiwa
  registry access is required to boot.

## Commands

```bash
pnpm install --frozen-lockfile
pnpm build:provision-bundle
pnpm check:provision-bundle
pnpm check:kiwa
pnpm check:repo-local-skills
pnpm check:starter-locks
pnpm typecheck
pnpm test
```

Refresh selected Kiwa source:

```bash
node scripts/sync-kiwa.mjs
```

Apply an overlay inside a generated repo:

```bash
node scripts/apply-overlay.mjs          # reads .mantle/launch-state.json
node scripts/apply-overlay.mjs publication
```

## Shape

```txt
blank/
overlays/
  publication/
  transaction/
  reservation/
  community/
kiwa/
provision-bundles/blank.json
scripts/
  build-provision-bundle.mjs
  sync-kiwa.mjs
  apply-overlay.mjs
```

`sources.json` keeps `publication`, `transaction`, `reservation`, and
`community` as launch intents, but they all resolve to `blank`.
Type-specific work happens after first deploy through repo-local
`mantle:overlay`.
