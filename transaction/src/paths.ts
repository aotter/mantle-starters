import { createPublicPathResolver, type PublicPathResolver } from "@aotter/mantle/runtime";

/**
 * Collection → URL routing table. The transaction starter exposes
 * `product-translations` at `/products` so search engines + customers
 * can find products by slug; `products` (language-neutral parent),
 * `orders`, `order_items`, `inventory_snapshots` have no public URL.
 *
 * Public HTML rendering (templates for product list / detail / cart /
 * checkout / order confirmation) lands in PR 4; PR 1 just declares
 * the path map so sitemap + hreflang work when templates wire up.
 */
export const PUBLIC_PATH_RESOLVER: PublicPathResolver = createPublicPathResolver({
  collectionRoutes: {
    "product-translations": { segment: "products" },
  },
});
