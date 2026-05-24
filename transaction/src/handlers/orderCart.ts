/**
 * Order cart stash — KV-backed shared state between checkoutStart and
 * the payment-callback consumer.
 *
 * checkoutStart enriches the cart with prices + titles + currency,
 * generates an orderId, and stashes the enriched cart at
 * `order:cart:<orderId>`. The provider only carries `orderId` +
 * `amount` + `customerEmail` (via CallbackEvent); commitOrder reads
 * the stash to write the `order_items` array on the order row.
 *
 * TTL sized for the slowest async settlement methods we expect to
 * encounter: 7 days. ACH (Stripe Direct Debit), SEPA, Bacs, BLIK
 * "delayed", iDEAL bank transfer all routinely settle in 3-5 days.
 * 7 days covers the long tail; orders that settle past then fall to
 * the event-only fallback in `commitOrder.buildOrderRowData` (no
 * item granularity, but payment + total + email survive). The 10-min
 * reservation alarm on the InventoryActor handles abandoned-cart
 * inventory release independently of this stash.
 *
 * Caller contract: the cart stash is treated as a hint, not as
 * source-of-truth. commitOrder MUST tolerate `null` from
 * `readOrderCart` and fall back to the event payload.
 */

export const ORDER_CART_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface OrderCartLine {
  readonly skuCode: string;
  /** Snapshot of the parent product's slug at stash time. Lets the
   *  callback consumer write order_items rows with both columns
   *  populated without re-joining the SKU index. */
  readonly productSlug: string;
  readonly qty: number;
  readonly priceMinor: number;
  readonly title: string;
  /** Rendered axis selection (e.g. "Red / M") snapshotted at stash
   *  time so the receipt / order history can show what was bought
   *  without re-joining the SKU's optionValues against the SPU's
   *  optionAxes. Omitted for single-default-SKU products. */
  readonly variantLabel?: string;
}

export interface OrderCart {
  readonly orderId: string;
  readonly customerEmail: string;
  readonly currency: string;
  readonly items: ReadonlyArray<OrderCartLine>;
  readonly subtotalMinor: number;
  readonly createdAt: number;
}

export function orderCartKey(orderId: string): string {
  return `order:cart:${orderId}`;
}

export async function stashOrderCart(
  kv: KVNamespace,
  cart: OrderCart,
): Promise<void> {
  await kv.put(orderCartKey(cart.orderId), JSON.stringify(cart), {
    expirationTtl: ORDER_CART_TTL_SECONDS,
  });
}

export async function readOrderCart(
  kv: KVNamespace,
  orderId: string,
): Promise<OrderCart | null> {
  return kv.get<OrderCart>(orderCartKey(orderId), "json");
}

export async function deleteOrderCart(
  kv: KVNamespace,
  orderId: string,
): Promise<void> {
  await kv.delete(orderCartKey(orderId));
}
