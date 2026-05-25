import type { Auth } from "@aotter/mantle/cloudflare";

/**
 * Customer session reader. Returns the BA session/user pair for the
 * incoming request, or null if the request is unauthenticated.
 *
 * Note: staff (owner / editor / contributor) and customers (user)
 * share one Better Auth instance; `getCustomerSession` does NOT
 * filter by role. Callers who only want non-staff sessions should
 * check `session.user.role` themselves. Most /account pages are fine
 * for any signed-in user — staff visiting their own /account dashboard
 * is the same flow as a customer.
 */
export async function getCustomerSession(
  request: Request,
  auth: Auth,
): Promise<Awaited<ReturnType<Auth["getSession"]>>> {
  return auth.getSession(request);
}

/**
 * Sign-in guard. If the request has no session, returns a 302
 * redirect to `/account/sign-in?return_to=<original-path>`. If it has
 * a session, returns null and the caller proceeds with the protected
 * handler.
 *
 * The `return_to` param round-trips through the magic-link / OTP
 * callback so the user lands back where they tried to go. The
 * sign-in handler is responsible for validating `return_to` (relative
 * URL, same-origin) before honoring it — never trust the query param
 * blindly.
 */
export async function requireCustomerSession(
  request: Request,
  auth: Auth,
): Promise<Response | null> {
  const session = await auth.getSession(request);
  if (session) return null;
  const url = new URL(request.url);
  const returnTo = `${url.pathname}${url.search}`;
  const signInUrl = new URL("/account/sign-in", url.origin);
  signInUrl.searchParams.set("return_to", returnTo);
  return Response.redirect(signInUrl.toString(), 302);
}
