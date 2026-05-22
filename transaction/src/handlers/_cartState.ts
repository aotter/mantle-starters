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
}

export const CART_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * Read a cart from KV. Drops any entries shaped as
 * `{ productSlug, qty }` (pre-SKU schema) silently — carts have a
 * 7-day TTL so this self-heals; throwing on customers mid-session
 * would be worse.
 */
export async function readCartState(
  kv: KVNamespace,
  cartId: string,
): Promise<CartState> {
  const raw = await kv.get<{
    items?: Array<{ skuCode?: string; productSlug?: string; qty?: number }>;
    updatedAt?: number;
  }>(`cart:${cartId}`, "json");
  if (!raw) return { items: [], updatedAt: 0 };
  const items: CartState["items"] = [];
  for (const i of raw.items ?? []) {
    if (typeof i.skuCode === "string" && typeof i.qty === "number") {
      items.push({ skuCode: i.skuCode, qty: i.qty });
    }
  }
  return { items, updatedAt: raw.updatedAt ?? 0 };
}
