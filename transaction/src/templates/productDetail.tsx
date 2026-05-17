/** @jsxImportSource hono/jsx */
import { raw } from "hono/html";
import type { SiteConfig } from "@aotterclam/mantle/spec";
import { Layout, renderHtml } from "./layout.js";

/**
 * GET /product/:slug — single product page with Add-to-Cart.
 * The "Add to Cart" button calls POST /api/cart/add via fetch with
 * the per-browser cartId from localStorage; on success it shows an
 * inline confirmation and links to /cart.
 */

const ADD_TO_CART_JS = `
(function() {
  const btn = document.getElementById("add-to-cart");
  const out = document.getElementById("add-result");
  if (!btn || !out) return;
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    out.textContent = "";
    try {
      const res = await fetch("/api/cart/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cartId: window.__cartId,
          productSlug: btn.dataset.slug,
          qty: parseInt(document.getElementById("qty").value, 10) || 1,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        out.innerHTML = '<div class="notice error">' +
          window.__escapeHtml(txt.slice(0, 200)) + '</div>';
        return;
      }
      out.innerHTML = '<div class="notice success">Added to cart. ' +
        '<a href="/cart">View cart →</a></div>';
    } catch (err) {
      out.innerHTML = '<div class="notice error">' +
        window.__escapeHtml(String(err)) + '</div>';
    } finally {
      btn.disabled = false;
    }
  });
})();
`;

export interface ProductDetailContext {
  readonly product: {
    readonly slug: string;
    readonly title: string;
    readonly priceMinor: number;
    readonly currency: string;
    /** Short blurb under the title. From `product-translations.shortDescription`. */
    readonly shortDescription?: string;
    /** Full body markdown. From `product-translations.body`. */
    readonly body?: string;
    readonly inventoryMode: "tracked" | "untracked";
  };
  readonly site: SiteConfig;
}

/**
 * The Add-to-Cart button is unconditionally rendered. Stock
 * authority lives server-side: `/api/cart/add` (and ultimately
 * `/api/checkout/start` → `InventoryActor.reserve`) is the gate. If
 * the customer clicks Add for a tracked product with no available
 * stock, the cart-add response surfaces the error inline. We do NOT
 * surface a server-rendered "Out of stock" state because the product
 * page is cacheable / shared between visitors; stock state can flip
 * between render time and click time.
 */
export function renderProductDetail(ctx: ProductDetailContext): string {
  const p = ctx.product;
  const tree = (
    <Layout title={p.title} site={ctx.site}>
      <p>
        <a href="/">← Back to shop</a>
      </p>
      <h1>{p.title}</h1>
      {p.shortDescription ? <p class="lead">{p.shortDescription}</p> : null}
      <p class="price-tag">{formatPrice(p.priceMinor, p.currency)}</p>
      {p.body ? <p>{p.body}</p> : null}
      <div>
        <label for="qty">Quantity</label>
        <input id="qty" type="number" min="1" max="10" value="1" style="width: 5rem" />
        <br />
        <button
          id="add-to-cart"
          class="primary"
          data-slug={p.slug}
          type="button"
        >
          Add to Cart
        </button>
        <div id="add-result"></div>
      </div>
      <script>{raw(ADD_TO_CART_JS)}</script>
    </Layout>
  );
  return renderHtml(tree);
}

function formatPrice(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}
