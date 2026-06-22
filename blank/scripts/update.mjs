#!/usr/bin/env node
import { execFileSync } from "node:child_process";
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
import { basename, dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const STARTERS_REPO = "aotter/mantle-starters";
const DEFAULT_REPORT = ".mantle/update-report.json";
const SNAPSHOT_EXPIRY = "2999-12-31T23:59:59.000Z";
const IGNORE_DIRS = new Set([
  ".git",
  "node_modules",
  ".wrangler",
  ".wrangler-home",
  ".wrangler-test",
  ".pnpm-store",
  "dist",
]);
const IGNORE_FILES = new Set([
  ".tsbuildinfo",
  "openapi.json",
  "mantle-types.d.ts",
  ".dev.vars",
  ".dev.vars.test",
]);

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`mantle:update: ${msg}`);
  process.exit(1);
});

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const pkg = readJson(join(root, "package.json"), "package.json");
  const features = readJson(join(root, ".mantle", "features.json"), ".mantle/features.json");
  const launchState = readOptionalJson(join(root, ".mantle", "launch-state.json"));
  const currentRef = currentStarterRef(pkg, features);
  const targetRef = normalizeRef(flags.ref ?? await latestReleasedRef(currentRef));
  const createMantleUrl = flags.createMantleUrl ?? releaseTarballUrl(targetRef);
  const reportPath = resolve(root, flags.report ?? DEFAULT_REPORT);
  const tempRoot = mkdtempSync(join(tmpdir(), "mantle-update-"));
  const projectName = stringField(launchState, "project_name") ?? slugFromPackage(pkg);
  const sessionPath = join(tempRoot, "session.json");
  const snapshotParent = join(tempRoot, "snapshot");
  const snapshotDir = join(snapshotParent, projectName);

  mkdirSync(snapshotParent, { recursive: true });
  writeFileSync(
    sessionPath,
    JSON.stringify(buildLaunchSession({ pkg, features, launchState, projectName }), null, 2) + "\n",
  );

  const command = [
    npxCommand(),
    "--yes",
    createMantleUrl,
    "launch",
    "--session",
    pathToFileURL(sessionPath).toString(),
    "--skip-install",
    "--skip-git-init",
    "--ref",
    targetRef,
  ];
  const startedAt = new Date().toISOString();
  const stdout = execFileSync(command[0], command.slice(1), {
    cwd: snapshotParent,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const diff = compareTrees(root, snapshotDir);
  const checks = flags.skipChecks ? [] : runChecks(root, pkg);
  const report = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    started_at: startedAt,
    project_root: root,
    current_ref: currentRef,
    target_ref: targetRef,
    create_mantle_url: createMantleUrl,
    npx_command: command,
    snapshot_dir: flags.keepTemp ? snapshotDir : null,
    snapshot_stdout: parseJsonOrText(stdout),
    counts: {
      unchanged: diff.unchanged.length,
      differing: diff.differing.length,
      missing_current: diff.missingCurrent.length,
      line_ending_only: diff.lineEndingOnly.length,
      user_only: diff.userOnly.length,
      checks_failed: checks.filter((check) => check.exit_code !== 0).length,
    },
    differing: diff.differing,
    missing_current: diff.missingCurrent,
    line_ending_only: diff.lineEndingOnly,
    user_only: diff.userOnly,
    checks,
    next_step:
      diff.differing.length || diff.missingCurrent.length
        ? "Review this report with the mantle:update skill. This check does not auto-apply upstream changes; full in-place merge is tracked in mantle-starters#192."
        : "No byte-level upstream scaffold differences were found for tracked starter files.",
  };

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  if (!flags.keepTemp) rmSync(tempRoot, { recursive: true, force: true });

  console.log(`mantle:update report: ${relative(root, reportPath) || reportPath}`);
  console.log(
    `target ${targetRef}: ${report.counts.differing} differing, ` +
      `${report.counts.missing_current} missing, ` +
      `${report.counts.line_ending_only} line-ending-only, ` +
      `${report.counts.user_only} user-only`,
  );
  if (checks.length) {
    const failed = report.counts.checks_failed;
    console.log(`checks: ${checks.length - failed}/${checks.length} passed`);
  }
  if (report.counts.checks_failed > 0) process.exit(1);
  if (flags.strictDiff && (report.counts.differing > 0 || report.counts.missing_current > 0)) {
    process.exit(2);
  }
}

