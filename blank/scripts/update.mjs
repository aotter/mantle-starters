#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

const STARTERS_REPO = "aotter/mantle-starters";
const DEFAULT_REPORT = ".mantle/update-report.json";
const IGNORE_DIRS = new Set([".git", "node_modules", ".wrangler", ".wrangler-test", "dist"]);

main().catch((err) => {
  console.error(`mantle:update: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const launchState = readJson(join(root, ".mantle", "launch-state.json"));
  const features = readJson(join(root, ".mantle", "features.json"));
  const targetRef = flags.ref ?? stringField(features.registry, "version");
  if (!targetRef) throw new Error("Pass --ref <starters-ref> or set .mantle/features.json registry.version.");

  const tempRoot = mkdtempSync(join(tmpdir(), "mantle-update-"));
  try {
    const bundle = await fetchBundle(targetRef);
    materializeBundle(tempRoot, bundle, placeholders({ launchState, features, targetRef }));
    const report = compare(root, tempRoot, {
      generated_at: new Date().toISOString(),
      target_ref: targetRef,
      bundle_version: bundle.version ?? null,
    });
    const reportPath = resolve(root, flags.report ?? DEFAULT_REPORT);
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
    console.log(`mantle:update report: ${relative(root, reportPath) || reportPath}`);
    console.log(
      `target ${targetRef}: ${report.differing.length} differing, ${report.missing_current.length} missing`,
    );
    if (flags.strict && (report.differing.length || report.missing_current.length)) process.exit(2);
  } finally {
    if (!flags.keepTemp) rmSync(tempRoot, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const flags = { ref: null, report: null, strict: false, keepTemp: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--strict") flags.strict = true;
    else if (arg === "--keep-temp") flags.keepTemp = true;
    else if (arg === "--ref") flags.ref = requiredValue(argv, ++i, arg);
    else if (arg === "--report") flags.report = requiredValue(argv, ++i, arg);
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: pnpm run mantle:update -- --ref <starters-ref> [--report ${DEFAULT_REPORT}] [--strict]`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return flags;
}

async function fetchBundle(ref) {
  const url = `https://raw.githubusercontent.com/${STARTERS_REPO}/${ref}/provision-bundles/blank.json`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  const bundle = await res.json();
  if (!bundle || typeof bundle !== "object" || !bundle.files || typeof bundle.files !== "object") {
    throw new Error(`Invalid provision bundle at ${url}`);
  }
  return bundle;
}

function materializeBundle(root, bundle, values) {
  for (const [path, raw] of Object.entries(bundle.files)) {
    const target = join(root, path.replace(/\.template$/, ""));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, substitute(String(raw), values), "utf8");
  }
}

function placeholders({ launchState, features, targetRef }) {
  const github = recordField(launchState, "github");
  const repo = recordField(launchState, "repo");
  const locales = arrayField(launchState, "locales");
  const owner = stringField(repo, "owner") ?? stringField(github, "owner") ?? "unknown-owner";
  const projectName = stringField(launchState, "project_name") ?? stringField(repo, "name") ?? "mantle-site";
  return {
    PROJECT_NAME: projectName,
    ARCHETYPE:
      stringField(launchState, "archetype") ??
      stringField(recordField(features, "archetype"), "name") ??
      "blank",
    BRAND: stringField(launchState, "brand") ?? projectName,
    DESCRIPTION: stringField(launchState, "description") ?? `${projectName} site.`,
    INSTALL_SUMMARY: stringField(launchState, "summary") ?? `Mantle update check for ${projectName}.`,
    LOCALES: JSON.stringify(locales.length ? locales : ["en"]),
    CANONICAL_LOCALE: stringField(launchState, "canonical_locale") ?? locales[0] ?? "en",
    STARTER_REF: targetRef,
    GITHUB_OWNER: owner,
    ADMIN_GITHUB_LOGIN: stringField(github, "admin_login") ?? owner,
    SITE_URL: stringField(launchState, "site_url") ?? "https://example.com",
    INSTALL_TIMESTAMP: new Date().toISOString(),
  };
}

function substitute(text, values) {
  return text.replace(/\{\{([A-Z_][A-Z0-9_]*)\}\}/g, (match, key) => {
    if (key in values) return values[key];
    throw new Error(`Unknown placeholder ${match}`);
  });
}

function compare(currentRoot, upstreamRoot, meta) {
  const upstreamFiles = listFiles(upstreamRoot);
  const differing = [];
  const missingCurrent = [];
  for (const path of upstreamFiles) {
    const current = join(currentRoot, path);
    const upstream = join(upstreamRoot, path);
    if (!existsSync(current)) {
      missingCurrent.push({ path, upstream_sha256: sha256(upstream) });
      continue;
    }
    const currentSha = sha256(current);
    const upstreamSha = sha256(upstream);
    if (currentSha !== upstreamSha) {
      differing.push({ path, current_sha256: currentSha, upstream_sha256: upstreamSha });
    }
  }
  return {
    schema_version: 1,
    ...meta,
    counts: {
      differing: differing.length,
      missing_current: missingCurrent.length,
    },
    differing,
    missing_current: missingCurrent,
    next_step: "Review differences manually; mantle:update never overwrites user-owned files.",
  };
}

function listFiles(root, prefix = "") {
  const files = [];
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...listFiles(root, path));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort();
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readJson(path) {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8"));
}

function recordField(value, key) {
  const field = value && typeof value === "object" && !Array.isArray(value) ? value[key] : null;
  return field && typeof field === "object" && !Array.isArray(field) ? field : {};
}

function stringField(value, key) {
  const field = value && typeof value === "object" && !Array.isArray(value) ? value[key] : null;
  return typeof field === "string" && field.trim() ? field.trim() : null;
}

function arrayField(value, key) {
  const field = value && typeof value === "object" && !Array.isArray(value) ? value[key] : null;
  return Array.isArray(field) ? field.filter((item) => typeof item === "string") : [];
}

function requiredValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}
