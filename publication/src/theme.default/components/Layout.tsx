// @clam-override-class sdk-owned — see src/theme.default/README.md
/** @jsxImportSource hono/jsx */
import type { SiteConfig } from "@aotterclam/clam-mantle/spec";
import { renderSeoTagsHtml, type SeoMeta } from "@aotterclam/clam-mantle/runtime";
import { html, raw } from "hono/html";
import { HEADER_RUNTIME_JS, SITE_CSS, THEME_BOOTSTRAP_JS } from "../styles.js";
import { TOKENS_CSS } from "../tokens.js";
import {
  PageShell as BaselinePageShell,
  type PageShellComponent,
  type PageShellProps,
} from "./PageShell.js";
import type { HeaderProps } from "./Header.js";

/**
 * Document envelope (`<html>` / `<head>` / `<body>` + SEO meta +
 * theme bootstrap script). Templates compose
 * `<Layout>{children}</Layout>`.
 *
 * `<head>` shape, SEO emission order, and theme bootstrap timing are
 * concerns that cross the starter-family line and shouldn't be
 * redefined per page. Body layout (Header / `<main>` / Footer
 * arrangement, sticky CTAs, sidebar variants) is delegated to the
 * `PageShell` slot which IS overridable at L3.
 *
 * Override flow: the consumer's `clamConfig.ts` calls
 * `createLayoutFactory({ PageShell?, extraCss?, extraHeaderJs?,
 * faviconUrl? })` once at boot and passes the returned `Layout` into
 * the template factory. Baseline files import nothing from the
 * consumer — every customization arrives as a factory option.
 *
 * When `seo` is provided (every public entry / list page through
 * `mountPublicRoutes`), the SDK-composed canonical / hreflang /
 * `.md` alternate / og: / twitter / JSON-LD block is emitted from
 * `renderSeoTagsHtml`. Hand-rolled meta in `<head>` is the
 * fall-back path for templates the publish pipeline doesn't reach
 * (404, contact form).
 */
export interface LayoutProps {
  readonly site: SiteConfig;
  readonly locale: string;
  readonly title: string;
  readonly description?: string;
  readonly ogImage?: string;
  readonly current?: HeaderProps["current"];
  readonly seo?: SeoMeta;
  readonly children: unknown;
}

export type LayoutComponent = (props: LayoutProps) => any;

export interface LayoutFactoryOptions {
  /** L3 PageShell override. Defaults to the baseline PageShell which
   *  in turn resolves Header / Footer from its own props. */
  readonly PageShell?: PageShellComponent;
  /** Additional CSS appended after `TOKENS_CSS` + `SITE_CSS`. Use for
   *  consumer-side theme tweaks (brand colour swaps, extra utilities). */
  readonly extraCss?: string;
  /** Inline JS appended after `HEADER_RUNTIME_JS`. Use for consumer
   *  behaviour wiring (mobile nav toggle, sticky CTA reveal). Runs
   *  after the baseline header runtime so its DOM is available. */
  readonly extraHeaderJs?: string;
  /** Props forwarded into the resolved PageShell on every page.
   *  Lets a consumer-supplied PageShell receive its own slot impls
   *  (header / footer overrides, mobile-nav config) without those
   *  having to be ambient module state. */
  readonly pageShellProps?: Omit<PageShellProps, "site" | "locale" | "current" | "children">;
}

/**
 * Build a Layout component closed over the supplied options. Called
 * once at consumer boot from `clamConfig.ts`; returns a Layout that
 * templates can `<Layout>...</Layout>` against.
 */
export function createLayoutFactory(opts: LayoutFactoryOptions = {}): LayoutComponent {
  const PageShellResolved = opts.PageShell ?? BaselinePageShell;
  const SITE_CSS_RESOLVED = TOKENS_CSS + SITE_CSS + (opts.extraCss ?? "");
  const HEADER_JS_RESOLVED = HEADER_RUNTIME_JS + (opts.extraHeaderJs ?? "");
  const extraShellProps = opts.pageShellProps ?? {};

  return function Layout(props: LayoutProps) {
    const { site, locale, title, description, ogImage, current, seo, children } = props;
    return (
      <html lang={locale || site.canonicalLocale || "en"}>
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>{title}</title>
          {seo ? html`${raw(renderSeoTagsHtml(seo))}` : null}
          {!seo && description ? <meta name="description" content={description} /> : null}
          {!seo && ogImage ? <meta property="og:image" content={ogImage} /> : null}
          <link rel="icon" type="image/svg+xml" href={site.faviconUrl ?? "/favicon.svg"} />
          <style>{raw(SITE_CSS_RESOLVED)}</style>
          {html`<script>${raw(THEME_BOOTSTRAP_JS)}</script>`}
        </head>
        <body>
          <PageShellResolved
            site={site}
            locale={locale}
            current={current}
            {...extraShellProps}
          >
            {children}
          </PageShellResolved>
          {html`<script>${raw(HEADER_JS_RESOLVED)}</script>`}
        </body>
      </html>
    );
  };
}

/** Pre-built Layout with all baseline defaults — for the trivial
 *  "no consumer customization" case (e.g. running the starter in CI
 *  before any override wiring exists). Production consumers should
 *  call `createLayoutFactory({...})` from `clamConfig.ts`. */
export const Layout: LayoutComponent = createLayoutFactory();
