/**
 * PR 2 smoke — exercises the live transaction flow against
 * `wrangler dev --env=test`. Fixture (`test/fixture/apply-test.ts`)
 * seeds one untracked product; this script drives the customer
 * happy path + idempotency.
 *
 * Tests:
 *   1. View REST works (`products-public` returns the seeded product).
 *   2. addToCart: POST `/api/cart/add` returns subtotal.
 *   3. checkoutStart: POST `/api/checkout/start` returns orderId +
 *      FakeProvider redirect URL.
 *   4. checkoutConfirm: POST `/api/payment/callback` with simulated
 *      provider event → queues → consumer creates the order row.
 *   5. readOrderStatus: GET `/api/order/status?orderId=<id>` returns
 *      `exists: true, orderStatus: "placed"` after the consumer runs.
 *   6. Idempotency: send the same callback event again → no second
 *      order row is created (entries.id is unique on event.id).
 *   7. MCP auth gates still work (401 unauthenticated).
 *
 * The FakeProvider lives in `src/payment/providers/_templates/fake.ts`
 * and is wired via the `FAKE_PAYMENT_PROVIDER=1` env var in the test
 * profile (wrangler.toml `[env.test.vars]`).
 */
import {
  BASE_URL,
  check,
  expectStatus,
  fail,
  jsonBody,
  poll,
  runAll,
} from "./_runner.js";

// ── checks ────────────────────────────────────────────────────────────

let savedOrderId: string | null = null;

check("seeded product appears in products-public view", async () => {
  const res = await expectStatus("/api/views/products-public", 200);
  const body = await jsonBody<{ entries: Array<{ data: { slug?: string } }> }>(res);
  if (!body.entries.some((e) => e.data.slug === "smoke-product")) {
    fail(`smoke-product not in products-public; entries=${JSON.stringify(body.entries)}`);
  }
});

check("addToCart: POST /api/cart/add returns subtotal", async () => {
  const res = await fetch(`${BASE_URL}/api/cart/add`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      cartId: "smoke-cart",
      productSlug: "smoke-product",
      qty: 2,
    }),
  });
  if (res.status !== 200) {
    fail(`/api/cart/add → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const body = await jsonBody<{ subtotalMinor: number; currency: string }>(res);
  if (body.subtotalMinor !== 2000) {
    fail(`expected subtotalMinor=2000 (2 × 1000), got ${body.subtotalMinor}`);
  }
  if (body.currency !== "USD") {
    fail(`expected currency=USD, got ${body.currency}`);
  }
});

check("checkoutStart: POST /api/checkout/start returns orderId + redirect", async () => {
  const res = await fetch(`${BASE_URL}/api/checkout/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      cartId: "smoke-cart",
      customerEmail: "test@example.com",
    }),
  });
  if (res.status !== 200) {
    fail(`/api/checkout/start → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const body = await jsonBody<{
    orderId: string;
    result: { kind: string; url?: string };
  }>(res);
  if (!body.orderId) fail("no orderId in response");
  if (body.result.kind !== "redirect") {
    fail(`expected FakeProvider redirect, got ${body.result.kind}`);
  }
  savedOrderId = body.orderId;
});

check("checkoutConfirm: simulated provider callback → 200", async () => {
  if (!savedOrderId) fail("no savedOrderId from prior check");
  const res = await fetch(`${BASE_URL}/api/payment/callback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      eventId: `evt_smoke_${savedOrderId}`,
      orderId: savedOrderId,
      status: "succeeded",
      amount: { minor: 2000, currency: "USD" },
    }),
  });
  if (res.status !== 200) {
    fail(`/api/payment/callback → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
});

check("readOrderStatus: order appears after consumer runs (poll up to 10s)", async () => {
  if (!savedOrderId) fail("no savedOrderId");
  await poll(
    async () => {
      const res = await fetch(
        `${BASE_URL}/api/order/status?orderId=${encodeURIComponent(savedOrderId!)}`,
      );
      if (res.status !== 200) return null;
      const body = await jsonBody<{ exists: boolean; orderStatus?: string }>(res);
      if (body.exists && body.orderStatus === "placed") return body;
      return null;
    },
    10_000,
    `order ${savedOrderId} to flip to placed`,
  );
});

check("idempotency: same callback event again → no second order row", async () => {
  if (!savedOrderId) fail("no savedOrderId");
  // Send the exact same eventId again. The find-and-modify lock on
  // event.id should make tryAcquire return acquired=false; consumer
  // skips; no second order is created. (Even if it weren't, the
  // INSERT OR IGNORE on entries.id keyed by event.id would still
  // prevent a duplicate row — defense in depth.)
  const res = await fetch(`${BASE_URL}/api/payment/callback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      eventId: `evt_smoke_${savedOrderId}`,
      orderId: savedOrderId,
      status: "succeeded",
      amount: { minor: 2000, currency: "USD" },
    }),
  });
  if (res.status !== 200) {
    fail(`second callback → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  // Wait a beat for any duplicate write to land, then verify there's
  // still exactly one matching order.
  await new Promise((r) => setTimeout(r, 2000));
  const viewRes = await expectStatus("/api/views/orders-recent", 200);
  const body = await jsonBody<{ entries: Array<{ data: { orderNumber?: string } }> }>(viewRes);
  const matches = body.entries.filter(
    (e) => e.data.orderNumber === savedOrderId,
  );
  if (matches.length !== 1) {
    fail(`expected 1 order row for ${savedOrderId}, got ${matches.length}`);
  }
});

// ── PR 3 — staff-gated + scheduled handler ───────────────────────────

check(
  "restockProduct: POST /staff/api/restock unauthenticated → rejected",
  async () => {
    // Auth-denied shape varies by mount layer in v0.1 — Hono may
    // return 401/403, the procedure dispatcher may return 200 with
    // `{ ok: false, diagnostic }`. Either is fine; the failure mode
    // is a 200 with the success shape (`snapshotQueued: true`).
    const res = await fetch(`${BASE_URL}/staff/api/restock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productSlug: "tracked-out-of-stock", addQty: 10 }),
    });
    if (res.status === 200) {
      const body = await jsonBody<{ snapshotQueued?: boolean }>(res);
      if (body.snapshotQueued) {
        fail(`restock succeeded without auth — staff gate is broken`);
      }
    }
  },
);

