/**
 * Stock-availability gate for `tracked` products. Used by `addToCart`
 * and `checkoutStart` so the same diagnostic surfaces wherever stock
 * can fall short. Adopters wiring a `/api/cart/set-qty` route should
 * also call this before the KV write — same signature.
 *
 * Returns a structured failure on insufficient stock so the same
 * shape can serve the checkout-time bulk-reserve path where multiple
 * lines may fail at once. The customer-facing message (`STOCK_ERROR_MESSAGE`)
 * is intentionally vague — exact counts can leak inventory state to
 * a hostile client; the structured `InsufficientItem[]` stays
 * server-side for logs / metrics.
 *
 * For localization, override `STOCK_ERROR_MESSAGE` (or the wider
 * envelope) per locale. The starter ships English; adopters writing
 * for zh-TW, ja, etc. swap the constant in their fork.
 */

import { getInventoryActor } from "../durableObjects/InventoryActor.js";

export interface StockCheckEnv {
  readonly INVENTORY_ACTOR: DurableObjectNamespace;
}

interface ProductInventoryDescriptor {
  readonly slug: string;
  readonly inventoryMode: "tracked" | "untracked";
}

export interface InsufficientItem {
  readonly slug: string;
  readonly available: number;
  readonly requested: number;
}

/** Customer-facing message — single phrase, no counts, no slug. */
export const STOCK_ERROR_MESSAGE = "Out of stock";

/**
 * Check `requestedQty` against the InventoryActor's live `available`
 * for one `tracked` product. Returns `null` when stock satisfies the
 * request OR when the product is `untracked` (unlimited). Returns a
 * structured `InsufficientItem` otherwise — caller decides whether
 * to throw, render, or aggregate across multiple items.
 */
export async function checkSingleItemStock(
  env: StockCheckEnv,
  product: ProductInventoryDescriptor,
  requestedQty: number,
): Promise<InsufficientItem | null> {
  if (product.inventoryMode !== "tracked") return null;
  const snap = await getInventoryActor(env).snapshot(product.slug);
  if (snap.available >= requestedQty) return null;
  return {
    slug: product.slug,
    available: snap.available,
    requested: requestedQty,
  };
}
