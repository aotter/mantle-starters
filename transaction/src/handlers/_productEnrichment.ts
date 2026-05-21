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

import type { CmsRuntime, MediaAsset } from "@aotter/mantle/runtime";

const EMPTY_ASSETS: ReadonlyMap<string, MediaAsset> = new Map();

/**
 * Resolve a batch of asset ids via `runtime.media.resolveMany`. Returns
 * an empty map when no ids were requested OR no `MediaStorage` adapter
 * is wired (deployments without media uploads enabled set
 * `runtime.media` to `null`). Renderers always receive a map; misses
 * just render through whatever placeholder path the template chose.
 */
async function resolveAssetIds(
  runtime: CmsRuntime,
  ids: ReadonlyArray<string>,
): Promise<ReadonlyMap<string, MediaAsset>> {
  if (ids.length === 0 || !runtime.media) return EMPTY_ASSETS;
  const dedupe = Array.from(new Set(ids));
  return runtime.media.resolveMany(dedupe);
}

export interface ProductRow {
  readonly slug: string;
  readonly title: string;
  readonly priceMinor: number;
  readonly currency: string;
  readonly inventoryMode: "tracked" | "untracked";
  /** Short blurb for catalog cards. From `product-translations.shortDescription`. */
  readonly shortDescription?: string;
  /** Full markdown body for product detail page. From `product-translations.body`. */
  readonly body?: string;
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
    };
    if (!d.slug) continue;
    const tr = translationEntries.find(
      (t) => (t.data as { slug?: string }).slug === d.slug,
    );
    const trd = tr?.data as
      | { title?: string; shortDescription?: string; body?: string }
      | undefined;
    rows.push({
      slug: d.slug,
      title: trd?.title ?? d.slug,
      priceMinor: d.priceMinor ?? 0,
      currency: d.currency ?? "USD",
      inventoryMode: d.inventoryMode ?? "untracked",
      shortDescription: trd?.shortDescription,
      body: trd?.body,
    });
  }
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  return { rows, bySlug };
}

// ── Pages + page-translations ────────────────────────────────────────

/** One element of `page-translations.blocks`. See `manifests/pages.yaml`
 *  for the field-by-block-type semantics; the union here is flat
 *  because the JSON Schema declares it flat — per-type required sets
 *  live in the renderer, not the schema. All fields are optional;
 *  the block renderer ignores unknown `type` values and skips fields
 *  irrelevant to the declared type. */
export interface PageBlock {
  readonly type: string;
  // hero
  readonly eyebrow?: string;
  readonly headline?: string;
  readonly paragraph?: string;
  readonly imageAssetId?: string;
  readonly imageAlt?: string;
  // features
  readonly heading?: string;
  readonly cards?: ReadonlyArray<PageBlockCard>;
  // prose
  readonly markdown?: string;
  // cta
  readonly body?: string;
  readonly buttonLabel?: string;
  readonly buttonHref?: string;
  // media
  readonly sectionEyebrow?: string;
  readonly assetId?: string;
  readonly assetAlt?: string;
  readonly caption?: string;
}

export interface PageBlockCard {
  readonly variant?: "white" | "blue" | "teal" | "green";
  readonly tag?: string;
  readonly title?: string;
  readonly body?: string;
  readonly sideImageAssetId?: string;
  readonly sideImageAlt?: string;
}

export interface PageContent {
  readonly slug: string;
  readonly title: string;
  readonly summary?: string;
  /** Markdown fallback. Used when `blocks` is empty. */
  readonly body: string;
  readonly blocks?: ReadonlyArray<PageBlock>;
  readonly assets: ReadonlyMap<string, MediaAsset>;
}

interface PageTranslationData {
  slug?: string;
  locale?: string;
  title?: string;
  summary?: string;
  body?: string;
  blocks?: ReadonlyArray<PageBlock>;
}

const DEFAULT_PAGE_LOCALE = "en";

/**
 * Load the first published `page-translations` row matching `slug`.
 * When the row carries `blocks[]`, walk every block's referenced
 * asset ids and resolve them in a single `runtime.media.resolveMany`
 * round trip — the renderer threads the resulting map into the block
 * dispatcher to emit `<picture>` per image.
 */
export async function loadPage(
  runtime: CmsRuntime,
  slug: string,
  locale: string = DEFAULT_PAGE_LOCALE,
): Promise<PageContent | null> {
  const trEntries = await runtime.listEntries.execute({
    collection: "page-translations",
    status: "published",
    limit: 500,
  });
  const td = trEntries
    .map((e) => e.data as PageTranslationData)
    .find((d) => d.slug === slug && (d.locale === locale || d.locale == null));
  if (!td) return null;
  const blocks = td.blocks && td.blocks.length > 0 ? td.blocks : undefined;
  const assets = blocks
    ? await resolveAssetIds(runtime, collectAssetIdsFromBlocks(blocks))
    : EMPTY_ASSETS;
  return {
    slug,
    title: td.title ?? slug,
    summary: td.summary,
    body: td.body ?? "",
    blocks,
    assets,
  };
}

function collectAssetIdsFromBlocks(
  blocks: ReadonlyArray<PageBlock>,
): ReadonlyArray<string> {
  const ids: string[] = [];
  for (const b of blocks) {
    if (b.imageAssetId) ids.push(b.imageAssetId);
    if (b.assetId) ids.push(b.assetId);
    if (b.cards) {
      for (const c of b.cards) {
        if (c.sideImageAssetId) ids.push(c.sideImageAssetId);
      }
    }
  }
  return ids;
}
