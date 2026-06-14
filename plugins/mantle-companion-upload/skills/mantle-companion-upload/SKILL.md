---
name: mantle-companion-upload
description: Upload local or chat-provided image files into a Mantle site through the companion plugin. Use when an operator asks to add an image/file to a Mantle entry and the file is available locally or as a host-provided attachment path.
---

# Mantle Companion Upload

Use this skill when an operator wants to upload a chat image, generated
image, screenshot, or local image file into a deployed Mantle site.

## Contract

- First supported host: Claude Code.
- Do not pass large binary data or base64 through MCP tool arguments.
- Use Mantle's normal upload lifecycle:
  `create_media_upload` -> signed upload URLs -> direct PUT -> `commit_media_upload`.
- The upload purpose must already exist in the site's
  `siteDefaults.media.purposes`; never invent purpose strings.
- The returned `asset.id` is the value to put into `*AssetId` fields
  and `x-mantle-ref: media_assets` references.

## Before Uploading

1. Confirm the file is available as a local path. If the host exposed a
   chat attachment as a file, use that path directly.
2. Identify the upload purpose from the target field or the site's docs.
   Common starter examples:
   - `post-cover`
   - `page-hero`
   - `product-cover`
   - `product-image`
3. Confirm the Mantle Worker origin. Prefer `MANTLE_WORKER_ORIGIN` or
   the tool argument `workerOrigin`; otherwise ask for it.
4. Confirm Staff MCP authorization. Prefer `MANTLE_STAFF_BEARER` or
   the tool argument `staffBearer`; otherwise ask for a fresh Staff MCP
   bearer from the site owner/operator.

## Upload

Call the bundled MCP tool:

```text
upload_mantle_image_from_file
```

Provide:

- `filePath`
- `purpose`
- optional `alt`
- optional `caption`
- optional `workerOrigin` and `staffBearer` only when environment
  variables are missing or intentionally overridden

The tool shells out to the released `aotter-mantle-media-tools` helper.
That helper creates AVIF/WebP/JPEG variants, asks the Mantle Worker for
signed upload URLs, uploads each variant directly to storage, and commits
the asset over Staff MCP.

## After Upload

Report:

- `asset.id`
- primary preview URL
- purpose used
- where the operator should paste/reference the asset next

If the upload fails with a Mantle diagnostic:

- `MEDIA_PURPOSE_REJECTED`: use an existing purpose or ask the coding
  agent to add a new purpose to `src/mantleConfig.ts`.
- `MEDIA_VARIANTS_INCOMPLETE`: the helper/runtime variant policies do
  not match; stop and ask for a coding-agent fix.
- `MEDIA_VARIANT_SIZE_EXCEEDED`: retry with smaller `maxEdge`, or ask
  the coding agent to adjust the media policy.

Do not retry by embedding the file in a normal MCP tool call.
