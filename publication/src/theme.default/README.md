# `src/theme.default/` — baseline UI for the publication archetype

Everything in this directory is **the baseline**. Files here ship the publication starter's default look and behavior — header chrome, page templates, tokens, default i18n. This is your **read-most-of-the-time, edit-knowing-the-tradeoff** zone.

## How customization works

`src/themeWiring.ts` is the single composition site. It calls `createPublicationBaseline(options)` from `./theme.default/index.js` with override options. You add yours there:

```ts
const baseline = createPublicationBaseline({
  extraCss: BRAND_OVERRIDES_CSS,             // L1 tokens + L2 css
  extraHeaderJs: MOBILE_NAV_RUNTIME,         // L2 behavior
  components: { PageShell: MarketingShell }, // L3 chrome fork
  templates: { home: marketingHome },        // L4 home fork
  bundles: { en: extendBundle("en", {...}) },
  extraIcons: { sparkles: "<path .../>" },
});
```

The override surface is **slot-based**, not file-edit-based. The recommended path is: add your override under `src/theme/` (you create that dir), then thread it through the factory options above.

## Override classes

Each file in this directory carries one of these `@clam-override-class` markers at the top:

| Class | Files | How to override |
|---|---|---|
| **L1-token** | `tokens.ts` | Append CSS variables via the `extraCss` factory option |
| **L2-style** | `styles.ts` | Append CSS rules via the `extraCss` factory option |
| **L2-icon** | `icons.ts` | Add new icons via the `extraIcons` factory option |
| **L2-script** | (none here — adopter ships their own runtime JS via `extraHeaderJs`) | `extraHeaderJs` factory option |
| **L2-i18n** | `i18n/*.json`, `i18n/index.ts` | `bundles` factory option + `extendBundle("locale", {patch})` |
| **L3-component** | `components/{Header,Footer,PageShell}.tsx` | `components.{name}` factory option |
| **L4-template** | `templates/{home,post,postList,page,contact,notFound}.tsx` | `templates.{name}` factory option |
| **sdk-owned** | `components/Layout.tsx`, `index.ts`, `templates/index.ts`, `templates/utils.ts`, `components/index.ts`, `i18n/index.ts` | Not overridable via factory — to customize, fork the starter |

## Editing baseline files in place

Allowed but **discouraged**. Direct edits to files in this directory drift from the upstream baseline — any future `pnpm update` of the SDK / starters template may conflict or silently revert your changes.

The factory-option path scales: your overrides live in `src/theme/`, baseline keeps absorbing upstream patches.

The edit-in-place path doesn't scale: your fork is forever your maintenance burden.

When you have a one-line tweak that doesn't fit any factory option (e.g., the slot is too coarse — you want to change ONLY a footer link), the honest answer is one of:

1. Replace the whole slot (L3 footer in this case) — feels heavy but is the supported path.
2. File a feature request — ask for a finer slot.
3. Edit in place — accept the maintenance debt.

Pick consciously.

## Don't move files out of this directory

The factory + barrel files (`index.ts`, `templates/index.ts`, `components/index.ts`, `i18n/index.ts`) assume the directory layout shown here. Moving files breaks the barrels' import paths.

If you want overrides organized differently, put your overrides in `src/theme/<your-shape>/` — that's yours. `src/theme.default/` keeps the layout described here.
