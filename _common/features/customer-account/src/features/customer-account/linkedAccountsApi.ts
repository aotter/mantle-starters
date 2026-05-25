import type { Auth } from "@aotter/mantle/cloudflare";
import { getCustomerSession } from "./session.js";

/**
 * GET /account/api/linked-accounts — returns the signed-in user's
 * linked social/credential accounts. 401 if unauthenticated. Used by
 * the linked-accounts settings page to render the list.
 *
 * Response shape:
 *
 * ```
 * { accounts: [{ id, providerId, accountId, createdAt, updatedAt }, ...] }
 * ```
 *
 * Timestamps are emitted as ISO strings for JSON safety.
 */
export async function handleListLinkedAccounts(
  request: Request,
  auth: Auth,
): Promise<Response> {
  const session = await getCustomerSession(request, auth);
  if (!session) {
    return jsonResponse(401, { error: "unauthenticated" });
  }
  const accounts = await auth.listLinkedAccounts(session.user.id);
  return jsonResponse(200, {
    accounts: accounts.map((a) => ({
      id: a.id,
      providerId: a.providerId,
      accountId: a.accountId,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    })),
  });
}

/**
 * POST /account/api/linked-accounts/unlink — removes one linked
 * account by providerId. Body: `{ providerId: string }`. 401 if
 * unauthenticated. 400 if body invalid. 404 if no account matched.
 *
 * The runtime does NOT block unlinking the user's only credential
 * (see `Auth.unlinkAccount` JSDoc — email-OTP / magic-link sessions
 * leave no row in the account table, so "rows remaining" is not a
 * reliable lockout signal). UI should warn before submitting.
 */
export async function handleUnlinkAccount(
  request: Request,
  auth: Auth,
): Promise<Response> {
  const session = await getCustomerSession(request, auth);
  if (!session) {
    return jsonResponse(401, { error: "unauthenticated" });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "invalid-json" });
  }
  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as { providerId?: unknown }).providerId !== "string"
  ) {
    return jsonResponse(400, { error: "missing-providerId" });
  }
  const providerId = (body as { providerId: string }).providerId;
  const removed = await auth.unlinkAccount(session.user.id, providerId);
  if (!removed) {
    return jsonResponse(404, { error: "no-such-account" });
  }
  return jsonResponse(200, { ok: true });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
