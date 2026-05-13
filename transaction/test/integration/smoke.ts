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
const BASE_URL = process.env.WRANGLER_BASE_URL ?? "http://localhost:8788";

interface Check {
  readonly name: string;
  readonly fn: () => Promise<void>;
}

const checks: Check[] = [];
function check(name: string, fn: () => Promise<void>): void {
  checks.push({ name, fn });
}

function fail(msg: string): never {
  throw new Error(msg);
}

async function expectStatus(path: string, expected: number, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${BASE_URL}${path}`, init);
  if (res.status !== expected) {
    const body = await res.text().catch(() => "(no body)");
    fail(
      `${init?.method ?? "GET"} ${path} → expected ${expected}, got ${res.status}\n${body.slice(0, 300)}`,
    );
  }
  return res;
}

async function jsonBody<T>(res: Response): Promise<T> {
  const txt = await res.text();
  try {
    return JSON.parse(txt) as T;
  } catch {
    fail(`non-JSON response: ${txt.slice(0, 200)}`);
  }
}

async function poll<T>(fn: () => Promise<T | null>, timeoutMs: number, label: string): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown = null;
  while (Date.now() < deadline) {
    try {
      const result = await fn();
      if (result !== null) return result;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  fail(`poll timeout (${timeoutMs}ms) waiting for ${label}${lastErr ? `: ${lastErr}` : ""}`);
}

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

check("MCP auth: POST /staff/mcp unauthenticated returns 401", async () => {
  await expectStatus("/staff/mcp", 401, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
});

// ── runner ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  let passed = 0;
  const failures: { name: string; err: unknown }[] = [];
  for (const c of checks) {
    try {
      await c.fn();
      console.log(`  PASS  ${c.name}`);
      passed += 1;
    } catch (err) {
      failures.push({ name: c.name, err });
      console.log(`  FAIL  ${c.name}`);
      console.log(
        `        ${err instanceof Error ? err.message : String(err)}`
          .split("\n")
          .map((line, i) => (i === 0 ? line : `        ${line}`))
          .join("\n"),
      );
    }
  }
  console.log(`\n${passed}/${checks.length} passed`);
  if (failures.length > 0) {
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(`smoke runner threw: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
});
