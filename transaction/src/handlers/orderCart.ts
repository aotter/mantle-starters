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
 * TTL matches the reservation TTL (24h ceiling — much longer than the
 * 10-min reservation, because a provider can legitimately call us
 * back hours after checkoutStart for async payment methods). The
 * shorter reservation alarm handles abandoned carts; the KV entry's
 * 24h TTL is a guardrail against stash leakage.
 */

export const ORDER_CART_TTL_SECONDS = 24 * 60 * 60;

export interface OrderCartLine {
  readonly productSlug: string;
  readonly qty: number;
  readonly priceMinor: number;
  readonly title: string;
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
