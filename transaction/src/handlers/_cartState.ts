/**
 * Cart KV state — shared shape + read helper.
 *
 * Cart lives at `cart:<cartId>` in KV. addToCart, /api/cart/set-qty,
 * checkoutStart, and readCart all need to read it; all paths route
 * through `readCartState` so the legacy-shape drop happens uniformly.
 * Inlined `env.KV.get<CartState>` skips the legacy filter and breaks
 * customers whose carts predate the SPU/SKU split.
 */

export interface CartState {
  items: { skuCode: string; qty: number }[];
  updatedAt: number;
  /** Read-time-only derived field — true when the KV row existed AND
   *  had at least one entry dropped because it lacked `skuCode`
   *  (pre-SKU schema). Lets callers like `checkoutStart` distinguish
   *  "cart empty (never added)" from "cart was non-empty before
   *  deploy but every entry is now incompatible" — the two produce
   *  different customer messages (one is "browse the shop", the
   *  other is "re-add the items you had — the catalog updated").
   *  Writers omit; not persisted in KV. */
  legacyDropped?: boolean;
}

export const CART_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * Read a cart from KV. Drops any entries shaped as
 * `{ productSlug, qty }` (pre-SKU schema) silently — carts have a
 * 7-day TTL so this self-heals; throwing on customers mid-session
 * would be worse. Sets `legacyDropped: true` when at least one entry
 * was dropped so callers can surface a recovery message instead of
 * the generic "cart empty" path.
 */
export async function readCartState(
  kv: KVNamespace,
  cartId: string,
): Promise<CartState> {
  const raw = await kv.get<{
    items?: Array<{ skuCode?: string; productSlug?: string; qty?: number }>;
    updatedAt?: number;
  }>(`cart:${cartId}`, "json");
  if (!raw) return { items: [], updatedAt: 0, legacyDropped: false };
  const items: CartState["items"] = [];
  let legacyDropped = false;
  for (const i of raw.items ?? []) {
    if (typeof i.skuCode === "string" && typeof i.qty === "number") {
      items.push({ skuCode: i.skuCode, qty: i.qty });
    } else if (typeof i.productSlug === "string") {
      legacyDropped = true;
    }
  }
  return { items, updatedAt: raw.updatedAt ?? 0, legacyDropped };
}
