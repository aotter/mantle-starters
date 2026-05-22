/**
 * `page-translations.blocks` renderer.
 *
 * Each block has a `type` discriminator (declared in `manifests/pages.yaml`)
 * driving one of five render functions: `hero`, `features`, `prose`,
 * `cta`, `media`. Unknown types render nothing — forward-compat with
 * future block types added to the manifest.
 *
 * Image fields resolve through `pictureFromAssetId`, so blocks with a
 * populated `*AssetId` emit `<picture>` with avif/webp/jpeg variants;
 * blocks without one render the surrounding section but no image.
 *
 * The CSS bundle below is intentionally neutral — generic typography
 * + spacing, color via CSS custom properties (`--ink`, `--surface`,
 * `--accent`, etc.) so an adopter can re-skin via a theme file
 * without touching the block markup. The `features` card variants
 * (`white / blue / teal / green`) ship sensible default colors;
 * override per brand under the matching class.
 *
 * Inlined once per page render — these pages are small and the styles
 * don't outlive a render.
 */

import { renderMarkdownSafe } from "./_markdown.js";
import { escapeAttr, pictureFromAssetId } from "./_picture.js";
import type { MediaAsset } from "@aotter/mantle/runtime";
import type { PageBlock, PageBlockCard } from "../handlers/_productEnrichment.js";

export function renderBlocks(
  blocks: ReadonlyArray<PageBlock>,
  assets: ReadonlyMap<string, MediaAsset>,
): string {
  return blocks.map((b) => renderBlock(b, assets)).join("");
}

function renderBlock(
  block: PageBlock,
  assets: ReadonlyMap<string, MediaAsset>,
): string {
  switch (block.type) {
    case "hero":
      return renderHero(block, assets);
    case "features":
      return renderFeatures(block, assets);
    case "prose":
      return renderProse(block);
    case "cta":
      return renderCta(block);
    case "media":
      return renderMedia(block, assets);
    default:
      return "";
  }
}

function renderHero(b: PageBlock, assets: ReadonlyMap<string, MediaAsset>): string {
  const eyebrow = b.eyebrow ? `<div class="block-hero-eyebrow">${escapeAttr(b.eyebrow)}</div>` : "";
  const headline = b.headline ? `<h1>${renderInlineBr(b.headline)}</h1>` : "";
  const paragraph = b.paragraph ? `<p>${escapeAttr(b.paragraph)}</p>` : "";
  const image = pictureFromAssetId(b.imageAssetId, b.imageAlt ?? "", assets, "eager");
  const imageBlock = image ? `<div class="block-hero-img">${image}</div>` : "";
  return `<section class="block-hero"><div class="block-hero-inner"><div>${eyebrow}${headline}${paragraph}</div>${imageBlock}</div></section>`;
}

function renderFeatures(b: PageBlock, assets: ReadonlyMap<string, MediaAsset>): string {
  const heading = b.heading ? `<h2 class="block-section-heading">${escapeAttr(b.heading)}</h2>` : "";
  const cards = (b.cards ?? []).map((c) => renderFeatureCard(c, assets)).join("");
  return `<section class="block-features">${heading}<div class="block-features-grid">${cards}</div></section>`;
}

function renderFeatureCard(c: PageBlockCard, assets: ReadonlyMap<string, MediaAsset>): string {
  const variant = c.variant ?? "white";
  const sideImage = pictureFromAssetId(
    c.sideImageAssetId,
    c.sideImageAlt ?? c.title ?? "",
    assets,
    "lazy",
  );
  const tag = c.tag ? `<div class="block-card-tag">${escapeAttr(c.tag)}</div>` : "";
  const title = c.title ? `<h3>${escapeAttr(c.title)}</h3>` : "";
  const body = c.body ? `<p>${escapeAttr(c.body)}</p>` : "";
  if (sideImage) {
    return `<div class="block-card block-card-${variant} block-card-with-img"><div class="block-card-text"><div>${title}${body}</div>${tag}</div><div class="block-card-side-img">${sideImage}</div></div>`;
  }
  return `<div class="block-card block-card-${variant}"><div>${title}${body}</div>${tag}</div>`;
}

function renderProse(b: PageBlock): string {
  if (!b.markdown) return "";
  const html = renderMarkdownSafe(b.markdown);
  return `<section class="block-prose"><div class="block-prose-body">${html}</div></section>`;
}

