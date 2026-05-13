/**
 * checkoutStart — reserves inventory + creates a provider checkout
 * session.
 *
 * Flow:
 *   1. Read cart from KV.
 *   2. Look up current prices (snapshotted into the reservation
 *      record so post-callback INSERT can use them).
 *   3. CAPTCHA gate (Turnstile).
 *   4. InventoryActor.reserve() — atomic; rejects if any item is
 *      out of stock; sets 10-min auto-release alarm.
 *   5. PaymentProvider.startCheckout() — returns redirect URL or
 *      auto-submit form.
 *
 * Returns the provider's flow envelope (`{kind:"redirect", url}` or
 * `{kind:"form", html}`) plus our internal orderId so the frontend
 * can poll readOrderStatus while waiting for the async callback.
 */

import type { AnyHandler, CmsRuntime } from "@aotterclam/clam-cms-runtime";
import { getInventoryActor } from "../durableObjects/InventoryActor.js";
import { buildPaymentProvider, type PaymentEnv } from "../payment/index.js";
import { defineHandler } from "./_context.js";
import { stashOrderCart } from "./orderCart.js";
import { verifyTurnstile } from "./turnstile.js";

interface CartState {
  items: { productSlug: string; qty: number }[];
  updatedAt: number;
}

export interface CheckoutStartEnv extends PaymentEnv {
  readonly KV: KVNamespace;
  readonly INVENTORY_ACTOR: DurableObjectNamespace;
  readonly TURNSTILE_SECRET_KEY?: string;
}

export interface CheckoutStartInput {
  readonly cartId: string;
  readonly customerEmail: string;
  readonly turnstileToken?: string;
}

export interface CheckoutStartOutput {
  readonly orderId: string;
  readonly result:
    | { kind: "redirect"; url: string }
    | { kind: "form"; html: string };
}

export function buildCheckoutStart(env: CheckoutStartEnv): AnyHandler {
  return defineHandler<CheckoutStartInput, CheckoutStartOutput>(async (input, ctx) => {
    if (!input.cartId || !input.customerEmail) {
      throw new Error("checkoutStart: missing cartId / customerEmail");
    }

    // 1. CAPTCHA gate
    await verifyTurnstile(env.TURNSTILE_SECRET_KEY, input.turnstileToken);

    // 2. Read cart
    const cart = await env.KV.get<CartState>(`cart:${input.cartId}`, "json");
    if (!cart || cart.items.length === 0) {
      throw new Error("checkoutStart: cart empty or expired");
    }

    // 3. Look up prices + currency
    const enrichedItems = await enrichItems(ctx.runtime, cart.items);
    const currency = enrichedItems[0]?.currency;
    if (!currency) {
      throw new Error("checkoutStart: cart items have no currency");
    }
    // Sanity — all items must share currency. Multi-currency carts
    // are out of scope for v0.1 (single-currency-per-site contract).
    for (const item of enrichedItems) {
      if (item.currency !== currency) {
        throw new Error(
          `checkoutStart: mixed currency cart (${currency} vs ${item.currency})`,
        );
      }
    }

    // 4. Reserve inventory under a fresh orderId
    const orderId = generateOrderId();
    const inv = getInventoryActor(env);
    const reserveItems = enrichedItems.filter(
      (i) => i.inventoryMode === "tracked",
    );
    if (reserveItems.length > 0) {
      const result = await inv.reserve({
        orderId,
        items: reserveItems.map((i) => ({ productSlug: i.productSlug, qty: i.qty })),
      });
      if (!result.ok) {
        const detail = result.insufficient
          .map((i) => `${i.productSlug}(need ${i.requested}, have ${i.available})`)
          .join(", ");
        throw new Error(`checkoutStart: insufficient stock — ${detail}`);
      }
    }

    // 5. Stash the enriched cart so the callback consumer can write
    // order_items + customerEmail without re-running price lookup.
    const subtotalMinor = enrichedItems.reduce(
      (acc, i) => acc + i.priceMinor * i.qty,
      0,
    );
    await stashOrderCart(env.KV, {
      orderId,
      customerEmail: input.customerEmail,
      currency,
      items: enrichedItems.map((i) => ({
        productSlug: i.productSlug,
        qty: i.qty,
        priceMinor: i.priceMinor,
        title: i.title,
      })),
      subtotalMinor,
      createdAt: Date.now(),
    });

    // 6. Hand off to the payment provider
    const provider = buildPaymentProvider(env);
    const origin = env.PUBLIC_ORIGIN ?? "http://localhost:8788";
    const result = await provider.startCheckout({
      orderId,
      items: enrichedItems.map((i) => ({
        productSlug: i.productSlug,
        qty: i.qty,
        priceMinor: i.priceMinor,
        title: i.title,
      })),
      customerEmail: input.customerEmail,
      currency,
      returnUrl: `${origin}/api/payment/return?orderId=${encodeURIComponent(orderId)}`,
      notifyUrl: `${origin}/api/payment/callback`,
    });
    return { orderId, result } satisfies CheckoutStartOutput;
  });
}

async function enrichItems(
  runtime: CmsRuntime,
  cartItems: ReadonlyArray<{ productSlug: string; qty: number }>,
): Promise<
  Array<{
    productSlug: string;
    qty: number;
    priceMinor: number;
    currency: string;
    inventoryMode: "tracked" | "untracked";
    title: string;
  }>
> {
  const products = await runtime.listEntries.execute({
    collection: "products",
    status: "published",
    limit: 1000,
  });
  const translations = await runtime.listEntries.execute({
    collection: "product-translations",
    status: "published",
    limit: 5000,
  });
  return cartItems.map((item) => {
    const product = products.find(
      (p) => (p.data as { slug?: string }).slug === item.productSlug,
    );
    if (!product) {
      throw new Error(`checkoutStart: unknown product ${item.productSlug}`);
    }
    const d = product.data as {
      slug: string;
      priceMinor: number;
      currency: string;
      inventoryMode: "tracked" | "untracked";
    };
    // First matching translation; locale picking is the front-end's
    // concern; for the Stripe line-item label we just need a string.
    const tr = translations.find(
      (t) => (t.data as { slug?: string }).slug === item.productSlug,
    );
    const title =
      (tr?.data as { title?: string } | undefined)?.title ?? item.productSlug;
    return {
      productSlug: d.slug,
      qty: item.qty,
      priceMinor: d.priceMinor,
      currency: d.currency,
      inventoryMode: d.inventoryMode,
      title,
    };
  });
}

function generateOrderId(): string {
  // Short-ish, sortable-ish, collision-resistant. Not crypto-secure;
  // the security boundary is the payment-provider verification, not
  // orderId guessability.
  return `o_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

