/**
 * Theme override contract for `src/theme/index.ts`.
 *
 * Layered override scheme; any key omitted falls through to the
 * `theme.default/` baseline. The four levels describe the recommended
 * escalation when an agent and the human user are iterating on visual
 * identity:
 *
 *   L1  tokens     - palette, type scale, measure, gutter
 *   L2  extraCss   - additional rules, icons, and i18n labels
 *   L3  components - Header / Footer chrome swaps, or PageShell
 *   L4  templates  - replace a whole page's render function
 */
import type { EntryContext, ListContext } from "@aotter/mantle/runtime";
import type { I18nBundle } from "./theme.default/i18n/index.js";
import type { Header } from "./theme.default/components/Header.js";
import type { Footer } from "./theme.default/components/Footer.js";
import type { PageShell } from "./theme.default/components/PageShell.js";
import type { HomeContext } from "./theme.default/templates/home.js";
import type { ContactContext } from "./theme.default/templates/contact.js";
import type { NotFoundContext } from "./theme.default/templates/notFound.js";

type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

export interface ThemeOverride {
  /** L1 - extra CSS appended after baseline `tokens.ts`. */
  readonly tokens?: string;

  /** L2 - extra CSS appended after baseline `styles.ts`. */
  readonly extraCss?: string;

  /** L2 - additional or overriding SVG icon registry entries. */
  readonly icons?: Record<string, string>;

  /** L2 - partial bundle deep-merged over the baseline bundle per locale. */
  readonly i18n?: { [locale: string]: DeepPartial<I18nBundle> };

  /** L3 - body-level component slots. */
  readonly components?: {
    readonly Header?: typeof Header;
    readonly Footer?: typeof Footer;
    readonly PageShell?: typeof PageShell;
  };

  /** L4 - replace a page kind's render function in whole. */
  readonly templates?: {
    readonly post?: (ctx: EntryContext) => string;
    readonly postList?: (ctx: ListContext) => string;
    readonly page?: (ctx: EntryContext) => string;
    readonly home?: (ctx: HomeContext) => string;
    readonly contact?: (ctx: ContactContext) => string;
    readonly notFound?: (ctx: NotFoundContext) => string;
  };
}