function renderCta(b: PageBlock): string {
  const heading = b.heading ? `<h2>${escapeAttr(b.heading)}</h2>` : "";
  const body = b.body ? `<p>${escapeAttr(b.body)}</p>` : "";
  const button =
    b.buttonLabel && b.buttonHref
      ? `<a class="block-cta-btn" href="${escapeAttr(b.buttonHref)}">${escapeAttr(b.buttonLabel)}</a>`
      : "";
  return `<section class="block-cta">${heading}${body}${button}</section>`;
}

function renderMedia(b: PageBlock, assets: ReadonlyMap<string, MediaAsset>): string {
  const eyebrow = b.sectionEyebrow
    ? `<p class="block-section-eyebrow">${escapeAttr(b.sectionEyebrow)}</p>`
    : "";
  const image = pictureFromAssetId(b.assetId, b.assetAlt ?? "", assets, "lazy");
  if (!image) return "";
  const caption = b.caption ? `<figcaption>${escapeAttr(b.caption)}</figcaption>` : "";
  return `<section class="block-media">${eyebrow}<figure>${image}${caption}</figure></section>`;
}

/** Escape attribute-unsafe chars but preserve a literal `<br>` /
 *  `<br/>` token in headlines so authors can break long display text.
 *  Only `<br>` survives — every other tag renders as text. */
function renderInlineBr(s: string): string {
  return escapeAttr(s).replace(/&lt;br\s*\/?&gt;/gi, "<br />");
}

/**
 * Neutral defaults — color via CSS custom properties so adopters
 * re-skin via a theme file without touching block markup. Override
 * any of these vars at `:root` or under a brand class.
 */
