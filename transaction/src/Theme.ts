/**
 * Theme override contract for `src/theme/index.ts`.
 *
 * PR 1 scaffold — minimal type. The transaction starter ships with
 * an empty template registry; PR 4 brings the real product / cart /
 * checkout templates and expands this interface accordingly.
 *
 * Layered override scheme (carried forward from publication for
 * forward-compat with the theme:fork tooling):
 *
 *   L1  tokens     — palette, type scale, measure, gutter
 *   L2  extraCss   — additional rules (icons / i18n / extraCss)
 *   L3  components — Header / Footer / PageShell swaps
 *   L4  templates  — per-page render fn (lands in PR 4)
 */
import type { I18nBundle } from "./i18n/index.js";

type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

export interface ThemeOverride {
  /** L1 — extra CSS appended AFTER baseline `tokens.ts`. */
  readonly tokens?: string;
  /** L2 — extra CSS rules appended after baseline `styles.ts`. */
  readonly extraCss?: string;
  /** L2 — icon registry overrides (svg path strings). */
  readonly icons?: Record<string, string>;
  /** L2 — i18n bundle overrides per locale. */
  readonly i18n?: Record<string, DeepPartial<I18nBundle>>;
  /** L3 — component overrides — lands when transaction's template
   *  stack arrives in PR 4 (product card / cart drawer / order
   *  receipt / etc.). Forward-compat slot for now. */
  readonly components?: Record<string, unknown>;
  /** L4 — per-page template render fn overrides (PR 4). */
  readonly templates?: Record<string, unknown>;
}
