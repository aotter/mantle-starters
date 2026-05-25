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
  type CmsRuntimeRef,
} from "@aotter/mantle/cloudflare";
import { buildCmsConfig, type Env } from "./mantleConfig.js";
import { csrfGuard } from "./csrf.js";
import { invokeHandler } from "./handlers/_context.js";
import { buildQueueDispatcher, sendOrderWork } from "./handlers/orderConsumer.js";
import { loadProductCatalog, loadPage } from "./handlers/_productEnrichment.js";
import { buildReadOrderStatus } from "./handlers/readOrderStatus.js";
import { buildReadCart } from "./handlers/readCart.js";
import { buildCheckoutReturn } from "./handlers/checkoutReturn.js";
import { enqueueDevCallback } from "./payment/devCallbackShim.js";
import { restockSkuCore } from "./handlers/restockSku.js";
import { renderProductList } from "./templates/productList.js";
import { renderProductDetail } from "./templates/productDetail.js";
import { renderPage } from "./templates/page.js";
import { renderCart } from "./templates/cart.js";
import { renderCheckout } from "./templates/checkout.js";
import { renderOrderStatus } from "./templates/orderStatus.js";

// Re-export DurableObject classes so Workers can resolve them by name
// from the `[[durable_objects.bindings]]` entries in wrangler.toml.
export { InventoryActor } from "./durableObjects/InventoryActor.js";

