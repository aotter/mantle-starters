# mantle-starters agent notes

This is the starter monorepo, not a generated consumer project.

Use ponytail defaults here: keep launch deterministic, prefer deletion
over new framework, and do not rebuild the old full-starter/theme path.

Current contract:

- Landing provisions `provision-bundles/<type>.json`.
- `blank/` owns the shared generated repo base, including repo-local
  Mantle skills.
- `overlays/` are source inputs applied while building each type bundle.
- `kiwa/` is vendored free Kiwa source; generated repos must boot
  without registry access.

Useful checks:

```bash
pnpm build:provision-bundle
pnpm check:provision-bundle
pnpm check:kiwa
pnpm check:repo-local-skills
pnpm check:starter-locks
pnpm typecheck
pnpm test
```