function parseArgs(argv) {
  const flags = {
    ref: null,
    report: null,
    createMantleUrl: null,
    skipChecks: false,
    strictDiff: false,
    keepTemp: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--skip-checks") flags.skipChecks = true;
    else if (arg === "--strict-diff") flags.strictDiff = true;
    else if (arg === "--keep-temp") flags.keepTemp = true;
    else if (arg === "--ref") flags.ref = requiredValue(argv, ++i, arg);
    else if (arg === "--report") flags.report = requiredValue(argv, ++i, arg);
    else if (arg === "--create-mantle-url") flags.createMantleUrl = requiredValue(argv, ++i, arg);
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return flags;
}

function printHelp() {
  console.log(`Usage: pnpm run mantle:update -- [options]

Options:
  --ref <vX.Y.Z>              Starter release ref to compare against.
  --report <path>             Report path. Default: ${DEFAULT_REPORT}
  --create-mantle-url <url>   Override create-mantle tarball URL.
  --skip-checks               Skip pnpm validation/typecheck checks.
  --strict-diff               Exit 2 when upstream differences are found.
  --keep-temp                 Keep the generated upstream snapshot.
`);
}

function requiredValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function readJson(path, label) {
  if (!existsSync(path)) throw new Error(`${label} not found. Run from a generated Mantle project root.`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function readOptionalJson(path) {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8"));
}

function currentStarterRef(pkg, features) {
  const registryVersion = stringField(features.registry, "version");
  if (registryVersion) return normalizeRef(registryVersion);
  const mantleVersion =
    stringField(pkg.dependencies, "@aotter/mantle") ??
    stringField(pkg.devDependencies, "@aotter/mantle");
  if (mantleVersion && /^[0-9]+\./.test(mantleVersion)) return normalizeRef(mantleVersion);
  return "main";
}

async function latestReleasedRef(fallbackRef) {
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${STARTERS_REPO}/main/sources.json`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return fallbackRef;
    const sources = await res.json();
    const version = stringField(sources, "version");
    return version ? normalizeRef(version) : fallbackRef;
  } catch {
    return fallbackRef;
  }
}

function normalizeRef(ref) {
  const trimmed = String(ref).trim();
  if (/^[0-9]+\./.test(trimmed)) return `v${trimmed}`;
  return trimmed;
}

function releaseTarballUrl(ref) {
  if (!/^v[0-9]/.test(ref)) {
    throw new Error(
      `Cannot derive create-mantle tarball URL for non-release ref "${ref}". Pass --create-mantle-url.`,
    );
  }
  return `https://github.com/${STARTERS_REPO}/releases/download/${ref}/aotter-create-mantle.tgz`;
}

function buildLaunchSession({ pkg, features, launchState, projectName }) {
  const github = recordField(launchState, "github");
  const repo = recordField(launchState, "repo");
  const locales = arrayField(launchState, "locales");
  const featureSelections =
    featureSelectionFlags(arrayField(launchState, "features")).length > 0
      ? featureSelectionFlags(arrayField(launchState, "features"))
      : featureSelectionFlags(arrayField(features, "features"));
  return {
    schema_version: 1,
    session_id: "mantle-update",
    expires_at: SNAPSHOT_EXPIRY,
    archetype:
      stringField(launchState, "archetype") ??
      stringField(recordField(features, "archetype"), "name") ??
      "blank",
    project_name: projectName,
    brand: stringField(launchState, "brand") ?? stringField(pkg, "name") ?? projectName,
    description:
      stringField(launchState, "description") ??
      stringField(pkg, "description") ??
      `${projectName} site.`,
    locales: locales.length ? locales : ["en"],
    canonical_locale: stringField(launchState, "canonical_locale") ?? locales[0] ?? "en",
    github_owner: stringField(github, "owner") ?? "unknown-owner",
    admin_github_login: stringField(github, "admin_login") ?? stringField(github, "owner") ?? "unknown-owner",
    summary:
      stringField(launchState, "summary") ?? `Mantle upstream update check for ${projectName}.`,
    theme:
      stringField(launchState, "theme") ??
      stringField(recordField(features, "theme"), "name") ??
      null,
    features: featureSelections,
    repo,
  };
}

function featureSelectionFlags(features) {
  return features
    .map((feature) => {
      const name = stringField(feature, "name");
      if (!name) return null;
      const variant = stringField(feature, "variant");
      return variant ? `${name}:${variant}` : name;
    })
    .filter(Boolean);
}

function compareTrees(currentRoot, upstreamRoot) {
  const currentFiles = listFiles(currentRoot);
  const upstreamFiles = listFiles(upstreamRoot);
  const currentSet = new Set(currentFiles);
  const upstreamSet = new Set(upstreamFiles);
  const unchanged = [];
  const differing = [];
  const missingCurrent = [];
  const lineEndingOnly = [];
  const userOnly = [];

  for (const path of upstreamFiles) {
    if (!currentSet.has(path)) {
      missingCurrent.push({ path, upstream_sha256: sha256(join(upstreamRoot, path)) });
      continue;
    }
    const currentPath = join(currentRoot, path);
    const upstreamPath = join(upstreamRoot, path);
    const currentHash = sha256(currentPath);
    const upstreamHash = sha256(upstreamPath);
    if (currentHash === upstreamHash) {
      unchanged.push(path);
      continue;
    }
    const currentNormalized = normalizedHash(currentPath);
    const upstreamNormalized = normalizedHash(upstreamPath);
    const entry = {
      path,
      current_sha256: currentHash,
      upstream_sha256: upstreamHash,
    };
    if (currentNormalized === upstreamNormalized) {
      lineEndingOnly.push({
        ...entry,
        kind: "line-ending-only",
      });
    } else {
      differing.push({
        ...entry,
        kind: "differs-without-scaffold-lock",
      });
    }
  }

  for (const path of currentFiles) {
    if (!upstreamSet.has(path)) userOnly.push(path);
  }
  return { unchanged, differing, missingCurrent, lineEndingOnly, userOnly };
}

function listFiles(root) {
  const files = [];
  walk(root, "");
  return files.sort();

  function walk(base, rel) {
    const dir = rel ? join(base, rel) : base;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const entryRel = rel ? join(rel, entry.name) : entry.name;
      if (shouldIgnore(entryRel, entry.isDirectory())) continue;
      if (entry.isDirectory()) {
        walk(base, entryRel);
      } else if (entry.isFile()) {
        files.push(entryRel);
      }
    }
  }
}

function shouldIgnore(relPath, isDir) {
  const parts = relPath.split(/[\\/]/);
  if (parts.some((part) => IGNORE_DIRS.has(part))) return true;
  const name = basename(relPath);
  if (!isDir && IGNORE_FILES.has(name)) return true;
  if (relPath.startsWith(`.mantle${separatorFor(relPath)}update-report`)) return true;
  if (name.endsWith(".log")) return true;
  return false;
}

function separatorFor(relPath) {
  return relPath.includes("\\") ? "\\" : "/";
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function normalizedHash(path) {
  const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  return createHash("sha256").update(text).digest("hex");
}

function runChecks(root, pkg) {
  const scripts = recordField(pkg, "scripts");
  if (stringField(scripts, "check")) {
    return [runCheck(root, "pnpm check", ["check"])];
  }
  const checks = [];
  if (stringField(scripts, "validate")) checks.push(runCheck(root, "pnpm validate", ["validate"]));
  if (stringField(scripts, "typecheck")) checks.push(runCheck(root, "pnpm typecheck", ["typecheck"]));
  return checks;
}

function runCheck(root, label, args) {
  try {
    execFileSync("pnpm", args, { cwd: root, stdio: "pipe" });
    return { command: label, exit_code: 0 };
  } catch (err) {
    return {
      command: label,
      exit_code: typeof err.status === "number" ? err.status : 1,
      stderr: String(err.stderr ?? "").slice(0, 4000),
      stdout: String(err.stdout ?? "").slice(0, 4000),
    };
  }
}

function parseJsonOrText(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text.trim();
  }
}

function npxCommand() {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function slugFromPackage(pkg) {
  const name = stringField(pkg, "name") ?? "mantle-site";
  return name.split("/").pop().replace(/[^A-Za-z0-9._-]/g, "-") || "mantle-site";
}

function stringField(record, key) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return undefined;
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function recordField(record, key) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return {};
  const value = record[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function arrayField(record, key) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return [];
  const value = record[key];
  return Array.isArray(value) ? value : [];
}
