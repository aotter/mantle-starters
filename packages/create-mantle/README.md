# @aotter/create-mantle

Scaffolds a generated Mantle repo from `mantle-starters`.

Current contract:

- every launch archetype resolves to the `blank` base;
- selected type is written into `.mantle/launch-state.json`;
- generated repos include repo-local `mantle:*` skills, `overlays/`,
  vendored Kiwa source, and `scripts/apply-overlay.mjs`;
- type-specific work happens after launch through `mantle:overlay`.

## Example

```bash
npx https://github.com/aotter/mantle-starters/releases/download/<tag>/aotter-create-mantle.tgz publication \
  --project-name lab-cafe \
  --brand "Lab Cafe" \
  --description "A blank-first Mantle site" \
  --locales "en" \
  --github-owner aotter \
  --summary "Initial blank Mantle launch"
```

The output is still a blank deployable Mantle project. `publication` is
stored as intent, then `node scripts/apply-overlay.mjs` can apply the
small publication overlay.

## Local checks

```bash
pnpm build
pnpm typecheck
pnpm test
```
