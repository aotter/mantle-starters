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
} from "@aotter/mantle/cloudflare";
import { buildCmsConfig, type Env } from "./mantleConfig.js";

/** Headless worker entrypoint — API + MCP only, no rendered UI.
 *  Wire your own frontend to /api/views/* + /mcp/staff + /mcp + /api/auth/*. */
type WorkerFetch = (req: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;
let workerFetchCache: { readonly key: string; readonly fetch: WorkerFetch } | null = null;

const AUTH_NOT_CONFIGURED = {
  error: "setup_incomplete",
  message:
    "Admin auth is not configured yet. Finish the Mantle landing provider setup to set BETTER_AUTH_SECRET and GitHub OAuth credentials.",
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

  mountServerEndpoints(app, cms);
  mountAuthorize(app, { auth, loginPath: "/admin/sign-in" });

  app.get("/", (c) => c.html(renderHome()));

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

function renderHome(): string {
  const type = "{{ARCHETYPE}}";
  const view = homeViewFor(type);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{{BRAND}}</title>
    <style>
      :root {
        color: #18201f;
        background: #fbfaf7;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body { margin: 0; }
      main { max-width: 760px; padding: 56px 24px; }
      .eyebrow { margin: 0 0 10px; color: #235a55; font-size: 13px; font-weight: 700; text-transform: uppercase; }
      h1 { margin: 0 0 12px; font-size: 32px; line-height: 1.15; letter-spacing: 0; }
      p { max-width: 640px; color: #596462; line-height: 1.65; }
      ul { margin-top: 24px; padding-left: 20px; color: #596462; line-height: 1.7; }
      code { color: #235a55; }
    </style>
  </head>
  <body>
    <main>
      <p class="eyebrow">${escapeHtml(view.eyebrow)}</p>
      <h1>${escapeHtml(view.title)}</h1>
      <p>
        ${escapeHtml(view.body)}
      </p>
      <ul>
        <li>Primary view: <code>${escapeHtml(view.viewPath)}</code></li>
        <li>Staff MCP: <code>/mcp/staff</code></li>
        <li>Public MCP: <code>/mcp</code></li>
        <li>Launch handoff: <code>.mantle/handoff.md</code></li>
      </ul>
    </main>
  </body>
</html>`;
}

function homeViewFor(type: string): { eyebrow: string; title: string; body: string; viewPath: string } {
  const description = descriptionOrFallback("{{DESCRIPTION}}");
  switch (type) {
    case "publication":
      return {
        eyebrow: "Publication",
        title: "{{BRAND}} is ready to publish",
        body: description,
        viewPath: "/api/views/published-posts",
      };
    case "transaction":
      return {
        eyebrow: "Transaction",
        title: "{{BRAND}} is ready to show products",
        body: description,
        viewPath: "/api/views/public-products",
      };
    case "reservation":
      return {
        eyebrow: "Reservation",
        title: "{{BRAND}} is ready to collect requests",
        body: description,
        viewPath: "/api/views/recent-reservation-requests",
      };
    case "community":
      return {
        eyebrow: "Community",
        title: "{{BRAND}} is ready for updates",
        body: description,
        viewPath: "/api/views/public-community-updates",
      };
    default:
      return {
        eyebrow: "Mantle",
        title: "{{BRAND}} is live",
        body: description,
        viewPath: "/api/views/published-notes",
      };
  }
}

function descriptionOrFallback(value: string): string {
  return value.trim() || "A blank Mantle site is live and ready for the next overlay.";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
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
