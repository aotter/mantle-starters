/**
 * Shared product + translation + SKU lookup for handlers and HTML routes.
 *
 * The transaction starter splits products into:
 *   - `products`           — SPU (slug, optionAxes, cover/gallery)
 *   - `product-skus`       — per-variant (skuCode, priceMinor, inventoryMode, optional images[])
 *   - `product-translations` — per-locale title / body / alt
 *
 * `loadProductCatalog` joins all three by slug + skuCode and returns
 * everything callers need: rows (for list / detail), `bySlug` map (for
 * cart enrichment), `skuByCode` reverse index (for cart write path),
 * plus the resolved `MediaAsset` map for `<picture>` rendering.
 *
 * `loadPublishedSkuIndex` is the lighter cart-write-hot-path variant —
 * one listEntries instead of three, returning just skuCode → SKU.
 */

import type { CmsRuntime, MediaAsset } from "@aotter/mantle/runtime";

const EMPTY_ASSETS: ReadonlyMap<string, MediaAsset> = new Map();
const DEFAULT_LOCALE = "en";

async function resolveAssetIds(
  runtime: CmsRuntime,
  ids: ReadonlyArray<string>,
): Promise<ReadonlyMap<string, MediaAsset>> {
  if (ids.length === 0 || !runtime.media) return EMPTY_ASSETS;
  const dedupe = Array.from(new Set(ids));
  return runtime.media.resolveMany(dedupe);
}

// ── Products (SPU) + product-translations + product-skus ─────────────

export interface ProductImage {
  readonly assetId: string;
  readonly alt?: string;
}

export interface ProductOptionAxis {
  readonly name: string;
  readonly values: ReadonlyArray<string>;
}

export interface ProductSku {
  readonly skuCode: string;
  readonly productSlug: string;
  readonly optionValues: Readonly<Record<string, string>>;
  readonly priceMinor: number;
  readonly currency: string;
  readonly inventoryMode: "tracked" | "untracked";
  /** SKU-specific gallery. When absent, detail page falls back to SPU `images`. */
  readonly images?: ReadonlyArray<ProductImage>;
}

export interface ProductRow {
  readonly slug: string;
  readonly title: string;
  readonly shortDescription?: string;
  readonly body?: string;
  readonly categorySlug?: string;
  readonly coverAssetId?: string;
  readonly coverAlt?: string;
  readonly images?: ReadonlyArray<ProductImage>;
  readonly optionAxes: ReadonlyArray<ProductOptionAxis>;
  /** All published SKUs sorted by skuCode. Guaranteed non-empty —
   *  rows without any published SKU are filtered out of the catalog. */
  readonly skus: ReadonlyArray<ProductSku>;
  readonly defaultSku: ProductSku;
  /** Lowest price across `skus[]` — list view "from $X" display. */
  readonly minPriceMinor: number;
  /** Currency from defaultSku. Mixed-currency SPUs are unsupported. */
  readonly currency: string;
}

export interface ProductCatalog {
  readonly rows: ReadonlyArray<ProductRow>;
  readonly bySlug: ReadonlyMap<string, ProductRow>;
  /** Reverse index for cart / checkout — skuCode → its SKU + parent. */
  readonly skuByCode: ReadonlyMap<
    string,
    { readonly sku: ProductSku; readonly product: ProductRow }
  >;
  /** Resolved MediaAssets referenced by SPU coverAssetId / images and
   *  every SKU's `images[]`. Templates pass the map to
   *  `pictureFromAssetId` to emit `<picture>` per image position. */
  readonly assets: ReadonlyMap<string, MediaAsset>;
}

interface ProductData {
  slug?: string;
  categorySlug?: string;
  coverAssetId?: string;
  coverAlt?: string;
  images?: ReadonlyArray<{ assetId?: string; alt?: string }>;
  optionAxes?: ReadonlyArray<{ name?: string; values?: ReadonlyArray<string> }>;
}

interface ProductSkuData {
  skuCode?: string;
  productSlug?: string;
  optionValues?: Readonly<Record<string, string>>;
  priceMinor?: number;
  currency?: string;
  inventoryMode?: "tracked" | "untracked";
  images?: ReadonlyArray<{ assetId?: string; alt?: string }>;
}

interface ProductTranslationData {
  slug?: string;
  locale?: string;
  title?: string;
  shortDescription?: string;
  body?: string;
  coverAlt?: string;
}

