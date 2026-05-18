import { Hono } from "hono";
import type { Entry } from "@aotterclam/mantle/spec";
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
} from "@aotterclam/mantle/cloudflare";
import { buildCmsConfig, type Env } from "./clamConfig.js";
import {
  contactTemplate,
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

  // mountServerEndpoints owns the whole /api/auth/* surface (specific
  // /api/auth/methods + Better Auth catch-all); consumers no longer
  // wire the catch-all by hand.
  mountServerEndpoints(app, cms);

  // /authorize consent UI — the only OAuth endpoint that lives on
  // defaultHandler (Hono). /token, /register, /.well-known/oauth-*
  // are intercepted by the OAuthProvider directly. The lib injects
  // OAUTH_PROVIDER onto env before calling this route.
  mountAuthorize(app, { auth, loginPath: "/admin/sign-in" });

  mountPublicRoutes(app, cms, {
    collectionRoutes: [
      { collection: "post-translations", segment: "posts", listRoute: true },
      { collection: "page-translations", segment: "pages", homeSlug: "home" },
    ],
    homeRenderer: renderHome,
    notFoundRenderer: renderNotFound,
    slugOverrides: [
      {
        collection: "page-translations",
        slug: "contact",
        render: (ctx) => renderContact(ctx, env),
      },
    ],
    liveDev: env.CLAM_LOCAL_DEV === "1",
  });

  // Top-level OAuthProvider — gets every request first. Intercepts
  // /token, /register, /.well-known/oauth-* internally; routes
  // /mcp/staff + /mcp through apiHandlers AFTER verifying bearer
  // tokens; forwards everything else to the Hono app via
  // defaultHandler. The lib injects OAUTH_PROVIDER onto env so
  // /authorize on Hono can read it.
  const oauthProvider = createOAuthProvider({
    defaultHandler: {
      fetch: (req, env, ctx) => app.fetch(req, env, ctx),
    },
    apiHandlers: {
      // Order matters: longer prefix first so /mcp/staff matches
      // before /mcp's shorter prefix.
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
  const [pages, recent] = await Promise.all([
    runtime.listEntries.execute({
      collection: "page-translations",
      status: "published",
      limit: 50,
    }),
    runtime.listEntries.execute({
      collection: "post-translations",
      status: "published",
      limit: 5,
    }),
  ]);
  const homeEntry = pages.rows.find(
    (e) =>
      (e.data as { slug?: string }).slug === "home" &&
      (e.data as { locale?: string }).locale === locale,
  );
  if (!homeEntry) return renderNotFound(ctx);

  const recentForLocale: Entry[] = recent.rows.filter(
    (e) => (e.data as { locale?: string }).locale === locale,
  );

  const data = homeEntry.data as { title?: string; intro?: string; body?: string };
  const html = homeTemplate({
    site,
    locale,
    home: {
      title: data.title ?? site.brand ?? "Home",
      intro: data.intro,
      body: data.body ?? "",
    },
    recentPosts: recentForLocale,
  });
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=60, s-maxage=60",
    },
  });
}

async function renderContact(ctx: PublicRouteContext, env: Env): Promise<Response> {
  const { runtime, site, locale } = ctx;
  const all = await runtime.listEntries.execute({
    collection: "page-translations",
    status: "published",
    limit: 50,
  });
  const entry = all.rows.find(
    (e) =>
      (e.data as { slug?: string }).slug === "contact" &&
      (e.data as { locale?: string }).locale === locale,
  );
  const data = (entry?.data ?? {}) as { title?: string; intro?: string; body?: string };
  const html = contactTemplate({
    site,
    locale,
    page: {
      title: data.title ?? "",
      intro: data.intro,
      body: data.body ?? "",
    },
    turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? "1x00000000000000000000AA",
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
