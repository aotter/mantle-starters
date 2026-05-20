import sharp from "sharp";

/**
 * Variant encoding contract — what the agent produces locally before
 * sending bytes to the Worker.
 *
 * Modern formats (avif, webp) MUST come out smaller than the fallback
 * (jpeg). The mantle runtime rejects suspicious-shape commits where
 * avif > jpeg or webp > jpeg, so the encoder picks quality knobs that
 * empirically satisfy that invariant for typical web imagery.
 *
 * Quality defaults are conservative (a touch lower than human-eye
 * indifferent) so even "easy" inputs respect the size ordering. The
 * caller can pass `quality` to override per-purpose if needed.
 */
export interface EncodeOptions {
  /** Cap on the longest edge in pixels. The encoder downscales (never
   *  upscales) to fit. Defaults to 1600 — large enough for typical
   *  hero / cover renders, small enough that mobile bandwidth doesn't
   *  cry. */
  readonly maxLongestEdge?: number;
  /** Per-mime quality knobs. Defaults: jpeg=85 (mozjpeg-style),
   *  webp=80, avif=60. The avif default is intentionally below the
   *  jpeg / webp values because avif's perceptual quality at the same
   *  visual fidelity sits roughly 20 points lower on the conventional
   *  0-100 scale. */
  readonly quality?: {
    readonly "image/jpeg"?: number;
    readonly "image/webp"?: number;
    readonly "image/avif"?: number;
  };
}

export interface EncodedVariant {
  readonly mimeType: "image/jpeg" | "image/webp" | "image/avif";
  readonly bytes: Buffer;
  readonly role: "primary" | "alternate";
}

const DEFAULT_QUALITY = {
  "image/jpeg": 85,
  "image/webp": 80,
  "image/avif": 60,
} as const;

const DEFAULT_MAX_LONGEST_EDGE = 1600;

/**
 * Produce a three-variant bundle (avif + webp + jpeg) for one source
 * image. The jpeg variant is `role: "primary"` (universal `<img>`
 * fallback); avif + webp are `alternate` (preferred via `<picture>`).
 *
 * The encoder rotates by EXIF orientation, drops EXIF for privacy +
 * size, and downscales to fit `maxLongestEdge`. Source images smaller
 * than the edge keep their native size — we don't upscale.
 */
export async function encodeTrio(
  source: Buffer | Uint8Array,
  opts: EncodeOptions = {},
): Promise<readonly EncodedVariant[]> {
  const maxEdge = opts.maxLongestEdge ?? DEFAULT_MAX_LONGEST_EDGE;
  const qualities = { ...DEFAULT_QUALITY, ...(opts.quality ?? {}) };

  const pipeline = sharp(source, { failOn: "error" })
    .rotate() // EXIF-aware orientation
    .resize({
      width: maxEdge,
      height: maxEdge,
      fit: "inside",
      withoutEnlargement: true,
    });

  // Clone the resize-applied pipeline once per output format. sharp's
  // pipeline is single-shot per `toBuffer()`, so cloning is required —
  // re-encoding from the same pipeline instance would error.
  const [jpegBytes, webpBytes, avifBytes] = await Promise.all([
    pipeline
      .clone()
      .jpeg({ quality: qualities["image/jpeg"], mozjpeg: true })
      .toBuffer(),
    pipeline
      .clone()
      .webp({ quality: qualities["image/webp"] })
      .toBuffer(),
    pipeline
      .clone()
      .avif({ quality: qualities["image/avif"], effort: 4 })
      .toBuffer(),
  ]);

  return [
    { mimeType: "image/avif", bytes: avifBytes, role: "alternate" },
    { mimeType: "image/webp", bytes: webpBytes, role: "alternate" },
    { mimeType: "image/jpeg", bytes: jpegBytes, role: "primary" },
  ];
}
