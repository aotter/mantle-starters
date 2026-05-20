/**
 * Media uploads integration smoke (multi-variant flow, aotter/mantle#272).
 * Assumes:
 *   - wrangler dev is running on http://localhost:8788 (override via
 *     WRANGLER_BASE_URL env var). Test profile must have R2 binding
 *     `MEDIA` + the `MEDIA_*` env vars set; see `wrangler.toml`.
 *   - `pnpm fixture` has been applied (staff row for u-staff-1).
 *
 * Validates the create + commit MCP tools end-to-end against a real
 * Worker:
 *
 *   1. tools/list contains both `create_media_upload` and
 *      `commit_media_upload`.
 *   2. `create_media_upload` returns a well-formed multi-variant
 *      response: uploadGroupId + one capability per declared variant
 *      (avif/webp/jpeg), each pointing at the S3 endpoint with
 *      signed query params and `Content-Type` requiredHeader.
 *   3. mime allowlist rejection bubbles a structured diagnostic
 *      (`MEDIA_MIME_REJECTED`) on application/octet-stream.
 *   4. Incomplete variants (missing required mime) →
 *      `MEDIA_VARIANTS_INCOMPLETE`.
 *   5. `commit_media_upload` with an unknown uploadGroupId surfaces
 *      `MEDIA_UPLOAD_EXPIRED` (no KV mapping found).
 *
 * What this DOESN'T cover (deliberate, requires real R2):
 *   - the actual presigned PUT to the S3 endpoint succeeding. The URL
 *     points at `<bucket>.<account>.r2.cloudflarestorage.com` which
 *     resolves only on real Cloudflare. Local miniflare emulates the
 *     R2 binding (head/put/delete) but not the S3 API host. Manual
 *     remote validation: `wrangler dev --remote` against a real R2
 *     bucket, or a deployed Worker. The use cases / adapter contract
 *     above is what carries forward to that validation.
 *
 * Exit non-zero on assertion failure with the failing context printed.
 */
import { strict as assert } from "node:assert";
import { makeMcpClient } from "./mcp-client.js";

const BASE = process.env.WRANGLER_BASE_URL ?? "http://localhost:8788";
const { rpc, tool, toolErr } = makeMcpClient(BASE);

interface CreateMediaUploadResponse {
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

const THREE_VARIANT_REQUEST = {
  filename: "smoke.jpg",
  purpose: "post-cover",
  variants: [
    { mimeType: "image/avif", byteSize: 60_000, role: "alternate" },
    { mimeType: "image/webp", byteSize: 80_000, role: "alternate" },
    { mimeType: "image/jpeg", byteSize: 110_000, role: "primary" },
  ],
};

async function main(): Promise<void> {
  // 1. tools/list — confirm media tools are registered when the
  //    runtime has `mediaStorage` bound (test profile has R2 + env).
  {
    const r = await rpc("tools/list");
    const result = r.result as { tools: ReadonlyArray<{ name: string }> };
    const names = result.tools.map((t) => t.name);
    assert.ok(names.includes("create_media_upload"), "tools/list missing create_media_upload");
    assert.ok(names.includes("commit_media_upload"), "tools/list missing commit_media_upload");
    console.log(`[media] 1/5  tools/list → media tools registered`);
  }

  // 2. create_media_upload — multi-variant capability shape.
  {
    const res = await tool<CreateMediaUploadResponse>(
      "create_media_upload",
      THREE_VARIANT_REQUEST,
    );
    assert.ok(res.uploadGroupId.length > 0, "uploadGroupId missing");
    assert.equal(res.capabilities.length, 3, `expected 3 capabilities, got ${res.capabilities.length}`);
    const mimes = res.capabilities.map((c) => c.mimeType).sort();
    assert.deepEqual(mimes, ["image/avif", "image/jpeg", "image/webp"]);
    for (const cap of res.capabilities) {
      assert.equal(cap.method, "PUT");
      assert.ok(cap.uploadUrl.includes("r2.cloudflarestorage.com"), `uploadUrl shape unexpected: ${cap.uploadUrl}`);
      assert.ok(cap.uploadUrl.includes("X-Amz-Expires="), "uploadUrl missing X-Amz-Expires");
      assert.equal(cap.requiredHeaders?.["Content-Type"], cap.mimeType);
    }
    assert.ok(res.expiresAt > Date.now() - 5_000, "expiresAt is in the past");
    console.log(`[media] 2/5  create_media_upload → uploadGroupId=${res.uploadGroupId.slice(0, 8)}… (3 caps)`);
  }

  // 3. Extras rejected: variants outside policy.required (octet-stream
  //    here) trip the closed-set branch of assertVariantsCoverPolicy.
  //    The global mime allowlist gate (assertEachVariantAccepted) is
  //    NOT reachable against this worker — the closed-set check runs
  //    first and rejects octet-stream before the allowlist sees it.
  //    That gate is covered at the unit-test layer (media.test.ts
  //    "rejects mime types outside the allowlist on any variant").
  {
    const err = await toolErr("create_media_upload", {
      filename: "extras.jpg",
      purpose: "post-cover",
      variants: [
        { mimeType: "image/avif", byteSize: 60_000, role: "alternate" },
        { mimeType: "image/webp", byteSize: 80_000, role: "alternate" },
        { mimeType: "image/jpeg", byteSize: 110_000, role: "primary" },
        // Extra mime outside `required: [avif, webp, jpeg]` — should
        // fire the extras-rejected branch of MEDIA_VARIANTS_INCOMPLETE.
        { mimeType: "application/octet-stream", byteSize: 100, role: "alternate" },
      ],
    });
    assert.equal(
      err.data?.code,
      "MEDIA_VARIANTS_INCOMPLETE",
      `expected MEDIA_VARIANTS_INCOMPLETE for extra octet-stream variant, got ${JSON.stringify(err)}`,
    );
    console.log(`[media] 3/5  create_media_upload(+ extra octet-stream) → MEDIA_VARIANTS_INCOMPLETE (extras branch)`);
  }

  // 4. Missing required mime → MEDIA_VARIANTS_INCOMPLETE (missing branch).
  {
    const err = await toolErr("create_media_upload", {
      filename: "incomplete.jpg",
      purpose: "post-cover",
      variants: [
        // Just jpeg — missing avif + webp from the post-cover policy.
        { mimeType: "image/jpeg", byteSize: 100, role: "primary" },
      ],
    });
    assert.equal(
      err.data?.code,
      "MEDIA_VARIANTS_INCOMPLETE",
      `expected MEDIA_VARIANTS_INCOMPLETE, got ${JSON.stringify(err)}`,
    );
    console.log(`[media] 4/5  create_media_upload(missing avif+webp) → MEDIA_VARIANTS_INCOMPLETE`);
  }

  // 5. commit with unknown uploadGroupId → MEDIA_UPLOAD_EXPIRED.
  //    Validates the KV-lookup gate without needing actual S3 PUT.
  {
    const err = await toolErr("commit_media_upload", { uploadGroupId: "nonexistent-upload-id" });
    assert.equal(err.data?.code, "MEDIA_UPLOAD_EXPIRED", `expected MEDIA_UPLOAD_EXPIRED, got ${JSON.stringify(err)}`);
    console.log(`[media] 5/5  commit_media_upload(unknown) → MEDIA_UPLOAD_EXPIRED`);
  }

  console.log(`[media] all assertions passed`);
}

main().catch((err) => {
  console.error(`[media] FAILED: ${(err as Error).message}`);
  if ((err as Error).stack) console.error((err as Error).stack);
  process.exit(1);
});
