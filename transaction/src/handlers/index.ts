import type { AnyHandler } from "@aotterclam/clam-cms-runtime";
import type { Env } from "../clamConfig.js";
import { buildAddToCart } from "./addToCart.js";
import { buildCheckoutStart } from "./checkoutStart.js";
import { buildCheckoutConfirm } from "./checkoutConfirm.js";
import { buildCheckoutReturn } from "./checkoutReturn.js";
import { buildReadOrderStatus } from "./readOrderStatus.js";
import { buildEnqueueOrderConfirmed } from "./enqueueOrderConfirmed.js";
import { buildSnapshotInventory } from "./snapshotInventory.js";
import { buildRestockProduct } from "./restockProduct.js";

export type HandlerEnv = Env;

/**
 * Procedure ref-handler registry. The runtime resolves
 * `Procedure.handler.ref` by name against this map at boot;
 * `pnpm validate` warns at CLI time if any ref name is missing.
 *
 * All 8 handlers live as of PR 3:
 *   - addToCart, checkoutStart, checkoutConfirm, checkoutReturn,
 *     readOrderStatus — customer-facing flow (PR 2)
 *   - enqueueOrderConfirmed — orders.after_create lifecycle target
 *     (PR 3); currently inactive because commitOrder bypasses the
 *     lifecycle, but live for when staff-side order creation routes
 *     through the runtime.
 *   - snapshotInventory — order_work_queue branch + sweeper fan-out
 *   - restockProduct — staff-gated POST /staff/api/restock
 */
export function buildHandlers(env: HandlerEnv): Readonly<Record<string, AnyHandler>> {
  return {
    "addToCart": buildAddToCart(env),
    "checkoutStart": buildCheckoutStart(env),
    "checkoutConfirm": buildCheckoutConfirm(env),
    "checkoutReturn": buildCheckoutReturn(env),
    "readOrderStatus": buildReadOrderStatus(),
    "enqueueOrderConfirmed": buildEnqueueOrderConfirmed(env),
    "snapshotInventory": buildSnapshotInventory(env),
    "restockProduct": buildRestockProduct(env),
  };
}
