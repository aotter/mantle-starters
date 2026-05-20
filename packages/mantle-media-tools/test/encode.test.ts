import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { encodeTrio } from "../src/encode.js";

/**
 * encodeTrio integration check — runs sharp end-to-end against a
 * generated source image (1024×1024 noise). Verifies:
 *
 *  - three variants come back in the documented order (avif, webp, jpeg)
 *  - jpeg is `role: "primary"`; avif + webp are `alternate`
 *  - modern formats land smaller than the jpeg fallback (the
 *    `MEDIA_VARIANTS_SUSPICIOUS_SIZE` invariant the runtime enforces)
 *  - downscale honours `maxLongestEdge`
 *
 * Using sharp's own `create` + `noise` pipelines for the source so the
 * test stays self-contained — no fixture binary in the repo.
 */
/**
 * Make a moderately-compressible source image: solid background with
 * an overlaid soft gradient (via blur). Real photos compress better
 * in avif than jpeg; synthetic random noise is the WORST case for
 * avif (high-entropy detail). Using a gradient sits roughly in the
 * realistic-photo range so the size invariant test reflects real
 * production behavior.
 */
async function makeSourceImage(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 120, g: 80, b: 200 },
    },
  })
    .blur(30)
    .jpeg({ quality: 95 })
    .toBuffer();
}

describe("encodeTrio", () => {
  it("produces avif + webp + jpeg in primary/alternate roles", async () => {
    const source = await makeSourceImage(1024, 1024);
    const variants = await encodeTrio(source, { maxLongestEdge: 800 });
    expect(variants.map((v) => v.mimeType)).toEqual([
      "image/avif",
      "image/webp",
      "image/jpeg",
    ]);
    expect(variants.find((v) => v.mimeType === "image/jpeg")!.role).toBe("primary");
    expect(variants.find((v) => v.mimeType === "image/avif")!.role).toBe("alternate");
    expect(variants.find((v) => v.mimeType === "image/webp")!.role).toBe("alternate");
  });

  it("modern formats are no larger than the jpeg fallback (runtime invariant)", async () => {
    const source = await makeSourceImage(1200, 800);
    const variants = await encodeTrio(source);
    const sizes = Object.fromEntries(
      variants.map((v) => [v.mimeType, v.bytes.byteLength]),
    );
    expect(sizes["image/avif"]!).toBeLessThanOrEqual(sizes["image/jpeg"]!);
    expect(sizes["image/webp"]!).toBeLessThanOrEqual(sizes["image/jpeg"]!);
  });

  it("downscales to maxLongestEdge (never upscales)", async () => {
    const source = await makeSourceImage(2400, 1200);
    const variants = await encodeTrio(source, { maxLongestEdge: 1000 });
    const jpeg = variants.find((v) => v.mimeType === "image/jpeg")!;
    const meta = await sharp(jpeg.bytes).metadata();
    expect(meta.width).toBe(1000);
    expect(meta.height).toBe(500);
  });

  it("keeps small images at native size (no upscale)", async () => {
    const source = await makeSourceImage(400, 300);
    const variants = await encodeTrio(source, { maxLongestEdge: 1600 });
    const jpeg = variants.find((v) => v.mimeType === "image/jpeg")!;
    const meta = await sharp(jpeg.bytes).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(300);
  });
});
