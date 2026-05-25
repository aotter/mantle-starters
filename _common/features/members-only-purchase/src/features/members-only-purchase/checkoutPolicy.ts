import type { Auth } from "@aotter/mantle/cloudflare";
import { requireCustomerSession } from "../customer-account/session.js";

/**
 * Resolved checkout-policy value. `"open"` is the default — anonymous
 * checkout permitted. `"members-only"` forces a signed-in customer
 * session before any checkout-start handler runs.
 */
export type CheckoutPolicy = "open" | "members-only";

/**
 * Read the checkout policy from env. The env var is declared by the
 * feature's `_compose/glue.json`; the host starter wires it through
 * `CreateAuthConfig` / runtime env. Unknown values default to `"open"`
 * with a `console.warn` so misconfigurations surface in dev logs
 * without breaking checkout.
 */
export function getCheckoutPolicy(
  env: { readonly CHECKOUT_POLICY?: string },
): CheckoutPolicy {
  const raw = env.CHECKOUT_POLICY?.trim();
  if (raw === "members-only") return "members-only";
  if (raw && raw !== "open") {
    console.warn(
      `[members-only-purchase] CHECKOUT_POLICY="${raw}" not recognized — falling back to "open".`,
    );
  }
  return "open";
}

/**
 * Checkout-time gate. Call this at the top of the
 * `/api/checkout/start` handler (or the equivalent in your starter):
 *
 * ```ts
 * const guard = await enforceCheckoutPolicy(c.req.raw, env, auth);
 * if (guard) return guard;
 * // proceed with checkout
 * ```
 *
 * - When policy is `"open"`: returns `null`, caller proceeds.
 * - When policy is `"members-only"` and session exists: returns `null`.
 * - When policy is `"members-only"` and session is missing:
 *   - for `Accept: text/html` requests, 302 redirects to
 *     `/account/sign-in?return_to=/checkout`.
 *   - for other requests (XHR / fetch), returns 401 JSON so the
 *     frontend can decide whether to redirect or show an inline
 *     message.
 *
 * The HTML-vs-JSON branch is deliberate: a browser navigating directly
 * to `/checkout` should land on the sign-in page; a fetch from an SPA
 * should get a structured response so it can offer a smoother handoff.
 */
export async function enforceCheckoutPolicy(
  request: Request,
  env: { readonly CHECKOUT_POLICY?: string },
  auth: Auth,
): Promise<Response | null> {
  if (getCheckoutPolicy(env) === "open") return null;
  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("text/html")) {
    const guard = await requireCustomerSession(request, auth);
    return guard;
  }
  const session = await auth.getSession(request);
  if (session) return null;
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
