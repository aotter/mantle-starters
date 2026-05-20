/**
 * `@aotter/mantle-media-tools` — agent-side helper for the #272
 * multi-variant media upload flow.
 *
 * Library entry: `encodeTrio` (avif/webp/jpeg via sharp) +
 * `uploadVariants` (drives the create → PUT → commit lifecycle
 * against a deployed mantle worker).
 *
 * CLI entry: `mantle-media-tools` (see `cli.ts`). Distributed via
 * mantle-starters' GitHub release tarball — `"private": true`, not
 * on npm.
 */
export { encodeTrio } from "./encode.js";
export type { EncodeOptions, EncodedVariant } from "./encode.js";

export { uploadVariants, MediaUploadError } from "./upload-client.js";
export type {
  UploadClientOptions,
  UploadResult,
  CommittedMediaAsset,
} from "./upload-client.js";
