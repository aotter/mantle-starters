// @mantle-override-class sdk-owned — see src/theme.default/README.md

/**
 * Client-side assets for GitHub-style markdown rendering (#245).
 *
 * The Worker emits structural markup only (`<pre><code class=
 * "language-X">`, `<div class="mermaid">`, `.code-tabs`); the actual
 * highlighting + diagram rendering + tab switching happens in the
 * browser via CDN-loaded libraries. Rationale (per the issue): keeps
 * the Worker bundle zero-cost (no Shiki / WASM / headless browser),
 * theme + lang upgrades are CDN-only, and it fails soft — body stays
 * readable if any lib fails to load.
 *
 * `MARKDOWN_HEAD_HTML` goes in `<head>` (stylesheets, render-blocking
 * for chrome only). `MARKDOWN_RUNTIME_HTML` is the deferred module
 * script block + the vanilla tab/copy runtime; emit it before
 * `</body>`.
 *
 * CSP note: a strict CSP must allow `cdn.jsdelivr.net` for
 * script-src + style-src, or self-host these (deferred follow-up).
 */

/** Custom CSS for the markup the github-markdown-css / hljs themes
 *  don't cover: the copy-button overlay and the code-group tabs.
 *  Kept tiny + token-light so it reads fine against either hljs
 *  theme. */
const MARKDOWN_CHROME_CSS = `
.md-code { position: relative; }
.md-code .md-copy {
  position: absolute; top: 6px; right: 6px;
  font: 12px/1 system-ui, sans-serif; padding: 4px 8px;
  border: 1px solid rgba(128,128,128,.4); border-radius: 6px;
  background: rgba(128,128,128,.12); color: inherit; cursor: pointer;
  opacity: 0; transition: opacity .12s;
}
.md-code:hover .md-copy, .md-code .md-copy:focus { opacity: 1; }
.code-tabs { border: 1px solid rgba(128,128,128,.3); border-radius: 8px; overflow: hidden; margin: 1rem 0; }
.code-tabs-nav { display: flex; gap: 2px; background: rgba(128,128,128,.08); padding: 4px 4px 0; }
.code-tabs-nav [role="tab"] {
  font: 13px/1 system-ui, sans-serif; padding: 8px 12px;
  border: none; background: transparent; color: inherit; cursor: pointer;
  border-bottom: 2px solid transparent;
}
.code-tabs-nav [role="tab"][aria-selected="true"] { border-bottom-color: currentColor; font-weight: 600; }
.code-tabs-panel .md-code { margin: 0; }
.code-tabs-panel pre { margin: 0; border-radius: 0; }
`.trim();

/** `<head>` stylesheets: GitHub markdown chrome + hljs themes
 *  (auto light/dark via prefers-color-scheme) + the custom
 *  copy/tab chrome. Pinned to majors so a CDN bump can't silently
 *  restyle the site. */
export const MARKDOWN_HEAD_HTML = [
  `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/github-markdown-css@5/github-markdown.css">`,
  `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11/styles/github.min.css" media="(prefers-color-scheme: light)">`,
  `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11/styles/github-dark.min.css" media="(prefers-color-scheme: dark)">`,
  `<style>${MARKDOWN_CHROME_CSS}</style>`,
].join("\n");

/** Vanilla runtime (no framework): tab switching with keyboard nav +
 *  aria sync, and copy-to-clipboard on every `.md-copy` button.
 *  Delegated at document level so re-rendered content (client nav)
 *  stays wired. */
const MARKDOWN_RUNTIME_JS = `
(function () {
  if (window.__mdRuntimeBound) return;
  window.__mdRuntimeBound = true;

  // ── Copy buttons ──
  document.addEventListener("click", function (ev) {
    var btn = ev.target.closest && ev.target.closest("[data-copy]");
    if (!btn) return;
    var wrap = btn.closest(".md-code");
    var code = wrap && wrap.querySelector("code");
    if (!code) return;
    var text = code.textContent || "";
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(function () {
      var prev = btn.textContent;
      btn.textContent = "Copied";
      setTimeout(function () { btn.textContent = prev; }, 1200);
    }).catch(function () {});
  });

  // ── Code-group tabs ──
  function selectTab(group, index) {
    var tabs = group.querySelectorAll('.code-tabs-nav [role="tab"]');
    var panels = group.querySelectorAll(".code-tabs-panel");
    tabs.forEach(function (t, i) {
      var on = i === index;
      t.setAttribute("aria-selected", String(on));
      if (on) t.removeAttribute("tabindex"); else t.setAttribute("tabindex", "-1");
    });
    panels.forEach(function (p, i) {
      if (i === index) p.removeAttribute("hidden"); else p.setAttribute("hidden", "");
    });
  }
  document.addEventListener("click", function (ev) {
    var tab = ev.target.closest && ev.target.closest('.code-tabs-nav [role="tab"]');
    if (!tab) return;
    var group = tab.closest(".code-tabs");
    if (!group) return;
    selectTab(group, parseInt(tab.getAttribute("data-i") || "0", 10));
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
    var tab = ev.target.closest && ev.target.closest('.code-tabs-nav [role="tab"]');
    if (!tab) return;
    var group = tab.closest(".code-tabs");
    var tabs = Array.prototype.slice.call(group.querySelectorAll('[role="tab"]'));
    var cur = tabs.indexOf(tab);
    var next = ev.key === "ArrowLeft" ? cur - 1 : cur + 1;
    if (next < 0) next = tabs.length - 1;
    if (next >= tabs.length) next = 0;
    ev.preventDefault();
    selectTab(group, next);
    tabs[next].focus();
  });
})();
`.trim();

/** Deferred asset block for before `</body>`: hljs auto-highlight,
 *  mermaid init (run() not the deprecated init()), and the tab/copy
 *  runtime. Each lib is independent — one failing doesn't break the
 *  others or the body text. */
export const MARKDOWN_RUNTIME_HTML = [
  `<script type="module">`,
  `  // jsdelivr's +esm gives a guaranteed-ESM full build (common langs`,
  `  // pre-registered) regardless of the package's own dual layout.`,
  `  import hljs from "https://cdn.jsdelivr.net/npm/highlight.js@11/+esm";`,
  `  document.querySelectorAll('pre code[class*="language-"]').forEach(function (el) {`,
  `    try { hljs.highlightElement(el); } catch (e) {}`,
  `  });`,
  `</script>`,
  `<script type="module">`,
  `  import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";`,
  `  mermaid.initialize({ startOnLoad: false, theme: "default" });`,
  `  try { await mermaid.run({ querySelector: ".mermaid" }); } catch (e) {}`,
  `</script>`,
  `<script>${MARKDOWN_RUNTIME_JS}</script>`,
].join("\n");
