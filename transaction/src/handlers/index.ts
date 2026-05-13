import type { AnyHandler } from "@aotterclam/clam-cms-runtime";

export interface HandlerEnv {
  // Provider secrets are declared per the chosen provider in
  // src/payment/index.ts; the actual ref-handler implementations
  // close over env at boot — see the per-handler files.
}

/**
 * Stub handler registry — PR 1 scaffold. Every Procedure declared
 * with `handler.kind: ref` resolves through this map; for now each
 * ref throws "not implemented" so:
 *   - `pnpm validate` passes (the runtime checks each ref name is
 *     registered, not that it does anything).
 *   - `pnpm typecheck` passes.
 *   - Calling any Procedure at runtime fails loud.
 *
 * Subsequent PRs replace each `notImplemented` slot with the real
 * handler:
 *   - PR 2: addToCart, checkoutStart, checkoutConfirm, checkoutReturn,
 *     readOrderStatus (the live customer path)
 *   - PR 3: enqueueOrderConfirmed, snapshotInventory, restockProduct
 *     (downstream + staff)
 */
export function buildHandlers(_env: HandlerEnv): Readonly<Record<string, AnyHandler>> {
  return {
    addToCart: notImplemented("addToCart"),
    checkoutStart: notImplemented("checkoutStart"),
    checkoutConfirm: notImplemented("checkoutConfirm"),
    checkoutReturn: notImplemented("checkoutReturn"),
    readOrderStatus: notImplemented("readOrderStatus"),
    enqueueOrderConfirmed: notImplemented("enqueueOrderConfirmed"),
    snapshotInventory: notImplemented("snapshotInventory"),
    restockProduct: notImplemented("restockProduct"),
  };
}

function notImplemented(name: string): AnyHandler {
  return (async () => {
    throw new Error(
      `transaction-starter: handler '${name}' is a PR-1 scaffold stub. ` +
        `Live implementation lands in a later PR; see SKILL.md and the ` +
        `repo's CHANGELOG.`,
    );
  }) as unknown as AnyHandler;
}
