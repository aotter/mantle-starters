import { Hono } from "hono";
import {
  createAuth,
  createCmsRef,
  mountMcp,
  mountServerEndpoints,
  type Auth,
  type CreateAuthConfig,
} from "@aotter/mantle-cloudflare";
import { buildCmsConfig, type Env } from "./mantleConfig.js";

// Re-export DurableObject classes so Workers can resolve them by name
// from the `[[durable_objects.bindings]]` entries in wrangler.toml.
export { InventoryActor } from "./durableObjects/InventoryActor.js";

/**
 * Transaction starter worker entrypoint.
 *
 * Mounts: Better Auth /api/auth/*, server endpoints (manifest-declared
 * HTTP Triggers + view REST), and the dual MCP surfaces.
 *
 * Public HTML routes (product list, cart, checkout, order confirmation)
 * are NOT mounted in PR 1 — those land with templates in PR 4. For now
 * the customer-facing flow is the HTTP Trigger routes declared in
 * manifests/checkout.yaml (/api/cart/add, /api/checkout/start, etc.)
 * plus the public View REST at /api/views/products-public.
 *
 * Queue consumer + queue producer wiring: see end of file (`queue`).
 */
let appCache: Hono | null = null;

const AUTH_NOT_CONFIGURED = {
  error: "auth_not_configured",
  message:
    "BETTER_AUTH_SECRET is required. Run `wrangler secret put BETTER_AUTH_SECRET` and redeploy.",
} as const;

function buildAuthFromEnv(env: Env): Auth {
  const baseURL = env.PUBLIC_ORIGIN ?? "http://localhost:8787";
  const github: CreateAuthConfig["github"] =
    env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? {
          clientId: env.GITHUB_CLIENT_ID,
          clientSecret: env.GITHUB_CLIENT_SECRET,
        }
      : undefined;
  return createAuth({
    database: env.DB,
    baseURL,
    secret: env.BETTER_AUTH_SECRET,
    github,
    adminGithubLogin: env.ADMIN_GITHUB_LOGIN,
  });
}

function getApp(env: Env): Hono {
  if (appCache) return appCache;
  const auth = buildAuthFromEnv(env);
  const cms = createCmsRef(buildCmsConfig(env, auth));
  const app = new Hono();
  app.all("/api/auth/*", (c) => auth.handler(c.req.raw));
  mountServerEndpoints(app, cms);
  mountMcp(app, cms, {
    path: "/staff/mcp",
    surface: "staff",
    requiredScope: "mcp:staff",
  });
  mountMcp(app, cms, {
    path: "/mcp",
    surface: "public",
    requiredScope: "mcp:read",
  });
  appCache = app;
  return app;
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (!env.BETTER_AUTH_SECRET) {
      return Response.json(AUTH_NOT_CONFIGURED, { status: 503 });
    }
    return getApp(env).fetch(req, env, ctx);
  },

  /**
   * Queue consumer dispatcher. Routes by `batch.queue` (binding name):
   *
   *   - `payment_callback_queue` → paymentCallbackConsumer
   *     (verify-and-process payment provider async callbacks under
   *      the find-and-modify lock on InventoryActor)
   *   - `order_work_queue`       → orderWorkConsumer
   *     (downstream effects: email, fulfillment, snapshot, reconcile)
   *
   * Real consumer implementations land in PR 2 + PR 3; this file
   * just signals the shape to wrangler.toml.
   *
   * Scaffold behavior: `ackAll` (drop) rather than throw. The cron
   * trigger fires every 5min and would otherwise burn through the
   * default 3-retry budget before the DLQ-less queue silently drops
   * the batch anyway. ack-and-warn keeps PR 1 dev sessions quiet.
   */
  async queue(batch: MessageBatch<unknown>, _env: Env, _ctx: ExecutionContext): Promise<void> {
    console.warn(
      `[transaction PR 1 scaffold] queue '${batch.queue}' received ${batch.messages.length} message(s); ` +
        `consumer not implemented yet — acking to drop. Real consumer lands in PR 2/3.`,
    );
    batch.ackAll();
  },
};
