/**
 * Dev fixture entrypoint for the transaction starter.
 * Run via `pnpm fixture` before `pnpm dev`.
 *
 * Seeds three demo products so the storefront has something to render
 * on first install:
 *
 *   1. An "untracked" inventory product — always purchasable; exercises
 *      the happy-path add-to-cart → checkout flow without needing
 *      InventoryActor stock seed.
 *   2. A second untracked product — gives the catalog a second card so
 *      the grid layout is visible.
 *   3. A "tracked" product with zero stock — surfaces the "Limited stock"
 *      label in the catalog and the reserve-rejects path if the user
 *      tries to checkout it. Mirrors the test fixture's parallel
 *      tracked-out-of-stock product so dev + test share the same shape.
 *
 * Without `pnpm fixture` the storefront renders the empty-catalog
 * message "No products yet. Sign in as staff to add some." — true
 * but unhelpful for a first-look impression of what the starter ships.
 *
 * Brand / description copy uses `{{BRAND}}` / `{{DESCRIPTION}}`
 * placeholders that `@aotterclam/create-mantle` substitutes at install
 * time (ADR-0016) — so the seeded product copy reflects what the
 * operator typed.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { CANONICAL_MIGRATIONS } from "@aotterclam/mantle/runtime";

const NOW = 1_730_000_000_000;

interface SeedProduct {
  readonly id: string;
  readonly translationId: string;
  readonly slug: string;
  readonly sku: string;
  readonly priceMinor: number;
  readonly currency: string;
  readonly inventoryMode: "tracked" | "untracked";
  readonly title: string;
  readonly shortDescription: string;
  readonly body: string;
}

const PRODUCTS: ReadonlyArray<SeedProduct> = [
  {
    id: "entry_dev_product_signature",
    translationId: "entry_dev_product_signature_en",
    slug: "signature-item",
    sku: "DEV-SIG-001",
    priceMinor: 2500,
    currency: "USD",
    inventoryMode: "untracked",
    title: "Signature Item",
    shortDescription:
      "An always-available item from {{BRAND}} — a demo product seeded by `pnpm fixture` so the storefront has something to render before you add your own.",
    body: "Replace this product with your own catalogue. Edit `test/fixture/apply-dev.ts` to seed different demo items, or sign in to `/admin` and author through MCP.",
  },
  {
    id: "entry_dev_product_companion",
    translationId: "entry_dev_product_companion_en",
    slug: "companion-piece",
    sku: "DEV-CMP-002",
    priceMinor: 1200,
    currency: "USD",
    inventoryMode: "untracked",
    title: "Companion Piece",
    shortDescription:
      "A second untracked item so the {{BRAND}} catalog grid shows a multi-column layout in development.",
    body: "Two products is the minimum that surfaces grid behaviour. Add more by editing the fixture or via MCP authoring after sign-in.",
  },
  {
    id: "entry_dev_product_limited",
    translationId: "entry_dev_product_limited_en",
    slug: "limited-edition",
    sku: "DEV-LMT-003",
    priceMinor: 5000,
    currency: "USD",
    inventoryMode: "tracked",
    title: "Limited Edition",
    shortDescription:
      "Inventory-tracked example with zero seeded stock. {{BRAND}}'s checkout will reject this if added — exercises the reserve-rejects path.",
    body: "Tracked-inventory products read stock state from the InventoryActor Durable Object. This fixture leaves the actor untouched, so any reserve attempt fails until you seed stock via the staff-only `/api/staff/restock` path.",
  },
];

function buildFixtureSql(): string {
  const lines: string[] = [];
  lines.push("-- transaction starter dev fixture (idempotent).");
  lines.push("-- 1. CANONICAL_MIGRATIONS");
  for (const m of CANONICAL_MIGRATIONS) {
    lines.push(`-- migration ${m.id}: ${m.description}`);
    lines.push(m.sql);
  }
  // site_config is seeded automatically by boot from
  // CmsConfig.siteDefaults (DatabaseSiteConfigRepository.seed); we don't
  // touch it here. That keeps brand / description / origin / locales
  // as the single source of truth in src/clamConfig.ts.
  lines.push("-- 2. demo products + en translations");
  for (const p of PRODUCTS) {
    const productData = {
      slug: p.slug,
      sku: p.sku,
      priceMinor: p.priceMinor,
      currency: p.currency,
      inventoryMode: p.inventoryMode,
      createdAt: NOW,
    };
    const translationData = {
      slug: p.slug,
      locale: "en",
      title: p.title,
      shortDescription: p.shortDescription,
      body: p.body,
    };
    lines.push(
      `INSERT OR IGNORE INTO entries (id, collection, status, version, data, created_at, updated_at) VALUES (` +
        `'${p.id}', 'products', 'published', 1, ` +
        `'${JSON.stringify(productData).replace(/'/g, "''")}', ${NOW}, ${NOW});`,
    );
    lines.push(
      `INSERT OR IGNORE INTO entries (id, collection, status, version, data, created_at, updated_at) VALUES (` +
        `'${p.translationId}', 'product-translations', 'published', 1, ` +
        `'${JSON.stringify(translationData).replace(/'/g, "''")}', ${NOW}, ${NOW});`,
    );
  }
  return lines.join("\n") + "\n";
}

function main(): void {
  const sql = buildFixtureSql();
  const path = ".fixture.dev.sql";
  writeFileSync(path, sql);
  process.stdout.write(`Wrote ${path} (${sql.split("\n").length} lines)\n`);
  const flags = ["d1", "execute", "DB", "--local", `--file=${path}`];
  process.stdout.write(`\nApplying D1 fixture (migrations + ${PRODUCTS.length} products)...\n`);
  execFileSync("pnpm", ["exec", "wrangler", ...flags], { stdio: "inherit" });
  process.stdout.write("\nFixture applied.\n\nNext:\n  pnpm dev\n  open http://localhost:8787\n");
}

main();
