/**
 * Lightweight check-runner for the integration smoke. The smoke file
 * (`smoke.ts`) imports `check / fail / expectStatus / jsonBody / poll`
 * to author tests; `runAll()` invokes every registered check in
 * registration order and exits non-zero on any failure.
 *
 * Lives here (separate from `smoke.ts`) so the smoke file reads
 * top-to-bottom as "what we test"; the plumbing lives off to the side.
 */
export const BASE_URL = process.env.WRANGLER_BASE_URL ?? "http://localhost:8788";

interface Check {
  readonly name: string;
  readonly fn: () => Promise<void>;
}

const checks: Check[] = [];

export function check(name: string, fn: () => Promise<void>): void {
  checks.push({ name, fn });
}

export function fail(msg: string): never {
  throw new Error(msg);
}

export async function expectStatus(
  path: string,
  expected: number,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(`${BASE_URL}${path}`, init);
  if (res.status !== expected) {
    const body = await res.text().catch(() => "(no body)");
    fail(
      `${init?.method ?? "GET"} ${path} → expected ${expected}, got ${res.status}\n${body.slice(0, 300)}`,
    );
  }
  return res;
}

export async function jsonBody<T>(res: Response): Promise<T> {
  const txt = await res.text();
  try {
    return JSON.parse(txt) as T;
  } catch {
    fail(`non-JSON response: ${txt.slice(0, 200)}`);
  }
}

export async function poll<T>(
  fn: () => Promise<T | null>,
  timeoutMs: number,
  label: string,
): Promise<T> {
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
  fail(
    `poll timeout (${timeoutMs}ms) waiting for ${label}${lastErr ? `: ${lastErr}` : ""}`,
  );
}

export async function runAll(): Promise<void> {
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