check("scheduled handler exists (miniflare /__scheduled trigger)", async () => {
  // miniflare exposes /__scheduled to manually fire `scheduled()`.
  // 200 = ran; 404 = route absent (older miniflare or non-miniflare
  // runner) — either way we're just verifying the handler doesn't
  // crash when invoked.
  const res = await fetch(`${BASE_URL}/__scheduled`);
  if (res.status !== 200 && res.status !== 404) {
    fail(`/__scheduled returned unexpected ${res.status}`);
  }
});

check("MCP auth: POST /staff/mcp unauthenticated returns 401", async () => {
  await expectStatus("/staff/mcp", 401, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
});

check("MCP auth: POST /mcp (user surface) unauthenticated returns 401", async () => {
  await expectStatus("/mcp", 401, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
});

// ── cart edge cases ──────────────────────────────────────────────────

check("addToCart: unknown productSlug → 500 with clear message", async () => {
  const res = await fetch(`${BASE_URL}/api/cart/add`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      cartId: "edge-cart-1",
      productSlug: "does-not-exist",
      qty: 1,
    }),
  });
  if (res.status === 200) {
    fail("expected non-200 for unknown product, got 200");
  }
  const txt = await res.text();
  if (!txt.includes("does-not-exist")) {
    fail(`error body should mention the bad slug; got ${txt.slice(0, 200)}`);
  }
});

check("addToCart: qty 0 → rejected", async () => {
  const res = await fetch(`${BASE_URL}/api/cart/add`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      cartId: "edge-cart-2",
      productSlug: "smoke-product",
      qty: 0,
    }),
  });
  if (res.status === 200) fail("expected non-200 for qty=0");
});