export const BLOCKS_CSS = `
  :root {
    --block-max-width: 1240px;
    --block-content-width: 720px;
    --block-ink: #1a1a1a;
    --block-ink-soft: #555;
    --block-muted: #888;
    --block-rule: rgba(0, 0, 0, 0.1);
    --block-surface: #fafafa;
    --block-accent: #2563eb;
    --block-accent-ink: #fff;
    --block-card-white-bg: #fff;
    --block-card-white-border: rgba(0, 0, 0, 0.1);
    --block-card-blue-bg: #dbeafe;
    --block-card-blue-tag: #1e40af;
    --block-card-teal-bg: #b5dedd;
    --block-card-teal-tag: #1a4f4e;
    --block-card-green-bg: #2d5a4a;
    --block-card-green-ink: #fff;
    --block-card-green-ink-soft: rgba(255, 255, 255, 0.8);
    --block-card-green-tag: rgba(255, 255, 255, 0.65);
  }

  /* ── Hero ── */
  .block-hero-inner {
    max-width: var(--block-max-width);
    margin: 0 auto;
    padding: 5rem 1.5rem 4rem;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4rem;
    align-items: center;
  }
  .block-hero-eyebrow {
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--block-accent);
    margin-bottom: 1.4rem;
  }
  .block-hero h1 {
    font-size: clamp(2.4rem, 4.5vw, 3.4rem);
    font-weight: 700;
    line-height: 1.18;
    color: var(--block-ink);
    margin: 0 0 1.4rem;
  }
  .block-hero p {
    color: var(--block-ink-soft);
    line-height: 1.8;
    margin: 0;
    max-width: 420px;
  }
  .block-hero-img { border-radius: 16px; overflow: hidden; aspect-ratio: 4/3; }
  .block-hero-img img,
  .block-hero-img picture,
  .block-hero-img picture img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  /* ── Features ── */
  .block-features {
    background: var(--block-surface);
    padding: 5rem 1.5rem;
  }
  .block-section-heading {
    text-align: center;
    font-size: clamp(1.5rem, 2.8vw, 2rem);
    font-weight: 700;
    color: var(--block-ink);
    margin: 0 auto 3rem;
    max-width: var(--block-max-width);
  }
  .block-features-grid {
    max-width: var(--block-max-width);
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 1.25rem;
  }
  .block-card:nth-child(4n+1) { grid-column: span 3; }
  .block-card:nth-child(4n+2) { grid-column: span 2; }
  .block-card:nth-child(4n+3) { grid-column: span 2; }
  .block-card:nth-child(4n)   { grid-column: span 3; }
  .block-card {
    border-radius: 16px;
    padding: 2rem 2.2rem;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-height: 260px;
    position: relative;
    overflow: hidden;
  }
  .block-card-white { background: var(--block-card-white-bg); border: 1px solid var(--block-card-white-border); }
  .block-card-blue  { background: var(--block-card-blue-bg); }
  .block-card-teal  { background: var(--block-card-teal-bg); }
  .block-card-green { background: var(--block-card-green-bg); color: var(--block-card-green-ink); }
  .block-card h3 {
    font-size: 1.2rem;
    font-weight: 700;
    line-height: 1.35;
    margin: 0 0 0.75rem;
    color: inherit;
  }
  .block-card p {
    font-size: 0.9rem;
    line-height: 1.75;
    color: var(--block-ink-soft);
    margin: 0;
    max-width: 320px;
  }
  .block-card-green p { color: var(--block-card-green-ink-soft); }
  .block-card-tag {
    margin-top: 1.4rem;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--block-accent);
  }
  .block-card-blue .block-card-tag  { color: var(--block-card-blue-tag); }
  .block-card-teal .block-card-tag  { color: var(--block-card-teal-tag); }
  .block-card-green .block-card-tag { color: var(--block-card-green-tag); }
  .block-card-with-img {
    display: block !important;
    position: relative;
    padding: 2rem 2.2rem 2rem 2.2rem !important;
    padding-right: 250px !important;
    min-height: 240px !important;
  }
  .block-card-with-img .block-card-text { display: flex; flex-direction: column; justify-content: space-between; height: 100%; }
  .block-card-side-img {
    position: absolute;
    right: 10px;
    top: 10px;
    bottom: 10px;
    width: 220px;
    border-radius: 10px;
    overflow: hidden;
  }
  .block-card-side-img img,
  .block-card-side-img picture,
  .block-card-side-img picture img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  /* ── Prose ── */
  .block-prose {
    max-width: var(--block-content-width);
    margin: 0 auto;
    padding: 2rem 1.5rem;
  }
  .block-prose-body {
    line-height: 1.85;
    color: var(--block-ink);
    font-size: 1rem;
  }
  .block-prose-body h2 {
    font-size: 1.4rem;
    margin: 2.6rem 0 0.8rem;
    padding-bottom: 0.45rem;
    border-bottom: 1px solid var(--block-rule);
  }
  .block-prose-body h3 { font-size: 1.08rem; margin: 1.8rem 0 0.4rem; }
  .block-prose-body p { margin: 0 0 1.05rem; }
  .block-prose-body ul, .block-prose-body ol { padding-left: 1.5rem; margin: 0 0 1.1rem; }
  .block-prose-body li { margin-bottom: 0.35rem; }
  .block-prose-body a { color: var(--block-accent); text-decoration: underline; text-underline-offset: 3px; }
  .block-prose-body blockquote {
    margin: 1.6rem 0;
    padding: 0.4rem 0 0.4rem 1.1rem;
    border-left: 3px solid var(--block-accent);
    color: var(--block-ink-soft);
  }
  .block-prose-body hr { border: 0; border-top: 1px solid var(--block-rule); margin: 2.4rem 0; }

  /* ── CTA ── */
  .block-cta {
    max-width: var(--block-content-width);
    margin: 0 auto;
    padding: 3rem 1.5rem;
    text-align: center;
  }
  .block-cta h2 {
    font-size: clamp(1.4rem, 2.4vw, 1.8rem);
    margin: 0 0 0.8rem;
  }
  .block-cta p {
    color: var(--block-ink-soft);
    line-height: 1.7;
    margin: 0 0 1.2rem;
  }
  .block-cta-btn {
    display: inline-block;
    padding: 0.75rem 1.6rem;
    border-radius: 999px;
    background: var(--block-accent);
    color: var(--block-accent-ink);
    font-weight: 600;
    text-decoration: none;
  }

  /* ── Media ── */
  .block-media {
    max-width: var(--block-max-width);
    margin: 0 auto;
    padding: 2rem 1.5rem;
  }
  .block-media figure { margin: 0; }
  .block-section-eyebrow {
    text-align: center;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--block-muted);
    margin-bottom: 0.6rem;
  }
  .block-media figcaption {
    text-align: center;
    font-size: 0.85rem;
    color: var(--block-muted);
    margin-top: 0.6rem;
  }

  /* ── Responsive ── */
  @media (max-width: 860px) {
    .block-hero-inner { grid-template-columns: 1fr; gap: 2rem; padding: 3rem 1.25rem 2.5rem; }
    .block-hero-img { aspect-ratio: 16/9; }
    .block-features-grid { grid-template-columns: 1fr; }
    .block-card { grid-column: span 1 !important; }
    .block-card-with-img {
      display: flex !important;
      flex-direction: column !important;
      padding: 1.5rem !important;
    }
    .block-card-with-img .block-card-text {
      justify-content: flex-start !important;
      gap: 0.75rem;
      height: auto !important;
    }
    .block-card-side-img {
      position: static !important;
      width: 100% !important;
      height: auto !important;
      aspect-ratio: 1 / 1;
      margin-top: 1rem;
      border-radius: 10px;
    }
  }
`;
