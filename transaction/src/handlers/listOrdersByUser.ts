/**
 * orders-by-user query (#175 / #210). Returns the orders attributed
 * to a specific Better Auth `user.id`, sorted newest-first.
 *
 * Uses `runtime.listEntries` rather than a direct D1 query so the
 * starter stays compatible with future D1→other-driver swaps via the
 * runtime's `DatabaseDriver` port. For high-volume shops where the
 * order table is huge, swap this for a parameterized View + index on
 * `userId` once that pattern lands in v0.1.x.
 *
 * The handler reads `ctx.user` from the SDK's HandlerContext (#299
 * populates it from the Better Auth cookie session). Anonymous
 * callers get an empty list — adopters who want a 401 instead can
 * gate the route handler before calling this helper.
 */

import type { AnyHandler, CmsRuntime } from "@aotter/mantle/runtime";
import type { OrderRowData } from "./orderConsumer.js";
import { defineHandler } from "./_context.js";

export interface OrderSummary {
  readonly orderNumber: string;
  readonly orderStatus: string;
  readonly currency: string;
  readonly totalMinor: number;
  readonly placedAt: number;
}

export interface ListOrdersByUserInput {
  /** Optional explicit override. When absent, the handler falls back
   *  to `ctx.user?.id` so route handlers can stay one-liners. */
  readonly userId?: string;
  readonly limit?: number;
}

export interface ListOrdersByUserOutput {
  readonly rows: ReadonlyArray<OrderSummary>;
}

export function buildListOrdersByUser(): AnyHandler {
  return defineHandler<ListOrdersByUserInput, ListOrdersByUserOutput>(
    async (input, ctx) => {
      const userId = input.userId ?? ctx.user?.id;
      if (!userId) return { rows: [] };
      return loadOrdersByUser(ctx.runtime, userId, input.limit);
    },
  );
}

export async function loadOrdersByUser(
  runtime: CmsRuntime,
  userId: string,
  limit: number = 50,
): Promise<ListOrdersByUserOutput> {
  // Pull all order rows, then filter by userId in JS. listEntries
  // doesn't support row-level filter on a JSON field yet; for v0.1
  // this is fine — shop-side order volumes are bounded per user, and
  // adopters with large catalogs can swap in a custom D1 query.
  const entries = await runtime.listEntries.execute({
    collection: "orders",
    status: "published",
    limit: 1000,
  });
  const out: OrderSummary[] = [];
  for (const e of entries) {
    const data = e.data as OrderRowData;
    if (data.userId !== userId) continue;
    out.push({
      orderNumber: data.orderNumber ?? "",
      orderStatus: data.orderStatus ?? "placed",
      currency: data.currency ?? "",
      totalMinor: data.totalMinor ?? 0,
      placedAt: data.placedAt ?? 0,
    });
  }
  out.sort((a, b) => b.placedAt - a.placedAt);
  return { rows: out.slice(0, limit) };
}
