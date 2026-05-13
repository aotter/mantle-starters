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
 *
 * The `MAX_RESTOCK_ADD_QTY` cap below is defense-in-depth — if a fork
 * copies this handler into an ungated Procedure or the manifest gate
 * is dropped, the cap prevents unbounded `inv.restock()`. Manifest
 * cap and handler cap are intentional duplication across layers.
 */

import type { AnyHandler } from "@aotter/mantle-runtime";
import { defineHandler } from "./_context.js";
import { getInventoryActor } from "../durableObjects/InventoryActor.js";
import { sendOrderWork } from "./orderConsumer.js";

const MAX_RESTOCK_ADD_QTY = 100_000;

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
    if (input.addQty > MAX_RESTOCK_ADD_QTY) {
      throw new Error(
        `restockProduct: addQty ${input.addQty} exceeds cap ${MAX_RESTOCK_ADD_QTY}`,
      );
    }
    const inv = getInventoryActor(env);
    await inv.restock(input.productSlug, input.addQty);
    await sendOrderWork(env.ORDER_WORK_QUEUE, {
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
