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

import type { AnyHandler, CmsRuntime } from "@aotter/mantle-runtime";
import { defineHandler } from "./_context.js";

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
    const enriched = await enrichItems(ctx.runtime, cart.items);
    const subtotalMinor = enriched.reduce(
      (acc, i) => acc + i.priceMinor * i.qty,
      0,
    );
    const currency = enriched[0]?.currency;
    return {
      cartId: input.cartId,
      exists: true,
      items: enriched.map((i) => ({
        productSlug: i.productSlug,
        qty: i.qty,
        priceMinor: i.priceMinor,
        title: i.title,
        lineTotalMinor: i.priceMinor * i.qty,
      })),
      subtotalMinor,
      currency,
    } satisfies ReadCartOutput;
  });
}

async function enrichItems(
  runtime: CmsRuntime,
  items: ReadonlyArray<{ productSlug: string; qty: number }>,
): Promise<
  Array<{
    productSlug: string;
    qty: number;
    priceMinor: number;
    currency: string;
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
  const out: Array<{
    productSlug: string;
    qty: number;
    priceMinor: number;
    currency: string;
    title: string;
  }> = [];
  for (const item of items) {
    const product = products.find(
      (p) => (p.data as { slug?: string }).slug === item.productSlug,
    );
    if (!product) {
      // Drop unknown products from the displayed cart — they were
      // unpublished after the user added them. addToCart will refuse
      // re-adds. Keeping them in the KV record (untouched here) so
      // an admin can recover state if needed.
      continue;
    }
    const d = product.data as { slug: string; priceMinor: number; currency: string };
    const tr = translations.find(
      (t) => (t.data as { slug?: string }).slug === item.productSlug,
    );
    const title =
      (tr?.data as { title?: string } | undefined)?.title ?? item.productSlug;
    out.push({
      productSlug: d.slug,
      qty: item.qty,
      priceMinor: d.priceMinor,
      currency: d.currency,
      title,
    });
  }
  return out;
}
