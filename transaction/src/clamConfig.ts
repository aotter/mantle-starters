import {
  AssetsAssetServer,
  D1DatabaseDriver,
  KvCacheBinding,
  R2MediaStorage,
  type Auth,
  type CmsConfig,
} from "@aotterclam/clam-cms-cloudflare";
import { AwsClient } from "aws4fetch";
import { buildHandlers } from "./handlers/index.js";
import { loadManifests } from "./loadManifests.js";
import { PUBLIC_PATH_RESOLVER } from "./paths.js";
import { buildTemplates } from "./theme.default/templates/index.js";

export interface Env {
  readonly DB: D1Database;
  readonly KV: KVNamespace;
  readonly ASSETS?: Fetcher;
  /** GitHub OAuth App client_id — provision at github.com/settings/developers. */
  readonly GITHUB_CLIENT_ID?: string;
  /** GitHub OAuth App client_secret. `wrangler secret put GITHUB_CLIENT_SECRET`. */
  readonly GITHUB_CLIENT_SECRET?: string;
  /** GitHub login that auto-promotes to `owner` on first sign-in (case-insensitive). */
  readonly ADMIN_GITHUB_LOGIN?: string;
  /** 32+ random bytes; `wrangler secret put BETTER_AUTH_SECRET`. */
  readonly BETTER_AUTH_SECRET: string;
  /** Deployed Worker origin (dev: `http://localhost:8787`). */
  readonly PUBLIC_ORIGIN?: string;
  /** Public — embedded in the contact form widget. wrangler.toml
   *  ships CF's "always passes" test key as the dev default. */
  readonly TURNSTILE_SITE_KEY?: string;
  /** Server-side — verifies the token client-side widget produces.
   *  `dev-stub` short-circuits; any other value triggers real
   *  siteverify (`wrangler secret put TURNSTILE_SECRET_KEY`). */
  readonly TURNSTILE_SECRET_KEY?: string;
  /** Local-dev live-render flag. `1` bypasses KV for post / postList
   *  / page routes — every request re-renders via the registered
   *  templates against the current D1 state. Don't set in production. */
  readonly CLAM_LOCAL_DEV?: string;
  /** Optional **public** R2 media bucket. When bound (in `wrangler.toml`'s
   *  `[[r2_buckets]] binding = "MEDIA"`), the runtime registers
   *  `create_media_upload` / `commit_media_upload` MCP tools and the
   *  `/admin/api/media/uploads` admin lifecycle. Reads bypass the
   *  Worker (`MEDIA_PUBLIC_URL_BASE` → CDN → R2). Leave unbound to
   *  keep first-run provisioning R2-free.
   *
   *  Private content (subscription-gated, fan-club, signed-GET) lands
   *  in v0.2 as a SEPARATE binding (`MEDIA_PRIVATE` or similar) wired
   *  to a separate `PrivateMediaStorage` port. Two buckets, two ports.
   *  See ADR-0011 § "Public vs private media — two buckets, two ports". */
  readonly MEDIA?: R2Bucket;
  /** Public read-base URL for media. `https://media.<domain>` for
   *  custom domain, or `https://pub-<hash>.r2.dev` for the dev-only
   *  fallback. Required when `MEDIA` is bound. */
  readonly MEDIA_PUBLIC_URL_BASE?: string;
  /** R2 S3 endpoint for THIS bucket. Format:
   *  `https://<bucket>.<account>.r2.cloudflarestorage.com`. Used as
   *  the host of presigned PUT URLs. Required when `MEDIA` is bound. */
  readonly MEDIA_S3_ENDPOINT?: string;
  /** R2 S3 access key id. Generate via R2 dashboard → Manage R2 API
   *  Tokens. `wrangler secret put MEDIA_S3_ACCESS_KEY_ID`. */
  readonly MEDIA_S3_ACCESS_KEY_ID?: string;
  /** R2 S3 secret access key. `wrangler secret put MEDIA_S3_SECRET_ACCESS_KEY`. */
  readonly MEDIA_S3_SECRET_ACCESS_KEY?: string;
  /** Opt-in flag for SVG uploads. Defaults off — object stores don't
   *  sanitize SVG payloads. */
  readonly MEDIA_ALLOW_SVG?: string;

