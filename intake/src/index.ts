import { Hono } from "hono";
import type { Entry } from "@aotterclam/clam-cms-spec";
import {
  createAuth,
  createCmsRef,
  createMcpApiHandler,
  createOAuthProvider,
  mountAuthorize,
  mountPublicRoutes,
  mountServerEndpoints,
  type Auth,
  type CmsRuntimeRef,
  type PublicRouteContext,
} from "@aotterclam/clam-cms-cloudflare";
import { buildCmsConfig, type Env } from "./clamConfig.js";

type CachedProvider = ReturnType<typeof createOAuthProvider>;
import {
  contactTemplate,
  homeTemplate,
  notFoundTemplate,
} from "./theme.default/templates/index.js";

// Cache the assembled OAuthProvider per-isolate. The library injects
// `env.OAUTH_PROVIDER` inside `provider.fetch(req, env, ctx)` before
// dispatching, so wrapping it in `{ fetch }` is safe — the consent
// handler still picks up the helper. We delay assembly until the
// first request because `createCmsRef` + `buildAuthFromEnv` both
// need env bindings that aren't available at module init.
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
              // Keeps the existing GitHub OAuth App's registered callback
              // URL working; delete with the translator route once the App
              // config moves to /api/auth/callback/github.
              redirectURI: `${baseURL}/admin/auth/github/callback`,
            },
          ]
        : [],
    bootstrapOwner: env.ADMIN_GITHUB_LOGIN
      ? { match: "github-login", value: env.ADMIN_GITHUB_LOGIN }
      : undefined,
  });
}

function buildApp(env: Env, auth: Auth, cms: CmsRuntimeRef): Hono {
  const app = new Hono();

  app.all("/api/auth/*", (c) => auth.handler(c.req.raw));
  app.get("/admin/auth/github/callback", (c) => {
    const url = new URL(c.req.url);
    url.pathname = "/api/auth/callback/github";
    return auth.handler(
      new Request(url.toString(), { method: "GET", headers: c.req.raw.headers }),
    );
  });

  mountServerEndpoints(app, cms);
  // `/oauth/authorize` consent gate. Verifies the visitor has a
  // Better Auth session (staff role check happens inside each MCP
  // apiHandler, not here — keeps consent UI uniform across surfaces).
  mountAuthorize(app, { auth });
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

  return app;
}

function getProvider(env: Env): CachedProvider {
  if (providerCache) return providerCache;
  const auth = buildAuthFromEnv(env);
  const cms = createCmsRef(buildCmsConfig(env, auth));
  const app = buildApp(env, auth, cms);
  providerCache = createOAuthProvider({
    defaultHandler: { fetch: (req, e, ctx) => app.fetch(req, e, ctx) },
    apiHandlers: {
      "/mcp/staff": createMcpApiHandler({ ref: cms, surface: "staff" }),
      "/mcp": createMcpApiHandler({ ref: cms, surface: "public" }),
    },
  });
  return providerCache;
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
  const homeEntry = pages.find(
    (e) =>
      (e.data as { slug?: string }).slug === "home" &&
      (e.data as { locale?: string }).locale === locale,
  );
  if (!homeEntry) return renderNotFound(ctx);

  const recentForLocale: Entry[] = recent.filter(
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
  const entry = all.find(
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
    return getProvider(env).fetch(req, env, ctx);
  },
};
