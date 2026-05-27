// @mantle-override-class sdk-owned — see src/theme.default/README.md
import { Marked, Renderer, type Tokens, type TokenizerAndRendererExtension } from "marked";

/**
 * Safe markdown renderer for operator-authored content
 * (post-translations.body, page bodies, home blocks — anything that
 * comes out of the CMS).
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
 * GitHub-style code rendering (#245) is layered on top WITHOUT
 * reopening the raw-HTML hole: the custom `code()` renderer escapes
 * every fenced-block body before emitting it, so highlight.js /
 * mermaid only ever see escaped text. Syntax highlighting + mermaid
 * diagram rendering + code-group tab switching all run client-side
 * (see `markdownAssets.ts`) — the Worker only emits the structural
 * markup + `language-*` classes hljs hooks onto.
 *
 * Tradeoff: legitimate inline HTML in markdown (`<sub>`, `<kbd>`,
 * etc.) is also dropped. Adopters wanting raw HTML in CMS content
 * override this renderer in their fork and own the sanitisation
 * upstream (`sanitize-html`, admin-side allowlist, etc.).
 */

/** HTML-escape for text that lands inside `<code>` / `<div class="mermaid">`.
 *  Mirrors marked's own escaping so a fenced block containing
 *  `</script>` or `<img onerror>` can't break out. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Split a fence info-string into language + optional `[label]`.
 *  ` ```bash [npm] ` → { lang: "bash", label: "npm" }.
 *  ` ```ts ` → { lang: "ts", label: undefined }. */
function parseFenceInfo(info: string | undefined): { lang: string; label?: string } {
  const raw = (info ?? "").trim();
  const m = /^(\S+)\s*\[(.+)\]\s*$/.exec(raw);
  if (m) return { lang: m[1]!, label: m[2]! };
  return { lang: raw.split(/\s+/)[0] ?? "" };
}

/** Render one fenced code block as GitHub-style markup. Mermaid
 *  blocks become a `<div class="mermaid">` the client lib picks up;
 *  everything else gets `<pre><code class="language-X">` + a copy
 *  button. Both escape their body. */
function renderCodeBlock(text: string, lang: string): string {
  if (lang === "mermaid") {
    return `<div class="mermaid">${escapeHtml(text)}</div>`;
  }
  const cls = lang ? ` class="language-${escapeHtml(lang)}"` : "";
  // Copy button sits OUTSIDE <pre> so it can be CSS-positioned in the
  // top-right without scrolling away under horizontal code overflow.
  return (
    `<div class="md-code">` +
    `<pre><code${cls}>${escapeHtml(text)}</code></pre>` +
    `<button type="button" class="md-copy" data-copy aria-label="Copy code">Copy</button>` +
    `</div>`
  );
}

const safeRenderer = new Renderer();
safeRenderer.html = () => "";
safeRenderer.code = ({ text, lang }: Tokens.Code): string => {
  const { lang: actualLang } = parseFenceInfo(lang);
  return renderCodeBlock(text, actualLang);
};

/**
 * `::: code-group` block extension (VitePress syntax). Wraps a run of
 * fenced blocks (each with a `[label]` in its info-string) into a
 * tablist + panels. Client JS (`markdownAssets.ts`) wires the tab
 * switching; with JS off the panels stay in the DOM and remain
 * readable (only the first is visible, rest are `hidden` — adopters
 * who want no-JS-all-visible can drop the `hidden` attr in CSS).
 */
const codeGroupExtension: TokenizerAndRendererExtension = {
  name: "codeGroup",
  level: "block",
  start(src: string) {
    const i = src.indexOf("::: code-group");
    return i < 0 ? undefined : i;
  },
  tokenizer(src: string) {
    // Match `::: code-group\n ... \n:::` (closing fence on its own line).
    const rule = /^::: code-group[ \t]*\n([\s\S]*?)\n:::[ \t]*(?:\n|$)/;
    const match = rule.exec(src);
    if (!match) return undefined;
    const inner = match[1]!;
    // Pull each fenced block out of the inner body in order. We parse
    // by hand rather than via the lexer so the `[label]` info-string
    // survives (the block lexer would route it through `code` and we'd
    // lose the per-block label association).
    const blocks: Array<{ lang: string; label: string; text: string }> = [];
    // Line-anchored fences: opening ``` at line start, closing ``` on
    // its own line. Tolerates inline backticks inside a panel body
    // (prose with `inline code`). Limitation: a panel whose body has a
    // LINE-START ``` (markdown-about-markdown / nested fenced code)
    // terminates early — rare for install-snippet tabs (the primary
    // use case); documented if it ever bites.
    const fence = /^```([^\n]*)\n([\s\S]*?)\n```[ \t]*$/gm;
    let fm: RegExpExecArray | null;
    let idx = 0;
    while ((fm = fence.exec(inner)) !== null) {
      const { lang, label } = parseFenceInfo(fm[1]);
      // `||` not `??`: an unlabeled, untyped fence has label=undefined
      // AND lang="" (empty string — `??` would NOT fall through), so
      // we fall back to a positional "Tab N" label.
      blocks.push({
        lang,
        label: label || lang || `Tab ${idx + 1}`,
        text: fm[2]!,
      });
      idx++;
    }
    return {
      type: "codeGroup",
      raw: match[0],
      blocks,
      tokens: [],
    } as unknown as Tokens.Generic;
  },
  renderer(token) {
    const blocks =
      (token as unknown as { blocks: Array<{ lang: string; label: string; text: string }> }).blocks ?? [];
    if (blocks.length === 0) return "";
    const nav = blocks
      .map(
        (b, i) =>
          `<button type="button" role="tab" data-i="${i}"` +
          (i === 0 ? ` aria-selected="true"` : ` aria-selected="false" tabindex="-1"`) +
          `>${escapeHtml(b.label)}</button>`,
      )
      .join("");
    const panels = blocks
      .map(
        (b, i) =>
          `<div class="code-tabs-panel" data-i="${i}" role="tabpanel"${i === 0 ? "" : " hidden"}>` +
          renderCodeBlock(b.text, b.lang) +
          `</div>`,
      )
      .join("");
    return (
      `<div class="code-tabs">` +
      `<div class="code-tabs-nav" role="tablist">${nav}</div>` +
      panels +
      `</div>`
    );
  },
};

const safeMarked = new Marked({
  renderer: safeRenderer,
  gfm: true,
  breaks: false,
});
safeMarked.use({ extensions: [codeGroupExtension] });

export function renderMarkdown(body: string | undefined): string {
  if (!body) return "";
  return safeMarked.parse(body, { async: false }) as string;
}

export function isoDate(dt: number | string | null | undefined): string {
  if (dt == null) return "";
  return new Date(dt).toISOString().slice(0, 10);
}

export function excerpt(body: string | undefined, max = 160): string {
  if (!body) return "";
  const first = body.split(/\n+/).find((l) => l.trim().length > 0) ?? "";
  return first.length > max ? first.slice(0, max - 3) + "…" : first;
}
