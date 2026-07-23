---
archetype: {{ARCHETYPE}}
status: ready
starter_repo: aotter/mantle-starters
starter_path: blank
---

# Mantle project: `{{ARCHETYPE}}`

This project was materialized from Mantle's shared blank base and the selected
`{{ARCHETYPE}}` provision bundle. The type layer is already composed; do not
copy `blank/` or merge overlays.

Before editing:

1. Read `AGENTS.md`, `.mantle/launch-state.json`, `.mantle/features.json`, and
   `.mantle/handoff.md`.
2. Read the repo-local Mantle skills under `.agent/skills/` or
   `.claude/skills/`.
3. After installing dependencies, use the matching embedded docs under
   `node_modules/@aotter/mantle/docs/`.
4. Run `pnpm validate` and `pnpm typecheck` before changing code.

Local preview is the first gate. GitHub, Cloudflare, and auth setup are
production work and should happen only when the user asks to ship.

## Product work

- Inspect the already composed manifest, pages, layout note, and seed data
  before proposing custom structure.
- Ask what the first useful page or workflow should prove.
- Keep seed data tiny and remove blank examples when real content replaces
  them.
- Apply brand and visual direction through the repo-local `mantle:theme`
  skill; there is no starter theme picker.
