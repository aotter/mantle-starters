/**
 * Profile-mutation form-POST handlers (#236). One handler per
 * route — `add`, `remove`, `set-default`. All three redirect back
 * to `/account/profile` with an `?ok=` or `?err=` query param so
 * the renderer can surface a toast without session-flash storage.
 *
 * CSRF gating is the adopter's responsibility — wire `csrfGuard`
 * on `/account/profile/*` in your starter's `src/index.ts`.
 */

import type { Auth } from "@aotter/mantle/cloudflare";
import { getCustomerSession } from "../customer-account/session.js";
import {
  addAddress,
  removeAddress,
  setDefaultAddress,
  type AddAddressInput,
} from "./profile.js";

const PROFILE_URL = "/account/profile";

/** POST /account/profile/add */
export async function handleAddAddress(
  request: Request,
  auth: Auth,
  kv: KVNamespace,
): Promise<Response> {
  const session = await getCustomerSession(request, auth);
  if (!session) return redirectTo(request, PROFILE_URL, { err: "Sign in required" });
  const form = await readForm(request);
  const parsed = parseAddressForm(form);
  if (!parsed.ok) return redirectTo(request, PROFILE_URL, { err: parsed.err });
  await addAddress(kv, session.user.id, parsed.value);
  return redirectTo(request, PROFILE_URL, { ok: "Address added" });
}

/** POST /account/profile/remove */
export async function handleRemoveAddress(
  request: Request,
  auth: Auth,
  kv: KVNamespace,
): Promise<Response> {
  const session = await getCustomerSession(request, auth);
  if (!session) return redirectTo(request, PROFILE_URL, { err: "Sign in required" });
  const form = await readForm(request);
  const addressId = form.get("addressId");
  if (typeof addressId !== "string" || !addressId) {
    return redirectTo(request, PROFILE_URL, { err: "Missing address id" });
  }
  await removeAddress(kv, session.user.id, addressId);
  return redirectTo(request, PROFILE_URL, { ok: "Address removed" });
}

/** POST /account/profile/default */
export async function handleSetDefaultAddress(
  request: Request,
  auth: Auth,
  kv: KVNamespace,
): Promise<Response> {
  const session = await getCustomerSession(request, auth);
  if (!session) return redirectTo(request, PROFILE_URL, { err: "Sign in required" });
  const form = await readForm(request);
  const addressId = form.get("addressId");
  if (typeof addressId !== "string" || !addressId) {
    return redirectTo(request, PROFILE_URL, { err: "Missing address id" });
  }
  await setDefaultAddress(kv, session.user.id, addressId);
  return redirectTo(request, PROFILE_URL, { ok: "Default address updated" });
}

async function readForm(request: Request): Promise<FormData> {
  // Form-POST only. The JSON-body fallback was tempting for SPA
  // adopters but it would bypass any csrfGuard that gates on
  // form-encoded bodies (a common pattern). Adopters wiring an
  // SPA can serialise to URLSearchParams + send as
  // application/x-www-form-urlencoded, which still rides the
  // same CSRF guard.
  return request.formData();
}

/** Per-field max length cap on POSTed strings — prevents accidental
 *  / malicious KV bloat. KV's 25 MB value cap is far higher, but
 *  there's no legitimate reason a street line should exceed this. */
const MAX_FIELD_LENGTH = 255;

function takeField(form: FormData, name: string): string | null {
  const v = form.get(name);
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_FIELD_LENGTH) return trimmed.slice(0, MAX_FIELD_LENGTH);
  return trimmed;
}

type ParsedAddress =
  | { readonly ok: false; readonly err: string }
  | { readonly ok: true; readonly value: AddAddressInput };

function parseAddressForm(form: FormData): ParsedAddress {
  const required = ["recipientName", "phone", "country", "postalCode", "city", "street"] as const;
  const out: Record<string, string> = {};
  for (const key of required) {
    const v = takeField(form, key);
    if (v === null) return { ok: false, err: `Missing field: ${key}` };
    out[key] = v;
  }
  return {
    ok: true,
    value: {
      recipientName: out.recipientName!,
      phone: out.phone!,
      country: out.country!,
      postalCode: out.postalCode!,
      city: out.city!,
      street: out.street!,
      label: takeField(form, "label") ?? undefined,
      district: takeField(form, "district") ?? undefined,
    },
  };
}

function redirectTo(
  request: Request,
  path: string,
  params: { readonly ok?: string; readonly err?: string },
): Response {
  const url = new URL(path, request.url);
  if (params.ok) url.searchParams.set("ok", params.ok);
  if (params.err) url.searchParams.set("err", params.err);
  return Response.redirect(url.toString(), 303);
}
