/** @jsxImportSource hono/jsx */
import { raw } from "hono/html";
import type { SiteConfig } from "@aotter/mantle/spec";
import { Layout, renderHtml } from "./layout.js";
import { BLOCKS_CSS, renderBlocks } from "./_blocks.js";
import { renderMarkdownSafe } from "./_markdown.js";
import { EMPTY_ASSETS } from "./_picture.js";
import type { PageContent } from "../handlers/_productEnrichment.js";

/** Markdown-fallback shell — used when the loaded page row has no
 *  `blocks` field. Mirrors the `block-prose` block's CSS so a pure
 *  markdown page and a `prose` block render with the same typography. */
const PAGE_MD_CSS = `
  .page-md {
    max-width: 720px;
    margin: 0 auto;
    padding: 3rem 1.5rem 5rem;
    line-height: 1.85;
    color: var(--block-ink, #1a1a1a);
  }
  .page-md h1 {
    font-size: clamp(2rem, 4vw, 2.6rem);
    line-height: 1.2;
    margin: 0 0 0.8rem;
  }
  .page-md .summary {
    font-size: 1.08rem;
    color: var(--block-ink-soft, #555);
    margin: 0 0 2.6rem;
  }
  .page-md h2 { font-size: 1.4rem; margin: 2.6rem 0 0.8rem; }
  .page-md h3 { font-size: 1.08rem; margin: 1.8rem 0 0.4rem; }
  .page-md p { margin: 0 0 1.05rem; }
  .page-md ul, .page-md ol { padding-left: 1.5rem; margin: 0 0 1.1rem; }
  .page-md li { margin-bottom: 0.35rem; }
  .page-md a {
    color: var(--block-accent, #2563eb);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
`;

export interface PageContext {
  readonly page: PageContent;
  readonly site: SiteConfig;
}

export function renderPage(ctx: PageContext): string {
  const blocks = ctx.page.blocks;
  const useBlocks = blocks && blocks.length > 0;
  const assets = ctx.page.assets ?? EMPTY_ASSETS;
  const bodyHtml =
    !useBlocks && ctx.page.body ? renderMarkdownSafe(ctx.page.body) : "";
  const tree = (
    <Layout title={ctx.page.title} site={ctx.site}>
      <style>{raw(useBlocks ? BLOCKS_CSS : PAGE_MD_CSS)}</style>
      {useBlocks ? (
        raw(renderBlocks(blocks, assets))
      ) : (
        <article class="page-md">
          <h1>{ctx.page.title}</h1>
          {ctx.page.summary ? <p class="summary">{ctx.page.summary}</p> : null}
          <div>{raw(bodyHtml)}</div>
        </article>
      )}
    </Layout>
  );
  return renderHtml(tree);
}
