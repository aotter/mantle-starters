/** @jsxImportSource hono/jsx */
import { raw } from "hono/html";
import type { MediaAsset } from "@aotter/mantle/runtime";
import type { SiteConfig } from "@aotter/mantle/spec";
import { Layout, renderHtml } from "./layout.js";
import { pictureFromAssetId } from "./_picture.js";
import { CAROUSEL_JS, renderCarousel, type CarouselSlide } from "./_carousel.js";

/**
 * GET /product/:slug — single product page with SPU/SKU variant picker.
 *
 * The picker is rendered server-side from `optionAxes`. Client-side
 * JS reads `window.__pdpData` (one entry per SKU) and resolves the
 * current axis selections to a `skuCode` via `findSku()`. On variant
 * change: price + Add-to-Cart's `data-sku` swap in place. Add-to-Cart
 * POSTs `{ cartId, skuCode, qty }` to `/api/cart/add`.
 *
 * `__pdpData` is JSON-escaped via the standard `</script>` defence
 * (`.replace(/</g, "\\u003c")`) — operator-supplied product titles
 * can otherwise break out of the inline script element.
 */

const ADD_TO_CART_JS = `
(function() {
  const data = window.__pdpData;
  if (!data) return;
  const picker = document.getElementById("variant-picker");
  const priceEl = document.getElementById("variant-price");
  const btn = document.getElementById("add-to-cart");
  const out = document.getElementById("add-result");
  if (!btn || !out) return;

  function findSku(selections) {
    // Iterate the SPU's declared axes (not each variant's own keys)
    // so missing-axis SKUs fail to match rather than spuriously match.
    return data.variants.find(function (v) {
      for (var i = 0; i < data.optionAxes.length; i++) {
        var axis = data.optionAxes[i].name;
        if (v.optionValues[axis] !== selections[axis]) return false;
      }
      return true;
    });
  }

  function currentSelections() {
    var sel = {};
    if (!picker) return sel;
    var radios = picker.querySelectorAll("input[type=radio]:checked");
    for (var i = 0; i < radios.length; i++) {
      sel[radios[i].name] = radios[i].value;
    }
    return sel;
  }

  function refresh() {
    var sku = findSku(currentSelections());
    if (!sku) {
      btn.disabled = true;
      btn.dataset.sku = "";
      if (priceEl) priceEl.textContent = "—";
      return;
    }
    btn.disabled = false;
    btn.dataset.sku = sku.skuCode;
    if (priceEl) priceEl.textContent = (sku.priceMinor / 100).toFixed(2) + " " + data.currency;
  }

  if (picker) picker.addEventListener("change", refresh);
  refresh();

  btn.addEventListener("click", async () => {
    if (!btn.dataset.sku) return;
    btn.disabled = true;
    out.textContent = "";
    try {
      const res = await fetch("/api/cart/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cartId: window.__cartId,
          skuCode: btn.dataset.sku,
          qty: parseInt(document.getElementById("qty").value, 10) || 1,
        }),
      });
      if (!res.ok) {
        const msg = window.__parseErrorMessage(await res.text());
        out.innerHTML = '<div class="notice error">' +
          window.__escapeHtml(String(msg).slice(0, 200)) + '</div>';
        return;
      }
      out.innerHTML = '<div class="notice success">Added to cart. ' +
        '<a href="/cart">View cart →</a></div>';
    } catch (err) {
      out.innerHTML = '<div class="notice error">' +
        window.__escapeHtml(String(err)) + '</div>';
    } finally {
      btn.disabled = false;
    }
  });
})();
`;

interface PdpSku {
  readonly skuCode: string;
  readonly optionValues: Readonly<Record<string, string>>;
  readonly priceMinor: number;
  readonly images?: ReadonlyArray<ProductImage>;
}

interface PdpOptionAxis {
  readonly name: string;
  readonly values: ReadonlyArray<string>;
}

interface ProductImage {
  readonly assetId: string;
  readonly alt?: string;
}

