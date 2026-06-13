#!/usr/bin/env node
/**
 * Post-Cloudflare-first-deploy provision helper for Mantle Publication.
 *
 * Happy path:
 *   1. The user's agent scaffolds and pushes this repo.
 *   2. The user imports the repo in Cloudflare Workers Builds and runs
 *      the first deploy from the dashboard/GitHub integration.
 *   3. The user reports the Worker URL back to the agent.
 *   4. The user creates a GitHub OAuth App with that URL.
 *   5. The agent runs this script to write non-secret config and set
 *      Worker secrets via Wrangler.
 *
 * This script intentionally does NOT use CLOUDFLARE_API_TOKEN and does
 * NOT create D1/KV/Turnstile resources. Cloudflare's first Git deploy
 * owns D1/KV auto-provisioning; Turnstile is a later optional setup.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const COMMAND = process.argv[2];
const SUB_ARGV = process.argv.slice(3);

if (COMMAND === "plan") {
  plan(parseArgs(SUB_ARGV));
} else if (COMMAND === "up") {
  up(parseArgs(SUB_ARGV));
} else {
  throw new Error("usage: provision plan|up [args]");
}

function plan(args) {
  const projectName = args["project-name"] ?? readWorkerName();
  console.log(`
==============================================
Mantle post-deploy provisioning plan
==============================================

Cloudflare first:
  1. Push this repo to GitHub.
  2. In Cloudflare dashboard, create a Worker from GitHub and select this repo.
  3. Keep the Worker name as: ${projectName}
  4. Run the first deploy.
  5. Copy the deployed Worker URL and come back to your coding agent.

GitHub OAuth App next:
  1. Open https://github.com/settings/developers → New OAuth App
  2. Fill in:
       Application name:           ${projectName}
       Homepage URL:               <worker-url>
       Authorization callback URL: <worker-url>/api/auth/callback/github
       Enable Device Flow:         leave UNCHECKED
  3. Register application.
  4. Copy Client ID. Generate Client Secret. Copy Client Secret once.

Agent handoff:
  read -rsp "GitHub Client Secret: " GITHUB_CLIENT_SECRET && export GITHUB_CLIENT_SECRET && printf "\\n"

  pnpm run provision:up -- \\
    --worker-url <worker-url> \\
    --github-username <your-github-login> \\
    --client-id <client-id>

Before provision:up, make sure Wrangler is authorized for the same
Cloudflare account:
  pnpm exec wrangler login

Turnstile is optional after launch. If you create a Turnstile widget
later, rerun provision:up with --turnstile-site-key and
TURNSTILE_SECRET_KEY exported.
`);
}

function up(args) {
  const workerUrl = normalizeWorkerUrl(requireArg(args, "worker-url"));
  const githubUsername = requireArg(args, "github-username");
  const clientId = requireArg(args, "client-id");
  const clientSecret = requireSecretArg(args, "client-secret", "GITHUB_CLIENT_SECRET");
  const turnstileSiteKey = args["turnstile-site-key"];
  const turnstileSecret = args["turnstile-secret"] ?? process.env.TURNSTILE_SECRET_KEY;

  console.log(`Configuring Mantle publication for ${workerUrl}`);

  console.log("\n[1/4] Writing non-secret Worker config...");
  updateWranglerToml({
    publicOrigin: workerUrl,
    githubClientId: clientId,
    adminGithubLogin: githubUsername,
    turnstileSiteKey,
  });
  updateOrigin(workerUrl);

  console.log("\n[2/4] Setting Worker secrets with Wrangler...");
  const existingSecrets = listSecrets();
  pipeSecret("GITHUB_CLIENT_SECRET", clientSecret);
  if (existingSecrets.has("BETTER_AUTH_SECRET")) {
    console.log("  BETTER_AUTH_SECRET already exists; leaving it unchanged.");
  } else {
    pipeSecret("BETTER_AUTH_SECRET", randomBytes(32).toString("base64url"));
  }
  if (turnstileSecret) {
    pipeSecret("TURNSTILE_SECRET_KEY", turnstileSecret);
  } else {
    console.log("  TURNSTILE_SECRET_KEY skipped (contact/Turnstile can be wired later).");
  }

  console.log("\n[3/4] Updating mantle/site.md + AGENTS.md...");
  updateSiteSemanticLayer(workerUrl);

  console.log("\n[4/4] Done.");
  printHandoff(workerUrl);
}

function updateWranglerToml({
  publicOrigin,
  githubClientId,
  adminGithubLogin,
  turnstileSiteKey,
}) {
  let toml = readFileSync("wrangler.toml", "utf8");
  toml = upsertVar(toml, "PUBLIC_ORIGIN", publicOrigin);
  toml = upsertVar(toml, "GITHUB_CLIENT_ID", githubClientId);
  toml = upsertVar(toml, "ADMIN_GITHUB_LOGIN", adminGithubLogin);
  if (turnstileSiteKey) {
    toml = upsertVar(toml, "TURNSTILE_SITE_KEY", turnstileSiteKey);
  }
  writeFileSync("wrangler.toml", toml);
}

function upsertVar(toml, key, value) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const line = `${key} = ${JSON.stringify(value)}`;
  const next = toml.replace(new RegExp(`^${escaped} = ".*"$`, "m"), line);
  if (next !== toml) return next;
  const varsHeader = "[vars]\n";
  const idx = toml.indexOf(varsHeader);
  if (idx === -1) throw new Error("[vars] block not found in wrangler.toml");
  return `${toml.slice(0, idx + varsHeader.length)}${line}\n${toml.slice(idx + varsHeader.length)}`;
}

function updateOrigin(workerUrl) {
  const path = "src/mantleConfig.ts";
  const text = readFileSync(path, "utf8");
  const next = text.replace(/origin: ".*",/m, `origin: ${JSON.stringify(workerUrl)},`);
  if (next === text) throw new Error("origin line not found in src/mantleConfig.ts");
  writeFileSync(path, next);
}

/**
 * Rewrites the site_url placeholder and appends a `revisions:` entry to
 * mantle/site.md and AGENTS.md per ADR-0016. Skipped if the files do
 * not exist (legacy installs predating the site-semantic-layer).
 */
