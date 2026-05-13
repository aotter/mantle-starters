/**
 * snapshotInventory — reads InventoryActor state for one product and
 * upserts the inventory_snapshots entry in D1. Called by the
 * `inventory.snapshot.requested` orderWorkConsumer branch + by the
 * cron-driven `inventory.reconcile.tick` (which fans out one
 * snapshot.requested per product).
 *
 * Idempotent — same productSlug repeatedly produces the same row
 * (upsert on entries.id derived from productSlug).
 *
 * Input shape enforced by the manifest (`required: [productSlug]`).
 */

import type { AnyHandler } from "@aotterclam/clam-cms-runtime";
import { defineHandler } from "./_context.js";
import { getInventoryActor } from "../durableObjects/InventoryActor.js";

export interface SnapshotInventoryEnv {
  readonly INVENTORY_ACTOR: DurableObjectNamespace;
  readonly DB: D1Database;
}

export interface SnapshotInventoryInput {
  readonly productSlug: string;
}

export interface SnapshotInventoryOutput {
  readonly productSlug: string;
  readonly available: number;
  readonly reserved: number;
}

export function inventorySnapshotEntryId(productSlug: string): string {
  return `entry_inv_${productSlug}`;
}

/**
 * Upsert one inventory_snapshots row. INSERT OR REPLACE keeps the
 * row id stable so a follow-up getEntry finds the latest snapshot;
 * COALESCE preserves the original created_at across replacements.
 * Shared by this handler and the orderWorkConsumer's
 * `inventory.snapshot.requested` branch.
 */
export async function upsertInventorySnapshot(
  db: D1Database,
  productSlug: string,
  available: number,
  reserved: number,
): Promise<void> {
  const now = Date.now();
  const entryId = inventorySnapshotEntryId(productSlug);
  const data = JSON.stringify({ productSlug, available, reserved, updatedAt: now });
  await db
    .prepare(
      `INSERT OR REPLACE INTO entries
         (id, collection, status, version, data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?,
               COALESCE((SELECT created_at FROM entries WHERE id = ?), ?),
               ?)`,
    )
    .bind(entryId, "inventory_snapshots", "published", 1, data, entryId, now, now)
    .run();
}

export function buildSnapshotInventory(env: SnapshotInventoryEnv): AnyHandler {
  return defineHandler<SnapshotInventoryInput, SnapshotInventoryOutput>(
    async (input) => {
      const inv = getInventoryActor(env);
      const { available, reserved } = await inv.snapshot(input.productSlug);
      await upsertInventorySnapshot(env.DB, input.productSlug, available, reserved);
      return { productSlug: input.productSlug, available, reserved };
    },
  );
}
