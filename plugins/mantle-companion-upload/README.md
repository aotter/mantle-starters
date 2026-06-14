# Mantle Companion Upload

Claude Code plugin for operator-side media uploads into a deployed
Mantle site.

This is the first host-specific bridge for the operator MCP connect
flow tracked in:

- `aotter/mantle#324`
- `aotter/mantle-starters#276`

## Install

Open the operator setup URL printed by Mantle provisioning, or add this
repository as a Claude Code plugin marketplace and install the plugin:

```text
/plugin marketplace add aotter/mantle-starters
/plugin install mantle-companion-upload@mantle-starters
```

When uploading, provide these values through environment variables or
tool arguments:

- `MANTLE_WORKER_ORIGIN`: deployed site origin, for example
  `https://my-site.example`.
- `MANTLE_STAFF_BEARER`: OAuth bearer for
  `<MANTLE_WORKER_ORIGIN>/mcp/staff`.

The bearer may also be provided per upload as `staffBearer`. The
plugin never sends large image bytes as base64 in MCP tool arguments.
The MCP tool carries only file references and metadata, then the
companion process drives Mantle's normal upload lifecycle:

```text
create_media_upload -> signed R2 PUT URLs -> commit_media_upload
```

## First Supported Host

This plugin targets Claude Code first. Other chat hosts may expose
attachments differently; keep those integrations separate until their
attachment APIs are explicit.

## Tool

The plugin exposes `upload_mantle_image_from_file` through its bundled
MCP server. It accepts a local file path, purpose, optional alt/caption,
and optional worker/token overrides.

For image purposes that require AVIF/WebP/JPEG variants, the tool shells
out to the released `aotter-mantle-media-tools.tgz` helper. The first
release expected to support bearer auth through `MANTLE_STAFF_BEARER`
without `--bearer` argv is `v0.0.11-alpha.20`. That helper uses `sharp`,
asks the Mantle backend for an upload session, uploads optimized bytes
directly to the signed URLs, then commits the asset.

## Pairing Model

For the current alpha, pairing is explicit:

1. Provisioning prints an operator setup URL.
2. The operator opens that URL and connects the Staff MCP URL.
3. The operator installs this plugin from the Mantle marketplace.
4. The operator supplies the Worker origin and Staff MCP bearer through
   environment variables or the upload tool call.

Future connect pages can deep-link into host-specific install flows,
but this plugin already keeps binary transport out of MCP arguments.
