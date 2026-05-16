// @clam-override-class L4-template — see src/theme.default/README.md
/** @jsxImportSource hono/jsx */
import type { SiteConfig } from "@aotterclam/clam-mantle/spec";
import type { LayoutComponent } from "../components/Layout.js";
import type { I18nBundle } from "../i18n/index.js";

export interface NotFoundContext {
  readonly site: SiteConfig;
  readonly locale: string;
}

export interface NotFoundTemplateDeps {
  readonly Layout: LayoutComponent;
  readonly bundleFor: (locale: string) => I18nBundle;
}

export function createNotFoundTemplate(deps: NotFoundTemplateDeps) {
  const { Layout, bundleFor } = deps;
  return function notFoundTemplate(ctx: NotFoundContext): string {
    const { site, locale } = ctx;
    const t = bundleFor(locale).notFound;
    const tree = (
      <Layout
        site={site}
        locale={locale}
        title={`404 — ${site.brand}`}
        description={t.body}
      >
        <section class="notfound">
          <h1>{t.title}</h1>
          <p>{t.body}</p>
          <p>
            <a href={`/${locale}`}>{t.back}</a>
          </p>
        </section>
      </Layout>
    );
    return "<!doctype html>" + String(tree);
  };
}
