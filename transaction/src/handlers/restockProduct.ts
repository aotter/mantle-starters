/**
 * restockProduct — staff-side inventory replenishment.
 *
 * Calls InventoryActor.restock to increment the product's available
 * stock by addQty. Routed at POST /staff/api/restock; the
 * manifests/inventory.yaml Procedure declares
 * `requires.auth.all: [{ "ctx.staff": [owner] }]`, so the runtime's
 * auth gate rejects unauthenticated callers BEFORE this handler
 * runs.
 *
 * Snapshot to D1 happens via the orderWorkConsumer's
 * `inventory.snapshot.requested` branch — restock enqueues that
 * message so staff Views (inventory-low) see the new totals after
 * one queue cycle.
 */

import type { AnyHandler } from "@aotterclam/clam-cms-runtime";
import { defineHandler } from "./_context.js";
import { inventoryActorClient } from "../durableObjects/InventoryActor.js";

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
    if (!input.productSlug || !input.addQty) {
      throw new Error("restockProduct: missing productSlug / addQty");
    }
    if (input.addQty < 1) {
      throw new Error("restockProduct: addQty must be >= 1");
    }
    const stub = env.INVENTORY_ACTOR.get(
      env.INVENTORY_ACTOR.idFromName("singleton"),
    );
    const inv = inventoryActorClient(stub);
    await inv.restock(input.productSlug, input.addQty);

    // Refresh the D1 snapshot row asynchronously so the staff
    // inventory-low View reflects the new totals.
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