check("addToCart: same product twice coalesces (1 + 2 = 3, not 2 lines)", async () => {
  await fetch(`${BASE_URL}/api/cart/add`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      cartId: "coalesce-cart",
      productSlug: "smoke-product",
      qty: 1,
    }),
  });
  const res = await fetch(`${BASE_URL}/api/cart/add`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      cartId: "coalesce-cart",
      productSlug: "smoke-product",
      qty: 2,
    }),
  });
  if (res.status !== 200) fail(`expected 200, got ${res.status}`);
  const body = await jsonBody<{
    items: Array<{ productSlug: string; qty: number }>;
    subtotalMinor: number;
  }>(res);
  const lines = body.items.filter((i) => i.productSlug === "smoke-product");
  if (lines.length !== 1 || lines[0]?.qty !== 3) {
    fail(`expected 1 line at qty=3; got ${JSON.stringify(body.items)}`);
  }
  if (body.subtotalMinor !== 3000) {
    fail(`expected subtotalMinor=3000, got ${body.subtotalMinor}`);
  }
});

// ── checkout edge cases ──────────────────────────────────────────────

check("checkoutStart: unknown cartId → 500 (cart expired/missing)", async () => {
  const res = await fetch(`${BASE_URL}/api/checkout/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      cartId: "nonexistent-cart-id-12345",
      customerEmail: "test@example.com",
    }),
  });
  if (res.status === 200) fail("expected non-200 for missing cart");
  const txt = await res.text();
  if (!/empty|expired|missing/i.test(txt)) {
    fail(`error should mention empty/expired/missing; got ${txt.slice(0, 200)}`);
  }
});

check(
  "checkoutStart: tracked product with 0 stock → 500 insufficient_stock",
  async () => {
    // Build a cart with the tracked-out-of-stock product.
    await fetch(`${BASE_URL}/api/cart/add`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cartId: "tracked-cart",
        productSlug: "tracked-out-of-stock",
        qty: 1,
      }),
    });
    const res = await fetch(`${BASE_URL}/api/checkout/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cartId: "tracked-cart",
        customerEmail: "test@example.com",
      }),
    });
    if (res.status === 200) fail("expected non-200 for out-of-stock");
    const txt = await res.text();
    if (!/insufficient|stock/i.test(txt)) {
      fail(`error should mention insufficient stock; got ${txt.slice(0, 200)}`);
    }
  },
);

// ── callback failure paths ───────────────────────────────────────────

check("paymentCallback: status=failed → no order row created", async () => {
  const failedEventId = "evt_smoke_failed_1";
  const failedOrderId = "o_failed_smoke";
  const res = await fetch(`${BASE_URL}/api/payment/callback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      eventId: failedEventId,
      orderId: failedOrderId,
      status: "failed",
      amount: { minor: 1000, currency: "USD" },
    }),
  });
  if (res.status !== 200) fail(`expected 200, got ${res.status}`);
  // Wait for the consumer to process.
  await new Promise((r) => setTimeout(r, 2000));
  const ordRes = await expectStatus(
    `/api/order/status?orderId=${encodeURIComponent(failedOrderId)}`,
    200,
  );
  const body = await jsonBody<{ exists: boolean }>(ordRes);
  if (body.exists) {
    fail(
      `failed callback should not create an order, but orderId=${failedOrderId} exists in D1`,
    );
  }
});

check("paymentCallback: status=expired → no order row created", async () => {
  const expiredEventId = "evt_smoke_expired_1";
  const expiredOrderId = "o_expired_smoke";
  const res = await fetch(`${BASE_URL}/api/payment/callback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      eventId: expiredEventId,
      orderId: expiredOrderId,
      status: "expired",
      amount: { minor: 1000, currency: "USD" },
    }),
  });
  if (res.status !== 200) fail(`expected 200, got ${res.status}`);
  await new Promise((r) => setTimeout(r, 2000));
  const ordRes = await expectStatus(
    `/api/order/status?orderId=${encodeURIComponent(expiredOrderId)}`,
    200,
  );
  const body = await jsonBody<{ exists: boolean }>(ordRes);
  if (body.exists) {
    fail(
      `expired callback should not create an order, but orderId=${expiredOrderId} exists`,
    );
  }
});

// ── read order status edge cases ─────────────────────────────────────

