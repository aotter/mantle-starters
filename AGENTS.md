# AGENTS.md

This is the **starter monorepo**, not a consumer project. The `AGENTS.md` that ends up in a scaffolded project is templated from [`_common/AGENTS.md.template`](./_common/AGENTS.md.template) per [ADR-0016](https://github.com/AotterClam/mantle/blob/main/docs/adr/0016-site-semantic-layer.md) on the parent repo.

## If you're using this monorepo to scaffold a project for a user

**Do not clone this repo.** Run the install Skill on the parent repo:
[`skills/install/SKILL.md`](https://github.com/AotterClam/mantle/blob/main/skills/install/SKILL.md).

The scaffolder downloads a pinned tarball, merges `_common/` + `<archetype>/` + optional theme overlays into the user's empty directory, fills `{{PLACEHOLDER}}` macros, and initializes a fresh user-owned git repo.

## If you're maintaining this monorepo

- Contribution contract → [CONTRIBUTING.md](./CONTRIBUTING.md) (branch model: `main` only; PRs base on `main`).
- Project doctrine → [parent CLAUDE.md](https://github.com/AotterClam/mantle/blob/main/CLAUDE.md). Agents write config; the runtime carries complexity.
- Dispatch SoT → [`sources.json`](./sources.json). Adding an archetype or theme starts here.
- Macro list → [parent ADR-0016](https://github.com/AotterClam/mantle/blob/main/docs/adr/0016-site-semantic-layer.md).

Premium / per-customer starters live in the private sibling [`AotterClam/mantle-starters-premium`](https://github.com/AotterClam/mantle-starters-premium). Sync strategy with this repo is tracked at TBD.
