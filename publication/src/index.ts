import { Hono } from "hono";
import type { Entry } from "@aotter/mantle/spec";
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
import { baseline } from "./themeWiring.js";

const { home: homeTemplate, notFound: notFoundTemplate } = baseline.templates;

type WorkerFetch = (req: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;
let workerFetchCache: { readonly key: string; readonly fetch: WorkerFetch } | null = null;

const AUTH_NOT_CONFIGURED = {
  error: "setup_incomplete",
  message:
    "Admin auth is not configured yet. Finish the post-deploy provisioning step to set BETTER_AUTH_SECRET and GitHub OAuth credentials.",
} as const;

function buildAuthFromEnv(env: Env): Auth {
  if (!authSetupComplete(env)) return createSetupIncompleteAuth();
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

function createSetupIncompleteAuth(): Auth {
  return {
    handler: async () => setupIncompleteResponse(),
    getSession: async () => null,
    getUserRole: async () => null,
    methods: [],
    listLinkedAccounts: async () => [],
    unlinkAccount: async () => false,
    listUsers: async () => [],
    setUserRole: async () => false,
    inviteUser: async () => {
      throw new Error(AUTH_NOT_CONFIGURED.message);
    },
    revokeInvite: async () => false,
  } as unknown as Auth;
}

function buildWorker(env: Env): WorkerFetch {
  const cacheKey = authCacheKey(env);
  if (workerFetchCache?.key === cacheKey) return workerFetchCache.fetch;
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
    slugOverrides: [...buildFeatureSlugOverrides(env)],
    liveDev: env.MANTLE_LOCAL_DEV === "1",
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

  const fetch: WorkerFetch = (req, e, ctx) =>
    (oauthProvider.fetch as (r: unknown, e: unknown, c: unknown) => Promise<Response>)(
      req,
      e,
      ctx,
    );
  workerFetchCache = { key: cacheKey, fetch };
  return fetch;
}

function authCacheKey(env: Env): string {
  return [
    env.PUBLIC_ORIGIN ?? "",
    env.BETTER_AUTH_SECRET ?? "",
    env.GITHUB_CLIENT_ID ?? "",
    env.GITHUB_CLIENT_SECRET ?? "",
    env.ADMIN_GITHUB_LOGIN ?? "",
  ].join("\0");
}

function authSetupComplete(env: Env): boolean {
  return Boolean(
    env.BETTER_AUTH_SECRET &&
      env.GITHUB_CLIENT_ID &&
      env.GITHUB_CLIENT_SECRET &&
      env.ADMIN_GITHUB_LOGIN,
  );
}

function blocksWhenAuthIsIncomplete(pathname: string): boolean {
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/authorize" ||
    pathname === "/token" ||
    pathname === "/register" ||
    pathname.startsWith("/.well-known/oauth") ||
    pathname.startsWith("/api/auth") ||
    pathname === "/mcp/staff" ||
    pathname.startsWith("/mcp/staff/")
  );
}

function setupIncompleteResponse(): Response {
  return Response.json(AUTH_NOT_CONFIGURED, {
    status: 503,
    headers: { "cache-control": "no-store" },
  });
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
    const url = new URL(req.url);
    if (!authSetupComplete(env) && blocksWhenAuthIsIncomplete(url.pathname)) {
      return setupIncompleteResponse();
    }
    const worker = buildWorker(env);
    return worker(req, env, ctx);
  },
};
