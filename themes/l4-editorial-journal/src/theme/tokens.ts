/**
 * l4-editorial-journal — quiet literary journal: warm paper, dark ink,
 * narrow measure, editorial serif (Fraunces display + Source Serif 4
 * body), one vermilion accent.
 *
 * Ported from the retired `blog-editorial-2026-05-05` starter's visual
 * system, preserved as a design reference at
 * `clam-cms/docs/design-references/editorial-blog-2026-05-05.md`.
 *
 * Tokens are the v0.0.9 stub scope; component overrides (drop cap on
 * first body paragraph, post-list two-column grid, hero block, mono
 * eyebrow metadata, vermilion mid-dot wordmark) require artist-tier
 * component deliverables that land separately.
 */
export const TOKENS_CSS = `
:root {
  --paper: #f6f1e7;
  --ink: #1a1814;
  --rule: #d4c8b3;
  --rule-strong: #3d342a;
  --mute: #7a6d5e;
  --accent: #a3331f;
  --accent-soft: #c9614a;
  --selection: #f0d6a3;

  --font-display: "Fraunces", "Noto Serif TC", "Source Serif 4", Georgia, serif;
  --font-body: "Source Serif 4", "Noto Serif TC", Georgia, serif;
  --font-mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;

  --measure: 38rem;
  --gutter: clamp(1.25rem, 4vw, 3rem);
}

[data-theme="dark"] {
  --paper: #1a1814;
  --ink: #f1ebdf;
  --rule: #3d342a;
  --rule-strong: #5a4d40;
  --mute: #9a8d7e;
  --accent: #e6594a;
  --accent-soft: #c9614a;
  --selection: #4a3520;
}

html { font-size: 18px; }
body {
  line-height: 1.65;
  font-feature-settings: "kern", "liga", "onum";
}
`;
