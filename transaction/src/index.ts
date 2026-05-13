import { Hono } from "hono";
import {
  createAuth,
  createCmsRef,
  mountMcp,
  mountServerEndpoints,
  type Auth,
  type CmsRuntimeRef,
  type CreateAuthConfig,
} from "@aotterclam/clam-cms-cloudflare";
import { buildCmsConfig, type Env } from "./clamConfig.js";
import { invokeHandler } from "./handlers/_context.js";
import { buildQueueDispatcher, sendOrderWork } from "./handlers/orderConsumer.js";
import { buildReadOrderStatus } from "./handlers/readOrderStatus.js";
import { buildCheckoutReturn } from "./handlers/checkoutReturn.js";
import { getInventoryActor } from "./durableObjects/InventoryActor.js";

// Re-export DurableObject classes so Workers can resolve them by name
// from the `[[durable_objects.bindings]]` entries in wrangler.toml.
export { InventoryActor } from "./durableObjects/InventoryActor.js";

/**
 * Transaction starter worker entrypoint.
 *
 * Mounts: Better Auth `/api/auth/*`, manifest-declared HTTP Triggers
 * + view REST (via `mountServerEndpoints`), dual MCP (`/staff/mcp` +
 * `/mcp`), plus two custom GET routes for the customer's payment-
 * return + order-status poll (v0.1 Triggers can't express GET; the
 * routes call into the `checkoutReturn` / `readOrderStatus`
 * Procedures via the runtime — same code path MCP / POST-Trigger
 * dispatch uses).
 *
 * Queue consumer: routes `payment_callback_queue` +
 * `order_work_queue` (both `max_concurrency: 1`) to the dispatcher
 * in `src/handlers/orderConsumer.ts`.
 */
let appCache: { app: Hono; cms: CmsRuntimeRef } | null = null;

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

function getApp(env: Env): { app: Hono; cms: CmsRuntimeRef } {
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

  // Build the GET-route handlers once at app boot; they close over
  // env + runtime. The shared handler functions also live in the
  // `handlers/index.ts` registry — same code reachable through MCP
  // and POST Triggers. The duplication here is just to expose them
  // via GET, which v0.1's Trigger.source.method enum doesn't cover.
  const readOrderStatus = buildReadOrderStatus();
  const checkoutReturn = buildCheckoutReturn(env);

  app.get("/api/order/status", async (c) => {
    const orderId = c.req.query("orderId") ?? "";
    if (!orderId) return c.json({ error: "missing orderId" }, 400);
    try {
      const runtime = await cms.get();
      const result = await invokeHandler<{ orderId: string }, unknown>(
        readOrderStatus,
        { orderId },
        { runtime },
      );
      return c.json(result as Record<string, unknown>);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  app.get("/api/payment/return", async (c) => {
    try {
      const runtime = await cms.get();
      const result = await invokeHandler<{ requestUrl: string }, unknown>(
        checkoutReturn,
        { requestUrl: c.req.url },
        { runtime },
      );
      return c.json(result as Record<string, unknown>);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  // Test-only bypass: seed InventoryActor stock without going through
  // the staff-gated `/staff/api/restock` (which needs a real session
  // cookie). Gated on the SAME flag that gates FakeProvider, so this
  // is impossible to hit in production unless an operator explicitly
  // sets FAKE_PAYMENT_PROVIDER=1 (which would also disable real
  // payments). Anyone copying this starter and removing the gate is
  // making the same mistake as removing the gate on FakeProvider —
  // not subtle. See test/integration/smoke.ts for the only caller.
  if (env.FAKE_PAYMENT_PROVIDER === "1") {
    app.post("/__test/restock", async (c) => {
      const body = (await c.req.json()) as {
        productSlug?: string;
        addQty?: number;
      };
      if (!body.productSlug || !body.addQty || body.addQty < 1) {
        return c.json({ error: "missing productSlug / addQty" }, 400);
      }
      const inv = getInventoryActor(env);
      await inv.restock(body.productSlug, body.addQty);
      return c.json({ ok: true });
    });
  }

  appCache = { app, cms };
  return appCache;
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (!env.BETTER_AUTH_SECRET) {
      return Response.json(AUTH_NOT_CONFIGURED, { status: 503 });
    }
    return getApp(env).app.fetch(req, env, ctx);
  },

  async queue(
    batch: MessageBatch<unknown>,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    if (!env.BETTER_AUTH_SECRET) {
      console.warn(
        `[transaction queue] env not ready (no BETTER_AUTH_SECRET); acking batch '${batch.queue}'`,
      );
      batch.ackAll();
      return;
    }
    const dispatch = buildQueueDispatcher(env);
    return dispatch(batch, env, ctx);
  },

  /**
   * Cron handler — fires per `wrangler.toml [triggers].crons` (every
   * 5 minutes). Enqueues `inventory.reconcile.tick`; the real work
   * (sweep stale locks + re-snapshot tracked products) runs in the
   * queue consumer so it inherits the queue's retry + serialization.
   */
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    if (!env.BETTER_AUTH_SECRET) {
      console.warn(
        `[transaction scheduled] env not ready (no BETTER_AUTH_SECRET); skipping tick`,
      );
      return;
    }
    ctx.waitUntil(
      sendOrderWork(env.ORDER_WORK_QUEUE, {
        type: "inventory.reconcile.tick",
        at: Date.now(),
      }),
    );
  },
};
