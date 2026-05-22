import { Marked, Renderer } from "marked";

/**
 * Safe markdown renderer for operator-authored content (page bodies,
 * home blocks — anything that comes out of the CMS).
 *
 * `marked` v9+ no longer ships the `sanitize` option; raw HTML in
 * markdown source (`<script>`, `<svg onload=...>`, etc.) otherwise
 * flows straight through and lands in `raw()`'d JSX output. Any
 * operator account compromise → arbitrary script execution on every
 * visitor of the affected page.
 *
 * The defence here is the smallest dependency-free one that works in
 * workerd: a custom `Renderer` whose `html()` returns `""`, dropping
 * both block-level and inline raw HTML from markdown source. Markdown
 * features (links, code, tables, lists) render normally; marked v14
 * already escapes `javascript:` / `data:` schemes in link hrefs.
 *
 * Tradeoff: legitimate inline HTML in markdown (`<sub>`, `<kbd>`,
 * etc.) is also dropped. Adopters wanting raw HTML in CMS content
 * override this renderer in their fork and own the sanitisation
 * upstream (`sanitize-html`, admin-side allowlist, etc.).
 */
const safeRenderer = new Renderer();
safeRenderer.html = () => "";
const safeMarked = new Marked({
  renderer: safeRenderer,
  gfm: true,
  breaks: false,
});

export function renderMarkdown(body: string | undefined): string {
  if (!body) return "";
  return safeMarked.parse(body, { async: false }) as string;
}
