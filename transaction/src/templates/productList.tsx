/** @jsxImportSource hono/jsx */
import type { SiteConfig } from "@aotter/mantle/spec";
import { Layout, renderHtml } from "./layout.js";

/**
 * GET / — product list. Reads from the `products-public` View (same
 * URL the JSON API exposes); renders one card per published product.
 *
 * Server-rendered for SEO + first-paint speed. The cart "Add" buttons
 * POST to /api/cart/add via fetch on click; the response updates
 * a tiny cart-count badge in the header (vanilla JS, no framework).
 */

export interface ProductListItem {
  readonly slug: string;
  readonly title: string;
  /** Minimum priceMinor across this SPU's SKUs (#166). Shown as
   *  "from $X" when the SPU has more than one purchasable SKU. */
  readonly minPriceMinor: number;
  readonly currency: string;
  /** Number of published SKUs for this SPU. `> 1` triggers the
   *  "from $X" display; otherwise the price renders as a fixed
   *  amount. */
  readonly skuCount: number;
  /** Short blurb shown under the card title. From `product-translations.shortDescription`. */
  readonly shortDescription?: string;
}

export interface ProductListContext {
  readonly products: ReadonlyArray<ProductListItem>;
  readonly site: SiteConfig;
}

export function renderProductList(ctx: ProductListContext): string {
  const tree = (
    <Layout title="Shop" site={ctx.site}>
      <h1>Shop</h1>
      {ctx.products.length === 0 ? (
        <div class="empty">
          No products yet. Sign in as staff to add some.
        </div>
      ) : (
        <div class="product-grid">
          {ctx.products.map((p) => (
            <div class="product-card">
              <h3>
                <a href={`/product/${encodeURIComponent(p.slug)}`}>{p.title}</a>
              </h3>
              {p.shortDescription ? (
                <p class="muted">{p.shortDescription}</p>
              ) : null}
              <div class="price">
                {p.skuCount > 1 ? "from " : ""}
                {formatPrice(p.minPriceMinor, p.currency)}
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
  return renderHtml(tree);
}

function formatPrice(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}
