/**
 * Test fixture — applies CANONICAL_MIGRATIONS to the test profile's
 * D1 + seeds one product so the smoke can exercise add-to-cart →
 * checkout-start → checkout-confirm → read-order-status end-to-end.
 *
 * Targets `wrangler dev --env=test --persist-to=.wrangler-test`
 * (port 8788). Run by `scripts/run-integration.mjs` after wrangler
 * is ready.
 *
 * The product seeded here uses `inventoryMode: untracked` so the
 * smoke doesn't have to seed InventoryActor state — the DO lock
 * path still runs (in paymentCallbackConsumer's tryAcquire),
 * but reserve / commit are skipped. PR 3 adds a tracked-inventory
 * variant smoke once snapshot/restock land.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { CANONICAL_MIGRATIONS } from "@aotter/mantle-runtime";

const NOW = 1_730_000_000_000;

const SEED_PRODUCT_ID = "entry_smoke_product";
const SEED_TRANSLATION_ID = "entry_smoke_product_en";
const SEED_PRODUCT_SLUG = "smoke-product";
const SEED_TRACKED_ID = "entry_tracked_product";
const SEED_TRACKED_TR_ID = "entry_tracked_product_en";
const SEED_TRACKED_SLUG = "tracked-out-of-stock";

function buildFixtureSql(): string {
  const lines: string[] = [];
  lines.push("-- transaction starter test fixture");
  lines.push("-- 1. CANONICAL_MIGRATIONS");
  for (const m of CANONICAL_MIGRATIONS) {
    lines.push(`-- migration ${m.id}: ${m.description}`);
    lines.push(m.sql);
  }
  lines.push("-- 2. site_config row so the runtime boot's locale validator passes.");
  lines.push(
    `INSERT OR IGNORE INTO site_config (id, brand, title, description, origin, locales, updated_at) VALUES (` +
      `'site', 'Mantle Transaction (test)', 'Mantle Transaction (test)', 'fixture', 'http://localhost:8788', '["en"]', ${NOW});`,
  );
  lines.push("-- 3. one published product + en translation");
  const productData = {
    slug: SEED_PRODUCT_SLUG,
    sku: "SMK-001",
    priceMinor: 1000, // $10.00
    currency: "USD",
    inventoryMode: "untracked",
    createdAt: NOW,
  };
  const translationData = {
    slug: SEED_PRODUCT_SLUG,
    locale: "en",
    title: "Smoke Product",
    shortDescription: "Fixture product for the integration smoke.",
    body: "Body for fixture product. Not user-facing.",
  };
  lines.push(
    `INSERT OR IGNORE INTO entries (id, collection, status, version, data, created_at, updated_at) VALUES (` +
      `'${SEED_PRODUCT_ID}', 'products', 'published', 1, ` +
      `'${JSON.stringify(productData).replace(/'/g, "''")}', ${NOW}, ${NOW});`,
  );
  lines.push(
    `INSERT OR IGNORE INTO entries (id, collection, status, version, data, created_at, updated_at) VALUES (` +
      `'${SEED_TRANSLATION_ID}', 'product-translations', 'published', 1, ` +
      `'${JSON.stringify(translationData).replace(/'/g, "''")}', ${NOW}, ${NOW});`,
  );

  lines.push("-- 4. one tracked product with zero stock (for insufficient-stock smoke)");
  const trackedData = {
    slug: SEED_TRACKED_SLUG,
    sku: "TRK-001",
    priceMinor: 2500,
    currency: "USD",
    inventoryMode: "tracked",
    createdAt: NOW,
  };
  const trackedTrData = {
    slug: SEED_TRACKED_SLUG,
    locale: "en",
    title: "Tracked (out of stock)",
    shortDescription: "Inventory-tracked product seeded with zero stock; smoke verifies reserve rejects.",
    body: "Body.",
  };
  lines.push(
    `INSERT OR IGNORE INTO entries (id, collection, status, version, data, created_at, updated_at) VALUES (` +
      `'${SEED_TRACKED_ID}', 'products', 'published', 1, ` +
      `'${JSON.stringify(trackedData).replace(/'/g, "''")}', ${NOW}, ${NOW});`,
  );
  lines.push(
    `INSERT OR IGNORE INTO entries (id, collection, status, version, data, created_at, updated_at) VALUES (` +
      `'${SEED_TRACKED_TR_ID}', 'product-translations', 'published', 1, ` +
      `'${JSON.stringify(trackedTrData).replace(/'/g, "''")}', ${NOW}, ${NOW});`,
  );

  return lines.join("\n");
}

function main(): void {
  const sql = buildFixtureSql();
  const path = ".wrangler-test/fixture.sql";
  writeFileSync(path, sql);
  const flags = ["d1", "execute", "DB", "--env=test", "--local", `--file=${path}`];
  execFileSync("pnpm", ["exec", "wrangler", ...flags], { stdio: "inherit" });
  console.log("fixture applied");
}

main();