export interface ProductDetailContext {
  readonly product: {
    readonly slug: string;
    readonly title: string;
    readonly coverAssetId?: string;
    readonly coverAlt?: string;
    readonly images?: ReadonlyArray<ProductImage>;
    readonly currency: string;
    readonly shortDescription?: string;
    readonly body?: string;
    readonly optionAxes: ReadonlyArray<PdpOptionAxis>;
    readonly skus: ReadonlyArray<PdpSku>;
    readonly defaultSku: PdpSku;
  };
  readonly assets: ReadonlyMap<string, MediaAsset>;
  readonly site: SiteConfig;
}

/**
 * The Add-to-Cart button is unconditionally rendered. Stock authority
 * lives server-side: `/api/cart/add` (and ultimately
 * `/api/checkout/start` → `InventoryActor.reserve`) is the gate. If
 * the customer clicks Add for a tracked SKU with no available stock,
 * the cart-add response surfaces the error inline. We do NOT surface
 * a server-rendered "Out of stock" state because the product page is
 * cacheable / shared between visitors; stock state can flip between
 * render time and click time.
 */
export function renderProductDetail(ctx: ProductDetailContext): string {
  const p = ctx.product;
  const gallerySlides = buildGallery(p, ctx.assets);
  const pdpData = {
    optionAxes: p.optionAxes.map((a) => ({ name: a.name, values: a.values })),
    variants: p.skus.map((s) => ({
      skuCode: s.skuCode,
      optionValues: s.optionValues,
      priceMinor: s.priceMinor,
    })),
    currency: p.currency,
  };
  const pdpJson = JSON.stringify(pdpData).replace(/</g, "\\u003c");
  const tree = (
    <Layout title={p.title} site={ctx.site}>
      <p>
        <a href="/">← Back to shop</a>
      </p>
      {gallerySlides.length > 0 ? (
        <div class="product-gallery">
          {raw(renderCarousel({ id: "product-gallery", slides: gallerySlides, ariaLabel: `${p.title} images` }))}
        </div>
      ) : null}
      <h1>{p.title}</h1>
      {p.shortDescription ? <p class="lead">{p.shortDescription}</p> : null}
      <p class="price-tag" id="variant-price">
        {formatPrice(p.defaultSku.priceMinor, p.currency)}
      </p>
      {p.body ? <p>{p.body}</p> : null}

      {p.optionAxes.length > 0 ? (
        <div id="variant-picker">
          {p.optionAxes.map((axis) => (
            <fieldset>
              <legend>{axis.name}</legend>
              {axis.values.map((v, i) => (
                <label style="margin-right: 1rem">
                  <input
                    type="radio"
                    name={axis.name}
                    value={v}
                    checked={i === 0}
                  />
                  {v}
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      ) : null}

      <div>
        <label for="qty">Quantity</label>
        <input
          id="qty"
          type="number"
          min="1"
          max="10"
          value="1"
          style="width: 5rem"
        />
        <br />
        <button
          id="add-to-cart"
          class="primary"
          data-sku={p.defaultSku.skuCode}
          type="button"
        >
          Add to Cart
        </button>
        <div id="add-result"></div>
      </div>
      <script>{raw(`window.__pdpData = ${pdpJson};`)}</script>
      <script>{raw(CAROUSEL_JS)}</script>
      <script>{raw(ADD_TO_CART_JS)}</script>
    </Layout>
  );
  return renderHtml(tree);
}

function buildGallery(
  product: ProductDetailContext["product"],
  assets: ReadonlyMap<string, MediaAsset>,
): ReadonlyArray<CarouselSlide> {
  const refs = [
    ...(product.defaultSku.images ?? []),
    ...(product.images ?? []),
    product.coverAssetId ? { assetId: product.coverAssetId, alt: product.coverAlt ?? product.title } : null,
  ].filter((ref): ref is ProductImage => Boolean(ref?.assetId));
  const seen = new Set<string>();
  const slides: CarouselSlide[] = [];
  refs
    .filter((ref) => {
      if (seen.has(ref.assetId)) return false;
      seen.add(ref.assetId);
      return true;
    })
    .forEach((ref, index) => {
      const html = pictureFromAssetId(ref.assetId, ref.alt ?? product.title, assets, index === 0 ? "eager" : "lazy");
      if (html) slides.push({ html, label: ref.alt ?? `${product.title} image ${index + 1}` });
    });
  return slides;
}

function formatPrice(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}
