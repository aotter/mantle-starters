import type { Auth } from "@aotter/mantle/cloudflare";
import { requireCustomerSession } from "./session.js";
import {
  listLinkedAccountsFor,
  renderLinkedAccountsSection,
} from "./linkedAccounts.js";

/**
 * GET /account — signed-in landing page. Greets the user, shows links
 * to settings, and (for the transaction archetype) renders a recent-
 * orders block that the host starter wires via the `orders` callback.
 *
 * The orders block is optional so this template stays usable by any
 * archetype, not just transaction. Pass `orders: undefined` to skip
 * the section entirely.
 *
 * Redirects to /account/sign-in?return_to=/account when no session.
 */
export async function renderAccountHome(args: {
  readonly request: Request;
  readonly auth: Auth;
  readonly orders?: ReadonlyArray<{
    readonly id: string;
    readonly status: string;
    readonly createdAt: Date;
    readonly total: string;
  }>;
  readonly brand?: string;
  /** When true (default), embeds the linked-accounts section
   *  inline on /account home so the user sees their sign-in
   *  methods alongside the rest of the dashboard. Adopters who
   *  prefer the separate `/account/settings/linked-accounts` page
   *  only can pass `false`. (#235) */
  readonly showLinkedAccountsSection?: boolean;
}): Promise<Response> {
  const guard = await requireCustomerSession(args.request, args.auth);
  if (guard) return guard;
  // requireCustomerSession returned null → session exists.
  const session = await args.auth.getSession(args.request);
  if (!session) {
    // Defensive: should not happen since the guard already proved a
    // session exists. Re-redirect rather than dereferencing null.
    return Response.redirect(
      new URL("/account/sign-in", args.request.url).toString(),
      302,
    );
  }
  const brand = escape(args.brand ?? "Account");
  const name = escape(session.user.name || session.user.email);
  const ordersHtml = args.orders === undefined
    ? ""
    : renderOrdersSection(args.orders);

  const showLinkedAccounts = args.showLinkedAccountsSection ?? true;
  const linkedAccountsHtml = showLinkedAccounts
    ? renderLinkedAccountsSection({
        accounts: await listLinkedAccountsFor(session.user.id, args.auth),
        userEmail: session.user.email,
      })
    : "";

  const html = page({
    title: `${brand} — Hi ${name}`,
    bodyHtml: [
      `<main class="account-home">`,
      `  <h1>Hi, ${name}</h1>`,
      `  <p>Signed in as ${escape(session.user.email)}.</p>`,
      ordersHtml,
      linkedAccountsHtml,
      `  <nav class="account-home__nav">`,
      `    <a href="/account/settings/linked-accounts">Linked accounts</a>`,
      `    <form method="post" action="/api/auth/sign-out"><button type="submit">Sign out</button></form>`,
      `  </nav>`,
      `</main>`,
    ].join("\n"),
  });
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function renderOrdersSection(
  orders: ReadonlyArray<{
    id: string;
    status: string;
    createdAt: Date;
    total: string;
  }>,
): string {
  if (orders.length === 0) {
    return `<section class="account-home__orders"><h2>Your orders</h2><p>No orders yet.</p></section>`;
  }
  const rows = orders
    .map(
      (o) =>
        `<tr><td>${escape(o.id)}</td><td>${escape(o.status)}</td><td>${escape(
          o.createdAt.toISOString().slice(0, 10),
        )}</td><td>${escape(o.total)}</td></tr>`,
    )
    .join("\n");
  return [
    `<section class="account-home__orders">`,
    `  <h2>Your orders</h2>`,
    `  <table>`,
    `    <thead><tr><th>Order</th><th>Status</th><th>Date</th><th>Total</th></tr></thead>`,
    `    <tbody>${rows}</tbody>`,
    `  </table>`,
    `</section>`,
  ].join("\n");
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
