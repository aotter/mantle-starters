/**
 * GET /account/profile — server-rendered profile + addresses page
 * (#236). Form-POST UI; no JS required. Add / remove / set-default
 * each round-trip through their respective POST handlers (see
 * `handleProfileMutation`).
 *
 * The renderer follows the `?ok=...` / `?err=...` query-param toast
 * pattern — the POST handler redirects back to /account/profile
 * with one of those params, the renderer surfaces the message
 * inline. Avoids needing session-flash storage.
 */

import type { Auth } from "@aotter/mantle/cloudflare";
import { requireCustomerSession } from "../customer-account/session.js";
import { loadCustomerProfile, type CustomerProfile } from "./profile.js";

export interface RenderProfileOptions {
  readonly request: Request;
  readonly auth: Auth;
  readonly kv: KVNamespace;
  readonly brand?: string;
  /** Optional country list for the add-address `<select>`. Defaults
   *  to `["TW"]` — adopters serving multiple regions override. */
  readonly countries?: ReadonlyArray<{ readonly code: string; readonly label: string }>;
  /** Show the 區 (district) field by default. TW shops want it;
   *  most US/EU adopters don't. */
  readonly showDistrict?: boolean;
}

export async function renderProfile(
  args: RenderProfileOptions,
): Promise<Response> {
  const guard = await requireCustomerSession(args.request, args.auth);
  if (guard) return guard;
  const session = await args.auth.getSession(args.request);
  if (!session) {
    return Response.redirect(
      new URL("/account/sign-in?return_to=/account/profile", args.request.url).toString(),
      302,
    );
  }
  const profile = await loadCustomerProfile(args.kv, session.user.id);
  const url = new URL(args.request.url);
  const okMsg = url.searchParams.get("ok");
  const errMsg = url.searchParams.get("err");
  const brand = escape(args.brand ?? "Profile");
  const countries = args.countries ?? [{ code: "TW", label: "Taiwan" }];
  const showDistrict = args.showDistrict ?? true;

  const html = page({
    title: `${brand} — Addresses`,
    bodyHtml: [
      `<main class="account-profile">`,
      `  <h1>Addresses</h1>`,
      renderToast(okMsg, errMsg),
      renderAddressList(profile),
      renderAddForm({ countries, showDistrict }),
      `  <nav class="account-profile__nav">`,
      `    <a href="/account">← Back to account</a>`,
      `  </nav>`,
      `</main>`,
    ].join("\n"),
  });
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function renderToast(ok: string | null, err: string | null): string {
  if (!ok && !err) return "";
  const cls = ok ? "ok" : "err";
  const msg = escape(ok ?? err ?? "");
  return `<p class="account-profile__toast account-profile__toast--${cls}">${msg}</p>`;
}

function renderAddressList(profile: CustomerProfile): string {
  if (profile.addresses.length === 0) {
    return `<p class="account-profile__empty">No addresses yet. Add your first one below.</p>`;
  }
  const rows = profile.addresses
    .map((a) => {
      const isDefault = a.id === profile.defaultAddressId;
      const defaultBadge = isDefault
        ? `<span class="account-profile__badge">Default</span>`
        : "";
      const setDefaultBtn = isDefault
        ? ""
        : [
            `<form method="post" action="/account/profile/default" class="account-profile__form">`,
            `  <input type="hidden" name="addressId" value="${escape(a.id)}" />`,
            `  <button type="submit">Set default</button>`,
            `</form>`,
          ].join("");
      const districtLine = a.district
        ? `<div>${escape(a.district)}</div>`
        : "";
      return [
        `<li class="account-profile__address">`,
        `  <header>`,
        `    <strong>${escape(a.label || a.recipientName)}</strong>`,
        defaultBadge,
        `  </header>`,
        `  <address>`,
        `    <div>${escape(a.recipientName)}</div>`,
        `    <div>${escape(a.phone)}</div>`,
        `    <div>${escape(a.country)} ${escape(a.postalCode)}</div>`,
        `    <div>${escape(a.city)}</div>`,
        districtLine,
        `    <div>${escape(a.street)}</div>`,
        `  </address>`,
        setDefaultBtn,
        `  <form method="post" action="/account/profile/remove" class="account-profile__form">`,
        `    <input type="hidden" name="addressId" value="${escape(a.id)}" />`,
        `    <button type="submit">Remove</button>`,
        `  </form>`,
        `</li>`,
      ].join("\n");
    })
    .join("\n");
  return `<ul class="account-profile__addresses">${rows}</ul>`;
}

function renderAddForm(args: {
  countries: ReadonlyArray<{ code: string; label: string }>;
  showDistrict: boolean;
}): string {
  const countryOptions = args.countries
    .map((c) => `<option value="${escape(c.code)}">${escape(c.label)}</option>`)
    .join("");
  const districtField = args.showDistrict
    ? `<label>District<input type="text" name="district" /></label>`
    : "";
  return [
    `<details class="account-profile__add">`,
    `  <summary>Add address</summary>`,
    `  <form method="post" action="/account/profile/add" class="account-profile__add-form">`,
    `    <label>Label<input type="text" name="label" placeholder="Home" /></label>`,
    `    <label>Recipient name<input type="text" name="recipientName" required /></label>`,
    `    <label>Phone<input type="tel" name="phone" required /></label>`,
    `    <label>Country<select name="country" required>${countryOptions}</select></label>`,
    `    <label>Postal code<input type="text" name="postalCode" required /></label>`,
    `    <label>City<input type="text" name="city" required /></label>`,
    districtField,
    `    <label>Street<input type="text" name="street" required /></label>`,
    `    <button type="submit">Add</button>`,
    `  </form>`,
    `</details>`,
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
