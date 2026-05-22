/**
 * addToCart — adds a product to a session's cart in KV.
 *
 * Cart shape (KV at `cart:<cartId>`):
 *   {
 *     items: [{ productSlug, qty }],
 *     updatedAt: <ms>
 *   }
 *
 * Coalesces by productSlug — adding qty=2 of an existing slug
 * increments its qty to 2+existing, not creating a separate line.
 *
 * Pricing is NOT stored in the cart. Subtotal is computed at read
 * time from the current `products` Schema entries — easier to handle
 * mid-cart price changes (last-price-at-checkout, never frozen on
 * add).
 */

import type { AnyHandler } from "@aotter/mantle/runtime";
import { defineHandler } from "./_context.js";
import { loadProductCatalog } from "./_productEnrichment.js";
import {
  checkSingleItemStock,
  STOCK_ERROR_MESSAGE,
  type StockCheckEnv,
} from "./_stockCheck.js";

interface CartState {
  items: { productSlug: string; qty: number }[];
  updatedAt: number;
}

const CART_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const MAX_QTY_PER_LINE = 99;

export interface AddToCartEnv extends StockCheckEnv {
  readonly KV: KVNamespace;
}

export interface AddToCartInput {
  readonly cartId: string;
  readonly productSlug: string;
  readonly qty: number;
}

export interface AddToCartOutput {
  readonly cartId: string;
  readonly items: ReadonlyArray<{
    productSlug: string;
    qty: number;
    priceMinor: number;
    title?: string;
  }>;
  readonly subtotalMinor: number;
  readonly currency: string;
}

export function buildAddToCart(env: AddToCartEnv): AnyHandler {
  return defineHandler<AddToCartInput, AddToCartOutput>(async (input, ctx) => {
    if (!input.cartId || !input.productSlug || !input.qty) {
      throw new Error("addToCart: missing cartId / productSlug / qty");
    }
    if (input.qty < 1 || input.qty > MAX_QTY_PER_LINE) {
      throw new Error(`addToCart: qty must be 1..${MAX_QTY_PER_LINE}`);
    }
    // One catalog load per request — used by (a) the incoming-product
    // lookup, (b) the stock-gate check, and (c) the enrichment fan-out
    // for the cart display payload. Previously each call site issued
    // its own `runtime.listEntries`, producing N+1 round trips on
    // multi-line carts (e.g. a 5-line cart with one add-to-cart click
    // fired 6 listEntries scans of the entire products collection).
    const catalog = await loadProductCatalog(ctx.runtime);
    const product = catalog.bySlug.get(input.productSlug);
    if (!product) {
      throw new Error(`addToCart: unknown productSlug '${input.productSlug}'`);
    }
    const key = `cart:${input.cartId}`;
    const existing = (await env.KV.get<CartState>(key, "json")) ?? {
      items: [],
      updatedAt: 0,
    };
    // Gate against the InventoryActor BEFORE the KV write — the
    // resulting qty (existing line qty + incoming delta) has to fit
    // within current `available`. Repeated add-calls on the same
    // line therefore can't drift past availability.
    const existingQty =
      existing.items.find((i) => i.productSlug === input.productSlug)?.qty ??
      0;
    const shortfall = await checkSingleItemStock(
      env,
      product,
      existingQty + input.qty,
    );
    if (shortfall) {
      throw new Error(STOCK_ERROR_MESSAGE);
    }
    const merged = coalesce(existing.items, input.productSlug, input.qty);
    const next: CartState = { items: merged, updatedAt: Date.now() };
    await env.KV.put(key, JSON.stringify(next), {
      expirationTtl: CART_TTL_SECONDS,
    });

    const enriched = next.items.map((item) => ({
      productSlug: item.productSlug,
      qty: item.qty,
      priceMinor: catalog.bySlug.get(item.productSlug)?.priceMinor ?? 0,
    }));
    const subtotalMinor = enriched.reduce(
      (sum, i) => sum + i.priceMinor * i.qty,
      0,
    );
    return {
      cartId: input.cartId,
      items: enriched,
      subtotalMinor,
      currency: product.currency,
    } satisfies AddToCartOutput;
  });
}

function coalesce(
  items: ReadonlyArray<{ productSlug: string; qty: number }>,
  slug: string,
  add: number,
): { productSlug: string; qty: number }[] {
  const out = items.map((i) => ({ ...i }));
  const existing = out.find((i) => i.productSlug === slug);
  if (existing) {
    existing.qty = Math.min(MAX_QTY_PER_LINE, existing.qty + add);
    return out;
  }
  out.push({ productSlug: slug, qty: add });
  return out;
}


