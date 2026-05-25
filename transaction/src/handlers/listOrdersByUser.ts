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

/** Safety cap: stop paginating after this many rows scanned even if
 *  we haven't filled the per-user `limit`. Above this point the shop
 *  has enough volume that a parameterized View or direct D1 query
 *  with an index on `data->>'userId'` is the right answer, and the
 *  starter helper should fail loud-ish (return what it found and
 *  emit a warning) instead of timing out a Worker invocation. */
const MAX_ROWS_SCANNED = 10_000;
const PAGE_SIZE = 500;

export async function loadOrdersByUser(
  runtime: CmsRuntime,
  userId: string,
  limit: number = 50,
): Promise<ListOrdersByUserOutput> {
  // Paginate via the cursored API so a shop with > PAGE_SIZE total
  // orders doesn't silently drop the older ones. We stop as soon as
  // we've filled `limit` for this user OR scanned `MAX_ROWS_SCANNED`
  // entries total — whichever comes first.
  const out: OrderSummary[] = [];
  let cursor: string | undefined = undefined;
  let scanned = 0;
  while (scanned < MAX_ROWS_SCANNED && out.length < limit) {
    const page = await runtime.listEntries.executePage({
      collection: "orders",
      status: "published",
      limit: PAGE_SIZE,
      cursor,
    });
    for (const e of page.rows) {
      scanned++;
      const data = e.data as OrderRowData;
      if (data.userId !== userId) continue;
      out.push({
        orderNumber: data.orderNumber ?? "",
        orderStatus: data.orderStatus ?? "placed",
        currency: data.currency ?? "",
        totalMinor: data.totalMinor ?? 0,
        placedAt: data.placedAt ?? 0,
      });
      if (out.length >= limit) break;
    }
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  if (scanned >= MAX_ROWS_SCANNED && out.length < limit) {
    console.warn(
      `[loadOrdersByUser] scanned ${scanned} rows without filling ${limit} for user ${userId}; consider swapping for a userId-indexed View.`,
    );
  }
  out.sort((a, b) => b.placedAt - a.placedAt);
  return { rows: out };
}
