/**
 * l4-minimal-ink — high-contrast monochrome, narrow measure, serif
 * display. v0.0.9 mechanism stub; artist deliverable pending.
 *
 * Overrides:
 *   --paper        #fafafa   (warmer-than-white background)
 *   --ink          #0d0d0d   (near-black ink)
 *   --accent       #1a1a1a   (no-color accent; ink-on-ink)
 *   --font-display Georgia, serif stack
 *   --measure      32rem     (narrower than baseline 38rem)
 *
 * Concatenated AFTER baseline tokens, so only the vars declared here
 * change; everything else falls through to baseline.
 */
export const TOKENS_CSS = `
:root {
  --paper: #fafafa;
  --ink: #0d0d0d;
  --rule: #d4d4d4;
  --rule-strong: #909090;
  --mute: #5a5a5a;
  --accent: #1a1a1a;
  --accent-soft: #555555;
  --selection: rgba(13, 13, 13, 0.14);
  --font-display: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  --font-body: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  --measure: 32rem;
}
[data-theme="dark"] {
  --paper: #0a0a0a;
  --ink: #f0f0f0;
  --rule: #2a2a2a;
  --rule-strong: #555555;
  --mute: #9a9a9a;
  --accent: #f0f0f0;
  --accent-soft: #b8b8b8;
  --selection: rgba(240, 240, 240, 0.16);
}
`;
