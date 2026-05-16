// @mantle-override-class sdk-owned — see src/theme.default/README.md
/**
 * Hono+JSX baseline UI for the @aotter/mantle publication
 * starter. Adopter projects scaffolded from `publication/` install
 * this package as a tarball-URL dependency; importing from the
 * package is the only way to reach baseline UI primitives (the
 * package is in `node_modules` so an agent can't fork it in place).
 *
 * Customization model — everything plugs in at wire time via
 * `createPublicationBaseline({...})` in your `src/mantleConfig.ts`:
 *
 *   import { createPublicationBaseline, extendBundle } from
 *     "@aotter/mantle-publication-baseline";
 *
 *   const { Layout, templates, buildTemplates } = createPublicationBaseline({
 *     // L1 — tokens via extraCss (`:root { --paper: #fff; }`)
 *     extraCss: MY_TOKENS + MY_OVERRIDES,
 *     // L2 — append-only header runtime JS (mobile nav, etc.)
 *     extraHeaderJs: MY_MOBILE_NAV_JS,
 *     // L3 — slot replacements (PageShell, Header, Footer)
 *     components: {
 *       PageShell: MyPageShell,   // full body-layout fork
 *       // Header / Footer travel via pageShellProps below if PageShell
 *       // wants the baseline-default in some routes
 *     },
 *     // L4 — template slot replacements (per-page)
 *     templates: {
 *       home: myHome,             // request-time custom home
 *     },
 *     // Optional — extended i18n bundles (deep-merge over baseline)
 *     bundles: {
 *       en: extendBundle("en", { header: { posts: "Articles" } }),
 *     },
 *     // Optional — additional icons (lucide-style path fragments)
 *     extraIcons: { sparkles: "<path d='...' />" },
 *   });
 *
 * The returned `templates.post / .postList / .page` go through
 * `buildTemplates()` into the runtime dispatch registry; `templates
 * .home / .notFound / .contact` are called directly from your worker
 * route handlers in `src/index.ts`.
 */
import { BASELINE_BUNDLES, baselineBundleFor, makeBundleResolver, type I18nBundle } from "./i18n/index.js";
import { createLayoutFactory, type LayoutComponent, type LayoutFactoryOptions } from "./components/Layout.js";
import { createPublicationTemplates, buildPublicationTemplates, type PublicationTemplateBundle } from "./templates/index.js";
import type { PageShellComponent, PageShellProps } from "./components/PageShell.js";

// ── Public re-exports — power users / advanced wiring ────────────

export * from "./components/index.js";
export {
  buildPublicationTemplates,
  createPublicationTemplates,
  type PublicationTemplateBundle,
  type TemplatesDeps,
  type HomeContext,
  type NotFoundContext,
  type ContactContext,
} from "./templates/index.js";
export {
  BASELINE_BUNDLES,
  baselineBundleFor,
  baselineLocaleLabel,
  extendBundle,
  makeBundleResolver,
  type I18nBundle,
} from "./i18n/index.js";
export {
  BASELINE_ICON_PATHS,
  createIconResolver,
  icon,
  renderIcon,
  type BaselineIconName,
  type IconOptions,
  type IconRenderer,
} from "./icons.js";
export { TOKENS_CSS } from "./tokens.js";
export {
  HEADER_RUNTIME_JS,
  SITE_CSS,
  THEME_BOOTSTRAP_JS,
} from "./styles.js";

// ── Ergonomic one-call factory ──────────────────────────────────

export interface CreatePublicationBaselineOptions {
  /** L3 component slot — full PageShell replacement. Defaults to the
   *  baseline PageShell, which itself accepts Header/Footer as
   *  optional props with baseline defaults. */
  readonly components?: {
    readonly PageShell?: PageShellComponent;
  };
  /** L4 template slot overrides. Any provided value replaces the
   *  baseline template wholesale. */
  readonly templates?: Partial<PublicationTemplateBundle>;
  /** Consumer-side merged i18n bundles. If unset, baseline bundles
   *  are used as-is. Use `extendBundle(locale, patch)` to construct. */
  readonly bundles?: Readonly<Record<string, I18nBundle>>;
  /** Additional CSS appended after tokens + baseline styles. */
  readonly extraCss?: string;
  /** Inline JS appended after `HEADER_RUNTIME_JS` — runs after the
   *  baseline header runtime so its DOM exists. Use for mobile-nav
   *  toggles, sticky-CTA reveals, custom popovers. */
  readonly extraHeaderJs?: string;
  /** Extra PageShell props forwarded on every page (e.g. mobile-nav
   *  config). Travels through Layout into PageShell. */
  readonly pageShellProps?: LayoutFactoryOptions["pageShellProps"];
}

export interface PublicationBaseline {
  /** Wired Layout ready to use from templates / consumer handlers. */
  readonly Layout: LayoutComponent;
  /** All 6 templates closed over the supplied deps. Pass the
   *  persistent ones (post/postList/page) into `buildTemplates()`;
   *  call the request-time ones (home/notFound/contact) from your
   *  worker route handlers. */
  readonly templates: PublicationTemplateBundle;
  /** `TemplateRegistry` for the runtime dispatcher (registers
   *  `post-translations` entry + list, `page-translations` entry). */
  readonly buildTemplates: () => ReturnType<typeof buildPublicationTemplates>;
  /** The bundleFor resolver in use — handy if a consumer-side route
   *  wants to read a label without re-wiring. */
  readonly bundleFor: (locale: string) => I18nBundle;
}

export function createPublicationBaseline(
  opts: CreatePublicationBaselineOptions = {},
): PublicationBaseline {
  const bundleFor = opts.bundles
    ? makeBundleResolver(opts.bundles)
    : baselineBundleFor;

  const Layout = createLayoutFactory({
    PageShell: opts.components?.PageShell,
    extraCss: opts.extraCss,
    extraHeaderJs: opts.extraHeaderJs,
    pageShellProps: opts.pageShellProps,
  });

  const baseTemplates = createPublicationTemplates({ Layout, bundleFor });
  const overridden = opts.templates ?? {};
  const templates: PublicationTemplateBundle = {
    post: overridden.post ?? baseTemplates.post,
    postList: overridden.postList ?? baseTemplates.postList,
    page: overridden.page ?? baseTemplates.page,
    home: overridden.home ?? baseTemplates.home,
    notFound: overridden.notFound ?? baseTemplates.notFound,
    contact: overridden.contact ?? baseTemplates.contact,
  };

  return {
    Layout,
    templates,
    buildTemplates: () => buildPublicationTemplates(templates),
    bundleFor,
  };
}
