/**
 * restockSku — staff-side inventory replenishment.
 *
 * Calls InventoryActor.restock to increment the SKU's available stock
 * by addQty, then enqueues `inventory.snapshot.requested` so the D1
 * snapshot row (read by staff inventory-low Views) refreshes after
 * one queue cycle.
 *
 * Auth + input shape are enforced by the manifest:
 *   - `requires.auth.all: [{ "ctx.staff": [owner] }]` — runtime
 *     gate rejects unauthenticated callers BEFORE this handler runs.
 *   - input schema declares `skuCode: string`, `addQty: integer
 *     minimum: 1` — invalid shapes are rejected pre-dispatch.
 *
 * The `MAX_RESTOCK_ADD_QTY` cap below is defense-in-depth — if a fork
 * copies this handler into an ungated Procedure or the manifest gate
 * is dropped, the cap prevents unbounded `inv.restock()`. Manifest
 * cap and handler cap are intentional duplication across layers.
 */

import type { AnyHandler } from "@aotter/mantle/runtime";
import { defineHandler } from "./_context.js";
import { getInventoryActor } from "../durableObjects/InventoryActor.js";
import { sendOrderWork } from "./orderConsumer.js";

export const MAX_RESTOCK_ADD_QTY = 100_000;

export interface RestockSkuEnv {
  readonly INVENTORY_ACTOR: DurableObjectNamespace;
  readonly ORDER_WORK_QUEUE: Queue;
}

export interface RestockSkuInput {
  readonly skuCode: string;
  readonly addQty: number;
}

export interface RestockSkuOutput {
  readonly skuCode: string;
  readonly addQty: number;
  readonly snapshotQueued: true;
}

/**
 * Core restock side effect — cap check + InventoryActor.restock +
 * snapshot enqueue. Shared by `buildRestockSku` (the staff-gated
 * Procedure) and the test-only `/__test/restock` bypass in
 * `src/index.ts`. The bypass skips the auth gate (gated separately
 * by `FAKE_PAYMENT_PROVIDER=1`); it does NOT skip the cap.
 */
export async function restockSkuCore(
  env: RestockSkuEnv,
  input: RestockSkuInput,
): Promise<RestockSkuOutput> {
  if (input.addQty > MAX_RESTOCK_ADD_QTY) {
    throw new Error(
      `restockSku: addQty ${input.addQty} exceeds cap ${MAX_RESTOCK_ADD_QTY}`,
    );
  }
  const inv = getInventoryActor(env);
  await inv.restock(input.skuCode, input.addQty);
  await sendOrderWork(env.ORDER_WORK_QUEUE, {
    type: "inventory.snapshot.requested",
    skuCode: input.skuCode,
  });
  return {
    skuCode: input.skuCode,
    addQty: input.addQty,
    snapshotQueued: true,
  };
}

export function buildRestockSku(env: RestockSkuEnv): AnyHandler {
  return defineHandler<RestockSkuInput, RestockSkuOutput>(
    (input) => restockSkuCore(env, input),
  );
}
