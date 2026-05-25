/**
 * Cart-binding (anon → user merge) helpers (#234).
 *
 * When an anonymous visitor signs in, the storefront wants to carry
 * the cart they were holding into a stable per-user cart so the next
 * device they sign in on also sees it. The merge is pure KV work
 * over the existing `cart:<cartId>` shape — no SDK change, no DO,
 * no D1.
 *
 * Adopter wires three pieces (see customer-account README):
 *
 *   1. `POST /api/cart/bind` route — reads session, calls
 *      `mergeAnonIntoUser`, returns `{ cartId, mergedItemCount }`.
 *      CSRF-guarded; cookie-session-only.
 *   2. JS hook in the chrome's account-slot bootstrap that fires
 *      bind once when a signed-in session is detected and the
 *      browser's stored `cartId` doesn't already start with `uc_`.
 *   3. (Optional) check `localStorage.cartId` BEFORE addToCart on
 *      signed-in users so subsequent adds land on the user cart
 *      directly without an extra merge step.
 *
 * Race posture: KV is eventually consistent; two-tab concurrent
 * binds can lose a few qty in the tight race window between
 * `read(anonCart)` + `read(userCart)` and the final `put`.
 * Acceptable at the starter's ≤100 orders/day sizing. If a future
 * deploy hits real concurrency the right answer is a `CartActor`
 * Durable Object keyed by `uc_<userId>` rather than hardening the
 * KV path — out of scope here.
 */

/**
 * Minimal cart shape this helper reads + writes. Mirrors the
 * transaction archetype's `CartState` JSON layout in KV. The
 * `legacyDropped` field on the archetype's read helper is a
 * read-time hint — not persisted, so it's not relevant here.
 */
export interface CartShape {
  readonly items: ReadonlyArray<{ readonly skuCode: string; readonly qty: number }>;
  readonly updatedAt?: number;
}

/** Deterministic per-user cart-id. `uc_` prefix lets adopter code
 *  cheaply detect "this cart already belongs to a user" without
 *  loading the row. The prefix doubles as a sentinel for the
 *  account-slot JS — only fire the bind when the stored cartId
 *  does NOT start with `uc_`. */
export function userCartIdFor(userId: string): string {
  return `uc_${userId}`;
}

export interface MergeAnonIntoUserOptions {
  /** Cap per-line qty after sum-merge. Defaults to 99 to match the
   *  transaction archetype's `MAX_QTY_PER_LINE`. Adopters with a
   *  different cap pass it through. */
  readonly maxQtyPerLine?: number;
  /** Cart KV TTL on write. Defaults to 7 days to match the
   *  transaction archetype's `CART_TTL_SECONDS`. */
  readonly ttlSeconds?: number;
}

export interface MergeAnonIntoUserResult {
  /** Canonical user cart-id the caller should re-cookie / store.
   *  Always `userCartIdFor(userId)`. */
  readonly cartId: string;
  /** Number of distinct skuCodes that came from the anon cart and
   *  ended up on the user cart (added or sum-merged). Useful for
   *  the bind response payload so the frontend can surface "we
   *  carried over your X items" toast. */
  readonly mergedItemCount: number;
}

/**
 * Merge the items at `cart:<anonCartId>` into the user's canonical
 * cart at `cart:uc_<userId>` and delete the anon row. Union by
 * skuCode, sum quantities, clamp to `maxQtyPerLine`. Idempotent
 * relative to its own writes — calling with the same
 * `(userId, anonCartId)` twice in a row is a no-op the second time
 * because the anon row is gone.
 *
 * No-anon-cart and no-user-cart paths are both safe: an empty anon
 * cart still returns the canonical user cartId so the route can
 * re-cookie without surfacing a "no cart to merge" error.
 */
export async function mergeAnonIntoUser(
  kv: KVNamespace,
  userId: string,
  anonCartId: string,
  opts: MergeAnonIntoUserOptions = {},
): Promise<MergeAnonIntoUserResult> {
  const maxQtyPerLine = opts.maxQtyPerLine ?? 99;
  const ttlSeconds = opts.ttlSeconds ?? 7 * 24 * 60 * 60;
  const userCartId = userCartIdFor(userId);

  // Idempotent re-entry: anon cart is already gone, just return the
  // canonical user cartId. Saves one KV read on the common-case
  // second-tab refresh after sign-in.
  if (anonCartId === userCartId) {
    return { cartId: userCartId, mergedItemCount: 0 };
  }

  const [anonRaw, userRaw] = await Promise.all([
    kv.get<CartShape>(`cart:${anonCartId}`, "json"),
    kv.get<CartShape>(`cart:${userCartId}`, "json"),
  ]);

  const anonItems = anonRaw?.items ?? [];
  const userItems = userRaw?.items ?? [];

  if (anonItems.length === 0) {
    // Nothing to merge. Don't touch the user cart; clean up the
    // empty anon row so the cookie can rotate without dangling.
    if (anonRaw) await kv.delete(`cart:${anonCartId}`);
    return { cartId: userCartId, mergedItemCount: 0 };
  }

  // Build the merged-by-sku index from the user cart first so that
  // subsequent additions from the anon cart sum on top, capped per
  // line. Iteration order: anon items appended after user items,
  // preserving "what you already had" stability.
  const bySku = new Map<string, number>();
  for (const i of userItems) {
    if (typeof i.skuCode === "string" && Number.isFinite(i.qty)) {
      bySku.set(i.skuCode, (bySku.get(i.skuCode) ?? 0) + i.qty);
    }
  }
  let merged = 0;
  for (const i of anonItems) {
    if (typeof i.skuCode !== "string" || !Number.isFinite(i.qty)) continue;
    const next = (bySku.get(i.skuCode) ?? 0) + i.qty;
    bySku.set(i.skuCode, Math.min(next, maxQtyPerLine));
    merged++;
  }

  const items = [...bySku.entries()].map(([skuCode, qty]) => ({ skuCode, qty }));
  const next: CartShape = { items, updatedAt: Date.now() };

  await kv.put(`cart:${userCartId}`, JSON.stringify(next), {
    expirationTtl: ttlSeconds,
  });
  await kv.delete(`cart:${anonCartId}`);

  return { cartId: userCartId, mergedItemCount: merged };
}
