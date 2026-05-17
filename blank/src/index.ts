import { Hono } from "hono";
import {
  createAuth,
  createCmsRef,
  createMcpApiHandler,
  createOAuthProvider,
  mountAuthorize,
  mountServerEndpoints,
  type Auth,
  type AuthMethodConfig,
} from "@aotterclam/mantle/cloudflare";
import { buildCmsConfig, type Env } from "./clamConfig.js";

/** Headless worker entrypoint — API + MCP only, no rendered UI.
 *  Wire your own frontend to /api/views/* + /mcp/staff + /mcp + /api/auth/*. */
type WorkerFetch = (req: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;
let workerFetchCache: WorkerFetch | null = null;

const AUTH_NOT_CONFIGURED = {
  error: "auth_not_configured",
  message:
    "BETTER_AUTH_SECRET is required. Run `wrangler secret put BETTER_AUTH_SECRET` and redeploy.",
} as const;

function buildAuthFromEnv(env: Env): Auth {
  const baseURL = env.PUBLIC_ORIGIN ?? "http://localhost:8787";
  const methods: AuthMethodConfig[] = [];
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    methods.push({
      kind: "social",
      provider: "github",
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    });
  }
  return createAuth({
    database: env.DB,
    baseURL,
    secret: env.BETTER_AUTH_SECRET,
    methods,
    bootstrapOwner: env.ADMIN_GITHUB_LOGIN
      ? { match: "github-login", value: env.ADMIN_GITHUB_LOGIN }
      : undefined,
  });
}

function buildWorker(env: Env): WorkerFetch {
  if (workerFetchCache) return workerFetchCache;
  const auth = buildAuthFromEnv(env);
  const cms = createCmsRef(buildCmsConfig(env, auth));
  const app = new Hono();

  mountServerEndpoints(app, cms);
  mountAuthorize(app, { auth, loginPath: "/admin/sign-in" });

  // Headless friendly index. blank ships no UI on purpose, but a bare
  // `GET /` returning 404 looks broken on first visit during local
  // dev. Surface a tiny JSON sitemap pointing at what *is* mounted
  // so the operator can confirm the worker booted and find the next
  // URL to hit. Replace this route with your own frontend's `/` once
  // you start building.
  app.get("/", (c) =>
    c.json({
      starter: "blank",
      mounts: {
        viewsRest: "/api/views/<view-name>",
        mcpStaff: "/mcp/staff",
        mcpPublic: "/mcp",
        auth: "/api/auth/*",
      },
      note: "blank is headless — no HTML chrome ships. Wire your own frontend (Next.js / Astro / native) to the mounts above.",
    }),
  );

  const oauthProvider = createOAuthProvider({
    defaultHandler: {
      fetch: (req, env, ctx) => app.fetch(req, env, ctx),
    },
    apiHandlers: {
      "/mcp/staff": createMcpApiHandler({ ref: cms, surface: "staff" }),
      "/mcp": createMcpApiHandler({ ref: cms, surface: "public" }),
    },
    scopesSupported: ["mcp"],
  });

  workerFetchCache = (req, e, ctx) =>
    (oauthProvider.fetch as (r: unknown, e: unknown, c: unknown) => Promise<Response>)(
      req,
      e,
      ctx,
    );
  return workerFetchCache;
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (!env.BETTER_AUTH_SECRET) {
      return Response.json(AUTH_NOT_CONFIGURED, { status: 503 });
    }
    const worker = buildWorker(env);
    return worker(req, env, ctx);
  },
};
