/**
 * Shared product + translation lookup for handlers and HTML routes.
 *
 * Three callers join `products` × `product-translations` by slug:
 *   - readCart        (cart display: title + current price)
 *   - checkoutStart   (Stripe line items + reservation)
 *   - GET / and GET /product/:slug (storefront templates)
 *
 * All three load the same two collections and pick the first matching
 * translation. For v0.1 (small catalogs) loading both lists up front
 * is fine; if catalogs grow we'll swap in a View with a server-side
 * join, but the caller-facing API stays the same.
 */

import type { CmsRuntime } from "@aotter/mantle-runtime";

export interface ProductRow {
  readonly slug: string;
  readonly title: string;
  readonly priceMinor: number;
  readonly currency: string;
  readonly inventoryMode: "tracked" | "untracked";
  readonly description?: string;
}

export interface ProductCatalog {
  readonly rows: ReadonlyArray<ProductRow>;
  readonly bySlug: ReadonlyMap<string, ProductRow>;
}

/**
 * Load every published product + its first matching translation, join
 * by slug, return both the ordered list (for product-list pages) and
 * a slug map (for per-line cart enrichment).
 */
export async function loadProductCatalog(
  runtime: CmsRuntime,
): Promise<ProductCatalog> {
  const [productEntries, translationEntries] = await Promise.all([
    runtime.listEntries.execute({
      collection: "products",
      status: "published",
      limit: 1000,
    }),
    runtime.listEntries.execute({
      collection: "product-translations",
      status: "published",
      limit: 5000,
    }),
  ]);
  const rows: ProductRow[] = [];
  for (const entry of productEntries) {
    const d = entry.data as {
      slug?: string;
      priceMinor?: number;
      currency?: string;
      inventoryMode?: "tracked" | "untracked";
      description?: string;
    };
    if (!d.slug) continue;
    const tr = translationEntries.find(
      (t) => (t.data as { slug?: string }).slug === d.slug,
    );
    const trd = tr?.data as
      | { title?: string; description?: string }
      | undefined;
    rows.push({
      slug: d.slug,
      title: trd?.title ?? d.slug,
      priceMinor: d.priceMinor ?? 0,
      currency: d.currency ?? "USD",
      inventoryMode: d.inventoryMode ?? "untracked",
      description: trd?.description ?? d.description,
    });
  }
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  return { rows, bySlug };
}
