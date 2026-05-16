// @clam-override-class L3-component — see src/theme.default/README.md
/** @jsxImportSource hono/jsx */
import type { SiteConfig } from "@aotterclam/clam-mantle/spec";
import { Header as BaselineHeader, type HeaderProps, type HeaderComponent } from "./Header.js";
import { Footer as BaselineFooter, type FooterComponent } from "./Footer.js";

/**
 * Body composition slot — the arrangement of Header / `<main>` /
 * Footer (and any sticky CTA, sidebar, full-bleed sections, etc.)
 * inside the document body.
 *
 * `Layout` owns the document envelope (`<html>` / `<head>` / `<body>`
 * + SEO meta + theme bootstrap script). PageShell is the body-level
 * decision: where Header sits, whether `<main>` has a container,
 * whether a sticky CTA sits between `<main>` and the real Footer.
 *
 * Splitting these is the answer to "publication carries landing /
 * articles / docs-lite / public widgets — they need different body
 * layouts but share the same `<head>`". Header / Footer stay
 * separate slot props; PageShell is the broader L3 escape hatch when
 * chrome-only swaps aren't enough but a full L4 template fork is too
 * much.
 *
 * Override flow: the consumer's `clamConfig.ts` passes a custom
 * `PageShell` into `createLayoutFactory({ PageShell: ... })`. A
 * consumer-supplied PageShell can either keep using the baseline
 * Header / Footer (default props below) or render its own chrome
 * entirely. Baseline imports nothing from consumer code, so a
 * read-only baseline tarball can't be drifted into.
 */
export interface PageShellProps {
  readonly site: SiteConfig;
  readonly locale: string;
  readonly current?: HeaderProps["current"];
  readonly children: unknown;
  /** Optional L3 chrome overrides forwarded by `createLayoutFactory`'s
   *  `pageShellProps` option, or set directly on the override
   *  PageShell. Default = baseline Header / Footer. */
  readonly Header?: HeaderComponent;
  readonly Footer?: FooterComponent;
}

export type PageShellComponent = (props: PageShellProps) => any;

export function PageShell(props: PageShellProps) {
  const {
    site,
    locale,
    current,
    children,
    Header = BaselineHeader,
    Footer = BaselineFooter,
  } = props;
  return (
    <>
      <Header site={site} locale={locale} current={current} />
      <main class="site-main">{children}</main>
      <Footer site={site} locale={locale} />
    </>
  );
}
