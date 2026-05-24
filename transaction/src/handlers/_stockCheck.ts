/**
 * Stock-availability gate for `tracked` SKUs. Used by addToCart,
 * `/api/cart/set-qty`, and checkoutStart. The callers already hold a
 * resolved SKU (via `loadPublishedSkuIndex` or `loadProductCatalog`),
 * so this helper takes the SKU value, not a runtime — no listEntries
 * here.
 *
 * Returns a structured failure on insufficient stock so the same
 * shape can also serve the checkout-time bulk-reserve path where
 * multiple lines may fail at once. The customer-facing message is
 * intentionally vague (counts can leak inventory state); server logs
 * retain the structured detail via the return value.
 */

import { getInventoryActor } from "../durableObjects/InventoryActor.js";

export interface StockCheckEnv {
  readonly INVENTORY_ACTOR: DurableObjectNamespace;
}

interface SkuInventoryDescriptor {
  readonly skuCode: string;
  readonly inventoryMode: "tracked" | "untracked";
}

export interface InsufficientItem {
  readonly skuCode: string;
  readonly available: number;
  readonly requested: number;
}

/**
 * Customer-facing wording — single phrase, no counts, no SKU code.
 * The constant is exported so adopters override in their fork to
 * localise per starter audience (zh-TW, ja, ko, etc.). Vague by
 * design: exact counts can leak inventory state to a hostile client;
 * server logs retain the structured `InsufficientItem` detail.
 */
export const STOCK_ERROR_MESSAGE = "Out of stock";

export async function checkSingleSkuStock(
  env: StockCheckEnv,
  sku: SkuInventoryDescriptor,
  requestedQty: number,
): Promise<InsufficientItem | null> {
  if (sku.inventoryMode !== "tracked") return null;
  const snap = await getInventoryActor(env).snapshot(sku.skuCode);
  if (snap.available >= requestedQty) return null;
  return { skuCode: sku.skuCode, available: snap.available, requested: requestedQty };
}
