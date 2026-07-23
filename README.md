# mantle-starters

Blank-first starter source for Mantle provisioning.

Current launch contract:

- `blank/` is the only first-launch base.
- `provision-bundles/<type>.json` are generated artifacts used by landing and
  local cold starts.
- `overlays/<type>/` contains small type intent overlays applied while
  building each matching bundle.
- `kiwa/` vendors selected free Kiwa source for deterministic generated
  repos.
- No first-run theme picker, full archetype starter fork, or Kiwa
  registry access is required to boot.

Generated repos use a Hono JSX-friendly shape:

```txt
src/index.ts          Worker fetch entrypoint
src/renderer.tsx      Hono JSX document renderer
src/worker/           Cloudflare Worker/Hono app, routes, auth, feature code
src/web/              public JSX page, seed-driven content, browser client JS
src/mantle/           Mantle adapter config, manifest loader, handler registry
manifests/            4 atoms: Schema, View, Procedure, Trigger
components/ lib/      Kiwa root-level convention from kiwa-ui.json
styles/               Kiwa/Tailwind source and generated CSS
```

The 4 atoms stay in root `manifests/` because they are project config,
not Worker route code. Type overlays may add server behavior under
`src/worker/features/<feature>` and register Mantle Procedure handlers
from `src/mantle/handlers/index.ts`.

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
pnpm materialize presence --out ../my-site --brand "My Site"
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

## Shape

```txt
blank/
overlays/
  presence/
  intake/
  publication/
  transaction/
  reservation/
  community/
kiwa/
provision-bundles/
  blank.json
  presence.json
  intake.json
  publication.json
  transaction.json
  reservation.json
  community.json
scripts/
  build-provision-bundle.mjs
  sync-kiwa.mjs
```

Maintain bundles by editing `blank/`, `overlays/<type>/`, or `kiwa/`, then
running `pnpm build:provision-bundle`. Do not hand-edit generated
`provision-bundles/*.json`.

`pnpm materialize <type> --out <dir>` writes one generated bundle to a local
project directory without installing dependencies, creating a remote repo, or
touching Cloudflare. The output directory must be empty.

Provisioned `README.md` files are generated from `blank/README.md` plus the
selected overlay's `handoff.md` and `layout.md`, so the repo root explains both
Mantle and the chosen launch type without maintaining seven copied READMEs.
