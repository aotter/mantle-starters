/**
 * Reusable image carousel — server-rendered markup + a small inline
 * script that uses event delegation rather than cached NodeList
 * references (#166). The TOA-style PDP variant swap motivated the
 * delegation rewrite: any template that calls
 * `track.innerHTML = newSlidesHtml` at runtime would detach a cached
 * NodeList-based listener, and the carousel silently stopped
 * responding to clicks.
 *
 * Event delegation fixes this — one listener per `.carousel` root,
 * fresh DOM lookups per click. Re-rendering the track / dots is
 * always safe.
 *
 * The render helpers (`renderSlides`, `renderDots`) are exported so
 * callers driving a runtime swap can produce the same markup the
 * server emits at first paint. For per-variant pre-render, the
 * caller stashes `{ slidesHtml, dotsHtml, hasControls }` per variant
 * in `window.__pdpData` and the swap routine is four lines of
 * `innerHTML = …` — no string concat on the client (the JSON-in-
 * script escape pattern in transaction/CLAUDE.md is in scope here).
 *
 * Wiring contract for adopter templates:
 *
 *   1. Render the carousel root with `renderCarousel({ id, slides })`.
 *   2. Style `.carousel`, `.carousel__track`, `.carousel__slide`,
 *      `.carousel__dots`, `.carousel__controls`, `.carousel__btn`
 *      to taste; the markup carries data-* hooks (data-carousel,
 *      data-carousel-track, etc.) for attribute-selector styling.
 *   3. Embed `CAROUSEL_JS` once per page (inside an existing inline
 *      script tag, or via a `<script>` block). One listener handles
 *      every carousel on the page.
 *   4. For runtime swaps, stage the new slides + dots HTML via
 *      `renderSlides` / `renderDots`, then assign to the
 *      `data-carousel-track` and `data-carousel-dots` elements.
 *
 * Single-slide carousels render with the `.carousel__controls`
 * wrapper hidden via the `hidden` attribute — so a swap from
 * single→multi can flip the hidden flag instead of inserting
 * controls from JS.
 */

export interface CarouselSlide {
  /** Full slide markup. For images, the caller typically uses
   *  `pictureFromAssetId(asset)` so `<picture>` + avif/webp
   *  negotiation survives. */
  readonly html: string;
  /** Optional accessible label for the dot button + the slide. */
  readonly label?: string;
}

export interface RenderCarouselArgs {
  /** DOM id of the carousel root. Lets adopter scripts target a
   *  specific carousel by id when multiple are on the page. */
  readonly id: string;
  readonly slides: ReadonlyArray<CarouselSlide>;
  /** Accessible label for the whole carousel (the outer `<div
   *  role="region">`). Defaults to "Image carousel". */
  readonly ariaLabel?: string;
}

/**
 * Emit the full carousel markup. Safe to call with an empty slides
 * array — the rendered carousel is hidden via the outer `hidden`
 * attribute, matching the "no slides yet" state.
 */
export function renderCarousel(args: RenderCarouselArgs): string {
  const ariaLabel = escape(args.ariaLabel ?? "Image carousel");
  const hidden = args.slides.length === 0 ? " hidden" : "";
  const controlsHidden = args.slides.length <= 1 ? " hidden" : "";
  const slidesHtml = renderSlides(args.slides);
  const dotsHtml = renderDots(args.slides);
  return [
    `<div class="carousel" data-carousel id="${escape(args.id)}" role="region" aria-label="${ariaLabel}" aria-roledescription="carousel"${hidden}>`,
    `  <div class="carousel__track" data-carousel-track>${slidesHtml}</div>`,
    `  <div class="carousel__controls" data-carousel-controls${controlsHidden}>`,
    `    <button type="button" class="carousel__btn" data-carousel-prev aria-label="Previous slide">‹</button>`,
    `    <div class="carousel__dots" data-carousel-dots role="tablist">${dotsHtml}</div>`,
    `    <button type="button" class="carousel__btn" data-carousel-next aria-label="Next slide">›</button>`,
    `  </div>`,
    `</div>`,
  ].join("\n");
}

