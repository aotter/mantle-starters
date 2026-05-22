/**
 * readCart — fetch a per-browser cart by cartId.
 *
 * KV holds the canonical cart shape (`cart:<cartId>` → { items,
 * updatedAt }, items keyed by skuCode). This handler enriches each
 * line with the current SKU price + parent SPU title so the cart
 * page can render totals without a second roundtrip.
 *
 * Pricing semantics match addToCart: prices are last-priced-at-read,
 * never frozen on add. The freeze happens at commitOrder (via the
 * order_items snapshot from checkoutStart's enriched cart).
 */

import type { AnyHandler } from "@aotter/mantle/runtime";
import { readCartState } from "./_cartState.js";
import { defineHandler } from "./_context.js";
import { loadProductCatalog, renderVariantLabel } from "./_productEnrichment.js";

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
    readonly skuCode: string;
    readonly productSlug: string;
    readonly qty: number;
    readonly priceMinor: number;
    readonly title: string;
    /** Rendered axis selection (e.g. "Red / M") when the parent SPU
     *  has `optionAxes` declared. Omitted for single-default SKUs so
     *  the cart row stays clean. */
    readonly variantLabel?: string;
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
    const cart = await readCartState(env.KV, input.cartId);
    if (cart.items.length === 0) {
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
      const hit = catalog.skuByCode.get(cartItem.skuCode);
      // Drop unknown SKUs from the displayed cart — they were
      // unpublished after the user added them. addToCart will refuse
      // re-adds. KV record stays untouched so an admin can recover.
      if (!hit) continue;
      const { sku, product } = hit;
      const lineTotalMinor = sku.priceMinor * cartItem.qty;
      subtotalMinor += lineTotalMinor;
      currency ??= sku.currency;
      items.push({
        skuCode: sku.skuCode,
        productSlug: product.slug,
        qty: cartItem.qty,
        priceMinor: sku.priceMinor,
        title: product.title,
        variantLabel: renderVariantLabel(sku, product.optionAxes),
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
