# `themes/`

Theme overlays for clam-cms v0.0.9+. Each theme ships files that
overlay onto `src/theme/` in the scaffolded consumer project. The
overlay merge happens in `@aotterclam/create-clam-cms` after
`_common/` + `<archetype>/` land, so theme files always win on
conflict against archetype defaults.

## Naming

`l<tier>-<mood>` — the `l<tier>` prefix indicates design quality tier.

- `L4` is the baseline artist-quality tier (v0.0.9 target).
- Higher tiers (`L5`+) can land later for premium / pro themes.
- The current stubs use `L4` to claim the slot; visual quality is
  mechanism-only until artist deliverables land.

## What a theme directory contains

```
themes/<key>/
├── src/theme/tokens.ts         ← required: CSS var overrides
├── src/theme/components/       ← optional: Header / Footer / PageShell
├── src/theme/templates/        ← optional: per-page templates
├── src/theme/icons.ts          ← optional: icon registry overrides
├── src/theme/i18n/             ← optional: UI string overrides
└── README.md                   ← what this theme overrides
```

Only `tokens.ts` is required. Component / template / icon / i18n
overrides slot into the same paths the [`customize-design`
skill](https://github.com/AotterClam/clam-cms/blob/main/skills/customize-design/SKILL.md)
documents.

## v0.0.9 stubs

| Key | Mood | Status |
|---|---|---|
| `l4-minimal-ink` | quiet / editorial / ink-on-paper | stub |
| `l4-editorial-warm` | warm-paper / brick accent / transitional serif | stub |
| `l4-editorial-journal` | literary journal — Fraunces + vermilion; ported from retired editorial-blog ref | stub (tokens + body type behavior) |
| `l4-playful-pop` | bright / hot-pink / sans / wider measure | stub |

All four override tokens only (the editorial-journal stub additionally
sets body-level type behavior — base size, line-height, OpenType
feature flags). Artist component / template deliverables ship
separately.

`l4-editorial-journal` has the richest design provenance: it ports the
visual system documented at
[`clam-cms/docs/design-references/editorial-blog-2026-05-05.md`](https://github.com/AotterClam/clam-cms/blob/main/docs/design-references/editorial-blog-2026-05-05.md).
The full design (drop caps, post-list grid, mono eyebrow metadata,
vermilion mid-dot wordmark, hero block) requires component overrides
that land when artist work resumes.

## Registering a theme

Add an entry under `themes:` in
[`sources.json`](../sources.json):

```json
"themes": {
  "l4-minimal-ink":       { "path": "themes/l4-minimal-ink" },
  "l4-editorial-warm":    { "path": "themes/l4-editorial-warm" },
  "l4-editorial-journal": { "path": "themes/l4-editorial-journal" },
  "l4-playful-pop":       { "path": "themes/l4-playful-pop" }
}
```

The landing site reads `sources.json` to populate the theme selector.
