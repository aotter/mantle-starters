/**
 * readCart — fetch a per-browser cart by cartId.
 *
 * KV holds the canonical cart shape (`cart:<cartId>` → { items,
 * updatedAt }). This handler enriches each line with the current
 * product price + title so the cart page can render totals without
 * a second roundtrip.
 *
 * Pricing semantics match addToCart: prices are last-priced-at-read,
 * never frozen on add. The freeze happens at commitOrder (via the
 * order_items snapshot from checkoutStart's enriched cart).
 */

import type { AnyHandler } from "@aotter/mantle/runtime";
import { defineHandler } from "./_context.js";
import { loadProductCatalog } from "./_productEnrichment.js";

interface CartState {
  items: { productSlug: string; qty: number }[];
  updatedAt: number;
}

export interface ReadCartEnv {
  readonly KV: KVNamespace;
}

export interface ReadCartInput {
  readonly cartId: string;
}

export interface ReadCartOutput {
  readonly cartId: string;
  readonly exists: boolean;
  readonly items: ReadonlyArray<{
    readonly productSlug: string;
    readonly qty: number;
    readonly priceMinor: number;
    readonly title: string;
    readonly lineTotalMinor: number;
  }>;
  readonly subtotalMinor: number;
  readonly currency?: string;
}

export function buildReadCart(env: ReadCartEnv): AnyHandler {
  return defineHandler<ReadCartInput, ReadCartOutput>(async (input, ctx) => {
    if (!input.cartId) {
      throw new Error("readCart: missing cartId");
    }
    const cart = await env.KV.get<CartState>(`cart:${input.cartId}`, "json");
    if (!cart || cart.items.length === 0) {
      return {
        cartId: input.cartId,
        exists: false,
        items: [],
        subtotalMinor: 0,
      } satisfies ReadCartOutput;
    }
    const catalog = await loadProductCatalog(ctx.runtime);
    const items: ReadCartOutput["items"][number][] = [];
    let subtotalMinor = 0;
    let currency: string | undefined;
    for (const cartItem of cart.items) {
      const product = catalog.bySlug.get(cartItem.productSlug);
      // Drop unknown products from the displayed cart — they were
      // unpublished after the user added them. addToCart will refuse
      // re-adds. KV record stays untouched so an admin can recover.
      if (!product) continue;
      const lineTotalMinor = product.priceMinor * cartItem.qty;
      subtotalMinor += lineTotalMinor;
      currency ??= product.currency;
      items.push({
        productSlug: product.slug,
        qty: cartItem.qty,
        priceMinor: product.priceMinor,
        title: product.title,
        lineTotalMinor,
      });
    }
    return {
      cartId: input.cartId,
      exists: true,
      items,
      subtotalMinor,
      currency,
    } satisfies ReadCartOutput;
  });
}
