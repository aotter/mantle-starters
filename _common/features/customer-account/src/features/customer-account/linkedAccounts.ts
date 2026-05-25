import type { Auth, LinkedAccountInfo } from "@aotter/mantle/cloudflare";

/**
 * Service-layer wrappers around the SDK's `Auth.listLinkedAccounts`
 * and `Auth.unlinkAccount` (#235). The SDK methods are the canonical
 * surface, but these thin wrappers give adopter code a stable
 * starter-side import path — if the SDK contract iterates (renames
 * a method, adds an arg) the wrapper can absorb the change without
 * every adopter project having to chase it.
 *
 * The wrappers also exist so route handlers + server-rendered
 * sections + future MCP-tool plumbing all share one entry point.
 */
export async function listLinkedAccountsFor(
  userId: string,
  auth: Auth,
): Promise<readonly LinkedAccountInfo[]> {
  return auth.listLinkedAccounts(userId);
}

/**
 * Unlink a single linked account by `(userId, providerId)`. Returns
 * `true` if a row was deleted, `false` if no matching account
 * existed (e.g. the user already unlinked it in another tab).
 *
 * The runtime does NOT guard against unlinking the user's only
 * sign-in method. From `Auth.unlinkAccount` JSDoc: email-OTP /
 * magic-link sessions DO NOT write rows to the `account` table at
 * all, so "rows remaining" is not a reliable lockout signal. Magic-
 * link via the user's verified email is the implicit fallback —
 * see the `renderLinkedAccountsSection` "always available" row.
 */
export async function unlinkProviderFor(
  userId: string,
  providerId: string,
  auth: Auth,
): Promise<boolean> {
  return auth.unlinkAccount(userId, providerId);
}

export interface RenderLinkedAccountsSectionArgs {
  readonly accounts: readonly LinkedAccountInfo[];
  /** The signed-in user's email — used to render the magic-link
   *  "always available" row. Magic-link sign-ins don't write to the
   *  `account` table, so the section would otherwise look empty
   *  for users who only ever used magic-link. */
  readonly userEmail: string;
  /** Heading text. Defaults to "Sign-in methods" — adopters override
   *  for localization (e.g. "登入方式"). */
  readonly heading?: string;
  /** Unlink form action URL. Defaults to `/account/api/linked-accounts/unlink`
   *  — matches the existing `handleUnlinkAccount` route. */
  readonly unlinkAction?: string;
  /** Unlink button label. */
  readonly unlinkLabel?: string;
  /** Localization for the always-available magic-link row's caption.
   *  Defaults to "Email magic-link — always available". */
  readonly magicLinkLabel?: string;
}

/**
 * Server-render the linked-accounts section as an HTML fragment.
 * Designed to be embedded into `/account` home alongside other
 * sections (orders, profile). Always includes the magic-link
 * "always available" row keyed to the user's email; otherwise a
 * magic-link-only user sees an empty section and thinks they have
 * no way to sign in (#235).
 *
 * The unlink action posts to `unlinkAction` with a form-encoded
 * `providerId` field, matching `handleUnlinkAccount`'s contract.
 * CSRF wiring is the adopter's responsibility — the section emits
 * the form, the route handler runs through `csrfGuard`.
 */
export function renderLinkedAccountsSection(
  args: RenderLinkedAccountsSectionArgs,
): string {
  const heading = escape(args.heading ?? "Sign-in methods");
  const unlinkAction = escape(args.unlinkAction ?? "/account/api/linked-accounts/unlink");
  const unlinkLabel = escape(args.unlinkLabel ?? "Unlink");
  const magicLinkLabel = escape(args.magicLinkLabel ?? "Email magic-link — always available");
  const email = escape(args.userEmail);

  const socialRows = args.accounts
    .map((a) => {
      const providerId = escape(a.providerId);
      const linkedDate = escape(a.createdAt.toISOString().slice(0, 10));
      return [
        `<li class="linked-accounts__row">`,
        `  <strong>${providerId}</strong>`,
        `  <span class="linked-accounts__since">linked ${linkedDate}</span>`,
        `  <form method="post" action="${unlinkAction}" class="linked-accounts__form">`,
        `    <input type="hidden" name="providerId" value="${providerId}" />`,
        `    <button type="submit">${unlinkLabel}</button>`,
        `  </form>`,
        `</li>`,
      ].join("");
    })
    .join("");

  // Magic-link row only renders when there's an email to key it
  // to. Better Auth's User type declares `email: string` so this
  // is always present for sessions that came through the SDK's
  // `createAuth` mount — but a social-only future provider might
  // produce a user without one, and an empty `<strong></strong>`
  // beside the "always available" label reads weird. Skip the row
  // cleanly in that edge case (#235 Codex review).
  const magicLinkRow = args.userEmail.trim()
    ? [
        `<li class="linked-accounts__row linked-accounts__row--magic-link">`,
        `  <strong>${email}</strong>`,
        `  <span class="linked-accounts__since">${magicLinkLabel}</span>`,
        `</li>`,
      ].join("")
    : "";

  return [
    `<section class="linked-accounts">`,
    `  <h2>${heading}</h2>`,
    `  <ul class="linked-accounts__list">`,
    socialRows,
    magicLinkRow,
    `  </ul>`,
    `</section>`,
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
