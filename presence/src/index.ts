import { Hono } from "hono";
import {
  createAuth,
  createCmsRef,
  createMcpApiHandler,
  createOAuthProvider,
  mountAuthorize,
  mountPublicRoutes,
  mountServerEndpoints,
  type Auth,
  type AuthMethodConfig,
  type PublicRouteContext,
} from "@aotter/mantle/cloudflare";
import { buildCmsConfig, type Env } from "./mantleConfig.js";
import { buildFeatureSlugOverrides } from "./.mantle/generated.routes.js";
import {
  homeTemplate,
  notFoundTemplate,
} from "./theme.default/templates/index.js";

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
  mountPublicRoutes(app, cms, {
    collectionRoutes: [
      { collection: "page-translations", segment: "pages", homeSlug: "home" },
    ],
    homeRenderer: renderHome,
    notFoundRenderer: renderNotFound,
    slugOverrides: [...buildFeatureSlugOverrides(env)],
    liveDev: env.MANTLE_LOCAL_DEV === "1",
  });

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

async function renderHome(ctx: PublicRouteContext): Promise<Response> {
  const { runtime, site, locale } = ctx;
  const pages = await runtime.listEntries.execute({
    collection: "page-translations",
    status: "published",
    limit: 50,
  });
  const homeEntry = pages.find(
    (e) =>
      (e.data as { slug?: string }).slug === "home" &&
      (e.data as { locale?: string }).locale === locale,
  );
  if (!homeEntry) return renderNotFound(ctx);

  const data = homeEntry.data as { title?: string; intro?: string; body?: string };
  const html = homeTemplate({
    site,
    locale,
    home: {
      title: data.title ?? site.brand ?? "Home",
      intro: data.intro,
      body: data.body ?? "",
    },
  });
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=60, s-maxage=60",
    },
  });
}

async function renderNotFound(ctx: PublicRouteContext): Promise<Response> {
  const { site, locale } = ctx;
  const html = notFoundTemplate({ site, locale: locale || site.canonicalLocale || "en" });
  return new Response(html, {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
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
