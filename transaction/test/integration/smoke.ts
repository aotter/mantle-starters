/**
 * PR 1 scaffold smoke. Runs against a `wrangler dev --env test`
 * worker booted by `scripts/run-integration.mjs`. Exercises only
 * what's wired in PR 1:
 *
 *   - manifests parse + runtime boots
 *   - view REST routes (products-public is publicly readable)
 *   - HTTP Triggers dispatch (handler stubs throw "not implemented"
 *     by design — the smoke verifies the route DISPATCHES, even
 *     though the handler hasn't been written yet)
 *   - MCP auth gates (401 unauthenticated)
 *
 * Live payment / DO / queue behavior smokes land in PR 2/3 alongside
 * the real handler implementations.
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

// ── checks ────────────────────────────────────────────────────────────

check("view REST: products-public returns 200 with empty array", async () => {
  const res = await expectStatus("/api/views/products-public", 200);
  const body = (await res.json()) as { entries?: unknown[] };
  if (!Array.isArray(body.entries)) {
    fail(`products-public response missing 'entries' array; body=${JSON.stringify(body)}`);
  }
});

check("HTTP Trigger dispatch: POST /api/cart/add reaches handler (returns 500 in PR 1)", async () => {
  // Handler stub throws "not implemented (PR 1 scaffold)" — we verify the
  // ROUTE dispatches even though the handler isn't implemented. In PR 2
  // this becomes 200 with cart state.
  const res = await fetch(`${BASE_URL}/api/cart/add`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cartId: "smoke-cart", productSlug: "smoke-product", qty: 1 }),
  });
  if (res.status !== 500) {
    fail(`POST /api/cart/add → expected 500 (handler stub), got ${res.status}`);
  }
});

check("MCP auth: POST /staff/mcp unauthenticated returns 401", async () => {
  await expectStatus("/staff/mcp", 401, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
});

check("MCP auth: POST /mcp unauthenticated returns 401", async () => {
  await expectStatus("/mcp", 401, {
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
