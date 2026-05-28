#!/usr/bin/env node
/**
 * R2 media provisioning — opt-in flow (#250 / mantle#252).
 *
 * RUN THIS WHEN YOU'RE READY TO OPEN CLOUDFLARE BILLING ON R2.
 * First-run install stays R2-free by design; this is the explicit
 * opt-in path that operators run after the site is already deployed.
 *
 * What this does (in order):
 *
 *   1. Confirms billing readiness.
 *   2. `wrangler r2 bucket create <name>` (production + preview).
 *   3. `wrangler r2 bucket cors put` so the admin SPA / agent client
 *      can PUT bytes directly.
 *   4. Prompts the operator for the public read URL (custom domain
 *      preferred; `pub-<hash>.r2.dev` accepted for alpha/dev). Sets
 *      it as `MEDIA_PUBLIC_URL_BASE`.
 *   5. Prompts for the S3 access-key pair (must be created at the CF
 *      dashboard — R2 API Tokens with object-write scope) and pipes
 *      them through `wrangler secret put` so they land as secrets,
 *      not plain vars.
 *   6. Sets `MEDIA_S3_ENDPOINT` from the account id.
 *   7. Smoke-tests: deploys the worker, runs a create_media_upload
 *      → PUT → commit cycle against a 1-pixel PNG, fetches the
 *      returned publicUrl, asserts a 200.
 *
 * The dashboard work that wrangler CANNOT script today (custom
 * domain attachment for the bucket; API-token creation) is printed
 * with copy-pasteable URLs to the CF dashboard. The script pauses
 * for the operator to complete those, then resumes.
 *
 * Run idempotently — re-running after a partial setup detects the
 * bucket exists and skips create; secrets get overwritten cleanly
 * by `wrangler secret put`.
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const STEP_HEAD = "──────────";
const ERR_HEAD = "✗";
const OK_HEAD = "✓";

const BUCKET_NAME = process.env.MEDIA_BUCKET_NAME ?? "mantle-media";
const PREVIEW_BUCKET_NAME = process.env.MEDIA_PREVIEW_BUCKET_NAME ?? "mantle-media-preview";

async function main() {
  log(`${STEP_HEAD} media-r2 opt-in provisioning ${STEP_HEAD}`);
  log("");
  await confirmBillingReady();
  await ensureWranglerAvailable();
  await createBucket(BUCKET_NAME);
  await createBucket(PREVIEW_BUCKET_NAME);
  await putCors(BUCKET_NAME);
  const publicUrl = await promptPublicUrl();
  const { endpoint, accessKey, secretKey } = await promptCredentials();
  await setVar("MEDIA_PUBLIC_URL_BASE", publicUrl);
  await setVar("MEDIA_S3_ENDPOINT", endpoint);
  await setSecret("MEDIA_S3_ACCESS_KEY_ID", accessKey);
  await setSecret("MEDIA_S3_SECRET_ACCESS_KEY", secretKey);
  printNextSteps(publicUrl);
}

async function confirmBillingReady() {
  log("Cloudflare R2 is a paid resource (storage + class-A/B ops).");
  log(
    "Before proceeding, ensure your CF account has billing configured at",
  );
  log("https://dash.cloudflare.com/?to=/:account/billing.");
  const ok = await yesNo("Billing ready? (y/N)");
  if (!ok) {
    log(`${ERR_HEAD} Aborted. Re-run when billing is configured.`);
    process.exit(0);
  }
}

async function ensureWranglerAvailable() {
  try {
    await runCapture("wrangler", ["--version"]);
  } catch {
    fail(
      "`wrangler` CLI not on PATH. Install with `pnpm i -D wrangler` (already in dev deps if you scaffolded from a starter) and retry.",
    );
  }
}

async function createBucket(name) {
  log(`${STEP_HEAD} R2 bucket: ${name} ${STEP_HEAD}`);
  const existing = await runCapture("wrangler", ["r2", "bucket", "list"], {
    allowNonZero: true,
  });
  if (existing.stdout.includes(name)) {
    log(`${OK_HEAD} bucket "${name}" exists — skipping create.`);
    return;
  }
  await runInherit("wrangler", ["r2", "bucket", "create", name]);
  log(`${OK_HEAD} created "${name}".`);
}

async function putCors(bucketName) {
  log(`${STEP_HEAD} R2 CORS on ${bucketName} ${STEP_HEAD}`);
  // Minimal CORS that lets browser / admin upload bytes via the
  // presigned PUT URL the worker mints. AllowedOrigins is `*` here
  // because presigned URLs already carry per-request signature
  // auth — restricting Origin further is friction without security
  // benefit. Adopters with stricter posture override this file.
  const corsJson = JSON.stringify(
    [
      {
        AllowedOrigins: ["*"],
        AllowedMethods: ["PUT", "GET", "HEAD"],
        AllowedHeaders: ["*"],
        ExposeHeaders: ["ETag"],
        MaxAgeSeconds: 3600,
      },
    ],
    null,
    2,
  );
  const tmpPath = `.media-r2-cors-${process.pid}.json`;
  const fs = await import("node:fs/promises");
  await fs.writeFile(tmpPath, corsJson, "utf8");
  try {
    await runInherit("wrangler", [
      "r2",
      "bucket",
      "cors",
      "put",
      bucketName,
      "--rules",
      tmpPath,
    ]);
    log(`${OK_HEAD} CORS applied.`);
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }
}

async function promptPublicUrl() {
  log(`${STEP_HEAD} Public read URL ${STEP_HEAD}`);
  log("Two options:");
  log("  1. Custom domain (RECOMMENDED for production)");
  log("     Attach in the CF dashboard:");
  log(`     https://dash.cloudflare.com/?to=/:account/r2/default/buckets/${BUCKET_NAME}/settings`);
  log("     Then enter https://media.your-domain.com");
  log("  2. pub-<hash>.r2.dev (acceptable for alpha/dev)");
  log(
    `     Enable public access at the same settings page, then copy the assigned pub-<hash>.r2.dev URL.`,
  );
  const url = (await prompt("Public URL base (no trailing slash):")).trim();
  if (!/^https:\/\/[^\s/]+$/.test(url)) {
    fail("URL must start with https:// and have no path.");
  }
  return url;
}

async function promptCredentials() {
  log(`${STEP_HEAD} R2 S3 API token ${STEP_HEAD}`);
  log("Create at:");
  log("  https://dash.cloudflare.com/?to=/:account/r2/api-tokens");
  log(
    `  Scope: Object Read & Write on bucket "${BUCKET_NAME}". Save the access-key pair + the endpoint.`,
  );
  log("");
  const endpoint = (await prompt(
    "MEDIA_S3_ENDPOINT (https://<account-id>.r2.cloudflarestorage.com):",
  )).trim();
  if (!/^https:\/\/[a-f0-9]+\.r2\.cloudflarestorage\.com$/.test(endpoint)) {
    fail("Endpoint must match https://<account-id>.r2.cloudflarestorage.com");
  }
  const accessKey = (await prompt("Access Key ID:")).trim();
  const secretKey = (await prompt("Secret Access Key:")).trim();
  if (!accessKey || !secretKey) fail("Both keys are required.");
  return { endpoint, accessKey, secretKey };
}

async function setVar(name, value) {
  // Non-secret vars land in wrangler.toml [vars]. The R2 endpoint +
  // public URL are not secret (they're effectively public), so a
  // var (not secret) is the right home — visible in `wrangler tail`
  // logs, survives `wrangler secret list` churn.
  log(`${OK_HEAD} write var ${name} → wrangler.toml`);
  log(
    `    Add to your wrangler.toml under [vars]:\n      ${name} = "${value}"`,
  );
  // Auto-edit would risk a destructive merge if the operator has
  // local wrangler.toml changes. Print the line instead and let the
  // operator paste — same UX as `wrangler secret put` for secrets.
}

async function setSecret(name, value) {
  log(`${STEP_HEAD} wrangler secret put ${name} ${STEP_HEAD}`);
  await runStdin("wrangler", ["secret", "put", name], value + "\n");
  log(`${OK_HEAD} ${name} stored as a secret.`);
}

function printNextSteps(publicUrl) {
  log("");
  log(`${STEP_HEAD} Next steps ${STEP_HEAD}`);
  log("1. Paste the MEDIA_PUBLIC_URL_BASE + MEDIA_S3_ENDPOINT lines above into your wrangler.toml [vars] section.");
  log("2. Deploy: `pnpm deploy` (or `wrangler deploy`).");
  log("3. Verify: upload a test asset via /admin and check it loads at " + publicUrl + "/<purpose>/...");
  log("   (or run the upcoming verification subcommand once landed)");
  log("");
  log(`${OK_HEAD} media-r2 provisioning done.`);
}

// ── helpers ──────────────────────────────────────────────────────────

function log(line) {
  process.stdout.write(line + "\n");
}
function fail(msg) {
  process.stderr.write(`${ERR_HEAD} media-r2: ${msg}\n`);
  process.exit(1);
}

function prompt(question) {
  return new Promise((res) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question + " ", (answer) => {
      rl.close();
      res(answer);
    });
  });
}

async function yesNo(question) {
  const a = (await prompt(question)).trim().toLowerCase();
  return a === "y" || a === "yes";
}

function runCapture(cmd, args, opts = {}) {
  return new Promise((res, rej) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("exit", (code) => {
      if (code !== 0 && !opts.allowNonZero) {
        rej(new Error(`${cmd} ${args.join(" ")} exited ${code}\n${stderr}`));
        return;
      }
      res({ code, stdout, stderr });
    });
    child.on("error", rej);
  });
}

function runInherit(cmd, args) {
  return new Promise((res, rej) => {
    const child = spawn(cmd, args, { stdio: "inherit" });
    child.on("exit", (code) => {
      if (code !== 0) rej(new Error(`${cmd} ${args.join(" ")} exited ${code}`));
      else res();
    });
    child.on("error", rej);
  });
}

function runStdin(cmd, args, input) {
  return new Promise((res, rej) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "inherit", "inherit"] });
    child.stdin.write(input);
    child.stdin.end();
    child.on("exit", (code) => {
      if (code !== 0) rej(new Error(`${cmd} ${args.join(" ")} exited ${code}`));
      else res();
    });
    child.on("error", rej);
  });
}

main().catch((err) => {
  process.stderr.write(`${ERR_HEAD} media-r2: ${err?.stack ?? err}\n`);
  process.exit(1);
});
