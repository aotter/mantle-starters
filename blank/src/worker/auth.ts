import {
  createAuth,
  type Auth,
  type AuthMethodConfig,
} from "@aotter/mantle/cloudflare";
import type { Env } from "../mantle/config.js";

const AUTH_NOT_CONFIGURED = {
  error: "setup_incomplete",
  message:
    "Admin auth is not configured yet. Finish the Mantle landing provider setup to set either platform hosted auth or self-hosted GitHub OAuth credentials.",
} as const;
const PLATFORM_AUTH_PROVIDER_ID = "mantle-platform";
const PLATFORM_AUTH_DISPLAY_NAME = "Mantle Platform";

export function buildAuthFromEnv(env: Env): Auth {
  if (!authSetupComplete(env)) return createSetupIncompleteAuth();
  const baseURL = env.PUBLIC_ORIGIN ?? "http://localhost:8787";
  const methods: AuthMethodConfig[] = [];
  const platformIssuer = normalizedPlatformIssuer(env);
  const hostedAuth = platformIssuer && env.MANTLE_PLATFORM_AUTH_CLIENT_ID
    ? { issuer: platformIssuer, clientId: env.MANTLE_PLATFORM_AUTH_CLIENT_ID }
    : null;
  if (hostedAuth) {
    methods.push({
      kind: "oauth",
      providerId: PLATFORM_AUTH_PROVIDER_ID,
      displayName: PLATFORM_AUTH_DISPLAY_NAME,
      clientId: hostedAuth.clientId,
      ...(env.MANTLE_PLATFORM_AUTH_CLIENT_SECRET
        ? { clientSecret: env.MANTLE_PLATFORM_AUTH_CLIENT_SECRET }
        : {}),
      discoveryUrl: `${hostedAuth.issuer}/.well-known/openid-configuration`,
      issuer: hostedAuth.issuer,
      requireIssuerValidation: true,
      scopes: ["openid", "profile", "email"],
      redirectURI: `${baseURL}/api/auth/oauth2/callback/${PLATFORM_AUTH_PROVIDER_ID}`,
      pkce: true,
    });
  } else if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
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
    bootstrapOwner: hostedAuth
      ? { match: "email", value: env.MANTLE_SITE_OWNER_EMAIL ?? "" }
      : env.ADMIN_GITHUB_LOGIN
        ? { match: "github-login", value: env.ADMIN_GITHUB_LOGIN }
        : undefined,
  });
}

export function authCacheKey(env: Env): string {
  return [
    env.PUBLIC_ORIGIN ?? "",
    env.BETTER_AUTH_SECRET ?? "",
    env.MANTLE_PLATFORM_AUTH_ISSUER ?? "",
    env.MANTLE_PLATFORM_AUTH_CLIENT_ID ?? "",
    env.MANTLE_PLATFORM_AUTH_CLIENT_SECRET ?? "",
    env.MANTLE_SITE_OWNER_EMAIL ?? "",
    env.GITHUB_CLIENT_ID ?? "",
    env.GITHUB_CLIENT_SECRET ?? "",
    env.ADMIN_GITHUB_LOGIN ?? "",
    env.TURNSTILE_SITE_KEY ?? "",
  ].join("\0");
}

export function authSetupComplete(env: Env): boolean {
  return (
    hostedAuthSetupComplete(env) ||
    Boolean(
      env.BETTER_AUTH_SECRET &&
        env.GITHUB_CLIENT_ID &&
        env.GITHUB_CLIENT_SECRET &&
        env.ADMIN_GITHUB_LOGIN,
    )
  );
}

function hostedAuthSetupComplete(env: Env): boolean {
  return Boolean(
    env.BETTER_AUTH_SECRET &&
      normalizedPlatformIssuer(env) &&
      env.MANTLE_PLATFORM_AUTH_CLIENT_ID &&
      env.MANTLE_SITE_OWNER_EMAIL,
  );
}

function normalizedPlatformIssuer(env: Env): string | null {
  const issuer = env.MANTLE_PLATFORM_AUTH_ISSUER?.trim();
  return issuer ? issuer.replace(/\/+$/, "") : null;
}

export function shouldBlockWhenAuthIncomplete(pathname: string): boolean {
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

export function setupIncompleteResponse(): Response {
  return Response.json(AUTH_NOT_CONFIGURED, {
    status: 503,
    headers: { "cache-control": "no-store" },
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
    registerOAuthClient: async () => {
      throw new Error(AUTH_NOT_CONFIGURED.message);
    },
  } as unknown as Auth;
}
