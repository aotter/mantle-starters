/**
 * readOrderStatus — polled by the frontend after customer returns
 * from the provider. Returns { orderId, exists, orderStatus? } so
 * the UI can detect when the async callback consumer has placed
 * the order. See manifests/checkout.yaml for the output contract.
 *
 * Uses `runtime.getEntry` against the deterministic
 * `entry_<orderId>` id — direct lookup, no 1000-row scan + no
 * silent miss past the limit cap.
 */

import type { AnyHandler } from "@aotterclam/clam-cms-runtime";
import { defineHandler } from "./_context.js";
import { orderEntryId, type OrderLineItem, type OrderRowData } from "./orderConsumer.js";

export interface ReadOrderStatusInput {
  readonly orderId: string;
}

export interface ReadOrderStatusOutput {
  readonly orderId: string;
  readonly exists: boolean;
  readonly orderStatus?: string;
  readonly currency?: string;
  readonly totalMinor?: number;
  readonly customerEmail?: string;
  readonly paymentProvider?: string;
  readonly paymentIntentId?: string;
  readonly items?: ReadonlyArray<OrderLineItem>;
}

export function buildReadOrderStatus(): AnyHandler {
  return defineHandler<ReadOrderStatusInput, ReadOrderStatusOutput>(async (input, ctx) => {
    if (!input.orderId) {
      throw new Error("readOrderStatus: missing orderId");
    }
    try {
      const row = await ctx.runtime.getEntry.execute({
        id: orderEntryId(input.orderId),
        collection: "orders",
      });
      const d = row.data as OrderRowData;
      return {
        orderId: d.orderNumber ?? input.orderId,
        exists: true,
        orderStatus: d.orderStatus ?? "placed",
        currency: d.currency,
        totalMinor: d.totalMinor,
        customerEmail: d.customerEmail,
        paymentProvider: d.paymentProvider,
        paymentIntentId: d.paymentIntentId,
        items: d.items,
      } satisfies ReadOrderStatusOutput;
    } catch (err) {
      // getEntry throws DiagnosticError on not-found. For our caller
      // not-found just means "the async callback hasn't placed the
      // order yet" — exists: false is the right shape.
      if (isNotFoundError(err)) {
        return {
          orderId: input.orderId,
          exists: false,
        } satisfies ReadOrderStatusOutput;
      }
      throw err;
    }
  });
}

function isNotFoundError(err: unknown): boolean {
  if (err instanceof Error) {
    // DiagnosticError carries a `diagnostic` field; not-found
    // diagnostics surface with `code: "ENTRY_NOT_FOUND"`. Defensive
    // string-match keeps this independent of the import surface.
    const message = err.message ?? "";
    if (/not.?found|ENTRY_NOT_FOUND/i.test(message)) return true;
    const diag = (err as { diagnostic?: { code?: string } }).diagnostic;
    if (diag && diag.code === "ENTRY_NOT_FOUND") return true;
  }
  return false;
}
