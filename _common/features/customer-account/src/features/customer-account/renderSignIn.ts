import type { Auth, AuthMethodInfo } from "@aotter/mantle/cloudflare";

/**
 * Server-rendered passwordless sign-in page. Reads `auth.methods` and
 * emits one section per registered method:
 *
 * - `magic-link` / `email-otp` → an `<input type="email">` + submit
 *   that POSTs to Better Auth's standard endpoints.
 * - `social` → one button per provider that links to BA's
 *   `/api/auth/sign-in/social` redirect.
 *
 * No client JavaScript beyond standard form-POST behavior. Themes can
 * override this template later; the feature ships a baseline so the
 * page works the moment the starter wires the route.
 *
 * `return_to` is read from the query string and round-tripped through
 * the form's hidden input so BA's callback lands the user back where
 * they tried to go. Validation (same-origin, absolute path) is the
 * caller's responsibility — never honor an opaque cross-origin URL.
 */
export function renderSignIn(args: {
  readonly request: Request;
  readonly auth: Auth;
  readonly brand?: string;
}): Response {
  const url = new URL(args.request.url);
  const returnTo = url.searchParams.get("return_to") ?? "/account";
  const brand = escape(args.brand ?? "Account");
  const safeReturnTo = sanitizeReturnTo(returnTo);

  const sections: string[] = [];
  const seenSocial = new Set<string>();
  for (const method of args.auth.methods) {
    if (method.kind === "magic-link") {
      sections.push(renderEmailSection({
        title: "Sign in with email link",
        action: "/api/auth/sign-in/magic-link",
        returnTo: safeReturnTo,
      }));
    } else if (method.kind === "email-otp") {
      sections.push(renderEmailSection({
        title: "Sign in with one-time code",
        action: "/api/auth/email-otp/send-verification-otp",
        returnTo: safeReturnTo,
      }));
    } else if (method.kind === "social" && !seenSocial.has(method.provider)) {
      seenSocial.add(method.provider);
      sections.push(renderSocialButton(method, safeReturnTo));
    }
  }
  if (sections.length === 0) {
    sections.push(
      "<p>No sign-in methods are configured. Contact the site operator.</p>",
    );
  }

  const html = page({
    title: `Sign in — ${brand}`,
    bodyHtml: [
      `<main class="account-sign-in">`,
      `  <h1>Sign in</h1>`,
      `  <p>Pick a sign-in method below.</p>`,
      ...sections,
      `</main>`,
    ].join("\n"),
  });
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function renderEmailSection(args: {
  title: string;
  action: string;
  returnTo: string;
}): string {
  return [
    `<section class="account-sign-in__section">`,
    `  <h2>${escape(args.title)}</h2>`,
    `  <form method="post" action="${escape(args.action)}">`,
    `    <input type="hidden" name="return_to" value="${escape(args.returnTo)}" />`,
    `    <label>Email <input type="email" name="email" required autocomplete="email" /></label>`,
    `    <button type="submit">Continue</button>`,
    `  </form>`,
    `</section>`,
  ].join("\n");
}

function renderSocialButton(
  method: Extract<AuthMethodInfo, { kind: "social" }>,
  returnTo: string,
): string {
  const provider = method.provider;
  const params = new URLSearchParams({ provider, callbackURL: returnTo });
  return [
    `<section class="account-sign-in__section">`,
    `  <form method="post" action="/api/auth/sign-in/social">`,
    `    <input type="hidden" name="provider" value="${escape(provider)}" />`,
    `    <input type="hidden" name="callbackURL" value="${escape(returnTo)}" />`,
    `    <button type="submit">Continue with ${escape(provider)}</button>`,
    `  </form>`,
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

function sanitizeReturnTo(raw: string): string {
  // Only honor same-origin absolute paths. Anything that looks like
  // an absolute URL, a protocol-relative URL, or a backslash-escaped
  // sneak gets coerced to "/account".
  if (!raw.startsWith("/")) return "/account";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/account";
  return raw;
}
