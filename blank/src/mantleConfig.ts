import {
  AssetsAssetServer,
  D1DatabaseDriver,
  KvCacheBinding,
  type Auth,
  type CmsConfig,
} from "@aotter/mantle/cloudflare";
import { buildHandlers } from "./handlers/index.js";
import { loadManifests } from "./loadManifests.js";

export interface Env {
  readonly DB: D1Database;
  readonly KV: KVNamespace;
  /** OAuth grant store for `@cloudflare/workers-oauth-provider` —
   *  client registrations + grants + tokens. Required by the
   *  top-level OAuthProvider that wraps the Worker; both /mcp/staff
   *  and /mcp use this namespace for OAuth state. The top-level
   *  wrangler.toml binding intentionally omits an id so Cloudflare can
   *  auto-provision it during the first deploy. */
  readonly OAUTH_KV: KVNamespace;
  readonly ASSETS?: Fetcher;
  readonly GITHUB_CLIENT_ID?: string;
  readonly GITHUB_CLIENT_SECRET?: string;
  readonly ADMIN_GITHUB_LOGIN?: string;
  readonly BETTER_AUTH_SECRET: string;
  readonly PUBLIC_ORIGIN?: string;
}

export function buildCmsConfig(env: Env, auth: Auth): CmsConfig {
  return {
    manifests: loadManifests(),
    handlers: buildHandlers(),
    siteDefaults: {
      brand: "{{BRAND}}",
      title: "{{BRAND}}",
      description: "{{DESCRIPTION}}",
      origin: "https://example.com",
      // `{{LOCALES}}` is substituted by Mantle landing during provision.
      // JSON.parse keeps this file TS-valid pre-substitution
      // so contributors can `pnpm typecheck` the starter directly; the runtime
      // cost is one tiny parse at worker cold-start.
      locales: JSON.parse('{{LOCALES}}') as readonly string[],
    },
    bindings: {
      db: new D1DatabaseDriver(env.DB),
      kv: new KvCacheBinding(env.KV),
      assets: env.ASSETS
        ? new AssetsAssetServer(env.ASSETS)
        : { fetch: async () => null },
    },
    auth,
  };
}
