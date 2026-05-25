/**
 * checkoutStart — reserves inventory + creates a provider checkout
 * session.
 *
 * Flow:
 *   1. Read cart from KV.
 *   2. Look up current prices (snapshotted into the reservation
 *      record so post-callback INSERT can use them).
 *   3. CAPTCHA gate (Turnstile).
 *   4. InventoryActor.reserve() — atomic; rejects if any item is
 *      out of stock; sets 10-min auto-release alarm.
 *   5. PaymentProvider.startCheckout() — returns redirect URL or
 *      auto-submit form.
 *
 * Returns the provider's flow envelope (`{kind:"redirect", url}` or
 * `{kind:"form", html}`) plus our internal orderId so the frontend
 * can poll readOrderStatus while waiting for the async callback.
 */

import type { AnyHandler, CmsRuntime } from "@aotter/mantle/runtime";
import { getInventoryActor } from "../durableObjects/InventoryActor.js";
import { buildPaymentProvider, type PaymentEnv } from "../payment/index.js";
import { readCartState } from "./_cartState.js";
import { defineHandler, isNotFoundError } from "./_context.js";
import { loadProductCatalog, renderVariantLabel } from "./_productEnrichment.js";
import { STOCK_ERROR_MESSAGE } from "./_stockCheck.js";
import { stashOrderCart } from "./orderCart.js";
import { orderEntryId } from "./orderConsumer.js";
import { verifyTurnstile } from "./turnstile.js";

export interface CheckoutStartEnv extends PaymentEnv {
  readonly KV: KVNamespace;
  readonly INVENTORY_ACTOR: DurableObjectNamespace;
  readonly TURNSTILE_SECRET_KEY?: string;
}

export interface CheckoutStartInput {
  readonly cartId: string;
  readonly customerEmail: string;
  readonly turnstileToken?: string;
}

export interface CheckoutStartOutput {
  readonly orderId: string;
  readonly result:
    | { kind: "redirect"; url: string }
    | { kind: "form"; html: string };
}

export function buildCheckoutStart(env: CheckoutStartEnv): AnyHandler {
  return defineHandler<CheckoutStartInput, CheckoutStartOutput>(async (input, ctx) => {
    if (!input.cartId || !input.customerEmail) {
      throw new Error("checkoutStart: missing cartId / customerEmail");
    }

    // Turnstile verify + KV cart read + catalog load are independent;
    // run them concurrently. Catalog is the long pole (3 listEntries
    // + media resolve) and dominates the wall time.
    const [, cart, catalog] = await Promise.all([
      verifyTurnstile(env.TURNSTILE_SECRET_KEY, input.turnstileToken),
      readCartState(env.KV, input.cartId),
      loadProductCatalog(ctx.runtime),
    ]);
    if (cart.items.length === 0) {
      // Distinguish "never added anything (or cart expired)" from
      // "had items before deploy but the SPU/SKU split made them
      // incompatible". The latter is recoverable — the customer
      // re-adds — but the generic empty message gives no clue that
      // anything was there. Frontend can route on the message text
      // (or, for a richer UI, swap this throw for a structured
      // error envelope).
      if (cart.legacyDropped) {
        throw new Error(
          "Your cart was updated by a catalog change — please re-add your items.",
        );
      }
      throw new Error("checkoutStart: cart empty or expired");
    }
    const enrichedItems = cart.items.map((item) => {
      const hit = catalog.skuByCode.get(item.skuCode);
      if (!hit) {
        throw new Error(`checkoutStart: unknown sku ${item.skuCode}`);
      }
      const { sku, product } = hit;
      return {
        skuCode: sku.skuCode,
        productSlug: product.slug,
        qty: item.qty,
        priceMinor: sku.priceMinor,
        currency: sku.currency,
        inventoryMode: sku.inventoryMode,
        title: product.title,
        variantLabel: renderVariantLabel(sku, product.optionAxes),
      };
    });
    const currency = enrichedItems[0]?.currency;
    if (!currency) {
      throw new Error("checkoutStart: cart items have no currency");
    }
    // Sanity — all items must share currency. Multi-currency carts
    // are out of scope for v0.1 (single-currency-per-site contract).
    for (const item of enrichedItems) {
      if (item.currency !== currency) {
        throw new Error(
          `checkoutStart: mixed currency cart (${currency} vs ${item.currency})`,
        );
      }
    }

    // 4. Reserve inventory under a fresh orderId
    const orderId = await generateOrderId(ctx.runtime);
    const inv = getInventoryActor(env);
    const reserveItems = enrichedItems.filter(
      (i) => i.inventoryMode === "tracked",
    );
    if (reserveItems.length > 0) {
      const result = await inv.reserve({
        orderId,
        items: reserveItems.map((i) => ({ skuCode: i.skuCode, qty: i.qty })),
      });
      if (!result.ok) {
        // Customer-facing message — vague by design (exact counts can
        // leak inventory state). Structured detail stays server-side
        // for ops via the log line below.
        const detail = result.insufficient
          .map((i) => `${i.skuCode}(need ${i.requested}, have ${i.available})`)
          .join(", ");
        console.warn(`checkoutStart: insufficient stock — ${detail}`);
        throw new Error(STOCK_ERROR_MESSAGE);
      }
    }

    // 5. Stash the enriched cart so the callback consumer can write
    // order_items + customerEmail without re-running price lookup.
    const subtotalMinor = enrichedItems.reduce(
      (acc, i) => acc + i.priceMinor * i.qty,
      0,
    );
    await stashOrderCart(env.KV, {
      orderId,
      customerEmail: input.customerEmail,
      currency,
      items: enrichedItems.map((i) => ({
        skuCode: i.skuCode,
        productSlug: i.productSlug,
        qty: i.qty,
        priceMinor: i.priceMinor,
        title: i.title,
        variantLabel: i.variantLabel,
      })),
      subtotalMinor,
      createdAt: Date.now(),
      // Snapshot the buyer's Better Auth user.id if they're a signed-
      // in CUSTOMER. Staff-assisted checkouts (staff member runs the
      // flow on a customer's behalf) intentionally attribute the
      // order to the customer side via `customerEmail`, not to the
      // staff's user.id — so we skip the snapshot when `ctx.staff` is
      // set. Guest carts (no session) also fall through to null. The
      // callback consumer runs server-to-server (no cookie), so it
      // can't re-read the session — the cart stash is the only place
      // the user→order link survives between checkoutStart and commit.
      ...(ctx.user?.id && !ctx.staff ? { userId: ctx.user.id } : {}),
    });

    // 6. Hand off to the payment provider
    const provider = buildPaymentProvider(env);
    const origin = env.PUBLIC_ORIGIN ?? "http://localhost:8787";
    const result = await provider.startCheckout({
      orderId,
      items: enrichedItems.map((i) => ({
        skuCode: i.skuCode,
        productSlug: i.productSlug,
        qty: i.qty,
        priceMinor: i.priceMinor,
        title: i.title,
      })),
      customerEmail: input.customerEmail,
      currency,
      returnUrl: `${origin}/api/payment/return?orderId=${encodeURIComponent(orderId)}`,
      notifyUrl: `${origin}/api/payment/callback`,
    });
    return { orderId, result } satisfies CheckoutStartOutput;
  });
}

