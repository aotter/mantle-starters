/** @jsxImportSource hono/jsx */
import { raw } from "hono/html";
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
          escapeHtml(txt.slice(0, 200)) + '</div>';
        return;
      }
      out.innerHTML = '<div class="notice success">Added to cart. ' +
        '<a href="/cart">View cart →</a></div>';
    } catch (err) {
      out.innerHTML = '<div class="notice error">' +
        escapeHtml(String(err)) + '</div>';
    } finally {
      btn.disabled = false;
    }
  });
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#39;"
    }[c]));
  }
})();
`;

export interface ProductDetailContext {
  readonly brand?: string;
  readonly product: {
    readonly slug: string;
    readonly title: string;
    readonly priceMinor: number;
    readonly currency: string;
    readonly description?: string;
    readonly inventoryMode: "tracked" | "untracked";
    readonly available?: number;
  };
}

export function renderProductDetail(ctx: ProductDetailContext): string {
  const p = ctx.product;
  const outOfStock = p.inventoryMode === "tracked" && (p.available ?? 0) <= 0;
  const tree = (
    <Layout brand={ctx.brand} title={`${p.title} — ${ctx.brand ?? "Storefront"}`}>
      <p>
        <a href="/">← Back to shop</a>
      </p>
      <h1>{p.title}</h1>
      <p class="price-tag">{formatPrice(p.priceMinor, p.currency)}</p>
      {p.description ? <p>{p.description}</p> : null}
      {outOfStock ? (
        <div class="notice error">Out of stock</div>
      ) : (
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
      )}
      <script>{raw(ADD_TO_CART_JS)}</script>
    </Layout>
  );
  return renderHtml(tree);
}

function formatPrice(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}
