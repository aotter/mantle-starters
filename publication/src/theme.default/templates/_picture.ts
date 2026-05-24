import { pickPrimaryVariant, type MediaAsset } from "@aotter/mantle/runtime";

const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeAttr(s: string): string {
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
  assets: ReadonlyMap<string, MediaAsset> | undefined,
  loading: "eager" | "lazy" = "lazy",
): string {
  if (!assetId || !assets) return "";
  const asset = assets.get(assetId);
  return asset ? pictureTag(asset, alt, loading) : "";
}
