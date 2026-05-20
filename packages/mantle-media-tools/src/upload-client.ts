import type { EncodedVariant } from "./encode.js";

/**
 * Thin MCP JSON-RPC client for the multi-variant media upload flow
 * (aotter/mantle#272). Targets the mantle worker's `/mcp/staff`
 * surface, not `/admin/api/media/uploads` — the MCP route is
 * Better-Auth + OAuth-Provider gated and accepts bearer tokens,
 * which is the agent-friendly path. The admin REST endpoint is
 * cookie-only (browser admin SPA), so a CLI / scaffolder using a
 * bearer token would 401 against it.
 *
 * Flow:
 *
 *   POST <baseUrl>/mcp/staff  (tools/call create_media_upload)
 *     → variants[] manifest in → uploadGroupId + N capabilities out
 *   PUT cap.uploadUrl × N (presigned R2 URLs; Worker bypassed)
 *   POST <baseUrl>/mcp/staff  (tools/call commit_media_upload)
 *     → uploadGroupId in → committed MediaAsset out
 *
 * Any tool-call failure surfaces as `MediaUploadError` carrying the
 * Worker's structured Diagnostic (`error.data`) so agent consumers
 * can route on the diagnostic code without parsing prose.
 */
export interface UploadClientOptions {
  /** Worker origin, e.g. `https://my-blog.example`. No trailing slash;
   *  the client appends the MCP staff path. */
  readonly baseUrl: string;
  /** OAuth bearer for the `/mcp/staff` resource. Obtained via the
   *  Worker's OAuth provider flow (admin sign-in → grant). Agents
   *  running locally use a fixture-minted token (see the starter's
   *  `pnpm fixture` output). */
  readonly bearer: string;
  /** Override the default `/mcp/staff` path. Useful for test
   *  fixtures that mount the dispatcher at a different prefix. */
  readonly mcpPath?: string;
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
 * Drive the full create → PUT-all → commit lifecycle through the MCP
 * staff transport.
 *
 * Variant-to-capability matching is by `(mimeType, role)` rather than
 * array order — the runtime asserts uniqueness on that pair, so the
 * pairing is unambiguous and tolerant of the server returning
 * capabilities in any order.
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
  const created = await callTool<CreateResponse>(client, "create_media_upload", {
    filename,
    purpose,
    variants: variants.map((v) => ({
      mimeType: v.mimeType,
      byteSize: v.bytes.byteLength,
      role: v.role,
    })),
    alt,
    caption,
  });

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
      throw await MediaUploadError.fromHttp(`r2-put (${cap.mimeType})`, putRes);
    }
  }

  const asset = await callTool<CommittedMediaAsset>(client, "commit_media_upload", {
    uploadGroupId: created.uploadGroupId,
    alt,
    caption,
  });

  return { uploadGroupId: created.uploadGroupId, asset };
}

interface JsonRpcResponse<T> {
  readonly jsonrpc: "2.0";
  readonly id: number;
  readonly result?: { readonly content?: ReadonlyArray<{ readonly type: string; readonly text: string }> };
  readonly error?: {
    readonly code: number;
    readonly message: string;
    readonly data?: unknown;
  };
}

async function callTool<T>(
  client: UploadClientOptions,
  toolName: string,
  toolArgs: Record<string, unknown>,
): Promise<T> {
  const base = client.baseUrl.replace(/\/+$/, "");
  const mcpPath = client.mcpPath ?? "/mcp/staff";
  const url = `${base}${mcpPath}`;
  const body = {
    jsonrpc: "2.0" as const,
    id: 1,
    method: "tools/call",
    params: { name: toolName, arguments: toolArgs },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${client.bearer}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw await MediaUploadError.fromHttp(toolName, res);
  }
  const envelope = (await res.json()) as JsonRpcResponse<unknown>;
  if (envelope.error) {
    throw new MediaUploadError(toolName, -1, envelope.error.data ?? envelope.error);
  }
  const text = envelope.result?.content?.[0]?.text;
  if (!text) {
    throw new Error(`MCP tool '${toolName}' returned no content`);
  }
  return JSON.parse(text) as T;
}

/** Carries the failing step's name + the Worker's response body so
 *  the caller can surface structured diagnostics. `status` is -1 when
 *  the tool returned a JSON-RPC error envelope (HTTP 200, but
 *  `error.data` populated with the runtime Diagnostic). */
export class MediaUploadError extends Error {
  constructor(
    public readonly step: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(
      status >= 0
        ? `mantle media upload step '${step}' failed (HTTP ${status})`
        : `mantle media upload step '${step}' failed (tool diagnostic)`,
    );
    this.name = "MediaUploadError";
  }

  static async fromHttp(step: string, res: Response): Promise<MediaUploadError> {
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
