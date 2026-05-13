/**
 * snapshotInventory — reads InventoryActor state for one product and
 * upserts the inventory_snapshots entry in D1. Called by the
 * `inventory.snapshot.requested` orderWorkConsumer branch + by the
 * cron-driven `inventory.reconcile.tick` (which fans out one
 * snapshot.requested per product).
 *
 * Idempotent — same productSlug repeatedly produces the same row
 * (upsert on entries.id derived from productSlug).
 */

import type { AnyHandler } from "@aotterclam/clam-cms-runtime";
import { defineHandler } from "./_context.js";
import { inventoryActorClient } from "../durableObjects/InventoryActor.js";

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

export function buildSnapshotInventory(env: SnapshotInventoryEnv): AnyHandler {
  return defineHandler<SnapshotInventoryInput, SnapshotInventoryOutput>(
    async (input) => {
      if (!input.productSlug) {
        throw new Error("snapshotInventory: missing productSlug");
      }
      const stub = env.INVENTORY_ACTOR.get(
        env.INVENTORY_ACTOR.idFromName("singleton"),
      );
      const inv = inventoryActorClient(stub);
      const { available, reserved } = await inv.snapshot(input.productSlug);

      const now = Date.now();
      const entryId = inventorySnapshotEntryId(input.productSlug);
      const data = {
        productSlug: input.productSlug,
        available,
        reserved,
        updatedAt: now,
      };
      const dataJson = JSON.stringify(data);

      // Upsert — first run creates; later runs update available /
      // reserved / updatedAt. INSERT OR REPLACE keeps the row id
      // stable so a returning getEntry call finds the latest snapshot.
      await env.DB.prepare(
        `INSERT OR REPLACE INTO entries
           (id, collection, status, version, data, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?,
                 COALESCE((SELECT created_at FROM entries WHERE id = ?), ?),
                 ?)`,
      )
        .bind(
          entryId,
          "inventory_snapshots",
          "published",
          1,
          dataJson,
          entryId,
          now,
          now,
        )
        .run();

      return { productSlug: input.productSlug, available, reserved };
    },
  );
}
