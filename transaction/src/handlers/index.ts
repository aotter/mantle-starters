import type { AnyHandler } from "@aotterclam/clam-cms-runtime";
import { checkoutConfirm } from "./checkoutConfirm.js";

export interface HandlerEnv {
  // Provider secrets are declared per the chosen provider in
  // src/payment/index.ts; the actual ref-handler implementations
  // close over env at boot — see the per-handler files.
}

/**
 * Stub handler registry — PR 1 scaffold. Every Procedure declared
 * with `handler.kind: ref` resolves through this map; in PR 1 each
 * slot is a `notImplemented` stub that throws on invoke (the runtime
 * only checks at boot that every ref name is registered, not that
 * the handler actually does anything). `pnpm validate` + `pnpm
 * typecheck` pass; runtime calls fail loud with a message that names
 * the handler + the PR that lands its real implementation.
 *
 * `checkoutConfirm` is the one exception — it's imported from its
 * own module (`./checkoutConfirm.ts`) because the flow doc lives
 * there too (idempotency hazard + "seen-processing → completed"
 * sweeper pattern). PR 2 fills in the body of that one file without
 * touching this registry.
 */
const HANDLER_TO_PR: Readonly<Record<string, "PR 2" | "PR 3">> = {
  "addToCart": "PR 2",
  "checkoutStart": "PR 2",
  "checkoutConfirm": "PR 2",
  "checkoutReturn": "PR 2",
  "readOrderStatus": "PR 2",
  "enqueueOrderConfirmed": "PR 3",
  "snapshotInventory": "PR 3",
  "restockProduct": "PR 3",
};

export function buildHandlers(_env: HandlerEnv): Readonly<Record<string, AnyHandler>> {
  return Object.fromEntries(
    Object.entries(HANDLER_TO_PR).map(([name, pr]) => [
      name,
      name === "checkoutConfirm" ? checkoutConfirm : notImplemented(name, pr),
    ]),
  );
}

function notImplemented(name: string, pr: "PR 2" | "PR 3"): AnyHandler {
  return (async () => {
    throw new Error(
      `transaction-starter: ref handler '${name}' is a PR 1 scaffold stub; ` +
        `live implementation lands in ${pr}.`,
    );
  }) as unknown as AnyHandler;
}
