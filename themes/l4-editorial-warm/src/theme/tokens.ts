/**
 * l4-editorial-warm — cream paper, brick accent, transitional serif.
 * v0.0.9 mechanism stub; artist deliverable pending.
 *
 * Overrides:
 *   --paper        #fcf6e8   (warm cream)
 *   --ink          #1d1814   (warm near-black)
 *   --accent       #9a2b1b   (brick red)
 *   --font-display Bookerly / Charter / Source Serif fallback stack
 *   --measure      36rem     (slightly narrower than baseline)
 */
export const TOKENS_CSS = `
:root {
  --paper: #fcf6e8;
  --ink: #1d1814;
  --rule: #e6dfcc;
  --rule-strong: #b8ad96;
  --mute: #6a5e4a;
  --accent: #9a2b1b;
  --accent-soft: #c45a48;
  --selection: rgba(154, 43, 27, 0.15);
  --font-display: "Bookerly", "Charter", "Source Serif 4", "Georgia", serif;
  --font-body: "Bookerly", "Charter", "Source Serif 4", "Georgia", serif;
  --measure: 36rem;
}
[data-theme="dark"] {
  --paper: #1a1612;
  --ink: #f1ebdf;
  --rule: #36302a;
  --rule-strong: #5a4f43;
  --mute: #a89c87;
  --accent: #e0664f;
  --accent-soft: #f08f7c;
  --selection: rgba(224, 102, 79, 0.2);
}
`;
