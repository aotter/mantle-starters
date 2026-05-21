/**
 * `<picture>` helper for rendering `MediaAsset.variants[]`.
 *
 * The agent-side optimizer (`@aotter/mantle-media-tools`) ships avif +
 * webp + jpeg per asset; this helper emits one `<source>` per
 * non-primary variant with `<img>` falling back to the
 * `role: "primary"` variant. Modern browsers pick the best format
 * they understand; the primary variant is the universal fallback.
 *
 * Two entry points:
 *   - `pictureTag(asset, alt)` — caller already has a resolved
 *     `MediaAsset`.
 *   - `pictureFromAssetId(assetId, alt, assets)` — caller has an
 *     asset id and a resolver map (typically the output of
 *     `runtime.media.resolveMany`). Returns `""` when the id doesn't
 *     resolve so the caller can decide on a placeholder.
 */

import { pickPrimaryVariant, type MediaAsset } from "@aotter/mantle/runtime";

const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeAttr(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPE_MAP[c] as string);
}

export function pictureTag(
  asset: MediaAsset,
  alt: string,
  loading: "eager" | "lazy" = "lazy",
): string {
  const primary = pickPrimaryVariant(asset);
  const sources = asset.variants
    .filter((v) => v.role !== "primary")
    .map(
      (v) =>
        `<source type="${escapeAttr(v.mimeType)}" srcset="${escapeAttr(v.publicUrl)}" />`,
    )
    .join("");
  return `<picture>${sources}<img src="${escapeAttr(primary.publicUrl)}" alt="${escapeAttr(alt)}" loading="${loading}" /></picture>`;
}

export function pictureFromAssetId(
  assetId: string | undefined,
  alt: string,
  assets: ReadonlyMap<string, MediaAsset>,
  loading: "eager" | "lazy" = "lazy",
): string {
  if (!assetId) return "";
  const asset = assets.get(assetId);
  if (!asset) return "";
  return pictureTag(asset, alt, loading);
}

/** Empty asset map — for callers that don't have one. */
export const EMPTY_ASSETS: ReadonlyMap<string, MediaAsset> = new Map();
