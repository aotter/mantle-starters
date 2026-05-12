#!/usr/bin/env node
/**
 * Single-shot provision orchestrator for clam-cms-starter-publication.
 *
 * Two subcommands:
 *
 *   pnpm run provision:plan -- --project-name X
 *     Reads CF account state, computes the worker URL, and prints the
 *     resources that will be created plus the GitHub OAuth App
 *     instructions. No side effects.
 *
 *   GITHUB_CLIENT_SECRET=... pnpm run provision:up -- \
 *       --project-name X --github-username Y --client-id Z \
 *       [--client-secret W]
 *     Creates D1 + render KV + Turnstile widget via CF API, writes
 *     wrangler.toml + site defaults, deploys, sets worker
 *     secrets, and prints the final handoff. It never seeds production
 *     content. CLOUDFLARE_API_TOKEN must be exported.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const COMMAND = process.argv[2];
const SUB_ARGV = process.argv.slice(3);

if (COMMAND === "plan") {
  await plan(parseArgs(SUB_ARGV));
} else if (COMMAND === "up") {
  await up(parseArgs(SUB_ARGV));
} else {
  throw new Error("usage: provision plan|up [args]");
}

async function plan(args) {
  const projectName = requireArg(args, "project-name");
  const names = resourceNames(projectName);
  const token = requireToken();
  const ctx = await fetchContext(token, projectName);
  printPlan(ctx, names);
}

async function up(args) {
  const projectName = requireArg(args, "project-name");
  const names = resourceNames(projectName);
  const githubUsername = requireArg(args, "github-username");
  const clientId = requireArg(args, "client-id");
  const clientSecret = requireSecretArg(args, "client-secret", "GITHUB_CLIENT_SECRET");
  if (args["seed-file"]) {
    throw new Error(
      [
        "provision:up no longer applies seed files.",
        "Provision first, ask the site owner what initial content they want, then create content through MCP/admin authoring.",
        "seed:initial and fixture data are for tests and OSS contributor local dev only.",
      ].join(" "),
    );
  }
  const token = requireToken();

  const ctx = await fetchContext(token, projectName);
  console.log(`Provisioning ${projectName} → ${ctx.workerUrl}`);

  console.log("\n[1/5] Creating Cloudflare resources...");
  const d1 = await createD1(token, ctx.accountId, names.d1);
  const renderKv = await createKv(token, ctx.accountId, names.renderKv);
  const widget = await createWidget(token, ctx.accountId, names.turnstile, ctx.hostname);
  console.log(`  D1:        ${d1.uuid}`);
  console.log(`  Render KV: ${renderKv.id}`);
  console.log(`  Turnstile: ${widget.sitekey}`);

  console.log("\n[2/5] Writing wrangler.toml + site defaults...");
  updateWranglerToml({
    d1Id: d1.uuid,
    renderKvId: renderKv.id,
    turnstileSiteKey: widget.sitekey,
    publicOrigin: ctx.workerUrl,
  });
  updateOrigin(ctx.workerUrl);

  console.log("\n[3/5] Deploying worker...");
  execFileSync("pnpm", ["run", "deploy"], { stdio: "inherit" });

  console.log("\n[4/5] Setting worker secrets...");
  pipeSecret("ADMIN_GITHUB_LOGIN", githubUsername);
  pipeSecret("GITHUB_CLIENT_ID", clientId);
  pipeSecret("GITHUB_CLIENT_SECRET", clientSecret);
  pipeSecret("BETTER_AUTH_SECRET", randomBytes(32).toString("base64url"));
  pipeSecret("TURNSTILE_SECRET_KEY", widget.secret);

  console.log("\n[5/6] Initial content intentionally skipped.");
  console.log("  Ask the site owner what to publish first, then use MCP/admin authoring.");

  console.log("\n[6/6] Updating mantle/site.md + AGENTS.md...");
  updateSiteSemanticLayer(ctx.workerUrl);

  printHandoff(ctx, names);
}

function resourceNames(projectName) {
  return {
    projectName,
    worker: projectName,
    d1: `${projectName}-db`,
    renderKv: `${projectName}-render`,
    turnstile: projectName,
  };
}

async function fetchContext(token, projectName) {
  const accounts = await cf(token, "/accounts");
  if (accounts.length !== 1) {
    throw new Error(`expected 1 account, got ${accounts.length}; refine token scope`);
  }
  const account = accounts[0];
  const sub = await cf(token, `/accounts/${account.id}/workers/subdomain`);
  const subdomain = sub.subdomain;
  if (!subdomain) {
    throw new Error("workers.dev subdomain not set on this account; visit dash.cloudflare.com → Workers to claim one");
  }
  const hostname = `${projectName}.${subdomain}.workers.dev`;
  return {
    accountId: account.id,
    accountName: account.name,
    subdomain,
    hostname,
    workerUrl: `https://${hostname}`,
  };
}

async function createD1(token, accountId, name) {
  return cf(token, `/accounts/${accountId}/d1/database`, { method: "POST", body: { name } });
}

async function createKv(token, accountId, title) {
  return cf(token, `/accounts/${accountId}/storage/kv/namespaces`, {
    method: "POST",
    body: { title },
  });
}

async function createWidget(token, accountId, name, domain) {
  return cf(token, `/accounts/${accountId}/challenges/widgets`, {
    method: "POST",
    body: { name, domains: [domain], mode: "managed" },
  });
}

async function cf(token, path, opts = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method: opts.method ?? "GET",
    headers: {
      authorization: `Bearer ${token}`,
      ...(opts.body ? { "content-type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(`CF API ${opts.method ?? "GET"} ${path} failed: ${JSON.stringify(data.errors)}`);
  }
  return data.result;
}

function updateWranglerToml({ d1Id, renderKvId, turnstileSiteKey, publicOrigin }) {
  let toml = readFileSync("wrangler.toml", "utf8");
  toml = replaceInBlock(toml, "d1_databases", 'binding = "DB"', "database_id", d1Id);
  toml = replaceInBlock(toml, "kv_namespaces", 'binding = "KV"', "id", renderKvId);
  toml = upsertVar(toml, "TURNSTILE_SITE_KEY", turnstileSiteKey);
  toml = upsertVar(toml, "PUBLIC_ORIGIN", publicOrigin);
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
  const path = "src/clamConfig.ts";
  const text = readFileSync(path, "utf8");
  const next = text.replace(/origin: ".*",/m, `origin: ${JSON.stringify(workerUrl)},`);
  if (next === text) throw new Error("origin line not found in src/clamConfig.ts");
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
    let after = before.replace(
      /^site_url: .*$/m,
      `site_url: ${workerUrl}`,
    );
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
    const after = before.replace(
      /^Public site: .*$/m,
      `Public site: ${workerUrl}`,
    );
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

function replaceInBlock(text, table, bindingLine, key, value) {
  const header = `[[${table}]]`;
  const start = text.indexOf(`${header}\n${bindingLine}`);
  if (start === -1) throw new Error(`Could not find ${header} with ${bindingLine}`);
  const next = text.indexOf("\n[[", start + header.length);
  const end = next === -1 ? text.length : next;
  const block = text.slice(start, end);
  const rewritten = block.replace(
    new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} = ".*"$`, "m"),
    `${key} = ${JSON.stringify(value)}`,
  );
  if (rewritten === block) throw new Error(`Could not update ${key} in ${bindingLine}`);
  return `${text.slice(0, start)}${rewritten}${text.slice(end)}`;
}

function pipeSecret(name, value) {
  execFileSync("pnpm", ["exec", "wrangler", "secret", "put", name], {
    input: value,
    stdio: ["pipe", "inherit", "inherit"],
  });
}

function printPlan(ctx, names) {
  const callback = `${ctx.workerUrl}/admin/auth/github/callback`;
  console.log(`
==============================================
Provisioning plan for ${names.projectName}
==============================================

Cloudflare account: ${ctx.accountName} (${ctx.accountId})
Worker URL:         ${ctx.workerUrl}

Will create:
  Worker            ${names.worker}
  D1 database       ${names.d1}
  Render KV         ${names.renderKv}
  Turnstile widget  ${names.turnstile}

Important: these KV names are created through the Cloudflare API,
not through "wrangler kv namespace create". Do not prefix them again.

Before running provision:up, create a GitHub OAuth App:

  1. Open https://github.com/settings/developers → New OAuth App
  2. Fill in:
       Application name:           ${names.projectName}
       Homepage URL:               ${ctx.workerUrl}
       Authorization callback URL: ${callback}
       Enable Device Flow:         leave UNCHECKED
  3. Register application
  4. Copy Client ID. Generate Client Secret. Copy Client Secret.

Then run the safer env-var form so the GitHub Client Secret is not
embedded in shell history or visible command logs:

  read -rsp "GitHub Client Secret: " GITHUB_CLIENT_SECRET && export GITHUB_CLIENT_SECRET && printf "\\n"

  pnpm run provision:up -- \\
    --project-name ${names.projectName} \\
    --github-username <your-github-login> \\
    --client-id <client-id>

Fallback for automation-only environments: pass --client-secret explicitly.
`);
}

function printHandoff(ctx, names) {
  console.log(`
==============================================
Provision complete
==============================================

Public URL:  ${ctx.workerUrl}
Staff MCP:   ${ctx.workerUrl}/staff/mcp
User MCP:    ${ctx.workerUrl}/mcp
Sign in:     ${ctx.workerUrl}/admin/sign-in

Cloudflare resources are scoped to ${names.projectName}; manage at
https://dash.cloudflare.com/${ctx.accountId}.

I wrote these URLs into mantle/site.md (frontmatter site_url + a
revisions entry). Next time you want me back, paste the contents of
mantle/site.md into the conversation — I read it whole on return.

Reminder: revoke the CLOUDFLARE_API_TOKEN you used for provisioning at
https://dash.cloudflare.com/profile/api-tokens.
`);
}

function requireToken() {
  const t = process.env.CLOUDFLARE_API_TOKEN;
  if (!t) throw new Error("CLOUDFLARE_API_TOKEN is not set");
  return t;
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
