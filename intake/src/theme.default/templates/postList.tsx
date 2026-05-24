/** @jsxImportSource hono/jsx */
import { raw } from "hono/html";
import type { ListContext, MediaAsset } from "@aotter/mantle/runtime";
import { Layout } from "../components/Layout.js";
import { bundleFor } from "../../i18n/index.js";
import { pictureFromAssetId } from "./_picture.js";
import { excerpt, isoDate } from "./utils.js";

export function postListTemplate(ctx: ListContext): string {
  const { entries, locale, site, seo } = ctx;
  const mediaAssets = (ctx as ListContext & MediaContext).mediaAssets;
  const t = bundleFor(locale).postList;
  const tree = (
    <Layout
      site={site}
      locale={locale}
      title={`${t.title} — ${site.brand}`}
      description={site.description}
      current="posts"
      seo={seo}
    >
      <section class="hero">
        <div class="eyebrow">{t.eyebrow}</div>
        <h1>{t.title}</h1>
      </section>
      <ul class="entry-list">
        {entries.map((e) => {
          const data = e.data as {
            slug?: string;
            title?: string;
            body?: string;
            locale?: string;
            coverAssetId?: string;
            coverAlt?: string;
          };
          const href = `/${data.locale ?? locale}/posts/${data.slug ?? e.id}`;
          const title = data.title ?? data.slug ?? e.id;
          const coverHtml = pictureFromAssetId(
            data.coverAssetId,
            data.coverAlt ?? title,
            mediaAssets,
          );
          return (
            <li>
              <time>{isoDate(e.updatedAt)}</time>
              <div>
                {coverHtml ? (
                  <a class="entry-cover" href={href} aria-label={title}>
                    {raw(coverHtml)}
                  </a>
                ) : null}
                <a href={href}>{title}</a>
                <div class="excerpt">{excerpt(data.body)}</div>
              </div>
            </li>
          );
        })}
      </ul>
    </Layout>
  );
  return String(tree);
}

interface MediaContext {
  readonly mediaAssets?: ReadonlyMap<string, MediaAsset>;
}
