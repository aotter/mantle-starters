# @aotter/mantle-media-tools

Agent-side helper for the [#272 multi-variant media upload flow](https://github.com/aotter/mantle/issues/272).

Takes a source image, produces avif/webp/jpeg variants via [sharp](https://sharp.pixelplumbing.com/), drives the `create_media_upload` → PUT-each-variant → `commit_media_upload` lifecycle against a deployed mantle worker, returns the committed `MediaAsset`.

**Distributed via `mantle-starters` GitHub releases, not npm.** Run via the release tarball URL:

```sh
npx https://github.com/aotter/mantle-starters/releases/download/v0.0.11-alpha.13/aotter-mantle-media-tools.tgz \
  upload \
  --file ./hero.jpg \
  --purpose post-cover \
  --endpoint https://my-blog.example \
  --bearer "$ADMIN_BEARER"
```

## Why agent-side?

Cloudflare workerd has no usable image-processing stack (no sharp / libvips). Rather than introduce a separate transform Worker or pay for Cloudflare Images, the optimization runs where the agent already lives — Claude Code, scaffolders, ops scripts, the admin SPA's local helper, all of which can `import "sharp"`.

The Worker receives only already-optimized bytes; it enforces policy (required mime set, per-mime byte caps, suspicious-shape heuristic) but never transforms. See [ADR-0017](https://github.com/aotter/mantle/blob/develop/docs/adr/0017-media-multi-variant-agent-side-optimization.md).

## CLI

```
mantle-media-tools upload \
  --file <path>           Source image (jpeg/png/etc — any sharp input)
  --purpose <slug>        Declared in siteDefaults.media.purposes
  --endpoint <origin>     Mantle Worker origin, e.g. https://my-blog.example
  [--bearer <token> | --cookie <name=value>]   Admin auth (exactly one)
  [--filename <name>]     Override basename(file) on the wire
  [--alt <text>] [--caption <text>]
  [--max-edge <px>]       Longest-edge cap; default 1600
```

Encodes the trio, uploads each variant directly to R2 (Worker bypassed), commits the bundle, prints the committed `MediaAsset` JSON on stdout. Errors emit structured diagnostics on stderr (parseable by agent consumers).

## Library

```ts
import { encodeTrio, uploadVariants } from "@aotter/mantle-media-tools";

const variants = await encodeTrio(buffer, { maxLongestEdge: 1600 });

const { uploadGroupId, asset } = await uploadVariants({
  client: {
    baseUrl: "https://my-blog.example",
    auth: { kind: "bearer", value: process.env.ADMIN_BEARER! },
  },
  purpose: "post-cover",
  filename: "hero.jpg",
  variants,
  alt: "Sunset over the bay",
});

// `asset.id` is the MediaAsset.id consumers write into `coverAssetId`
// entry fields (x-mantle-ref: media_assets).
```

## Constraints

- Modern formats (avif, webp) must come out smaller than the jpeg fallback. The encoder picks quality defaults (avif=60, webp=80, jpeg=85) that empirically satisfy this for typical web imagery; if your inputs are unusual (line art, screenshots) the runtime will reject the upload with `MEDIA_VARIANTS_SUSPICIOUS_SIZE` and you'll need to tune quality.
- Each variant's encoded size must fit the per-purpose `maxBytes[mimeType]` declared in `siteDefaults.media.purposes`. The Worker rejects with `MEDIA_VARIANT_SIZE_EXCEEDED` otherwise.
- Source images are downscaled (never upscaled) to fit `--max-edge`.

## Distribution

The package is `"private": true`. Tarballs are built + attached as release assets to every `mantle-starters` tag via `.github/workflows/release.yml`. Two aliases per release:

- `aotter-mantle-media-tools-<version>.tgz` (versioned)
- `aotter-mantle-media-tools.tgz` (latest)