  // ── Transaction starter bindings (declared in wrangler.toml) ──────

  /** Inventory + lock authority. One DO per tenant. See
   *  `src/durableObjects/InventoryActor.ts` for the contract. PR 2/3
   *  handlers + queue consumers route through this; PR 1 only declares
   *  the binding so wrangler can resolve the class at boot. */
  readonly INVENTORY_ACTOR: DurableObjectNamespace;

  /** Payment provider async callback queue. HTTP handler verifies
   *  provider signature then `queue.send`s the envelope; consumer
   *  (PR 2) does the actual work under the InventoryActor lock. */
  readonly PAYMENT_CALLBACK_QUEUE: Queue;

  /** Downstream-work queue. orders.after_create lifecycle producer +
   *  cron `inventory.reconcile.tick` producer + sweeper + email /
   *  notify consumer. */
  readonly ORDER_WORK_QUEUE: Queue;

  /** Test-only — when "1" (set by `[env.test.vars]` in wrangler.toml),
   *  the worker mounts FakeProvider AND the `/__test/restock` bypass
   *  used by the integration smoke. NEVER set in production. Reads as
   *  optional so the runtime type-checks cleanly when unset. */
  readonly FAKE_PAYMENT_PROVIDER?: string;
}

export function buildCmsConfig(env: Env, auth: Auth): CmsConfig {
  return {
    manifests: loadManifests(),
    handlers: buildHandlers(env),
    templates: buildTemplates(),
    siteDefaults: {
      brand: "Clam Transaction",
      title: "Clam Transaction",
      description: "Reference transaction starter for clam-cms — products + cart + checkout via configurable payment provider.",
      origin: "https://example.com",
      // `{{LOCALES}}` is substituted by @aotterclam/create-clam-cms at
      // install time (ADR-0016). Defensive parse: pre-substitution +
      // CI builds + contributor `pnpm dev` see the raw `{{LOCALES}}`
      // string which isn't valid JSON; fall back to `["en"]` so the
      // runtime boots and integration tests run. Post-substitution the
      // first branch returns the configured array.
      locales: parseLocales(),
    },
    publicPathResolver: PUBLIC_PATH_RESOLVER,
    bindings: {
      db: new D1DatabaseDriver(env.DB),
      kv: new KvCacheBinding(env.KV),
      assets: env.ASSETS
        ? new AssetsAssetServer(env.ASSETS)
        : { fetch: async () => null },
      ...buildMediaStorage(env),
    },
    mediaAllowSvg: env.MEDIA_ALLOW_SVG === "1",
    auth,
  };
}

/** Wire `R2MediaStorage` only when ALL the env requires are present.
 *  Partial config is a deployment error — fail loudly so the operator
 *  notices, rather than silently dropping the feature. */
function buildMediaStorage(env: Env): { mediaStorage?: R2MediaStorage } {
  if (!env.MEDIA) return {};
  const required = {
    MEDIA_PUBLIC_URL_BASE: env.MEDIA_PUBLIC_URL_BASE,
    MEDIA_S3_ENDPOINT: env.MEDIA_S3_ENDPOINT,
    MEDIA_S3_ACCESS_KEY_ID: env.MEDIA_S3_ACCESS_KEY_ID,
    MEDIA_S3_SECRET_ACCESS_KEY: env.MEDIA_S3_SECRET_ACCESS_KEY,
  };
  const missing = Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(
      `MEDIA bucket is bound but the following env vars are missing: ${missing.join(", ")}.`,
    );
  }
  const s3 = new AwsClient({
    accessKeyId: required.MEDIA_S3_ACCESS_KEY_ID!,
    secretAccessKey: required.MEDIA_S3_SECRET_ACCESS_KEY!,
    service: "s3",
    region: "auto",
  });
  return {
    mediaStorage: new R2MediaStorage(
      env.MEDIA,
      s3,
      required.MEDIA_S3_ENDPOINT!,
      required.MEDIA_PUBLIC_URL_BASE!,
    ),
  };
}

function parseLocales(): readonly string[] {
  const raw = "{{LOCALES}}";
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((s) => typeof s === "string")) {
      return parsed;
    }
  } catch {
    // pre-substitution / fixture / CI — fall through to default.
  }
  return ["en"];
}
