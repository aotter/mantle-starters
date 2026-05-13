import type { AnyHandler } from "@aotterclam/clam-cms-runtime";
import type { Env } from "../clamConfig.js";
import { buildAddToCart } from "./addToCart.js";
import { buildCheckoutStart } from "./checkoutStart.js";
import { buildCheckoutConfirm } from "./checkoutConfirm.js";
import { buildCheckoutReturn } from "./checkoutReturn.js";
import { buildReadOrderStatus } from "./readOrderStatus.js";

export type HandlerEnv = Env;

/**
 * Procedure ref-handler registry. The runtime resolves
 * `Procedure.handler.ref` by name against this map at boot;
 * `pnpm validate` warns at CLI time if any ref name is missing.
 *
 * Status as of PR 2:
 *   - addToCart, checkoutStart, checkoutConfirm, checkoutReturn,
 *     readOrderStatus → live, exercised by integration smoke.
 *   - enqueueOrderConfirmed, snapshotInventory, restockProduct →
 *     still PR-1-style stubs; PR 3 fills them in.
 */
const PR3_PENDING: Readonly<Record<string, true>> = {
  "enqueueOrderConfirmed": true,
  "snapshotInventory": true,
  "restockProduct": true,
};

export function buildHandlers(env: HandlerEnv): Readonly<Record<string, AnyHandler>> {
  const live: Record<string, AnyHandler> = {
    "addToCart": buildAddToCart(env),
    "checkoutStart": buildCheckoutStart(env),
    "checkoutConfirm": buildCheckoutConfirm(env),
    "checkoutReturn": buildCheckoutReturn(env),
    "readOrderStatus": buildReadOrderStatus(),
  };
  const pending: Record<string, AnyHandler> = Object.fromEntries(
    Object.keys(PR3_PENDING).map((name) => [name, notImplemented(name, "PR 3")]),
  );
  return { ...live, ...pending };
}

function notImplemented(name: string, pr: "PR 3"): AnyHandler {
  return (async () => {
    throw new Error(
      `transaction-starter: ref handler '${name}' is a PR 1/2 scaffold stub; ` +
        `live implementation lands in ${pr}.`,
    );
  }) as unknown as AnyHandler;
}
