/** @jsxImportSource hono/jsx */
import { raw } from "hono/html";
import type { EntryContext, MediaAsset } from "@aotter/mantle/runtime";
import { Layout } from "../components/Layout.js";
import { pictureFromAssetId } from "./_picture.js";
import { isoDate, renderMarkdown } from "./utils.js";

export function postTemplate(ctx: EntryContext): string {
  const { entry, site, seo } = ctx;
  const mediaAssets = (ctx as EntryContext & MediaContext).mediaAssets;
  const data = entry.data as {
    slug?: string;
    title?: string;
    body?: string;
    locale?: string;
    coverAssetId?: string;
    coverAlt?: string;
    publishedAt?: number;
  };
  const locale = data.locale ?? site.canonicalLocale ?? "en";
  const title = data.title ?? data.slug ?? "Untitled";
  const coverHtml = pictureFromAssetId(
    data.coverAssetId,
    data.coverAlt ?? title,
    mediaAssets,
    "eager",
  );
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
        {coverHtml ? <figure class="post-cover">{raw(coverHtml)}</figure> : null}
        <div class="post-body">{raw(renderMarkdown(data.body))}</div>
      </article>
    </Layout>
  );
  return String(tree);
}

interface MediaContext {
  readonly mediaAssets?: ReadonlyMap<string, MediaAsset>;
}
