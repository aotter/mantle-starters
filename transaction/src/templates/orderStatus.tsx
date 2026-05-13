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
  const esc = window.__escapeHtml;
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
        return;
      }
      if (attempts >= MAX_ATTEMPTS) {
        container.innerHTML =
          '<div class="notice error">Your order is taking longer than ' +
          'usual to confirm. We\\'ll email you when it\\'s done. ' +
          'Order id: <code>' + esc(orderId) + '</code></div>';
        return;
      }
      setTimeout(poll, 1000);
    } catch (err) {
      container.innerHTML = '<div class="notice error">Could not check ' +
        'order status: ' + esc(err.message) + '</div>';
    }
  }

  function statusBanner(orderStatus) {
    switch (orderStatus) {
      case "placed":
      case "fulfilling":
      case "shipped":
      case "completed":
        return '<div class="notice success">Order received — thank you!</div>';
      case "cancelled":
        return '<div class="notice error">Order cancelled.</div>';
      case "refunded":
        return '<div class="notice">Order refunded.</div>';
      default:
        return '';
    }
  }

  function render(data) {
    // Order is placed — drop the per-browser cart id so the customer
    // starts a fresh cart on their next visit. The server-side cart
    // KV entry was already TTL-bounded; we don't need a clear API.
    if (data.orderStatus === "placed" || data.orderStatus === "fulfilling" ||
        data.orderStatus === "shipped" || data.orderStatus === "completed") {
      try { localStorage.removeItem("cartId"); } catch (_) {}
    }
    let html = statusBanner(data.orderStatus);
    html += '<p class="muted">Order id: <code>' + esc(orderId) + '</code></p>';
    if (data.customerEmail) {
      html += '<p>A receipt will be sent to <strong>' +
        esc(data.customerEmail) + '</strong>.</p>';
    }
    if (data.items && data.items.length > 0) {
      html += '<table class="cart"><thead><tr><th>Product</th><th>Qty</th>' +
        '<th>Line total</th></tr></thead><tbody>';
      for (const item of data.items) {
        const total = (item.priceMinorAtPurchase * item.qty / 100).toFixed(2);
        html += '<tr><td>' + esc(item.title || item.productSlug) +
          '</td><td>' + item.qty + '</td><td>' + total + ' ' +
          esc(data.currency || '') + '</td></tr>';
      }
      html += '</tbody><tfoot><tr><td colspan="2">Total</td><td>' +
        (data.totalMinor / 100).toFixed(2) + ' ' +
        esc(data.currency || '') + '</td></tr></tfoot></table>';
    }
    html += '<p><a href="/">← Continue shopping</a></p>';
    container.innerHTML = html;
  }

  poll();
})();
`;

export interface OrderStatusContext {
  readonly orderId: string;
}

export function renderOrderStatus(ctx: OrderStatusContext): string {
  const orderIdJson = JSON.stringify(ctx.orderId);
  const tree = (
    <Layout title="Order">
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
