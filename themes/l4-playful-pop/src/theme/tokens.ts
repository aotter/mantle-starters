/**
 * l4-playful-pop — bright background, hot-pink accent, geometric sans,
 * wide measure. v0.0.9 mechanism stub; artist deliverable pending.
 *
 * Overrides:
 *   --paper        #fffaf0   (off-white with warm cast)
 *   --ink          #1f1f2e   (deep indigo, not pure black)
 *   --accent       #ff2e88   (hot pink)
 *   --font-display Inter / Söhne / sans
 *   --measure      44rem     (wider than baseline 38rem; less precious)
 */
export const TOKENS_CSS = `
:root {
  --paper: #fffaf0;
  --ink: #1f1f2e;
  --rule: #ffe4d1;
  --rule-strong: #ffb88a;
  --mute: #6e6e85;
  --accent: #ff2e88;
  --accent-soft: #ff7ab0;
  --selection: rgba(255, 46, 136, 0.22);
  --font-display: "Inter", "Söhne", system-ui, -apple-system, sans-serif;
  --font-body: "Inter", "Söhne", system-ui, -apple-system, sans-serif;
  --measure: 44rem;
}
[data-theme="dark"] {
  --paper: #16161f;
  --ink: #f0eaff;
  --rule: #2e2e44;
  --rule-strong: #525275;
  --mute: #9090a8;
  --accent: #ff5fa2;
  --accent-soft: #ff9ec5;
  --selection: rgba(255, 95, 162, 0.24);
}
`;
