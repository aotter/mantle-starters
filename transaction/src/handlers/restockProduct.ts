/**
 * restockProduct — staff-side inventory replenishment.
 *
 * Calls InventoryActor.restock to increment the product's available
 * stock by addQty, then enqueues `inventory.snapshot.requested` so
 * the D1 snapshot row (read by staff inventory-low Views) refreshes
 * after one queue cycle.
 *
 * Auth + input shape are enforced by the manifest:
 *   - `requires.auth.all: [{ "ctx.staff": [owner] }]` — runtime
 *     gate rejects unauthenticated callers BEFORE this handler runs.
 *   - input schema declares `productSlug: string`, `addQty: integer
 *     minimum: 1` — invalid shapes are rejected pre-dispatch.
 */

import type { AnyHandler } from "@aotterclam/clam-cms-runtime";
import { defineHandler } from "./_context.js";
import { getInventoryActor } from "../durableObjects/InventoryActor.js";

export interface RestockProductEnv {
  readonly INVENTORY_ACTOR: DurableObjectNamespace;
  readonly ORDER_WORK_QUEUE: Queue;
}

export interface RestockProductInput {
  readonly productSlug: string;
  readonly addQty: number;
}

export interface RestockProductOutput {
  readonly productSlug: string;
  readonly addQty: number;
  readonly snapshotQueued: true;
}

export function buildRestockProduct(env: RestockProductEnv): AnyHandler {
  return defineHandler<RestockProductInput, RestockProductOutput>(async (input) => {
    const inv = getInventoryActor(env);
    await inv.restock(input.productSlug, input.addQty);
    await env.ORDER_WORK_QUEUE.send({
      type: "inventory.snapshot.requested",
      productSlug: input.productSlug,
    });
    return {
      productSlug: input.productSlug,
      addQty: input.addQty,
      snapshotQueued: true,
    };
  });
}
