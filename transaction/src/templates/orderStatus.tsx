/** @jsxImportSource hono/jsx */
import { raw } from "hono/html";
import { Layout, renderHtml } from "./layout.js";

/**
 * GET /order/:orderId — order confirmation page.
 *
 * Customer lands here after the payment provider redirects them back
 * (the provider's success_url is set to /api/payment/return?orderId=…
 * which the checkout-return handler verifies; this page then polls
 * /api/order/status until the order row is committed).
 *
 * Polls every 1s for up to 60s. Once exists: true and orderStatus
 * is one of the terminal states, renders the receipt with line items.
 */

const ORDER_STATUS_JS = `
(function() {
  const orderId = window.__orderId;
  const container = document.getElementById("order-content");
  if (!orderId) {
    container.innerHTML = '<div class="notice error">No order id in URL.</div>';
    return;
  }

  const MAX_ATTEMPTS = 60;
  let attempts = 0;

  async function poll() {
    attempts++;
    try {
      const res = await fetch("/api/order/status?orderId=" + encodeURIComponent(orderId));
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (data.exists && data.orderStatus) {
        render(data);
        // Clear stale cart now that the order is placed.
        if (window.__cartId) {
          // Best-effort — don't block on this.
          fetch("/api/cart/get?cartId=" + encodeURIComponent(window.__cartId))
            .catch(() => {});
        }
        return;
      }
      if (attempts >= MAX_ATTEMPTS) {
        container.innerHTML =
          '<div class="notice error">Your order is taking longer than ' +
          'usual to confirm. We\\'ll email you when it\\'s done. ' +
          'Order id: <code>' + escapeHtml(orderId) + '</code></div>';
        return;
      }
      setTimeout(poll, 1000);
    } catch (err) {
      container.innerHTML = '<div class="notice error">Could not check ' +
        'order status: ' + escapeHtml(err.message) + '</div>';
    }
  }

  function render(data) {
    let html = '';
    if (data.orderStatus === "placed" || data.orderStatus === "fulfilling" ||
        data.orderStatus === "shipped" || data.orderStatus === "completed") {
      html += '<div class="notice success">Order received — thank you!</div>';
    } else if (data.orderStatus === "cancelled") {
      html += '<div class="notice error">Order cancelled.</div>';
    } else if (data.orderStatus === "refunded") {
      html += '<div class="notice">Order refunded.</div>';
    }
    html += '<p class="muted">Order id: <code>' + escapeHtml(orderId) + '</code></p>';
    if (data.customerEmail) {
      html += '<p>A receipt will be sent to <strong>' +
        escapeHtml(data.customerEmail) + '</strong>.</p>';
    }
    if (data.items && data.items.length > 0) {
      html += '<table class="cart"><thead><tr><th>Product</th><th>Qty</th>' +
        '<th>Line total</th></tr></thead><tbody>';
      for (const item of data.items) {
        const total = (item.priceMinorAtPurchase * item.qty / 100).toFixed(2);
        html += '<tr><td>' + escapeHtml(item.title || item.productSlug) +
          '</td><td>' + item.qty + '</td><td>' + total + ' ' +
          escapeHtml(data.currency || '') + '</td></tr>';
      }
      html += '</tbody><tfoot><tr><td colspan="2">Total</td><td>' +
        (data.totalMinor / 100).toFixed(2) + ' ' +
        escapeHtml(data.currency || '') + '</td></tr></tfoot></table>';
    }
    html += '<p><a href="/">← Continue shopping</a></p>';
    container.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  poll();
})();
`;

export interface OrderStatusContext {
  readonly brand?: string;
  readonly orderId: string;
}

export function renderOrderStatus(ctx: OrderStatusContext): string {
  const orderIdJson = JSON.stringify(ctx.orderId);
  const tree = (
    <Layout brand={ctx.brand} title={`Order — ${ctx.brand ?? "Storefront"}`}>
      <h1>Order Confirmation</h1>
      <div id="order-content">
        <p class="muted">Checking your order status…</p>
      </div>
      <script>{raw(`window.__orderId = ${orderIdJson};`)}</script>
      <script>{raw(ORDER_STATUS_JS)}</script>
    </Layout>
  );
  return renderHtml(tree);
}
