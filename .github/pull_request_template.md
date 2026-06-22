## Summary

-

## Why

-

## Scope

-

## Non-goals

-

## Test plan

- [ ] Blank starter: `cd blank && pnpm install --frozen-lockfile && pnpm validate && pnpm typecheck`
- [ ] Provision bundle smoke: `pnpm smoke:provision-bundle`
- [ ] Not run / not applicable:
- [ ] Other:

## Follow-ups

-

## Related

Refs #

## Contributor checklist

- [ ] Base branch is `develop` for normal work, or `main` for release fanout/promote PRs.
- [ ] If adding/changing an overlay: `overlays/<name>/` updated and bundle smoke covered.
- [ ] If changing Kiwa source: `node scripts/sync-kiwa.mjs` run and `pnpm check:kiwa` passes.
- [ ] Labels applied: `starter:*` and/or `area:*`.
- [ ] User-facing docs or changelog entries updated when relevant.
