/** @jsxImportSource hono/jsx */
import { raw } from "hono/html";
import { Layout, renderHtml } from "./layout.js";

/**
 * GET /checkout — checkout form.
 *
 * Customer enters email; submits to POST /api/checkout/start which
 * returns either `{ kind: "redirect", url }` or `{ kind: "form",
 * html }` per the wired PaymentProvider. The inline script handles
 * both — window.location for redirect, replace the page body for
 * form (the form auto-submits to the provider).
 *
 * Cart is read by id on page load (same /api/cart endpoint the cart
 * page uses) so we can show what the customer is about to buy.
 */

const CHECKOUT_JS = `
(function() {
  const esc = window.__escapeHtml;
  const cartId = window.__cartId;
  const summary = document.getElementById("summary");
  const form = document.getElementById("checkout-form");
  const submit = document.getElementById("submit-btn");
  const out = document.getElementById("submit-result");

  async function loadCart() {
    try {
      const res = await fetch("/api/cart/get?cartId=" + encodeURIComponent(cartId));
      if (!res.ok) {
        if (res.status === 404) {
          summary.innerHTML = '<div class="notice error">Cart is empty. ' +
            '<a href="/">Back to shop</a></div>';
          submit.disabled = true;
          return;
        }
        throw new Error("HTTP " + res.status);
      }
      const data = await res.json();
      if (!data.items || data.items.length === 0) {
        summary.innerHTML = '<div class="notice error">Cart is empty.</div>';
        submit.disabled = true;
        return;
      }
      let html = "<ul>";
      for (const item of data.items) {
        html += "<li>" + esc(item.title) + " × " + item.qty +
          " — " + (item.lineTotalMinor / 100).toFixed(2) + " " +
          esc(data.currency || "") + "</li>";
      }
      html += "</ul><p><strong>Total: " +
        (data.subtotalMinor / 100).toFixed(2) + " " +
        esc(data.currency || "") + "</strong></p>";
      summary.innerHTML = html;
    } catch (err) {
      summary.innerHTML = '<div class="notice error">Could not load cart: ' +
        esc(err.message) + '</div>';
      submit.disabled = true;
    }
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    submit.disabled = true;
    out.textContent = "";
    const email = document.getElementById("email").value;
    try {
      const res = await fetch("/api/checkout/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cartId, customerEmail: email }),
      });
      if (!res.ok) {
        out.innerHTML = '<div class="notice error">' +
          esc((await res.text()).slice(0, 300)) + '</div>';
        submit.disabled = false;
        return;
      }
      const data = await res.json();
      if (data.result && data.result.kind === "redirect") {
        window.location.href = data.result.url;
      } else if (data.result && data.result.kind === "form") {
        document.open();
        document.write(data.result.html);
        document.close();
      } else {
        out.innerHTML = '<div class="notice error">Unexpected provider ' +
          'response shape.</div>';
        submit.disabled = false;
      }
    } catch (err) {
      out.innerHTML = '<div class="notice error">' +
        esc(String(err)) + '</div>';
      submit.disabled = false;
    }
  });

  loadCart();
})();
`;

export function renderCheckout(): string {
  const tree = (
    <Layout title="Checkout">
      <h1>Checkout</h1>
      <div id="summary">Loading cart…</div>
      <form id="checkout-form" class="checkout">
        <label for="email">Email (for the order receipt)</label>
        <input id="email" name="email" type="email" required />
        <button id="submit-btn" class="primary" type="submit">
          Place Order →
        </button>
        <div id="submit-result"></div>
      </form>
      <script>{raw(CHECKOUT_JS)}</script>
    </Layout>
  );
  return renderHtml(tree);
}
