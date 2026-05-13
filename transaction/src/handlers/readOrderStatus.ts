/**
 * readOrderStatus — polled by the frontend after customer returns
 * from the provider. Returns { orderId, exists, orderStatus? } so
 * the UI can detect when the async callback consumer has placed
 * the order. See manifests/checkout.yaml for the output contract.
 */

import type { AnyHandler, CmsRuntime } from "@aotterclam/clam-cms-runtime";

export interface ReadOrderStatusInput {
  readonly orderId: string;
}

export interface ReadOrderStatusOutput {
  readonly orderId: string;
  readonly exists: boolean;
  readonly orderStatus?: string;
}

export function buildReadOrderStatus(): AnyHandler {
  return (async (input: ReadOrderStatusInput, ctx: HandlerContext) => {
    if (!input.orderId) {
      throw new Error("readOrderStatus: missing orderId");
    }
    const orders = await ctx.runtime.listEntries.execute({
      collection: "orders",
      status: "published",
      limit: 1000,
    });
    const hit = orders.find(
      (o) => (o.data as { orderNumber?: string }).orderNumber === input.orderId,
    );
    if (!hit) {
      return { orderId: input.orderId, exists: false } satisfies ReadOrderStatusOutput;
    }
    const d = hit.data as { orderNumber?: string; orderStatus?: string };
    return {
      orderId: d.orderNumber ?? input.orderId,
      exists: true,
      orderStatus: d.orderStatus ?? "placed",
    } satisfies ReadOrderStatusOutput;
  }) as unknown as AnyHandler;
}

interface HandlerContext {
  readonly runtime: CmsRuntime;
}
