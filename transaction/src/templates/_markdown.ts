/**
 * Safe markdown renderer for operator-authored content.
 *
 * `marked` does not sanitize by default — the v9 `sanitize` option was
 * removed. Raw HTML in markdown source flows straight through to the
 * output, which becomes a stored-XSS vector when the source lives in
 * a CMS (`page-translations.body` / `page-translations.blocks[].markdown`
 * for the starter today). Any operator account compromise → arbitrary
 * script execution on every visitor of the affected page.
 *
 * The defence here is the smallest, dependency-free one that works in
 * workerd: a custom `Renderer` that drops raw HTML blocks (`<script>`,
 * `<svg>`, etc.) and raw inline HTML. Markdown features (links, code,
 * tables, lists) still render normally. Marked v14 already escapes
 * `javascript:` / `vbscript:` / `data:` schemes in link hrefs, so
 * link-injection vectors are covered without extra work.
 *
 * Tradeoff: legitimate inline HTML in markdown source (`<sub>`,
 * `<kbd>`, etc.) is also dropped. Adopters wanting raw HTML in CMS
 * content should override this renderer in their fork (and own the
 * sanitisation upstream — e.g. an admin-side allowlist or
 * `sanitize-html` integration).
 */

import { Marked, Renderer } from "marked";

const safeRenderer = new Renderer();
// Drop both block-level and inline raw HTML from markdown source.
// Returning empty string is fine; the surrounding markdown structure
// (paragraphs, lists, etc.) still renders.
safeRenderer.html = () => "";

const safeMarked = new Marked({ renderer: safeRenderer });

/**
 * Parse markdown to HTML with raw-HTML stripped. Synchronous; safe to
 * call inside render templates that don't await.
 */
export function renderMarkdownSafe(source: string): string {
  return safeMarked.parse(source, { async: false }) as string;
}
