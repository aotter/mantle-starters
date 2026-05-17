/** @jsxImportSource hono/jsx */
import type { SiteConfig } from "@aotterclam/mantle/spec";
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
  readonly priceMinor: number;
  readonly currency: string;
  readonly inventoryMode: "tracked" | "untracked";
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
              <div class="price">{formatPrice(p.priceMinor, p.currency)}</div>
              {p.inventoryMode === "tracked" ? (
                <div class="muted">Limited stock</div>
              ) : null}
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
