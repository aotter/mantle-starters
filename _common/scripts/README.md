# `_common/scripts/`

Scaffolded scripts that ride along with every archetype. Files here
are copied verbatim into the consumer project; they don't go through
the macro substitution pass.

## `mantle.mjs`

Mantle workflow helper — runs from the consumer project root. See the
file header for verbs.

## `migrate-media.mjs` — bulk-upload local seed assets to R2

Migrates a starter's local seed image directory to the deployed
Worker's R2 media store. Glues
`@aotter/mantle-media-tools` (sharp encoder + MCP staff upload client)
to a config-driven workflow with three resumable phases.

### When to use it

Two flows hit this regularly:

1. **Bootstrapping**: the starter ships placeholder image files under
   `mock-data/` (or wherever the config points). After
   first deploy, run this to upload them and capture the asset IDs
   for seed scripts.
2. **Backfilling**: an adopter migrating from a legacy site has a
   tree of product / page images on disk. Same flow.

For one-off uploads (a single product hero swap), reach for
`mantle-media-tools upload <file> --purpose <name>` directly; this
script is the multi-file batch tool.

### Install

`migrate-media.mjs` imports two opt-in dependencies. Install both in
the consumer project before running the encode/upload phases:

```sh
pnpm i -D sharp @aotter/mantle-media-tools
```

### Config file

```jsonc
// mantle/media-migration.config.json
{
  "sourceDir": "./mock-data/images",
  "outputState": "./mantle/.migration-state.json",
  "purposes": [
    {
      "name": "product-cover",
      "sourceSubdir": "products",
      "mimeAllowlist": ["image/jpeg", "image/png"]
    },
    {
      "name": "page-hero",
      "sourceSubdir": "pages",
      "mimeAllowlist": ["image/jpeg", "image/png", "image/webp"]
    }
  ]
}
```

- `sourceDir` — root the script scans.
- `purposes[].name` — must match a declared `media.purposes` policy
  on the Worker (`siteConfig.readMediaPurposes`).
- `purposes[].sourceSubdir` — subfolder under `sourceDir` that holds
  files for this purpose. Defaults to the purpose name.
- `purposes[].mimeAllowlist` — files whose extension maps to a mime
  outside this list are silently skipped.
- `outputState` — where the resumable plan + asset-id ledger lives.

### Run

```sh
# 1. Scan + write the plan (idempotent, --force overwrites)
node _common/scripts/migrate-media.mjs plan \
  --config mantle/media-migration.config.json

# 2. Pre-flight encode (no network — verifies sharp can decode every source)
node _common/scripts/migrate-media.mjs encode \
  --config mantle/media-migration.config.json

# 3. Drive create → PUT → commit against the Worker
export MANTLE_STAFF_BEARER=...   # staff MCP token; see below
node _common/scripts/migrate-media.mjs upload \
  --config mantle/media-migration.config.json \
  --base-url https://my-shop.example
```

- The staff bearer comes from env `MANTLE_STAFF_BEARER` (preferred —
  shell history and `ps` output won't carry it). `--bearer <token>`
  also works for ad-hoc runs but the script warns on stderr about the
  leak surface. Obtain the token via the Worker's `/admin` sign-in →
  MCP grant flow (or `pnpm fixture` for local dev).
- The state file is written after each successful row, so an
  interrupted run resumes at the next `--upload` invocation.

### Output: `.migration-state.json`

```jsonc
{
  "rows": [
    {
      "slug": "product-cover/widget-blue",
      "purpose": "product-cover",
      "source": "/abs/path/to/widget-blue.jpg",
      "mimeType": "image/jpeg",
      "uploadGroupId": "ug_…",
      "assetId": "media_…",
      "variants": [
        { "mimeType": "image/avif",  "role": "alternate", "publicUrl": "https://…", "byteSize": 12345 },
        { "mimeType": "image/webp",  "role": "alternate", "publicUrl": "https://…", "byteSize": 23456 },
        { "mimeType": "image/jpeg",  "role": "primary",   "publicUrl": "https://…", "byteSize": 45678 }
      ]
    }
  ]
}
```

Seed scripts join on `slug` (or `named:<slug>` if you prefix manually)
to swap `coverAssetId` from a placeholder string into the committed
`media_…` id.

### Out of scope

- **Non-image purposes**: encoder is `encodeTrio` (avif + webp + jpeg).
  Other media types are a future change.
- **Per-purpose `maxLongestEdge`**: the encoder uses its 1600 px
  default for every purpose. A future pass can plumb a config knob
  through if hero vs thumb start needing different caps.
- **S3 / GCS sources**: local FS only; #221 explicitly defers cloud
  sources to a follow-up.
- **Variant-role autodetection**: roles come from `encodeTrio`
  (jpeg = primary, avif/webp = alternate); the config does not
  override them.
