/** @jsxImportSource hono/jsx */
import { raw } from "hono/html";
import { Layout, renderHtml } from "./layout.js";

/**
 * GET /cart — cart contents.
 *
 * Server doesn't know the per-browser cartId yet (it's in
 * localStorage), so the page renders an empty shell and the inline
 * script hydrates it by calling `/api/cart/get?cartId=<id>` — a
 * lookup that the runtime exposes via the manifest's
 * `cart-snapshot` View if/when wired. For v0.1 we leave the cart
 * fetch as an explicit roundtrip the customer sees as a brief
 * "loading" state.
 *
 * The "Proceed to checkout" link carries cartId in the query string
 * so the checkout page can prefill state without another lookup.
 */

const CART_BOOTSTRAP_JS = `
(function() {
  const tbody = document.getElementById("cart-rows");
  const totalCell = document.getElementById("cart-total");
  const emptyMsg = document.getElementById("cart-empty");
  const summary = document.getElementById("cart-summary");
  const cartId = window.__cartId;

  async function render() {
    try {
      const res = await fetch("/api/cart/get?cartId=" + encodeURIComponent(cartId));
      if (!res.ok) {
        if (res.status === 404) { showEmpty(); return; }
        throw new Error("HTTP " + res.status);
      }
      const data = await res.json();
      if (!data.items || data.items.length === 0) { showEmpty(); return; }
      summary.style.display = "block";
      emptyMsg.style.display = "none";
      tbody.innerHTML = "";
      for (const item of data.items) {
        const tr = document.createElement("tr");
        tr.innerHTML =
          "<td>" + escapeHtml(item.productSlug) + "</td>" +
          "<td>" + item.qty + "</td>";
        tbody.appendChild(tr);
      }
      const total = (data.subtotalMinor / 100).toFixed(2) + " " + (data.currency || "");
      totalCell.textContent = total;
      document.getElementById("checkout-link").href =
        "/checkout?cartId=" + encodeURIComponent(cartId);
    } catch (err) {
      emptyMsg.textContent = "Could not load cart: " + err.message;
      emptyMsg.style.display = "block";
    }
  }
  function showEmpty() {
    summary.style.display = "none";
    emptyMsg.style.display = "block";
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#39;"
    }[c]));
  }
  render();
})();
`;

export interface CartContext {
  readonly brand?: string;
}

export function renderCart(ctx: CartContext): string {
  const tree = (
    <Layout brand={ctx.brand} title={`Cart — ${ctx.brand ?? "Storefront"}`}>
      <h1>Your Cart</h1>
      <div id="summary-loading">Loading…</div>
      <div id="cart-empty" class="empty" style="display: none">
        Your cart is empty. <a href="/">Browse the shop →</a>
      </div>
      <div id="cart-summary" style="display: none">
        <table class="cart">
          <thead>
            <tr>
              <th>Product</th>
              <th>Qty</th>
            </tr>
          </thead>
          <tbody id="cart-rows"></tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td id="cart-total"></td>
            </tr>
          </tfoot>
        </table>
        <a id="checkout-link" class="btn-primary" href="/checkout">
          Proceed to checkout →
        </a>
      </div>
      <script>{raw(CART_BOOTSTRAP_JS)}</script>
    </Layout>
  );
  return renderHtml(tree);
}
