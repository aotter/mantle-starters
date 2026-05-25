/**
 * Customer profile + shipping addresses (#236). KV-backed at
 * `profile:<userId>`. One row per signed-in user.
 *
 * KV (not the entries lifecycle) is the right store here because:
 *   1. Profile is private user data — keeping it out of the entries
 *      table preserves the customer/admin boundary (the admin
 *      editor shouldn't wander into addresses).
 *   2. O(1) lookup by userId — the entries path needs a
 *      parameterized View or a `listEntries` scan per load.
 *   3. Single user-owned blob — no draft→publish lifecycle, no
 *      audit history, no admin editor. Cart already uses KV with
 *      the same contract.
 *
 * Empty / missing profile is a valid state: the helpers return an
 * empty `CustomerProfile` so callers can render the "no addresses
 * yet" UI without a separate not-found path.
 */

export const PROFILE_TTL_SECONDS = 365 * 24 * 60 * 60; // 1 year; refreshed on every write

export interface CustomerAddress {
  readonly id: string;
  /** Optional adopter-supplied label e.g. "Home" / "Office". */
  readonly label?: string;
  readonly recipientName: string;
  readonly phone: string;
  /** ISO 3166-1 alpha-2 (TW, JP, US, …). Adopters validate. */
  readonly country: string;
  readonly postalCode: string;
  /** TW: 縣市. */
  readonly city: string;
  /** TW: 區. Many countries omit; the form layer toggles
   *  visibility. */
  readonly district?: string;
  readonly street: string;
  readonly createdAt: number;
}

export interface CustomerProfile {
  readonly userId: string;
  /** When set, addresses MUST contain a row with this id. The
   *  helpers (`removeAddress`, `addAddress`) maintain the invariant
   *  on every mutation. */
  readonly defaultAddressId?: string;
  readonly optInMarketing?: boolean;
  /** BCP 47 locale the user prefers for transactional emails. */
  readonly locale?: string;
  readonly addresses: readonly CustomerAddress[];
  readonly updatedAt: number;
}

function profileKey(userId: string): string {
  return `profile:${userId}`;
}

/**
 * Load the profile for `userId`. Returns an empty (no addresses)
 * profile when none exists; never throws on missing. Adopter
 * route handlers can treat the result as the single source of
 * truth for the page render.
 */
export async function loadCustomerProfile(
  kv: KVNamespace,
  userId: string,
): Promise<CustomerProfile> {
  const raw = await kv.get<CustomerProfile>(profileKey(userId), "json");
  if (!raw) {
    return { userId, addresses: [], updatedAt: 0 };
  }
  // Defensive: a malformed KV row (manually edited, schema drift)
  // shouldn't crash the page. Drop addresses[] entries that don't
  // match the basic shape.
  const addresses = Array.isArray(raw.addresses)
    ? raw.addresses.filter(isValidAddress)
    : [];
  return {
    userId,
    defaultAddressId: addresses.some((a) => a.id === raw.defaultAddressId)
      ? raw.defaultAddressId
      : undefined,
    optInMarketing: raw.optInMarketing ?? false,
    locale: typeof raw.locale === "string" ? raw.locale : undefined,
    addresses,
    updatedAt: raw.updatedAt ?? 0,
  };
}

async function writeProfile(
  kv: KVNamespace,
  profile: CustomerProfile,
): Promise<void> {
  const next: CustomerProfile = { ...profile, updatedAt: Date.now() };
  await kv.put(profileKey(profile.userId), JSON.stringify(next), {
    expirationTtl: PROFILE_TTL_SECONDS,
  });
}

export interface AddAddressInput {
  readonly label?: string;
  readonly recipientName: string;
  readonly phone: string;
  readonly country: string;
  readonly postalCode: string;
  readonly city: string;
  readonly district?: string;
  readonly street: string;
}

/**
 * Append an address. The FIRST address auto-promotes to
 * `defaultAddressId` so a single-address user doesn't need to
 * click "set default" before checkout can use it.
 *
 * The address `id` is generated server-side (crypto.randomUUID)
 * so adopters don't have to. Returns the address that was
 * written so the route handler can echo it back.
 */
export async function addAddress(
  kv: KVNamespace,
  userId: string,
  input: AddAddressInput,
): Promise<{ address: CustomerAddress; profile: CustomerProfile }> {
  const profile = await loadCustomerProfile(kv, userId);
  const address: CustomerAddress = {
    id: crypto.randomUUID(),
    label: input.label,
    recipientName: input.recipientName,
    phone: input.phone,
    country: input.country,
    postalCode: input.postalCode,
    city: input.city,
    district: input.district,
    street: input.street,
    createdAt: Date.now(),
  };
  const addresses = [...profile.addresses, address];
  const defaultAddressId =
    profile.defaultAddressId ?? address.id;
  const next: CustomerProfile = {
    ...profile,
    addresses,
    defaultAddressId,
    updatedAt: Date.now(),
  };
  await writeProfile(kv, next);
  return { address, profile: next };
}

/**
 * Remove an address by id. When the removed address was the
 * default, promote the newest remaining address to default (or
 * clear `defaultAddressId` when the last address is removed).
 * Returns the updated profile; callers can re-render directly
 * off the result.
 */
export async function removeAddress(
  kv: KVNamespace,
  userId: string,
  addressId: string,
): Promise<CustomerProfile> {
  const profile = await loadCustomerProfile(kv, userId);
  const addresses = profile.addresses.filter((a) => a.id !== addressId);
  if (addresses.length === profile.addresses.length) {
    // No-op: nothing matched. Don't bump updatedAt for a no-write.
    return profile;
  }
  let defaultAddressId = profile.defaultAddressId;
  if (defaultAddressId === addressId) {
    // Promote the newest remaining to default. The list is in
    // append order, so the last entry is the newest.
    defaultAddressId = addresses[addresses.length - 1]?.id;
  }
  const next: CustomerProfile = {
    ...profile,
    addresses,
    defaultAddressId,
    updatedAt: Date.now(),
  };
  await writeProfile(kv, next);
  return next;
}

/**
 * Set an existing address as the default. No-op when the id is
 * already the default or when no matching address exists. Returns
 * the updated profile.
 */
export async function setDefaultAddress(
  kv: KVNamespace,
  userId: string,
  addressId: string,
): Promise<CustomerProfile> {
  const profile = await loadCustomerProfile(kv, userId);
  if (profile.defaultAddressId === addressId) return profile;
  if (!profile.addresses.some((a) => a.id === addressId)) return profile;
  const next: CustomerProfile = {
    ...profile,
    defaultAddressId: addressId,
    updatedAt: Date.now(),
  };
  await writeProfile(kv, next);
  return next;
}

/**
 * Convenience for checkoutStart: returns the default address (if
 * any) so the checkout form can pre-fill.
 */
export function getDefaultAddress(
  profile: CustomerProfile,
): CustomerAddress | undefined {
  if (!profile.defaultAddressId) return undefined;
  return profile.addresses.find((a) => a.id === profile.defaultAddressId);
}

function isValidAddress(a: unknown): a is CustomerAddress {
  if (typeof a !== "object" || a === null) return false;
  const o = a as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.recipientName === "string" &&
    typeof o.phone === "string" &&
    typeof o.country === "string" &&
    typeof o.postalCode === "string" &&
    typeof o.city === "string" &&
    typeof o.street === "string" &&
    typeof o.createdAt === "number"
  );
}
