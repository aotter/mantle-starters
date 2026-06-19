#!/usr/bin/env node
/**
 * Shared post-Cloudflare-first-deploy provision helper for Mantle starters.
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
 * NOT create D1/KV/R2/Turnstile resources. Cloudflare's first Git deploy
 * owns automatic provisioning for id-less D1/KV/R2 bindings; Turnstile
 * is a later optional setup.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const COMMAND = process.argv[2];
const SUB_ARGV = process.argv.slice(3);
const CLOUDFLARE_WORKERS_PAGES_URL =
  "https://dash.cloudflare.com/?to=%2F%3Aaccount%2Fworkers-and-pages";

await main();

async function main() {
  if (COMMAND === "plan") {
    await plan(parseArgs(SUB_ARGV));
  } else if (COMMAND === "up") {
    await up(parseArgs(SUB_ARGV));
  } else {
    throw new Error("usage: provision plan|up [args]");
  }
}

async function plan(args) {
  const projectName = args["project-name"] ?? readWorkerName();
  const launchState = readLaunchState();
  const repoTarget = readRepoTarget(launchState, projectName);
  const adminGithubLogin = readAdminGithubLogin(launchState) ?? "<your-github-login>";
  const resourceNotes = readStarterSpecificPlanNotes();
  const featureSteps = await loadFeatureSteps();
  console.log(`
==============================================
Mantle post-deploy provisioning plan
==============================================

Deterministic state:
  Repo:        ${repoTarget}
  Worker name: ${projectName}
  Admin login: ${adminGithubLogin}

Browser handoff 1 - Cloudflare first deploy:
  Open: ${CLOUDFLARE_WORKERS_PAGES_URL}
  Create a Worker from the GitHub repo above.
  Keep the Worker name as "${projectName}" when Cloudflare asks.
  Wait for deploy to finish, then copy the live *.workers.dev URL.
${resourceNotes}

Browser handoff 2 - GitHub OAuth App:
  Open: https://github.com/settings/developers
  Create an OAuth App after the Worker URL is known.
  Homepage URL:               <worker-url>
  Authorization callback URL: <worker-url>/api/auth/callback/github
  Device Flow:                unchecked
  Copy the Client ID. Keep the Client Secret off chat.

Agent commands after the Worker URL and Client ID are known:
  read -rsp "GitHub Client Secret: " GITHUB_CLIENT_SECRET && export GITHUB_CLIENT_SECRET && printf "\\n"

  pnpm run provision:up -- \\
    --worker-url <worker-url> \\
    --github-username ${adminGithubLogin} \\
    --client-id <client-id>

If you first deployed to a custom domain and the worker name cannot be
inferred from a *.workers.dev URL, add:
  --worker-name <cloudflare-worker-name>

Before provision:up, make sure Wrangler is authorized for the same
Cloudflare account:
  pnpm exec wrangler login

Until provision:up finishes, /admin and /api/auth/* should return
setup_incomplete. Public routes should still boot and must not throw
auth configuration exceptions.

Turnstile is optional after launch. If you create a Turnstile widget
later, rerun provision:up with --turnstile-site-key and
TURNSTILE_SECRET_KEY exported.
`);
  printFeatureStepPlan(featureSteps);
}

async function up(args) {
  const workerUrl = normalizeWorkerUrl(requireArg(args, "worker-url"));
  const workerName = args["worker-name"] ?? inferWorkerName(workerUrl);
  const githubUsername = requireArg(args, "github-username");
  const clientId = requireArg(args, "client-id");
  const clientSecret = requireSecretArg(args, "client-secret", "GITHUB_CLIENT_SECRET");
  const turnstileSiteKey = args["turnstile-site-key"];
  const turnstileSecret = args["turnstile-secret"] ?? process.env.TURNSTILE_SECRET_KEY;

  console.log(`Configuring Mantle starter for ${workerUrl}`);

  console.log("\n[1/4] Writing non-secret Worker config...");
  if (workerName) updateWorkerName(workerName);
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

  await runFeatureProvisionSteps({ args, workerUrl });

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

function updateWorkerName(workerName) {
  const path = "wrangler.toml";
  const text = readFileSync(path, "utf8");
  const nameLine = /^name = ".*"$/m;
  if (!nameLine.test(text)) {
    throw new Error('name = "..." line not found in wrangler.toml');
  }
  const next = text.replace(nameLine, `name = ${JSON.stringify(workerName)}`);
  writeFileSync(path, next);
}

function upsertVar(toml, key, value) {
  const line = `${key} = ${JSON.stringify(value)}`;
  const varsHeader = "[vars]\n";
  const idx = toml.indexOf(varsHeader);
  if (idx === -1) throw new Error("[vars] block not found in wrangler.toml");
  const sectionStart = idx + varsHeader.length;
  const nextHeader = toml.slice(sectionStart).search(/\n\[/);
  const sectionEnd = nextHeader === -1 ? toml.length : sectionStart + nextHeader;
  const before = toml.slice(0, sectionStart);
  const section = toml.slice(sectionStart, sectionEnd);
  const after = toml.slice(sectionEnd);
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const varLine = new RegExp(`^${escaped} = ".*"$`, "m");
  const nextSection = varLine.test(section)
    ? section.replace(varLine, line)
    : `${line}\n${section}`;
  return `${before}${nextSection}${after}`;
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
  const operatorSetupUrl = `https://mantle.tools/connect?site=${encodeURIComponent(workerUrl)}`;
  console.log(`
==============================================
Provisioning config written
==============================================

Public URL:  ${workerUrl}
Staff MCP:   ${workerUrl}/mcp/staff
User MCP:    ${workerUrl}/mcp
Operator setup:
             ${operatorSetupUrl}
Sign in:     ${workerUrl}/admin

Next:
  1. Commit the non-secret changes in wrangler.toml, src/mantleConfig.ts,
     mantle/site.md, and AGENTS.md.
  2. Push to GitHub so Cloudflare Workers Builds redeploys from source.
  3. Open /admin and sign in with the GitHub account configured above.

Turnstile/contact remains optional until you wire a real widget.
`);
}

const PHASE_ORDER = new Map([
  ["resources", 0],
  ["config", 1],
  ["secrets", 2],
  ["postDeploy", 3],
  // Legacy feature notes used this phase before the final phase names
  // were documented. Keep it last so the note still prints without
  // changing feature packages in lockstep.
  ["post-scaffold", 4],
]);

async function loadFeatureSteps() {
  const url = new URL("./.mantle-provision.mjs", import.meta.url);
  if (!existsSync(url)) return [];
  const mod = await import(url.href);
  if (!Array.isArray(mod.featureSteps)) return [];
  return mod.featureSteps.filter((step) => step && typeof step === "object");
}

function printFeatureStepPlan(featureSteps) {
  if (featureSteps.length === 0) return;
  console.log("Feature provision steps:");
  for (const step of sortFeatureSteps(featureSteps)) {
    const phase = typeof step.phase === "string" ? step.phase : "postDeploy";
    const id = typeof step.id === "string" ? step.id : "<unnamed>";
    const label = typeof step.label === "string" ? ` — ${step.label}` : "";
    console.log(`  - ${phase}/${id}${label}`);
  }
}

async function runFeatureProvisionSteps({ args, workerUrl }) {
  const featureSteps = sortFeatureSteps(await loadFeatureSteps()).filter(
    (step) => typeof step.run === "function",
  );
  if (featureSteps.length === 0) return;
  console.log("\nFeature provision steps...");
  const ctx = {
    args,
    workerUrl,
    print(line = "") {
      console.log(`  ${line}`);
    },
  };
  for (const step of featureSteps) {
    const phase = typeof step.phase === "string" ? step.phase : "postDeploy";
    const id = typeof step.id === "string" ? step.id : "<unnamed>";
    console.log(`  ${phase}/${id}`);
    await step.run(ctx);
  }
}

function sortFeatureSteps(featureSteps) {
  return [...featureSteps].sort((a, b) => {
    const aPhase = typeof a.phase === "string" ? a.phase : "postDeploy";
    const bPhase = typeof b.phase === "string" ? b.phase : "postDeploy";
    const aOrder = PHASE_ORDER.get(aPhase) ?? 99;
    const bOrder = PHASE_ORDER.get(bPhase) ?? 99;
    return aOrder - bOrder;
  });
}

function readWorkerName() {
  const text = readFileSync("wrangler.toml", "utf8");
  const match = text.match(/^name = "([^"]+)"$/m);
  return match?.[1] ?? "<worker-name>";
}

function readLaunchState() {
  if (!existsSync(".mantle/launch-state.json")) return null;
  try {
    return JSON.parse(readFileSync(".mantle/launch-state.json", "utf8"));
  } catch {
    return null;
  }
}

function readRepoTarget(launchState, projectName) {
  const remote = readGitHubRemoteTarget();
  if (remote) return remote;
  const github = recordField(launchState, "github");
  const repo = recordField(launchState, "repo");
  const owner = stringField(repo, "owner") ?? stringField(github, "owner");
  const name =
    stringField(repo, "name") ??
    stringField(launchState, "project_name") ??
    projectName;
  return owner ? `${owner}/${name}` : `<github-owner>/${name}`;
}

function readAdminGithubLogin(launchState) {
  const github = recordField(launchState, "github");
  return stringField(github, "admin_login") ?? stringField(github, "owner");
}

function readGitHubRemoteTarget() {
  try {
    const raw = execFileSync("git", ["remote", "get-url", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return parseGitHubRemote(raw);
  } catch {
    return null;
  }
}

function parseGitHubRemote(raw) {
  const https = raw.match(/^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (https) return `${https[1]}/${https[2]}`;
  const ssh = raw.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (ssh) return `${ssh[1]}/${ssh[2]}`;
  return null;
}

function recordField(value, key) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const field = value[key];
  return field && typeof field === "object" && !Array.isArray(field) ? field : null;
}

function stringField(value, key) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const field = value[key];
  return typeof field === "string" && field.trim() ? field.trim() : null;
}

function readStarterSpecificPlanNotes() {
  const text = readFileSync("wrangler.toml", "utf8").split(/\n\[env\./, 1)[0];
  const notes = [];
  if (/^\[\[queues\./m.test(text)) {
    const queues = [
      ...new Set(
        [...text.matchAll(/^queue = "([^"]+)"$/gm)].map((match) => match[1]),
      ),
    ].sort();
    notes.push(
      [
        "",
        "Transaction resources:",
        "  This starter declares Cloudflare Queues. Cloudflare automatic",
        "  provisioning currently covers id-less D1/KV/R2 bindings, not",
        "  Queues. If the first dashboard deploy asks for queues, have your",
        "  coding agent run Wrangler after login:",
        ...queues.map((queue) => `    pnpm exec wrangler queues create ${queue}`),
      ].join("\n"),
    );
  }
  if (/^\[\[durable_objects\.bindings\]\]/m.test(text)) {
    notes.push(
      [
        "",
        "Durable Objects:",
        "  This starter declares Durable Object migrations. Keep the",
        "  migrations block committed; Wrangler/Workers deploy applies it",
        "  when the Worker is deployed.",
      ].join("\n"),
    );
  }
  return notes.join("\n");
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

function inferWorkerName(workerUrl) {
  const { hostname } = new URL(workerUrl);
  if (!hostname.endsWith(".workers.dev")) return null;
  const [first] = hostname.split(".");
  return first || null;
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
