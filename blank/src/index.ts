import { Hono } from "hono";
import {
  createAuth,
  createCmsRef,
  createMcpApiHandler,
  createOAuthProvider,
  mountAuthorize,
  mountServerEndpoints,
  type Auth,
  type CmsRuntimeRef,
} from "@aotterclam/clam-cms-cloudflare";
import { buildCmsConfig, type Env } from "./clamConfig.js";

type CachedProvider = ReturnType<typeof createOAuthProvider>;

/** Headless worker entrypoint — API + MCP only, no rendered UI.
 *  Wire your own frontend to /api/views/* + /mcp/staff + /mcp + /api/auth/*. */
let providerCache: CachedProvider | null = null;

const AUTH_NOT_CONFIGURED = {
  error: "auth_not_configured",
  message:
    "BETTER_AUTH_SECRET is required. Run `wrangler secret put BETTER_AUTH_SECRET` and redeploy.",
} as const;

function buildAuthFromEnv(env: Env): Auth {
  const baseURL = env.PUBLIC_ORIGIN ?? "http://localhost:8787";
  return createAuth({
    database: env.DB,
    baseURL,
    secret: env.BETTER_AUTH_SECRET,
    methods:
      env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
        ? [
            {
              kind: "social",
              provider: "github",
              clientId: env.GITHUB_CLIENT_ID,
              clientSecret: env.GITHUB_CLIENT_SECRET,
            },
          ]
        : [],
    bootstrapOwner: env.ADMIN_GITHUB_LOGIN
      ? { match: "github-login", value: env.ADMIN_GITHUB_LOGIN }
      : undefined,
  });
}

function buildApp(auth: Auth, cms: CmsRuntimeRef): Hono {
  const app = new Hono();
  app.all("/api/auth/*", (c) => auth.handler(c.req.raw));
  mountServerEndpoints(app, cms);
  mountAuthorize(app, { auth });
  return app;
}

function getProvider(env: Env): CachedProvider {
  if (providerCache) return providerCache;
  const auth = buildAuthFromEnv(env);
  const cms = createCmsRef(buildCmsConfig(env, auth));
  const app = buildApp(auth, cms);
  providerCache = createOAuthProvider({
    defaultHandler: { fetch: (req, e, ctx) => app.fetch(req, e, ctx) },
    apiHandlers: {
      "/mcp/staff": createMcpApiHandler({ ref: cms, surface: "staff" }),
      "/mcp": createMcpApiHandler({ ref: cms, surface: "public" }),
    },
  });
  return providerCache;
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (!env.BETTER_AUTH_SECRET) {
      return Response.json(AUTH_NOT_CONFIGURED, { status: 503 });
    }
    return getProvider(env).fetch(req, env, ctx);
  },
};
