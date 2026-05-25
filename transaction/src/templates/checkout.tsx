/** @jsxImportSource hono/jsx */
import { raw } from "hono/html";
import type { SiteConfig } from "@aotter/mantle/spec";
import type { ShippingAddress } from "../handlers/orderCart.js";
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
    const fd = new FormData(form);
    const email = String(fd.get("email") || "");
    // Read every address field and only attach a shippingAddress
    // to the POST body when ALL required fields are present —
    // empty / partial address gets dropped server-side anyway,
    // but the client-side check keeps the dev-tools network panel
    // honest about intent.
    const required = ["recipientName", "phone", "country", "postalCode", "city", "street"];
    const addr = {};
    let allPresent = true;
    for (const k of required) {
      const v = String(fd.get(k) || "").trim();
      if (!v) { allPresent = false; break; }
      addr[k] = v;
    }
    const district = String(fd.get("district") || "").trim();
    if (district) addr.district = district;
    const saveAddress = fd.get("saveAddress") === "on";
    const body = { cartId, customerEmail: email };
    if (allPresent) body.shippingAddress = addr;
    if (saveAddress) body.saveAddress = true;
    try {
      const res = await fetch("/api/checkout/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const msg = window.__parseErrorMessage(await res.text());
        out.innerHTML = '<div class="notice error">' +
          esc(String(msg).slice(0, 300)) + '</div>';
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

export interface CheckoutContext {
  readonly site: SiteConfig;
  /** Pre-fill the email field. Adopters pass the customer's email
   *  when a session is present so signed-in checkouts don't have
   *  to re-type. (#240) */
  readonly userEmail?: string;
  /** Pre-fill the shipping address. Adopters pass the customer's
   *  default address (via customer-profile feature's
   *  `getDefaultAddress`) so signed-in checkouts are one-tap. */
  readonly defaultAddress?: ShippingAddress;
  /** When true, render a "save this address" checkbox (pre-
   *  checked). Adopter sets this on first checkout — when
   *  `customer-profile` is installed AND the profile has no
   *  addresses yet. The POST handler reads `saveAddress` from the
   *  body and best-effort-calls `saveFirstAddressIfEmpty`. */
  readonly profileIsEmpty?: boolean;
}

export function renderCheckout(ctx: CheckoutContext): string {
  const a = ctx.defaultAddress;
  const showSaveBox = ctx.profileIsEmpty ?? false;
  const leadCopy = ctx.defaultAddress
    ? "Pre-filled from your saved default. Edits here won't change your saved address."
    : "We use this only for shipping + order updates.";
  const tree = (
    <Layout title="Checkout" site={ctx.site}>
      <h1>Checkout</h1>
      <div id="summary">Loading cart…</div>
      <form id="checkout-form" class="checkout">
        <p class="checkout__lead">{leadCopy}</p>
        <label for="email">Email (for the order receipt)</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          value={ctx.userEmail ?? ""}
        />
        <label for="recipientName">Recipient name</label>
        <input
          id="recipientName"
          name="recipientName"
          type="text"
          required
          value={a?.recipientName ?? ""}
        />
        <label for="phone">Phone</label>
        <input
          id="phone"
          name="phone"
          type="tel"
          required
          value={a?.phone ?? ""}
        />
        <label for="country">Country</label>
        <input
          id="country"
          name="country"
          type="text"
          required
          value={a?.country ?? "TW"}
        />
        <label for="postalCode">Postal code</label>
        <input
          id="postalCode"
          name="postalCode"
          type="text"
          required
          value={a?.postalCode ?? ""}
        />
        <label for="city">City</label>
        <input
          id="city"
          name="city"
          type="text"
          required
          value={a?.city ?? ""}
        />
        <label for="district">District (optional)</label>
        <input
          id="district"
          name="district"
          type="text"
          value={a?.district ?? ""}
        />
        <label for="street">Street</label>
        <input
          id="street"
          name="street"
          type="text"
          required
          value={a?.street ?? ""}
        />
        {showSaveBox && (
          <label class="checkout__save">
            <input type="checkbox" name="saveAddress" checked />{" "}
            Save this as my default address
          </label>
        )}
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
