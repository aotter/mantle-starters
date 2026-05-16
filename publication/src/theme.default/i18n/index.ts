// @clam-override-class sdk-owned — see src/theme.default/README.md
import en from "./en.json";
import zhTw from "./zh-TW.json";

/**
 * Baseline UI-string bundles. Schema-stored content (post bodies,
 * page bodies, post titles) stays in the runtime; this is starter
 * chrome (nav, headings, error copy, form labels) that doesn't fit
 * a CMS-row shape.
 *
 * Adding a locale: create `./<locale>.json` matching the en shape
 * (TypeScript will complain on divergence — every locale must
 * satisfy `I18nBundle`), then register in `BASELINE_BUNDLES`.
 *
 * Consumer overrides land at wire time (`clamConfig.ts`) — call
 * `extendBundle("zh-tw", { header: { posts: "文章" } })` to
 * deep-merge custom strings over the baseline, then feed the merged
 * bundles into `createPublicationBaseline({ bundles })`. Keeping the
 * merge out of this file is what lets the baseline package ship as a
 * read-only tarball with zero consumer-side imports.
 */
export type I18nBundle = typeof en;

export const BASELINE_BUNDLES: Readonly<Record<string, I18nBundle>> = {
  en,
  "zh-tw": zhTw,
};

export function baselineBundleFor(locale: string): I18nBundle {
  return BASELINE_BUNDLES[locale.toLowerCase()] ?? en;
}

export function baselineLocaleLabel(locale: string): string {
  return baselineBundleFor(locale).label;
}

/** Deep-merge consumer overrides over a baseline bundle. Use at
 *  wire time; returns a new bundle that satisfies `I18nBundle`. */
export function extendBundle(
  locale: string,
  patch: DeepPartial<I18nBundle>,
): I18nBundle {
  const base = baselineBundleFor(locale);
  return deepMerge(base, patch);
}

/** Make a `bundleFor(locale)` lookup closed over an extended-bundle
 *  table. Pass to `createPublicationBaseline({ bundleFor })` so
 *  templates resolve i18n through the consumer's merged copies. */
export function makeBundleResolver(
  bundles: Readonly<Record<string, I18nBundle>>,
): (locale: string) => I18nBundle {
  return (locale) => bundles[locale.toLowerCase()] ?? bundles["en"] ?? en;
}

// ── internals ────────────────────────────────────────────────────

type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

function deepMerge<T>(base: T, override: unknown): T {
  if (override == null || typeof override !== "object" || Array.isArray(override)) {
    return base;
  }
  if (base == null || typeof base !== "object" || Array.isArray(base)) {
    return override as T;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(override)) {
    out[k] = deepMerge((base as Record<string, unknown>)[k], v);
  }
  return out as T;
}
