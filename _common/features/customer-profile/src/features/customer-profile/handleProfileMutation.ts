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
  const ct = request.headers.get("content-type") ?? "";
  if (ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded")) {
    return request.formData();
  }
  // Tolerate JSON body for adopters who wire the routes from an
  // SPA — same shape, just different on-the-wire format.
  const json = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const fd = new FormData();
  for (const [k, v] of Object.entries(json)) {
    if (typeof v === "string") fd.set(k, v);
  }
  return fd;
}

type ParsedAddress =
  | { readonly ok: false; readonly err: string }
  | { readonly ok: true; readonly value: AddAddressInput };

function parseAddressForm(form: FormData): ParsedAddress {
  const required = ["recipientName", "phone", "country", "postalCode", "city", "street"] as const;
  const out: Record<string, string> = {};
  for (const key of required) {
    const v = form.get(key);
    if (typeof v !== "string" || v.trim().length === 0) {
      return { ok: false, err: `Missing field: ${key}` };
    }
    out[key] = v.trim();
  }
  const label = form.get("label");
  const district = form.get("district");
  return {
    ok: true,
    value: {
      recipientName: out.recipientName!,
      phone: out.phone!,
      country: out.country!,
      postalCode: out.postalCode!,
      city: out.city!,
      street: out.street!,
      label: typeof label === "string" && label.trim().length > 0 ? label.trim() : undefined,
      district: typeof district === "string" && district.trim().length > 0 ? district.trim() : undefined,
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
