// @clam-override-class L3-component — see src/theme.default/README.md
/** @jsxImportSource hono/jsx */
import type { SiteConfig } from "@aotterclam/clam-mantle/spec";

export interface FooterProps {
  readonly site: SiteConfig;
  readonly locale: string;
}

export type FooterComponent = (props: FooterProps) => any;

/** Default site footer. Override by passing a custom Footer via the
 *  PageShell prop in `createLayoutFactory({ pageShellProps: { Footer } })`. */
export function Footer(props: FooterProps) {
  const { site } = props;
  return (
    <footer class="site-footer">
      <div class="colophon">
        {site.brand} · {site.description ?? ""}
      </div>
      <div>
        built on{" "}
        <a href="https://github.com/AotterClam/clam-mantle">clam·mantle</a>
      </div>
    </footer>
  );
}
