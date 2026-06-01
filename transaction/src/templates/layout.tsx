/** @jsxImportSource hono/jsx */
import { raw } from "hono/html";
import type { SiteConfig } from "@aotter/mantle/spec";
import {
  GeneratedExperience,
  GENERATED_EXPERIENCE_CSS,
  GENERATED_EXPERIENCE_JS,
} from "./generatedExperience.js";

/**
 * Minimal HTML doc envelope for the customer-facing storefront.
 *
 * Deliberately plain — no theme tokens, no SEO machinery, no
 * sidebar/header chrome. Reference templates that adopters will
 * replace with their own brand. Inline CSS keeps the entire
 * shipping surface readable; no external CSS bundle to track.
 *
 * Cart state lives in localStorage on the client (key `cartId` =
 * uuid stored on first visit) and in KV server-side
 * (`cart:<cartId>`); the server's view of the cart is authoritative
 * after addToCart, but the template renders subtotal client-side
 * while the user shops to avoid round-trips.
 *
 * Header brand + footer copy come from `site_config` (seeded from
 * `siteDefaults.brand` / `siteDefaults.description` at boot). Route
 * handlers call `runtime.siteConfig.load()` and pass the result down.
 */

const INLINE_CSS = `
  :root {
    --fg: #1a1a1a;
    --bg: #fafaf7;
    --muted: #666;
    --accent: #2a4d3a;
    --border: #d6d3cb;
    --card: #fff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    line-height: 1.5;
    color: var(--fg);
    background: var(--bg);
  }
  * { box-sizing: border-box; }
  body { margin: 0; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  header.site {
    border-bottom: 1px solid var(--border);
    padding: 1rem 1.5rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--card);
  }
  header.site .brand { font-weight: 600; font-size: 1.05rem; }
  header.site nav a { margin-left: 1rem; color: var(--fg); }
  main { max-width: 960px; margin: 0 auto; padding: 2rem 1.5rem; }
  h1, h2, h3 { margin-top: 0; }
  .product-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 1.25rem;
  }
  .product-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 1rem;
  }
  .product-card picture,
  .product-card img {
    display: block;
    width: 100%;
  }
  .product-card picture { margin-bottom: 0.85rem; }
  .product-card img {
    aspect-ratio: 4 / 3;
    object-fit: cover;
    border-radius: 4px;
    border: 1px solid var(--border);
  }
  .product-card .price { color: var(--accent); font-weight: 600; margin-top: 0.5rem; }
  .product-hero {
    margin: 0 0 1.5rem 0;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }
  .product-hero picture,
  .product-hero img {
    display: block;
    width: 100%;
  }
  .product-hero img {
    max-height: 32rem;
    object-fit: cover;
  }
  .price-tag { font-size: 1.5rem; color: var(--accent); font-weight: 600; }
  form.checkout { background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 1.5rem; max-width: 480px; }
  form.checkout label { display: block; margin-top: 1rem; font-weight: 500; }
  form.checkout input, form.checkout textarea {
    width: 100%; padding: 0.5rem; margin-top: 0.25rem;
    border: 1px solid var(--border); border-radius: 4px;
    font-family: inherit; font-size: 1rem;
  }
  button.primary, .btn-primary {
    background: var(--accent); color: white; border: 0;
    padding: 0.65rem 1.25rem; border-radius: 4px;
    font-size: 1rem; font-weight: 500; cursor: pointer;
    margin-top: 1rem;
  }
  button.primary:hover, .btn-primary:hover { opacity: 0.92; }
  button.primary:disabled { opacity: 0.5; cursor: wait; }
  table.cart {
    width: 100%; border-collapse: collapse; margin-top: 1rem;
    background: var(--card); border: 1px solid var(--border); border-radius: 6px;
  }
  table.cart th, table.cart td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid var(--border); }
  table.cart tfoot td { font-weight: 600; }
  .muted { color: var(--muted); font-size: 0.9rem; }
  .notice {
    padding: 0.75rem 1rem; border-radius: 4px; margin: 1rem 0;
    background: #f3f0e8; border: 1px solid var(--border);
  }
  .notice.success { background: #e7f0e9; border-color: var(--accent); }
  .notice.error { background: #f7e8e8; border-color: #b84545; color: #8b2f2f; }
  .empty { text-align: center; padding: 3rem 1rem; color: var(--muted); }
  footer.site {
    text-align: center; padding: 2rem 1rem; color: var(--muted);
    font-size: 0.85rem; border-top: 1px solid var(--border); margin-top: 4rem;
  }
  ${GENERATED_EXPERIENCE_CSS}
`;

// Bootstraps three things every page needs in client JS:
//   1. window.__cartId — stable per-browser uuid (server holds cart
//      state in KV under `cart:<cartId>`; this is just the key).
//   2. window.__escapeHtml — shared HTML-escape for all inline scripts
//      so each template doesn't redefine it.
//   3. window.__parseErrorMessage — extract the `error` field from a
//      JSON envelope returned by `/api/*` handlers on 4xx. Without
//      this, page scripts render the raw response text and the user
//      sees `{"error":"..."}` braces in the notice strip. Falls back
//      to the raw text on parse failure so non-JSON 5xx bodies still
//      surface something readable.
const BOOTSTRAP_JS = `
  if (!localStorage.getItem("cartId")) {
    localStorage.setItem("cartId", "c_" + crypto.randomUUID());
  }
  window.__cartId = localStorage.getItem("cartId");
  window.__escapeHtml = function (s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#39;"
    }[c]));
  };
  window.__parseErrorMessage = function (rawText) {
    if (typeof rawText !== "string" || rawText.length === 0) return rawText;
    try {
      var body = JSON.parse(rawText);
      if (body && typeof body.error === "string") return body.error;
    } catch (_) { /* keep raw — non-JSON body, e.g. HTML 5xx */ }
    return rawText;
  };
  ${GENERATED_EXPERIENCE_JS}
`;

export interface LayoutContext {
  readonly title: string;
  readonly site: SiteConfig;
  readonly children: unknown;
}

export function Layout(props: LayoutContext) {
  const { site } = props;
  const pageTitle = `${props.title} — ${site.brand}`;
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{pageTitle}</title>
        <style>{raw(INLINE_CSS)}</style>
        {/*
          Bootstrap lives in <head> so window.__cartId + window.__escapeHtml
          are defined before any page-body inline script runs.
        */}
        <script>{raw(BOOTSTRAP_JS)}</script>
      </head>
      <body>
        <header class="site">
          <a href="/" class="brand">{site.brand}</a>
          <nav>
            <a href="/">Shop</a>
            <a href="/cart">Cart</a>
          </nav>
        </header>
        <main>{props.children}</main>
        <footer class="site">
          {site.brand}
          {site.description ? ` · ${site.description}` : ""}
        </footer>
        <GeneratedExperience />
      </body>
    </html>
  );
}

export function renderHtml(tree: unknown): string {
  return "<!doctype html>" + String(tree);
}
