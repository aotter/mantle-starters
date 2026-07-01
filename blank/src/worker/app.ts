import { Hono } from "hono";
import {
  createCmsRef,
  createMcpApiHandler,
  createOAuthProvider,
  mountAuthorize,
  mountServerEndpoints,
} from "@aotter/mantle/cloudflare";
import { buildCmsConfig, type Env } from "../mantle/config.js";
import { authCacheKey, buildAuthFromEnv } from "./auth.js";
import { createAssetsRoutes, createEnhanceRoutes } from "./routes/assets.js";
import { createHomeRoutes } from "./routes/home.js";

/** Worker entrypoint: public home plus Mantle API/MCP surfaces. */
type WorkerFetch = (req: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;
let workerFetchCache: { readonly key: string; readonly fetch: WorkerFetch } | null = null;

export function createWorkerFetch(env: Env): WorkerFetch {
  const cacheKey = authCacheKey(env);
  if (workerFetchCache?.key === cacheKey) return workerFetchCache.fetch;

  const auth = buildAuthFromEnv(env);
  const cms = createCmsRef(buildCmsConfig(env, auth));
  const app = new Hono();

  mountServerEndpoints(app, cms);
  mountAuthorize(app, { auth, loginPath: "/admin/sign-in" });
  app.route("/", createHomeRoutes(env));
  app.route("/assets", createAssetsRoutes());
  app.route("/enhance", createEnhanceRoutes());

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

  const fetch: WorkerFetch = (req, e, ctx) =>
    (oauthProvider.fetch as (r: unknown, e: unknown, c: unknown) => Promise<Response>)(
      req,
      e,
      ctx,
    );
  workerFetchCache = { key: cacheKey, fetch };
  return fetch;
}