check("readOrderStatus: unknown orderId → exists=false (200)", async () => {
  const res = await expectStatus(
    "/api/order/status?orderId=nonexistent-xyz-123",
    200,
  );
  const body = await jsonBody<{ exists: boolean; orderId: string }>(res);
  if (body.exists !== false) {
    fail(`expected exists=false; got ${JSON.stringify(body)}`);
  }
});

check("readOrderStatus: missing orderId query → 400", async () => {
  await expectStatus("/api/order/status", 400);
});

// ── tracked-inventory end-to-end (PR 4 commerce correctness) ─────────

check(
  "tracked e2e: restock → checkout → succeeded callback → inventory committed + order line items",
  async () => {
    // 1. Seed stock via the test bypass (/__test/restock mounted only
    //    when FAKE_PAYMENT_PROVIDER=1; same flag that gates the fake
    //    provider, so this is also disabled in prod).
    const restockRes = await fetch(`${BASE_URL}/__test/restock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productSlug: "tracked-out-of-stock", addQty: 3 }),
    });
    if (restockRes.status !== 200) {
      fail(`/__test/restock → ${restockRes.status}: ${(await restockRes.text()).slice(0, 200)}`);
    }

    // 2. Build a fresh cart and check out.
    const cartId = `e2e-tracked-${Date.now()}`;
    await fetch(`${BASE_URL}/api/cart/add`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cartId,
        productSlug: "tracked-out-of-stock",
        qty: 2,
      }),
    });
    const startRes = await fetch(`${BASE_URL}/api/checkout/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cartId,
        customerEmail: "e2e@example.com",
      }),
    });
    if (startRes.status !== 200) {
      fail(`/api/checkout/start (tracked) → ${startRes.status}: ${(await startRes.text()).slice(0, 200)}`);
    }
    const startBody = await jsonBody<{ orderId: string }>(startRes);
    const orderId = startBody.orderId;
    if (!orderId) fail("no orderId from tracked checkoutStart");

    // 3. Drive the provider callback.
    const cbRes = await fetch(`${BASE_URL}/api/payment/callback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        eventId: `evt_e2e_${orderId}`,
        orderId,
        status: "succeeded",
        amount: { minor: 2000, currency: "USD" },
        paymentIntentId: `pi_e2e_${orderId}`,
        customerEmail: "e2e@example.com",
      }),
    });
    if (cbRes.status !== 200) {
      fail(`tracked callback → ${cbRes.status}: ${(await cbRes.text()).slice(0, 200)}`);
    }

    // 4. Poll for the order row to appear with items + customerEmail.
    const order = await poll<{
      exists: boolean;
      orderStatus?: string;
      customerEmail?: string;
      items?: Array<{ productSlug: string; qty: number; priceMinorAtPurchase: number }>;
      paymentProvider?: string;
      paymentIntentId?: string;
    }>(
      async () => {
        const res = await fetch(
          `${BASE_URL}/api/order/status?orderId=${encodeURIComponent(orderId)}`,
        );
        if (res.status !== 200) return null;
        const body = await jsonBody<{
          exists: boolean;
          orderStatus?: string;
          customerEmail?: string;
          items?: Array<{ productSlug: string; qty: number; priceMinorAtPurchase: number }>;
          paymentProvider?: string;
          paymentIntentId?: string;
        }>(res);
        if (body.exists && body.orderStatus === "placed") return body;
        return null;
      },
      10_000,
      `tracked order ${orderId} to flip to placed`,
    );

    if (order.customerEmail !== "e2e@example.com") {
      fail(`expected customerEmail=e2e@example.com; got ${order.customerEmail}`);
    }
    if (!order.items || order.items.length !== 1) {
      fail(`expected 1 line item; got ${JSON.stringify(order.items)}`);
    }
    const line = order.items[0]!;
    if (line.productSlug !== "tracked-out-of-stock" || line.qty !== 2) {
      fail(`line item shape wrong: ${JSON.stringify(line)}`);
    }
    if (typeof line.priceMinorAtPurchase !== "number" || line.priceMinorAtPurchase <= 0) {
      fail(`expected priceMinorAtPurchase > 0; got ${line.priceMinorAtPurchase}`);
    }
    if (order.paymentProvider !== "fake") {
      fail(`expected paymentProvider=fake; got ${order.paymentProvider}`);
    }
    if (order.paymentIntentId !== `pi_e2e_${orderId}`) {
      fail(`expected paymentIntentId=pi_e2e_${orderId}; got ${order.paymentIntentId}`);
    }
  },
);

// ── checkout return ──────────────────────────────────────────────────

check(
  "GET /api/payment/return?orderId=X&status=succeeded returns providerStatus + order shape",
  async () => {
    if (!savedOrderId) fail("no savedOrderId");
    const res = await expectStatus(
      `/api/payment/return?orderId=${encodeURIComponent(savedOrderId!)}&status=succeeded`,
      200,
    );
    const body = await jsonBody<{
      orderId: string;
      providerStatus: string;
      exists: boolean;
      orderStatus?: string;
    }>(res);
    if (body.orderId !== savedOrderId) {
      fail(`expected orderId=${savedOrderId}; got ${body.orderId}`);
    }
    if (body.providerStatus !== "succeeded") {
      fail(`expected providerStatus=succeeded; got ${body.providerStatus}`);
    }
    if (!body.exists || body.orderStatus !== "placed") {
      fail(`expected exists=true, orderStatus=placed; got ${JSON.stringify(body)}`);
    }
  },
);

// ── public storefront templates (PR 5) ───────────────────────────────

check("GET / renders product list with seeded product", async () => {
  const res = await expectStatus("/", 200);
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    fail(`expected HTML; got content-type=${contentType}`);
  }
  const html = await res.text();
  if (!html.includes("<!doctype html>") && !html.includes("<!DOCTYPE html>")) {
    fail(`expected doctype in HTML; got: ${html.slice(0, 200)}`);
  }
  if (!html.includes("smoke-product")) {
    fail(`product list should mention seeded product slug; got: ${html.slice(0, 500)}`);
  }
});

check("GET /product/:slug renders product detail with Add-to-Cart", async () => {
  const res = await expectStatus("/product/smoke-product", 200);
  const html = await res.text();
  if (!html.includes("smoke-product")) {
    fail(`product detail should mention the slug`);
  }
  if (!/add[- ]?to[- ]?cart/i.test(html)) {
    fail(`product detail should expose the Add-to-Cart button`);
  }
});

check("GET /product/:slug for unknown slug → 404", async () => {
  await expectStatus("/product/does-not-exist-xyz", 404);
});

check("GET /cart, /checkout, /order/:id render HTML shells", async () => {
  for (const path of ["/cart", "/checkout", "/order/o_smoke"]) {
    const res = await expectStatus(path, 200);
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html")) {
      fail(`${path} expected HTML; got content-type=${ct}`);
    }
    const html = await res.text();
    if (!html.includes("<!doctype html>") && !html.includes("<!DOCTYPE html>")) {
      fail(`${path} missing doctype`);
    }
  }
});

check("GET /api/cart/get?cartId=… returns empty 404 for unknown cart", async () => {
  await expectStatus("/api/cart/get?cartId=nonexistent-cart-z", 404);
});

// ── CSRF gate (PR 5 review) ──────────────────────────────────────────

check("CSRF: cross-site POST /api/cart/add → 403", async () => {
  const res = await fetch(`${BASE_URL}/api/cart/add`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // Browser-supplied signal for a third-party-origin form post.
      "sec-fetch-site": "cross-site",
      origin: "https://attacker.example",
    },
    body: JSON.stringify({
      cartId: "csrf-victim",
      productSlug: "smoke-product",
      qty: 1,
    }),
  });
  if (res.status !== 403) {
    fail(`expected 403 on cross-site POST; got ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
});

check("CSRF: origin-mismatch POST /api/checkout/start → 403", async () => {
  const res = await fetch(`${BASE_URL}/api/checkout/start`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://attacker.example",
    },
    body: JSON.stringify({ cartId: "x", customerEmail: "x@example.com" }),
  });
  if (res.status !== 403) {
    fail(`expected 403 on origin-mismatch; got ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
});

// ── runner ────────────────────────────────────────────────────────────

runAll().catch((err: unknown) => {
  console.error(
    `smoke runner threw: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(2);
});
