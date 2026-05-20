import type { EncodedVariant } from "./encode.js";

/**
 * Thin HTTP client for the mantle admin media upload endpoint
 * (#272 multi-variant flow). The Worker exposes:
 *
 *   POST <baseUrl>/admin/api/media/uploads            — create capabilities
 *   POST <baseUrl>/admin/api/media/uploads/:groupId/commit — commit
 *
 * Both are Better-Auth-gated; the caller passes a session token / bearer
 * via the `cookie` (browser-style) or `authorization` (server-side
 * bearer) headers.
 */
export interface UploadClientOptions {
  /** Worker origin, e.g. `https://my-blog.example`. No trailing slash. */
  readonly baseUrl: string;
  /** Either an admin session cookie ("better-auth.session_token=…") or
   *  a bearer token to send as `Authorization: Bearer …`. Exactly one. */
  readonly auth:
    | { readonly kind: "cookie"; readonly value: string }
    | { readonly kind: "bearer"; readonly value: string };
}

export interface UploadResult {
  readonly uploadGroupId: string;
  readonly asset: CommittedMediaAsset;
}

export interface CommittedMediaAsset {
  readonly id: string;
  readonly variants: ReadonlyArray<{
    readonly mimeType: string;
    readonly publicUrl: string;
    readonly storageKey: string;
    readonly byteSize: number;
    readonly role: "primary" | "alternate" | "fallback";
  }>;
  readonly alt?: string;
  readonly caption?: string;
  readonly createdAt: number;
}

interface CreateResponse {
  readonly uploadGroupId: string;
  readonly capabilities: ReadonlyArray<{
    readonly mimeType: string;
    readonly role: "primary" | "alternate" | "fallback";
    readonly method: "PUT";
    readonly uploadUrl: string;
    readonly requiredHeaders?: Readonly<Record<string, string>>;
  }>;
  readonly expiresAt: number;
}

/**
 * Drive the full create → PUT-all → commit lifecycle.
 *
 * 1. POSTs the variants manifest to `/admin/api/media/uploads`.
 * 2. For each capability, PUTs the variant bytes to the returned
 *    presigned URL (bypassing the Worker entirely — direct R2 S3).
 * 3. POSTs `/admin/api/media/uploads/:uploadGroupId/commit` to
 *    finalise; the Worker HEAD-verifies every variant.
 *
 * Any step's failure short-circuits with a `MediaUploadError` carrying
 * the offending response body (the Worker emits structured Diagnostics).
 */
export async function uploadVariants(args: {
  readonly client: UploadClientOptions;
  readonly purpose: string;
  readonly filename: string;
  readonly variants: ReadonlyArray<EncodedVariant>;
  readonly alt?: string;
  readonly caption?: string;
}): Promise<UploadResult> {
  const { client, purpose, filename, variants, alt, caption } = args;
  const base = client.baseUrl.replace(/\/+$/, "");

  const createBody = {
    filename,
    purpose,
    variants: variants.map((v) => ({
      mimeType: v.mimeType,
      byteSize: v.bytes.byteLength,
      role: v.role,
    })),
    alt,
    caption,
  };
  const createRes = await fetch(`${base}/admin/api/media/uploads`, {
    method: "POST",
    headers: {
      ...authHeaders(client.auth),
      "content-type": "application/json",
    },
    body: JSON.stringify(createBody),
  });
  if (!createRes.ok) {
    throw await MediaUploadError.fromResponse("create_media_upload", createRes);
  }
  const created = (await createRes.json()) as CreateResponse;

  // Match each capability to its source variant by (mimeType, role)
  // so the right bytes go to the right presigned URL even if the
  // server returned them in a different order than we sent.
  for (const cap of created.capabilities) {
    const source = variants.find(
      (v) => v.mimeType === cap.mimeType && v.role === cap.role,
    );
    if (!source) {
      throw new Error(
        `mantle returned a capability we did not request: ${cap.mimeType} (${cap.role})`,
      );
    }
    const putRes = await fetch(cap.uploadUrl, {
      method: "PUT",
      headers: cap.requiredHeaders ?? { "Content-Type": cap.mimeType },
      // Node fetch accepts Buffer / Uint8Array — cast away from
      // `BodyInit` (lib.dom) since this module is Node-only.
      body: source.bytes as unknown as ArrayBuffer,
    });
    if (!putRes.ok) {
      throw await MediaUploadError.fromResponse(
        `r2-put (${cap.mimeType})`,
        putRes,
      );
    }
  }

  const commitRes = await fetch(
    `${base}/admin/api/media/uploads/${encodeURIComponent(created.uploadGroupId)}/commit`,
    {
      method: "POST",
      headers: {
        ...authHeaders(client.auth),
        "content-type": "application/json",
      },
      body: JSON.stringify({ alt, caption }),
    },
  );
  if (!commitRes.ok) {
    throw await MediaUploadError.fromResponse("commit_media_upload", commitRes);
  }
  const asset = (await commitRes.json()) as CommittedMediaAsset;
  return { uploadGroupId: created.uploadGroupId, asset };
}

function authHeaders(
  auth: UploadClientOptions["auth"],
): Record<string, string> {
  return auth.kind === "cookie"
    ? { cookie: auth.value }
    : { authorization: `Bearer ${auth.value}` };
}

/** Carries the failing step's name + the Worker's response body so the
 *  caller can surface structured diagnostics in CLI output / JSON. */
export class MediaUploadError extends Error {
  constructor(
    public readonly step: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`mantle media upload step '${step}' failed (HTTP ${status})`);
    this.name = "MediaUploadError";
  }

  static async fromResponse(step: string, res: Response): Promise<MediaUploadError> {
    let body: unknown;
    try {
      const text = await res.text();
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    return new MediaUploadError(step, res.status, body);
  }
}
