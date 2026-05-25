import type { Auth } from "@aotter/mantle/cloudflare";
import { requireCustomerSession } from "./session.js";

/**
 * GET /account/settings/linked-accounts — list the user's linked
 * social/credential accounts with unlink controls.
 *
 * Server-renders the current list at request time so the page works
 * without client JavaScript. The unlink form posts back to
 * `/account/api/linked-accounts/unlink` (see `linkedAccountsApi.ts`).
 * Clients who want a richer experience can hydrate from
 * `GET /account/api/linked-accounts` and replace the rendered list
 * client-side.
 *
 * "Add another sign-in method" is intentionally NOT in v1 — Better
 * Auth's `linkSocial` flow requires client-side coordination
 * (`auth.linkSocial({ provider })`) that's out of scope for a
 * server-rendered template. Adopters who want it can hand-add the
 * client snippet; documenting the path is a follow-up.
 */
export async function renderLinkedAccounts(args: {
  readonly request: Request;
  readonly auth: Auth;
  readonly brand?: string;
}): Promise<Response> {
  const guard = await requireCustomerSession(args.request, args.auth);
  if (guard) return guard;
  const session = await args.auth.getSession(args.request);
  if (!session) {
    return Response.redirect(
      new URL("/account/sign-in", args.request.url).toString(),
      302,
    );
  }
  const accounts = await args.auth.listLinkedAccounts(session.user.id);
  const brand = escape(args.brand ?? "Account");

  const listHtml = accounts.length === 0
    ? `<p>No linked accounts. Sign in with a social provider to link one.</p>`
    : [
        `<ul class="linked-accounts__list">`,
        ...accounts.map(
          (a) =>
            `<li><strong>${escape(a.providerId)}</strong> — linked ${escape(
              a.createdAt.toISOString().slice(0, 10),
            )}<form method="post" action="/account/api/linked-accounts/unlink"><input type="hidden" name="providerId" value="${escape(a.providerId)}" /><button type="submit">Unlink</button></form></li>`,
        ),
        `</ul>`,
      ].join("\n");

  const html = page({
    title: `${brand} — Linked accounts`,
    bodyHtml: [
      `<main class="linked-accounts">`,
      `  <h1>Linked accounts</h1>`,
      `  <p>These providers can be used to sign in to this account.</p>`,
      listHtml,
      `  <nav><a href="/account">Back to account</a></nav>`,
      `</main>`,
    ].join("\n"),
  });
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function page(args: { title: string; bodyHtml: string }): string {
  return [
    "<!doctype html>",
    "<html lang=\"en\">",
    "<head>",
    `<meta charset="utf-8" />`,
    `<meta name="viewport" content="width=device-width, initial-scale=1" />`,
    `<title>${escape(args.title)}</title>`,
    "</head>",
    "<body>",
    args.bodyHtml,
    "</body>",
    "</html>",
  ].join("\n");
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
