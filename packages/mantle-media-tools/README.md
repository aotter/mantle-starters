# @aotter/mantle-media-tools

Agent-side helper for the [#272 multi-variant media upload flow](https://github.com/aotter/mantle/issues/272).

Takes a source image, produces avif/webp/jpeg variants via [sharp](https://sharp.pixelplumbing.com/), drives the `create_media_upload` → PUT-each-variant → `commit_media_upload` lifecycle against a deployed mantle worker's MCP staff transport, returns the committed `MediaAsset`.

**Distributed via `mantle-starters` GitHub releases, not npm.** Run via the release tarball URL:

```sh
npx https://github.com/aotter/mantle-starters/releases/download/v0.0.11-alpha.13/aotter-mantle-media-tools.tgz \
  upload \
  --file ./hero.jpg \
  --purpose post-cover \
  --endpoint https://my-blog.example \
  --bearer "$MCP_BEARER"
```

## Why agent-side?

Cloudflare workerd has no usable image-processing stack (no sharp / libvips). Rather than introduce a separate transform Worker or pay for Cloudflare Images, the optimization runs where the agent already lives — Claude Code, scaffolders, ops scripts, all of which can `import "sharp"`.

The Worker receives only already-optimized bytes; it enforces policy (required mime set, per-mime byte caps, suspicious-shape heuristic) but never transforms. See [ADR-0017](https://github.com/aotter/mantle/blob/develop/docs/adr/0017-media-multi-variant-agent-side-optimization.md).

## Why MCP transport, not the admin REST endpoint?

The worker exposes two media-upload entrypoints:

- `/mcp/staff` — OAuth-Provider + Better-Auth gated; accepts `Authorization: Bearer <token>`. Agent-friendly.
- `/admin/api/media/uploads` — Better-Auth **session-cookie** gated. Designed for the in-browser admin SPA.

A CLI / scaffolder / Claude Code session has a bearer, not a session cookie, so `mantle-media-tools` targets the MCP transport. The presigned R2 PUTs happen directly against the bucket (no Worker auth involved).

## CLI

```
mantle-media-tools upload \
  --file <path>           Source image (jpeg/png/etc — any sharp input)
  --purpose <slug>        Declared in siteDefaults.media.purposes
  --endpoint <origin>     Mantle Worker origin, e.g. https://my-blog.example
  --bearer <token>        OAuth token for /mcp/staff (admin grant)
  [--mcp-path <path>]     Override default `/mcp/staff` MCP route
  [--filename <name>]     Override basename(file) on the wire
  [--alt <text>] [--caption <text>]
  [--max-edge <px>]       Longest-edge cap; default 1600
```

Encodes the trio, uploads each variant directly to R2 (Worker bypassed for the PUT), commits the bundle via `/mcp/staff`, prints the committed `MediaAsset` JSON on stdout. Errors emit structured diagnostics on stderr (parseable by agent consumers).

## Library

```ts
import { encodeTrio, uploadVariants } from "@aotter/mantle-media-tools";

const variants = await encodeTrio(buffer, { maxLongestEdge: 1600 });

const { uploadGroupId, asset } = await uploadVariants({
  client: {
    baseUrl: "https://my-blog.example",
    bearer: process.env.MCP_BEARER!,
    // mcpPath defaults to "/mcp/staff"; override only for non-standard mounts.
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
- Each variant's encoded size must fit the per-purpose `maxBytes[mimeType]` declared in `siteDefaults.media.purposes`. The Worker rejects with `MEDIA_VARIANT_SIZE_EXCEEDED` *at create time* (before any presigned PUT is minted).
- Exactly one variant must carry `role: "primary"`; each `(mimeType, role)` pair must be unique. The Worker rejects with `MEDIA_VARIANTS_INCOMPLETE` otherwise.
- Source images are downscaled (never upscaled) to fit `--max-edge`.

## Distribution

The package is `"private": true`. Tarballs are built + attached as release assets to every `mantle-starters` tag via `.github/workflows/release.yml`. Two aliases per release:

- `aotter-mantle-media-tools-<version>.tgz` (versioned)
- `aotter-mantle-media-tools.tgz` (unversioned alias on the same release tag)
