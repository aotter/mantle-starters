import type { AnyHandler } from "@aotter/mantle/runtime";
import type { Env } from "../mantleConfig.js";
import { buildFeatureHandlers } from "../.mantle/generated.handlers.js";
import { buildAddToCart } from "./addToCart.js";
import { buildCheckoutStart } from "./checkoutStart.js";
import { buildCheckoutConfirm } from "./checkoutConfirm.js";
import { buildCheckoutReturn } from "./checkoutReturn.js";
import { buildReadOrderStatus } from "./readOrderStatus.js";
import { buildEnqueueOrderConfirmed } from "./enqueueOrderConfirmed.js";
import { buildSnapshotInventory } from "./snapshotInventory.js";
import { buildRestockSku } from "./restockSku.js";

export type HandlerEnv = Env;

/**
 * Procedure ref-handler registry. The runtime resolves
 * `Procedure.handler.ref` by name against this map at boot;
 * `pnpm validate` warns at CLI time if any ref name is missing.
 *
 * Feature handlers are appended via the generated feature-glue file
 * — `create-mantle` regenerates `.mantle/generated.handlers.ts` from
 * the selected feature overlay set at scaffold time. The stub
 * commits a no-op so the starter typechecks before any feature is
 * installed.
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
    "restockSku": buildRestockSku(env),
    ...buildFeatureHandlers(env),
  };
}
