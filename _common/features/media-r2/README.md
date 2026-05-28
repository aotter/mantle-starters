# `media-r2` feature overlay

Opt-in R2-backed media hosting for any starter that wants
first-party uploaded images (cover art, gallery slides, page
hero). The mantle SDK already ships the upload lifecycle (presigned
PUT, commit→D1 ledger via `MediaAssetRepository`, MCP tools,
`mantle-media-tools` companion CLI). This feature handles the
operator-side opt-in flow so you don't have to fight Cloudflare's
dashboard from memory.

## First-run R2-free by design

Selecting this feature at scaffold time writes **only local files**
— `wrangler.toml` stanza, env templates, scripts, this README. It
never makes a Cloudflare API call, never creates a bucket, never
prompts billing. R2 is a paid resource and the install path has to
stay billing-free.

When you're ready to open billing, run the explicit opt-in script:

```sh
pnpm media-r2:provision
# or directly:
node scripts/media-r2-provision.mjs
```

## What the scaffolder ships

| Path in scaffolded project | Origin | Notes |
|---|---|---|
| `scripts/media-r2-provision.mjs` | feature source | Interactive R2 provisioning flow (run when ready) |
| `wrangler.toml` `[[r2_buckets]] binding = "MEDIA"` | composed in | Merged via the scaffolder's wrangler composer |
| `.dev.vars.example` entries | composed in | Documents `MEDIA_PUBLIC_URL_BASE` / `MEDIA_S3_ENDPOINT` (plain) + `MEDIA_S3_ACCESS_KEY_ID` / `MEDIA_S3_SECRET_ACCESS_KEY` (secrets) |
| `scripts/.mantle-provision.mjs` | scaffolder | Includes an install step that prints "run media-r2:provision when ready" |

## What the provision script does

The script drives the parts wrangler CAN automate; pauses with
clear dashboard links for the parts it can't. In order:

1. **Billing confirmation** — explicit yes/no gate. Aborts cleanly
   if billing isn't ready.
2. **`wrangler r2 bucket create mantle-media`** + `mantle-media-preview`.
   Idempotent — re-running detects existing buckets and skips.
3. **`wrangler r2 bucket cors put`** — minimal CORS that allows
   browser / admin PUTs against the presigned URLs the Worker
   mints. AllowedOrigins is `*` because presigned URLs already
   carry per-request signature auth.
4. **Prompts for the public read URL.** Two paths:
   - **Custom domain (recommended for production)** — attach in
     the CF dashboard at `R2 → <bucket> → Settings → Custom domains`.
     The script prints the dashboard URL.
   - **`pub-<hash>.r2.dev`** — acceptable for alpha / dev. Enable
     public access at the same settings page and copy the assigned
     URL.
5. **Prompts for the R2 S3 API token** — created at
   `Cloudflare dashboard → R2 → Manage R2 API Tokens` with
   object-write scope on the MEDIA bucket. The script prints the
   URL. The Access Key ID prompt echoes normally; the Secret Access
   Key prompt has terminal echo OFF so the secret doesn't sit in
   scroll history. Secrets go through `wrangler secret put`; the
   public values (`MEDIA_PUBLIC_URL_BASE`, `MEDIA_S3_ENDPOINT`) are
   printed as `[vars]` lines for the operator to paste.

### Planned (not in v1)

- **End-of-flow smoke test**: deploy worker, run
  `create_media_upload → PUT → commit → fetch publicUrl`, assert
  200. v1 prints next-step instructions instead so the operator
  verifies manually.
- **Auto-edit of `wrangler.toml [vars]`**: v1 prints the lines for
  the operator to paste (avoids a destructive merge against unsaved
  local edits). A future pass can attempt a non-destructive patch
  with a confirmation diff.
- **Non-TTY (CI) flow**: the secret prompt falls back to plain
  echo'd input when stdin isn't a TTY (pipe / CI). Piped invocations
  should pre-set env vars and skip the interactive path — a
  `--from-env` flag is on the roadmap.

## Variables this feature declares

Set via `.dev.vars` for local dev; production goes through
`wrangler.toml [vars]` (the non-secrets) + `wrangler secret put`
(the secrets):

| Name | Kind | Purpose |
|---|---|---|
| `MEDIA_PUBLIC_URL_BASE` | var | Public read URL the bucket is served from |
| `MEDIA_S3_ENDPOINT` | var | `https://<account-id>.r2.cloudflarestorage.com` |
| `MEDIA_S3_ACCESS_KEY_ID` | secret | R2 S3 token access-key ID |
| `MEDIA_S3_SECRET_ACCESS_KEY` | secret | R2 S3 token secret-access-key |

## What's NOT in scope

- **First-party private media** — separate `MEDIA_PRIVATE` binding
  + signed-GET; future feature.
- **Image variants / transforms** — handled agent-side via
  `@aotter/mantle-media-tools` (`encodeTrio`).
- **Orphan sweep** — uncommitted-upload cleanup is tracked
  separately ([aotter/mantle#254](https://github.com/aotter/mantle/issues/254)).
- **Admin upload widget** — the React widget for media-hinted
  fields is [aotter/mantle#253](https://github.com/aotter/mantle/issues/253);
  this feature gets the storage online, that one builds the UI on top.

## When to NOT install this feature

- You only need digital-goods checkout (no images).
- You use an external CDN / image host (Cloudinary, Imgix) and
  reference URLs directly in CMS fields.
- You're prototyping and don't want to open CF billing yet — leave
  this off, scaffold without it; you can `create-mantle update --add
  media-r2` later.

## Compose schemaVersion

`_compose/glue.json` declares `"schemaVersion": 2` (uses the `env`
and `provision` compose targets). Older scaffolders that only
support v1 hard-fail with "scaffolder upgrade required" rather
than silently dropping the install steps.
