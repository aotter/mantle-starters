/**
 * CSRF gate for browser-origin POST endpoints.
 *
 * The transaction starter is the first archetype with public,
 * unauthenticated browser POSTs (cart add, checkout start). Without
 * a cross-origin check, a malicious page can submit a hidden form
 * to /api/cart/add from any third-party site while a visitor is
 * logged in here — classic CSRF.
 *
 * Defense uses two browser-supplied signals:
 *
 *   1. `Sec-Fetch-Site` — set by browsers on every fetch / form
 *      POST. Values: "same-origin", "same-site", "cross-site",
 *      "none". A cross-site form submission gets "cross-site"; we
 *      reject those.
 *
 *   2. `Origin` — set by browsers on every POST. Must match the
 *      request's Host header.
 *
 * Both signals are required (separately) when they're present. If
 * BOTH are absent, the request is non-browser (curl, server-to-
 * server, integration tests) and is allowed — those aren't subject
 * to the CSRF threat model. Production deployments behind a CDN
 * should ensure these headers are forwarded.
 *
 * Endpoints to gate:
 *   - `/api/cart/add` (anonymous, browser-origin)
 *   - `/api/checkout/start` (anonymous, browser-origin)
 *   - `/staff/api/restock` (staff-session, browser-origin)
 *
 * Endpoints NOT gated:
 *   - `/api/payment/callback` — provider webhook (Stripe / ECPay /
 *     PayUni), signed via the provider's own scheme. Cross-origin
 *     by design.
 *   - `/__test/*` — test-only bypasses already gated by
 *     FAKE_PAYMENT_PROVIDER=1.
 */

import type { Context, Next } from "hono";

const ALLOWED_SFS = new Set(["same-origin", "same-site", "none"]);

export async function csrfGuard(c: Context, next: Next): Promise<Response | void> {
  const sfs = c.req.header("sec-fetch-site");
  const origin = c.req.header("origin");
  // Both signals absent → non-browser caller. Allow.
  if (!sfs && !origin) return next();
  if (sfs && !ALLOWED_SFS.has(sfs)) {
    return c.json(
      {
        error: "csrf_blocked",
        reason: "sec_fetch_site",
        value: sfs,
      },
      403,
    );
  }
  if (origin) {
    const host = c.req.header("host") ?? "";
    const originHost = origin.replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (originHost !== host) {
      return c.json(
        {
          error: "csrf_blocked",
          reason: "origin_mismatch",
          expected_host: host,
          got_origin: origin,
        },
        403,
      );
    }
  }
  return next();
}
