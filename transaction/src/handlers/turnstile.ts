/**
 * Cloudflare Turnstile siteverify gate, reused by checkoutStart.
 *
 * `dev-stub` secret short-circuits (returns success) so `pnpm dev`
 * works without provisioning. Any other secret triggers real
 * siteverify against `https://challenges.cloudflare.com/turnstile/v0/siteverify`.
 *
 * Throws on failure — the handler's caller surfaces as a 4xx.
 */

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(
  secret: string | undefined,
  token: string | undefined,
): Promise<void> {
  if (!secret || secret === "dev-stub") return;
  if (!token) {
    throw new Error("turnstile: missing token");
  }
  const body = new URLSearchParams({ secret, response: token });
  const res = await fetch(TURNSTILE_VERIFY_URL, {
    method: "POST",
    body,
  });
  if (!res.ok) {
    throw new Error(`turnstile: siteverify HTTP ${res.status}`);
  }
  const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
  if (!data.success) {
    throw new Error(
      `turnstile: failed${
        data["error-codes"] ? ` (${data["error-codes"].join(",")})` : ""
      }`,
    );
  }
}
