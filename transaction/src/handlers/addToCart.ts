/**
 * addToCart — adds a SKU to a session's cart in KV.
 *
 * Cart shape (KV at `cart:<cartId>`):
 *   {
 *     items: [{ skuCode, qty }],
 *     updatedAt: <ms>
 *   }
 *
 * Coalesces by skuCode. Pricing is NOT stored in the cart — subtotal
 * is computed at read time from the current `product-skus` entries,
 * so mid-cart price changes are handled by re-pricing at checkout
 * (last-price-at-checkout, never frozen on add).
 */

import type { AnyHandler } from "@aotter/mantle/runtime";
import { defineHandler } from "./_context.js";
import {
  CART_TTL_SECONDS,
  readCartState,
  type CartState,
} from "./_cartState.js";
import { loadPublishedSkuIndex } from "./_productEnrichment.js";
import {
  checkSingleSkuStock,
  STOCK_ERROR_MESSAGE,
} from "./_stockCheck.js";

export const MAX_QTY_PER_LINE = 99;

export interface AddToCartEnv {
  readonly KV: KVNamespace;
  readonly INVENTORY_ACTOR: DurableObjectNamespace;
}

export interface AddToCartInput {
  readonly cartId: string;
  readonly skuCode: string;
  readonly qty: number;
}

export interface AddToCartOutput {
  readonly cartId: string;
  readonly items: ReadonlyArray<{
    skuCode: string;
    qty: number;
    priceMinor: number;
  }>;
  readonly subtotalMinor: number;
  readonly currency: string;
}

export function buildAddToCart(env: AddToCartEnv): AnyHandler {
  return defineHandler<AddToCartInput, AddToCartOutput>(async (input, ctx) => {
    if (!input.cartId || !input.skuCode || !input.qty) {
      throw new Error("addToCart: missing cartId / skuCode / qty");
    }
    if (input.qty < 1 || input.qty > MAX_QTY_PER_LINE) {
      throw new Error(`addToCart: qty must be 1..${MAX_QTY_PER_LINE}`);
    }
    const skuIndex = await loadPublishedSkuIndex(ctx.runtime);
    const sku = skuIndex.get(input.skuCode);
    if (!sku) {
      throw new Error(`addToCart: unknown skuCode '${input.skuCode}'`);
    }
    const existing = await readCartState(env.KV, input.cartId);
    // Throw rather than silently clamp — a silent clamp lets the API
    // say "ok" while adding fewer items than the customer requested.
    const existingQty =
      existing.items.find((i) => i.skuCode === input.skuCode)?.qty ?? 0;
    const targetQty = existingQty + input.qty;
    if (targetQty > MAX_QTY_PER_LINE) {
      throw new Error(
        `Max ${MAX_QTY_PER_LINE} per line (currently ${existingQty}, adding ${input.qty}).`,
      );
    }
    const shortfall = await checkSingleSkuStock(env, sku, targetQty);
    if (shortfall) throw new Error(STOCK_ERROR_MESSAGE);

    const merged = coalesce(existing.items, input.skuCode, input.qty);
    const next: CartState = { items: merged, updatedAt: Date.now() };
    await env.KV.put(`cart:${input.cartId}`, JSON.stringify(next), {
      expirationTtl: CART_TTL_SECONDS,
    });

    const enriched = next.items.map((item) => ({
      skuCode: item.skuCode,
      qty: item.qty,
      priceMinor: skuIndex.get(item.skuCode)?.priceMinor ?? 0,
    }));
    const subtotalMinor = enriched.reduce(
      (sum, i) => sum + i.priceMinor * i.qty,
      0,
    );
    return {
      cartId: input.cartId,
      items: enriched,
      subtotalMinor,
      currency: sku.currency,
    } satisfies AddToCartOutput;
  });
}

function coalesce(
  items: ReadonlyArray<{ skuCode: string; qty: number }>,
  skuCode: string,
  add: number,
): { skuCode: string; qty: number }[] {
  const out = items.map((i) => ({ ...i }));
  const existing = out.find((i) => i.skuCode === skuCode);
  if (existing) {
    existing.qty = Math.min(MAX_QTY_PER_LINE, existing.qty + add);
    return out;
  }
  out.push({ skuCode, qty: add });
  return out;
}