/**
 * Order id format: `o_YYYYMMDD-XXXXXX` (UTC date; adopters override
 * for merchant timezones — Asia/Taipei avoids the +1 UTC date for
 * 23:59 local orders, US/Pacific covers North American storefronts,
 * etc.).
 *
 *   - 6 chars from a no-confusables alphabet (30⁶ ≈ 729M per day).
 *
 * orderId is the reservation key + KV cart-stash key + `entries.id`
 * primary key, so collisions silently overwrite the prior order and
 * strand inventory. We pre-check D1 and retry on hit; after 5
 * collisions we widen the tail with a UUID slice rather than loop
 * forever, since 5 misses in a row means the RNG is broken or the
 * day's space is genuinely saturated.
 */
const ID_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const ID_TAIL_LEN = 6;
const ID_MAX_ATTEMPTS = 5;
const UTC_DATE_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "UTC",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

async function generateOrderId(runtime: CmsRuntime): Promise<string> {
  const ymd = UTC_DATE_FMT.format(new Date()).replace(/-/g, "");
  for (let attempt = 0; attempt < ID_MAX_ATTEMPTS; attempt++) {
    const candidate = `o_${ymd}-${randomTail(ID_TAIL_LEN)}`;
    if (!(await orderIdExists(runtime, candidate))) return candidate;
  }
  // Fallback after 5 collisions — RNG is broken or the day's space is
  // saturated. Widen by re-mapping a fresh UUID through the same
  // no-confusables alphabet so the resulting id stays structurally
  // identical to a normal one (a raw `randomUUID().slice(0,8)` would
  // mix hex `0`/`1` and `[A-F]` back into otherwise-confusable-free
  // ids, exactly when you want maximum readability for the on-call).
  const fallbackBytes = new TextEncoder().encode(crypto.randomUUID());
  let tail = "";
  for (let i = 0; i < ID_TAIL_LEN * 2 && tail.length < ID_TAIL_LEN * 2; i++) {
    tail += ID_ALPHABET.charAt(fallbackBytes[i % fallbackBytes.length]! % ID_ALPHABET.length);
  }
  return `o_${ymd}-${tail}`;
}

function randomTail(len: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (const b of bytes) {
    out += ID_ALPHABET.charAt(b % ID_ALPHABET.length);
  }
  return out;
}

async function orderIdExists(runtime: CmsRuntime, orderId: string): Promise<boolean> {
  try {
    await runtime.getEntry.execute({
      id: orderEntryId(orderId),
      collection: "orders",
    });
    return true;
  } catch (err) {
    if (isNotFoundError(err)) return false;
    throw err;
  }
}