function updateSiteSemanticLayer(workerUrl) {
  const isoNow = new Date().toISOString();
  if (existsSync("mantle/site.md")) {
    const before = readFileSync("mantle/site.md", "utf8");
    let after = before.replace(/^site_url: .*$/m, `site_url: ${workerUrl}`);
    after = appendRevision(after, isoNow, "provision", `deployed to ${workerUrl}`);
    if (after === before) {
      console.log("  mantle/site.md unchanged (no frontmatter site_url to update)");
    } else {
      writeFileSync("mantle/site.md", after);
      console.log("  mantle/site.md: site_url + revisions entry updated");
    }
  }
  if (existsSync("AGENTS.md")) {
    const before = readFileSync("AGENTS.md", "utf8");
    const after = before.replace(/^Public site: .*$/m, `Public site: ${workerUrl}`);
    if (after === before) {
      console.log("  AGENTS.md unchanged (no Public site line to update)");
    } else {
      writeFileSync("AGENTS.md", after);
      console.log("  AGENTS.md: Public site URL updated");
    }
  }
}

/**
 * Adds `- at: <iso>` / `by:` / `summary:` items at the end of the
 * `revisions:` YAML list in frontmatter. The list must already exist
 * (the install template seeds it with the install entry).
 */
function appendRevision(text, isoNow, by, summary) {
  if (!text.startsWith("---\n")) return text;
  const closeIdx = text.indexOf("\n---", 4);
  if (closeIdx === -1) return text;
  if (text.slice(0, closeIdx).indexOf("\nrevisions:") === -1) return text;
  const block = `  - at: ${isoNow}\n    by: ${by}\n    summary: ${JSON.stringify(summary)}`;
  return `${text.slice(0, closeIdx)}\n${block}${text.slice(closeIdx)}`;
}

function pipeSecret(name, value) {
  console.log(`  ${name}`);
  execFileSync("pnpm", ["exec", "wrangler", "secret", "put", name], {
    input: value,
    stdio: ["pipe", "inherit", "inherit"],
  });
}

function listSecrets() {
  try {
    const raw = execFileSync("pnpm", ["exec", "wrangler", "secret", "list"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    });
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set(parsed.map((entry) => entry?.name).filter(Boolean));
      }
    } catch {
      // Wrangler's text output still includes secret names. Fall through.
    }
    return new Set(raw.split(/\s+/).filter(Boolean));
  } catch {
    console.log("  Could not list existing secrets; proceeding with first-run secret setup.");
    return new Set();
  }
}

function printHandoff(workerUrl) {
  console.log(`
==============================================
Provisioning config written
==============================================

Public URL:  ${workerUrl}
Staff MCP:   ${workerUrl}/mcp/staff
User MCP:    ${workerUrl}/mcp
Sign in:     ${workerUrl}/admin

Next:
  1. Commit the non-secret changes in wrangler.toml, src/mantleConfig.ts,
     mantle/site.md, and AGENTS.md.
  2. Push to GitHub so Cloudflare Workers Builds redeploys from source.
  3. Open /admin and sign in with the GitHub account configured above.

Turnstile/contact remains optional until you wire a real widget.
`);
}

function readWorkerName() {
  const text = readFileSync("wrangler.toml", "utf8");
  const match = text.match(/^name = "([^"]+)"$/m);
  return match?.[1] ?? "<worker-name>";
}

function normalizeWorkerUrl(raw) {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("--worker-url must be https unless it is localhost");
  }
  url.hash = "";
  url.search = "";
  url.pathname = "";
  return url.toString().replace(/\/$/, "");
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--") continue;
    if (!key?.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${key}`);
    out[key.slice(2)] = value;
    i += 1;
  }
  return out;
}

function requireArg(args, key) {
  const value = args[key];
  if (!value) throw new Error(`Missing --${key}`);
  return value;
}

function requireSecretArg(args, key, envKey) {
  const value = args[key] ?? process.env[envKey];
  if (!value) throw new Error(`Missing --${key} or ${envKey}`);
  return value;
}
