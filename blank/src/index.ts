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
import stylesCss from "../styles/generated.css";
import { renderHome } from "./home.js";
import { kiwaEnhanceAssets } from "./kiwaEnhanceAssets.js";
import { buildCmsConfig, type Env } from "./mantleConfig.js";
import {
  mantleOceanHeroDarkSvg,
  mantleOceanHeroLightSvg,
  mantleOceanHeroSvg,
} from "./mantleOceanHero.js";

/** Worker entrypoint: small public home plus Mantle API/MCP surfaces.
 *  Wire your own frontend to /api/views/* + /mcp/staff + /mcp + /api/auth/*. */
type WorkerFetch = (req: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;
let workerFetchCache: { readonly key: string; readonly fetch: WorkerFetch } | null = null;
const homeJs = [
  "import { collapsible } from '/enhance/collapsible.js';",
  "import { accordion } from '/enhance/accordion.js';",
  "collapsible();",
  "accordion();",
  "const THEME_KEY = 'mantle-theme';",
  "const readTheme = () => {",
  "  const stored = localStorage.getItem(THEME_KEY);",
  "  if (stored === 'light' || stored === 'dark') return stored;",
  "  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';",
  "};",
  "const applyTheme = (theme) => {",
  "  document.documentElement.classList.toggle('dark', theme === 'dark');",
  "  document.querySelectorAll('img[src*=\"/assets/mantle-ocean-hero-light.svg\"], img[src*=\"/assets/mantle-ocean-hero-dark.svg\"]').forEach((image) => {",
  "    const src = image.getAttribute('src') || '';",
  "    const nextSrc = theme === 'dark' ? src.replace('/assets/mantle-ocean-hero-light.svg', '/assets/mantle-ocean-hero-dark.svg') : src.replace('/assets/mantle-ocean-hero-dark.svg', '/assets/mantle-ocean-hero-light.svg');",
  "    if (nextSrc && image.getAttribute('src') !== nextSrc) image.setAttribute('src', nextSrc);",
  "  });",
  "  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {",
  "    button.dataset.theme = theme;",
  "    button.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');",
  "    button.querySelectorAll('[data-theme-label]').forEach((label) => {",
  "      label.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';",
  "    });",
  "  });",
  "};",
  "applyTheme(readTheme());",
  "window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {",
  "  if (!localStorage.getItem(THEME_KEY)) applyTheme(readTheme());",
  "});",
  "document.querySelectorAll('[data-theme-toggle]').forEach((button) => {",
  "  button.addEventListener('click', () => {",
  "    const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';",
  "    localStorage.setItem(THEME_KEY, next);",
  "    applyTheme(next);",
  "  });",
  "});",
  "const updateSiteNav = () => {",
  "  document.querySelectorAll('[data-site-nav]').forEach((nav) => {",
  "    nav.dataset.scrolled = window.scrollY > 8 ? 'true' : 'false';",
  "  });",
  "};",
  "updateSiteNav();",
  "window.addEventListener('scroll', updateSiteNav, { passive: true });",
  "document.querySelectorAll('[data-mobile-nav]').forEach((sheet) => {",
  "  const root = sheet.closest('nav');",
  "  const trigger = root?.querySelector('[data-mobile-nav-trigger]');",
  "  const panel = sheet.querySelector('[data-sheet-content]');",
  "  if (!trigger) return;",
  "  const setOpen = (open) => {",
  "    sheet.dataset.state = open ? 'open' : 'closed';",
  "    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');",
  "    document.body.style.overflow = open ? 'hidden' : '';",
  "    if (open) panel?.querySelector('a, button')?.focus();",
  "  };",
  "  trigger.addEventListener('click', () => setOpen(sheet.dataset.state !== 'open'));",
  "  sheet.querySelectorAll('[data-mobile-nav-close]').forEach((el) => {",
  "    el.addEventListener('click', () => setOpen(false));",
  "  });",
  "  document.addEventListener('keydown', (event) => {",
  "    if (event.key === 'Escape' && sheet.dataset.state === 'open') setOpen(false);",
  "  });",
  "});",
  "document.querySelectorAll('[data-mantle-form]').forEach((form) => {",
  "  form.addEventListener('submit', async (event) => {",
  "    event.preventDefault();",
  "    const status = form.querySelector('[data-mantle-form-status]');",
  "    const button = form.querySelector('button[type=\"submit\"]');",
  "    const turnstile = form.querySelector('.cf-turnstile');",
  "    const setStatus = (message, error) => {",
  "      if (!status) return;",
  "      status.hidden = false;",
  "      status.textContent = message;",
  "      if (error) status.dataset.error = 'true';",
  "      else delete status.dataset.error;",
  "    };",
  "    if (button) button.disabled = true;",
  "    setStatus('Sending message...', false);",
  "    try {",
  "      const body = Object.fromEntries(new FormData(form).entries());",
  "      const res = await fetch(form.action, {",
  "        method: form.method || 'POST',",
  "        headers: { 'content-type': 'application/json' },",
  "        body: JSON.stringify(body),",
  "      });",
  "      const payload = await res.json().catch(() => null);",
  "      if (!res.ok || payload?.ok === false) {",
  "        throw new Error(payload?.diagnostic?.message || 'Message could not be sent.');",
  "      }",
  "      form.reset();",
  "      setStatus('Message saved. The site owner can review it in Mantle.', false);",
  "    } catch (error) {",
  "      setStatus(error instanceof Error ? error.message : 'Message could not be sent.', true);",
  "    } finally {",
  "      if (turnstile && window.turnstile?.reset) window.turnstile.reset(turnstile);",
  "      if (button) button.disabled = false;",
  "    }",
  "  });",
  "});",
  "",
].join("\n");

const AUTH_NOT_CONFIGURED = {
  error: "setup_incomplete",
  message:
    "Admin auth is not configured yet. Finish the Mantle landing provider setup to set BETTER_AUTH_SECRET and GitHub OAuth credentials.",
} as const;
const ASSET_CACHE_CONTROL = "public, max-age=300";

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

  app.get("/assets/styles.css", () =>
    new Response(stylesCss, {
      headers: {
        "cache-control": ASSET_CACHE_CONTROL,
        "content-type": "text/css; charset=utf-8",
      },
    }),
  );
  app.get("/assets/kiwa-home.js", () =>
    new Response(homeJs, {
      headers: {
        "cache-control": ASSET_CACHE_CONTROL,
        "content-type": "text/javascript; charset=utf-8",
      },
    }),
  );
  app.get("/assets/mantle-ocean-hero.svg", () =>
    new Response(mantleOceanHeroSvg, {
      headers: {
        "cache-control": ASSET_CACHE_CONTROL,
        "content-type": "image/svg+xml; charset=utf-8",
      },
    }),
  );
  app.get("/assets/mantle-ocean-hero-light.svg", () =>
    new Response(mantleOceanHeroLightSvg, {
      headers: {
        "cache-control": ASSET_CACHE_CONTROL,
        "content-type": "image/svg+xml; charset=utf-8",
      },
    }),
  );
  app.get("/assets/mantle-ocean-hero-dark.svg", () =>
    new Response(mantleOceanHeroDarkSvg, {
      headers: {
        "cache-control": ASSET_CACHE_CONTROL,
        "content-type": "image/svg+xml; charset=utf-8",
      },
    }),
  );
  app.get("/enhance/:file", (c) => {
    const file = c.req.param("file");
    if (!/^[A-Za-z0-9._-]+\.js$/.test(file)) return c.notFound();
    const asset = kiwaEnhanceAssets[file];
    if (!asset) return c.notFound();
    return new Response(asset, {
      headers: {
        "cache-control": "public, max-age=31536000, immutable",
        "content-type": "text/javascript; charset=utf-8",
      },
    });
  });
  app.get("/", (c) => c.html(renderHome({ turnstileSiteKey: env.TURNSTILE_SITE_KEY })));

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
    env.TURNSTILE_SITE_KEY ?? "",
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