/**
 * Transaction starter worker entrypoint.
 *
 * Mounts: Better Auth `/api/auth/*` (owned by mountServerEndpoints),
 * manifest-declared HTTP Triggers + view REST (also via
 * `mountServerEndpoints`), `mountAuthorize` consent UI on Hono, and
 * the top-level OAuthProvider that wraps it all and exposes the dual
 * MCP surfaces (`/mcp/staff` + `/mcp`) as bearer-verified
 * `apiHandlers`. Plus two custom GET routes for the customer's
 * payment-return + order-status poll (v0.1 Triggers can't express
 * GET; the routes call into the `checkoutReturn` / `readOrderStatus`
 * Procedures via the runtime — same code path MCP / POST-Trigger
 * dispatch uses).
 *
 * Queue consumer: routes `payment-callback-queue` +
 * `order-work-queue` (both `max_concurrency: 1`) to the dispatcher
 * in `src/handlers/orderConsumer.ts`.
 */
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
  const cms: CmsRuntimeRef = createCmsRef(buildCmsConfig(env, auth));
  const app = new Hono();

  // CSRF gate on browser-origin POSTs. Mounted BEFORE
  // mountServerEndpoints so the middleware fires before the manifest-
  // declared handlers. Provider webhook (/api/payment/callback) is
  // intentionally NOT gated — it's signed via the provider's own
  // scheme and is cross-origin by design. See src/csrf.ts for the
  // gating rationale.
  app.use("/api/cart/add", csrfGuard);
  app.use("/api/checkout/start", csrfGuard);
  app.use("/api/staff/restock", csrfGuard);

  mountServerEndpoints(app, cms);
  mountAuthorize(app, { auth, loginPath: "/admin/sign-in" });

  // Build the GET-route handlers once at app boot; they close over
  // env + runtime. The shared handler functions also live in the
  // `handlers/index.ts` registry — same code reachable through MCP
  // and POST Triggers. The duplication here is just to expose them
  // via GET, which v0.1's Trigger.source.method enum doesn't cover.
  const readOrderStatus = buildReadOrderStatus();
  const readCart = buildReadCart(env);
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

  // Provider return — the customer's browser lands here after the
  // provider redirects them post-payment. checkoutReturn verifies any
  // provider-signed query params (mandatory for merchant-form
  // providers like ECPay / PayUni; trust-the-webhook for hosted
  // checkout). On success, 302 to /order/:orderId so the customer
  // sees the receipt. If the provider's return params are bad we
  // still redirect — the order page polls /api/order/status and
  // surfaces whatever state actually persisted.
  app.get("/api/payment/return", async (c) => {
    try {
      const runtime = await cms.get();
      const result = (await invokeHandler<{ requestUrl: string }, unknown>(
        checkoutReturn,
        { requestUrl: c.req.url },
        { runtime },
      )) as { orderId?: string };
      const orderId = result.orderId ?? c.req.query("orderId") ?? "";
      if (!orderId) {
        return c.text("missing orderId after return", 400);
      }
      // Local-dev only: synthesize the success callback the merchant-
      // form provider would have POSTed to a publicly-reachable URL
      // (which localhost isn't). Hard-gated on MANTLE_LOCAL_DEV inside
      // the helper; production calls return without touching the
      // queue. See payment/devCallbackShim.ts.
      const shim = await enqueueDevCallback(c.env as Env, orderId);
      if (!shim.enqueued && shim.reason && shim.reason !== "MANTLE_LOCAL_DEV !== \"1\"") {
        // Surface dev-only failures (queue.send threw, etc.) so the
        // dev doesn't silently get a 302 to /order/:id while the
        // consumer never runs. Production case (the gate short-
        // circuited) is the expected silent path and stays quiet.
        console.warn(`[devCallbackShim] not enqueued for ${orderId}: ${shim.reason}`);
      }
      return c.redirect(`/order/${encodeURIComponent(orderId)}`, 302);
    } catch (err) {
      // Failed signature verification or transient error. Still try
      // to land the customer on a useful page rather than a JSON 500.
      const orderId = c.req.query("orderId") ?? "";
      if (orderId) {
        return c.redirect(`/order/${encodeURIComponent(orderId)}`, 302);
      }
      const msg = err instanceof Error ? err.message : String(err);
      return c.text(`payment return error: ${msg}`, 500);
    }
  });

  app.get("/api/cart/get", async (c) => {
    const cartId = c.req.query("cartId") ?? "";
    if (!cartId) return c.json({ error: "missing cartId" }, 400);
    try {
      const runtime = await cms.get();
      const result = (await invokeHandler<{ cartId: string }, unknown>(
        readCart,
        { cartId },
        { runtime },
      )) as { exists?: boolean };
      // 404 on missing cart so the client can branch without parsing.
      if (result.exists === false) {
        return c.json(result as Record<string, unknown>, 404);
      }
      return c.json(result as Record<string, unknown>);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  // ── Public storefront HTML routes ────────────────────────────────
  // Reference templates. Adopters typically replace these with their
  // own branded pages; the URL contract (paths + query strings) is
  // what the API layer assumes, not the HTML shape.

  app.get("/", async (c) => {
    try {
      const runtime = await cms.get();
      const [catalog, site] = await Promise.all([
        loadProductCatalog(runtime),
        runtime.siteConfig.load(),
      ]);
      return c.html(
        renderProductList({
          products: catalog.rows.map((r) => ({
            slug: r.slug,
            title: r.title,
            coverAssetId: r.coverAssetId,
            coverAlt: r.coverAlt,
            minPriceMinor: r.minPriceMinor,
            currency: r.currency,
            skuCount: r.skus.length,
            shortDescription: r.shortDescription,
          })),
          assets: catalog.assets,
          site,
        }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.text(`error: ${msg}`, 500);
    }
  });

  app.get("/product/:slug", async (c) => {
    const slug = c.req.param("slug");
    try {
      const runtime = await cms.get();
      const [catalog, site] = await Promise.all([
        loadProductCatalog(runtime),
        runtime.siteConfig.load(),
      ]);
      const product = catalog.bySlug.get(slug);
      if (!product) return c.text("not found", 404);
      return c.html(renderProductDetail({ product, assets: catalog.assets, site }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.text(`error: ${msg}`, 500);
    }
  });

  // Generic page route — slug drives the lookup directly into the
  // `page-translations` collection. The renderer prefers `blocks[]`
  // when present (structured layout) and falls back to the markdown
  // `body` field otherwise. Agents publishing a new page-translations
  // row are immediately reachable at `/p/<slug>` with no code change.
  app.get("/p/:slug", async (c) => {
    const slug = c.req.param("slug");
    if (!slug) return c.notFound();
    try {
      const runtime = await cms.get();
      const [page, site] = await Promise.all([
        loadPage(runtime, slug),
        runtime.siteConfig.load(),
      ]);
      if (!page) return c.notFound();
      return c.html(renderPage({ page, site }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.text(`error: ${msg}`, 500);
    }
  });

  app.get("/cart", async (c) => {
    const runtime = await cms.get();
    const site = await runtime.siteConfig.load();
    return c.html(renderCart({ site }));
  });
  app.get("/checkout", async (c) => {
    const runtime = await cms.get();
    const site = await runtime.siteConfig.load();
    return c.html(renderCheckout({ site }));
  });
  app.get("/order/:orderId", async (c) => {
    const runtime = await cms.get();
    const site = await runtime.siteConfig.load();
    return c.html(renderOrderStatus({ orderId: c.req.param("orderId"), site }));
  });

  // Test-only bypass: seed InventoryActor stock without going through
  // the staff-gated `/api/staff/restock` (which needs a real session
  // cookie). Gated on the SAME flag that gates FakeProvider, so this
  // is impossible to hit in production unless an operator explicitly
  // sets FAKE_PAYMENT_PROVIDER=1 (which would also disable real
  // payments). Anyone copying this starter and removing the gate is
  // making the same mistake as removing the gate on FakeProvider —
  // not subtle. See test/integration/smoke.ts for the only caller.
  //
  // Delegates to `restockSkuCore` so the cap + snapshot-enqueue
  // stay in sync with the staff-gated handler — only the auth gate
  // is skipped.
  if (env.FAKE_PAYMENT_PROVIDER === "1") {
    app.post("/__test/restock", async (c) => {
      const body = (await c.req.json()) as {
        skuCode?: string;
        addQty?: number;
      };
      if (!body.skuCode || !body.addQty || body.addQty < 1) {
        return c.json({ error: "missing skuCode / addQty" }, 400);
      }
      try {
        const result = await restockSkuCore(env, {
          skuCode: body.skuCode,
          addQty: body.addQty,
        });
        return c.json({ ok: true, ...result });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return c.json({ error: msg }, 400);
      }
    });
  }

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

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (!env.BETTER_AUTH_SECRET) {
      return Response.json(AUTH_NOT_CONFIGURED, { status: 503 });
    }
    const worker = buildWorker(env);
    return worker(req, env, ctx);
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