export async function loadProductCatalog(
  runtime: CmsRuntime,
  locale: string = DEFAULT_LOCALE,
): Promise<ProductCatalog> {
  const [productEntries, translationEntries, skuEntries] = await Promise.all([
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
    runtime.listEntries.execute({
      collection: "product-skus",
      status: "published",
      limit: 5000,
    }),
  ]);
  const trBySlug = new Map<string, ProductTranslationData>();
  for (const t of translationEntries) {
    const td = t.data as ProductTranslationData;
    if (!td.slug) continue;
    if (td.locale && td.locale !== locale) continue;
    if (!trBySlug.has(td.slug)) trBySlug.set(td.slug, td);
  }
  const skusBySlug = new Map<string, ProductSku[]>();
  for (const e of skuEntries) {
    const d = e.data as ProductSkuData;
    if (!d.skuCode || !d.productSlug || d.priceMinor == null || !d.currency) continue;
    const sku: ProductSku = {
      skuCode: d.skuCode,
      productSlug: d.productSlug,
      optionValues: d.optionValues ?? {},
      priceMinor: d.priceMinor,
      currency: d.currency,
      inventoryMode: d.inventoryMode ?? "untracked",
      images: normalizeImages(d.images),
    };
    const list = skusBySlug.get(d.productSlug);
    if (list) list.push(sku);
    else skusBySlug.set(d.productSlug, [sku]);
  }
  const rows: ProductRow[] = [];
  for (const entry of productEntries) {
    const d = entry.data as ProductData;
    if (!d.slug) continue;
    const skus = (skusBySlug.get(d.slug) ?? [])
      .slice()
      .sort((a, b) => a.skuCode.localeCompare(b.skuCode));
    if (skus.length === 0) continue; // SPU with no SKUs has nothing to sell.
    const trd = trBySlug.get(d.slug);
    const optionAxes = normalizeOptionAxes(d.optionAxes);
    rows.push({
      slug: d.slug,
      title: trd?.title ?? d.slug,
      shortDescription: trd?.shortDescription,
      body: trd?.body,
      categorySlug: d.categorySlug,
      coverAssetId: d.coverAssetId,
      coverAlt: trd?.coverAlt ?? d.coverAlt,
      images: normalizeImages(d.images),
      optionAxes,
      skus,
      defaultSku: skus[0]!,
      minPriceMinor: skus.reduce(
        (min, s) => (s.priceMinor < min ? s.priceMinor : min),
        skus[0]!.priceMinor,
      ),
      currency: skus[0]!.currency,
    });
  }
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const skuByCode = new Map<string, { sku: ProductSku; product: ProductRow }>();
  for (const row of rows) {
    for (const sku of row.skus) skuByCode.set(sku.skuCode, { sku, product: row });
  }
  const assetIds: string[] = [];
  for (const r of rows) {
    if (r.coverAssetId) assetIds.push(r.coverAssetId);
    if (r.images) for (const img of r.images) assetIds.push(img.assetId);
    for (const sku of r.skus) {
      if (sku.images) for (const img of sku.images) assetIds.push(img.assetId);
    }
  }
  const assets = await resolveAssetIds(runtime, assetIds);
  return { rows, bySlug, skuByCode, assets };
}

/**
 * Build a `Map<skuCode, ProductSku>` from the `product-skus`
 * collection. Lighter than `loadProductCatalog` for the cart write
 * hot path (addToCart / set-qty / stock gate) which only needs to
 * resolve a skuCode → price + inventoryMode, never the joined product
 * or translations. One listEntries per request; callers pass the map
 * around instead of re-querying.
 */
export async function loadPublishedSkuIndex(
  runtime: CmsRuntime,
): Promise<ReadonlyMap<string, ProductSku>> {
  const entries = await runtime.listEntries.execute({
    collection: "product-skus",
    status: "published",
    limit: 5000,
  });
  const index = new Map<string, ProductSku>();
  for (const e of entries) {
    const d = e.data as ProductSkuData;
    if (!d.skuCode || !d.productSlug || d.priceMinor == null || !d.currency) continue;
    index.set(d.skuCode, {
      skuCode: d.skuCode,
      productSlug: d.productSlug,
      optionValues: d.optionValues ?? {},
      priceMinor: d.priceMinor,
      currency: d.currency,
      inventoryMode: d.inventoryMode ?? "untracked",
      images: normalizeImages(d.images),
    });
  }
  return index;
}

/**
 * Render an SPU's option-axis selection as a single human label
 * ("Red / M" for Color="Red", Size="M"). Used by the cart line
 * subtitle today; checkout + order receipts can adopt the same
 * helper when they also surface the selected variant. Returns
 * undefined when the SPU has no axes (single-default SKU) so callers
 * can short-circuit.
 */
export function renderVariantLabel(
  sku: { readonly optionValues: Readonly<Record<string, string>> },
  axes: ReadonlyArray<ProductOptionAxis>,
): string | undefined {
  if (axes.length === 0) return undefined;
  const parts: string[] = [];
  for (const axis of axes) {
    const v = sku.optionValues[axis.name];
    if (v) parts.push(v);
  }
  return parts.length > 0 ? parts.join(" / ") : undefined;
}

/**
 * Single source of truth for the single-default-SKU naming convention
 * (`${productSlug}-default`). Documented in `manifests/products.yaml`.
 * Used by the seeder + test fixtures; production carts/handlers don't
 * compute SKU codes — they only consume them.
 */
export function defaultSkuCode(productSlug: string): string {
  return `${productSlug}-default`;
}

function normalizeOptionAxes(
  raw: ReadonlyArray<{ name?: string; values?: ReadonlyArray<string> }> | undefined,
): ReadonlyArray<ProductOptionAxis> {
  if (!raw || raw.length === 0) return [];
  const cleaned: ProductOptionAxis[] = [];
  for (const a of raw) {
    if (!a.name || !a.values || a.values.length === 0) continue;
    cleaned.push({ name: a.name, values: a.values });
  }
  return cleaned;
}

function normalizeImages(
  raw: ReadonlyArray<{ assetId?: string; alt?: string }> | undefined,
): ReadonlyArray<ProductImage> | undefined {
  if (!raw || raw.length === 0) return undefined;
  const cleaned = raw.filter(
    (img): img is ProductImage =>
      img != null && typeof img.assetId === "string" && img.assetId.length > 0,
  );
  return cleaned.length > 0 ? cleaned : undefined;
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

export async function loadPage(
  runtime: CmsRuntime,
  slug: string,
  locale: string = DEFAULT_LOCALE,
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
