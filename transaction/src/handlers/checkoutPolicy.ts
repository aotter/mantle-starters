/**
 * Members-only-purchase policy gate (#210 release spine + #220
 * feature).
 *
 * Lifted inline rather than imported from the `members-only-purchase`
 * feature overlay because feature files only exist after the
 * scaffolder copies them in — archetype source can't depend on a
 * path that isn't there at typecheck time. The semantics match the
 * feature's `enforceCheckoutPolicy` so adopters who install the
 * feature don't see double-gating.
 *
 * Policy values:
 *   - "open" (default) — anonymous checkout permitted.
 *   - "members-only" — signed-in customer session required.
 * Unknown values fall back to "open" with a `console.warn`.
 */

import type { Auth } from "@aotter/mantle/cloudflare";

export type CheckoutPolicy = "open" | "members-only";

export function getCheckoutPolicy(
  env: { readonly CHECKOUT_POLICY?: string },
): CheckoutPolicy {
  const raw = env.CHECKOUT_POLICY?.trim();
  if (raw === "members-only") return "members-only";
  if (raw && raw !== "open") {
    console.warn(
      `[checkout-policy] CHECKOUT_POLICY="${raw}" not recognized — falling back to "open".`,
    );
  }
  return "open";
}

/**
 * Checkout-time gate. Call this at the top of the `/api/checkout/
 * start` HTTP handler BEFORE invoking the checkoutStart procedure.
 *
 * Returns:
 *   - `null` when the policy is "open" OR a signed-in session is
 *     present — caller proceeds.
 *   - a Response when the policy is "members-only" AND no session:
 *     • HTML accept → 302 redirect to /account/sign-in?return_to=/checkout
 *     • XHR / fetch → 401 JSON with structured `signInUrl` field
 *
 * The HTML-vs-JSON branch is deliberate: a browser navigating
 * directly to /checkout should land on the sign-in page; a fetch
 * from an SPA should get a structured response so it can offer a
 * smoother handoff.
 */
export async function enforceCheckoutPolicy(
  request: Request,
  env: { readonly CHECKOUT_POLICY?: string },
  auth: Auth,
): Promise<Response | null> {
  if (getCheckoutPolicy(env) === "open") return null;
  const session = await auth.getSession(request);
  if (session) return null;
  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("text/html")) {
    return Response.redirect(
      new URL("/account/sign-in?return_to=/checkout", request.url).toString(),
      302,
    );
  }
  return new Response(
    JSON.stringify({
      error: "members-only",
      message: "Sign in required to complete checkout.",
      signInUrl: "/account/sign-in?return_to=/checkout",
    }),
    {
      status: 401,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}
