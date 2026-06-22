# mantle-starters

Blank-first starter source for Mantle provisioning.

Current launch contract:

- `blank/` is the only first-launch base.
- `provision-bundles/<type>.json` are generated artifacts landing fetches.
- `overlays/<type>/` contains small type intent overlays applied into each
  matching bundle.
- `kiwa/` vendors selected free Kiwa source for deterministic generated
  repos.
- No first-run theme picker, full archetype starter fork, or Kiwa
  registry access is required to boot.

## Kiwa Credit

Selected UI primitives are copied from the free
[Kiwa UI](https://kiwaui.com/) registry and vendored here so generated
repos boot without registry access. Kiwa source is MIT licensed; keep
`kiwa/LICENSE` and `kiwa/manifest.json` with any copied Kiwa files.

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
provision-bundles/
  blank.json
  publication.json
  transaction.json
  reservation.json
  community.json
scripts/
  build-provision-bundle.mjs
  sync-kiwa.mjs
  apply-overlay.mjs
```

Maintain bundles by editing `blank/`, `overlays/<type>/`, or `kiwa/`, then
running `pnpm build:provision-bundle`. Do not hand-edit generated
`provision-bundles/*.json`.