/**
 * Render the inner track HTML — one `<div class="carousel__slide">`
 * per slide. Slide 0 is active (`aria-current="true"`); the rest are
 * `aria-hidden="true"`. CSS owns the actual show/hide transition.
 */
export function renderSlides(slides: ReadonlyArray<CarouselSlide>): string {
  return slides
    .map((s, i) => {
      const active = i === 0 ? ' aria-current="true"' : ' aria-hidden="true"';
      return `<div class="carousel__slide" data-carousel-slide data-index="${i}"${active}>${s.html}</div>`;
    })
    .join("");
}

/**
 * Render the dot row — one `<button role="tab">` per slide, dot 0
 * gets `aria-current="true"`. Empty string when there's only one
 * slide (single-slide carousels skip the dot UI even if the
 * controls wrapper is still in the DOM).
 */
export function renderDots(slides: ReadonlyArray<CarouselSlide>): string {
  if (slides.length <= 1) return "";
  return slides
    .map((s, i) => {
      const active = i === 0 ? ' aria-current="true"' : "";
      const label = escape(s.label ?? `Slide ${i + 1}`);
      return `<button type="button" class="carousel__dot" data-carousel-dot data-index="${i}" role="tab" aria-label="${label}"${active}></button>`;
    })
    .join("");
}

/**
 * Inline script source. Embed once per page (inside an existing
 * `<script>` block or wrap in your own). One delegated click
 * handler binds at the document level and re-derives every
 * carousel's current index from `aria-current` on the active dot,
 * so any `innerHTML` rewrite of `data-carousel-track` /
 * `data-carousel-dots` is safe — no NodeList caching.
 *
 * `window.__bindCarousel` is exposed for adopter code that wants to
 * trigger a re-bind after dynamic injection, but is a no-op in the
 * delegated-handler model (kept for parity with the older
 * imperative API).
 */
export const CAROUSEL_JS = `(function () {
  if (window.__mantleCarouselBound) return;
  window.__mantleCarouselBound = true;
  function go(carousel, target) {
    var slides = carousel.querySelectorAll('[data-carousel-slide]');
    var dots = carousel.querySelectorAll('[data-carousel-dot]');
    if (slides.length === 0) return;
    var index = ((target % slides.length) + slides.length) % slides.length;
    slides.forEach(function (s, i) {
      if (i === index) {
        s.setAttribute('aria-current', 'true');
        s.removeAttribute('aria-hidden');
      } else {
        s.removeAttribute('aria-current');
        s.setAttribute('aria-hidden', 'true');
      }
    });
    dots.forEach(function (d, i) {
      if (i === index) d.setAttribute('aria-current', 'true');
      else d.removeAttribute('aria-current');
    });
  }
  function currentIndex(carousel) {
    var active = carousel.querySelector('[data-carousel-dot][aria-current="true"]');
    var raw = active ? active.getAttribute('data-index') : '0';
    var n = parseInt(raw || '0', 10);
    return Number.isFinite(n) ? n : 0;
  }
  document.addEventListener('click', function (ev) {
    var target = ev.target;
    if (!target || !target.closest) return;
    var carousel = target.closest('[data-carousel]');
    if (!carousel) return;
    var dot = target.closest('[data-carousel-dot]');
    if (dot) {
      var raw = dot.getAttribute('data-index') || '0';
      var i = parseInt(raw, 10);
      if (Number.isFinite(i)) go(carousel, i);
      return;
    }
    if (target.closest('[data-carousel-prev]')) {
      go(carousel, currentIndex(carousel) - 1);
      return;
    }
    if (target.closest('[data-carousel-next]')) {
      go(carousel, currentIndex(carousel) + 1);
      return;
    }
  });
  // Stub for adopter code that imported the older imperative API.
  // Re-binding is a no-op in the delegated model — the listener
  // above already covers carousels inserted at any time.
  window.__bindCarousel = function () {};
})();`;

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
