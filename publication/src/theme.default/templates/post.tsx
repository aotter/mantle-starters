// @mantle-override-class L4-template — see src/theme.default/README.md
/** @jsxImportSource hono/jsx */
import { raw } from "hono/html";
import type { EntryContext } from "@aotter/mantle/runtime";
import type { LayoutComponent } from "../components/Layout.js";
import { isoDate, renderMarkdown } from "./utils.js";

export interface PostTemplateDeps {
  readonly Layout: LayoutComponent;
}

export function createPostTemplate(deps: PostTemplateDeps) {
  const { Layout } = deps;
  return function postTemplate(ctx: EntryContext): string {
    const { entry, site, seo } = ctx;
    const data = entry.data as {
      slug?: string;
      title?: string;
      body?: string;
      locale?: string;
      /** MediaAsset.id (#272). Templates currently degrade gracefully
       *  when set: the cover is omitted. SDK render-pipeline change
       *  to pre-resolve assets into EntryContext lands in a follow-up;
       *  once that's in, this template will read the resolved
       *  variants[] off ctx and emit <picture>. */
      coverAssetId?: string;
      publishedAt?: number;
    };
    const locale = data.locale ?? site.canonicalLocale ?? "en";
    const title = data.title ?? data.slug ?? "Untitled";
    const tree = (
      <Layout
        site={site}
        locale={locale}
        title={`${title} — ${site.brand}`}
        description={site.description}
        current="posts"
        seo={seo}
      >
        <article>
          <header class="post-meta">
            {data.publishedAt ? (
              <time dateTime={new Date(data.publishedAt).toISOString()}>
                {isoDate(data.publishedAt)}
              </time>
            ) : null}
            <h1>{title}</h1>
          </header>
          <div class="post-body">{raw(renderMarkdown(data.body))}</div>
        </article>
      </Layout>
    );
    return String(tree);
  };
}
