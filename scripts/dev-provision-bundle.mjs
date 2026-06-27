#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const archetype = process.argv[2];
const port = valueAfter("--port") ?? process.env.WRANGLER_DEV_PORT ?? "8787";
const prepareOnly = process.argv.includes("--prepare-only");

if (!archetype || archetype.startsWith("-")) {
  fail("usage: pnpm dev:bundle <type> [--port 8787] [--prepare-only]");
}

const bundlePath = join(root, "provision-bundles", `${archetype}.json`);
if (!existsSync(bundlePath)) {
  fail(`missing provision bundle: provision-bundles/${archetype}.json`);
}

const bundle = JSON.parse(readFileSync(bundlePath, "utf8"));
const targetRoot = mkdtempSync(join(tmpdir(), `mantle-${archetype}-bundle-`));
const replacements = sampleLaunch(archetype);

for (const [path, raw] of Object.entries(bundle.files ?? {})) {
  const target = join(targetRoot, path.replace(/\.template$/, ""));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, substitute(raw, replacements), "utf8");
}

const nodeModules = join(root, "blank", "node_modules");
if (existsSync(nodeModules) && !existsSync(join(targetRoot, "node_modules"))) {
  symlinkSync(nodeModules, join(targetRoot, "node_modules"), "dir");
}

console.log(`generated ${archetype} bundle at ${targetRoot}`);
console.log(`local URL: http://localhost:${port}`);

run(process.execPath, ["scripts/build-styles.mjs"], targetRoot);
if (!prepareOnly) {
  run(process.execPath, ["scripts/wrangler-dev.mjs"], targetRoot, {
    PATH: [join(targetRoot, "node_modules", ".bin"), process.env.PATH ?? ""].join(delimiter),
    WRANGLER_DEV_PORT: port,
    WRANGLER_INSPECTOR_PORT: process.env.WRANGLER_INSPECTOR_PORT ?? "0",
  });
}

function run(command, args, cwd, env = {}) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function substitute(text, replacements) {
  return String(text).replace(/\{\{([A-Z_][A-Z0-9_]*)\}\}/g, (match, key) => {
    if (key in replacements) return replacements[key];
    throw new Error(`unknown placeholder ${match}`);
  });
}

function sampleLaunch(type) {
  const brand = type === "presence" ? "Northstar Studio" : "Mantle Preview";
  const description =
    type === "presence"
      ? "A compact studio helping teams explain their work, collect serious inquiries, and launch a useful web presence quickly."
      : "A Mantle starter preview generated from a provision bundle.";
  return {
    PROJECT_NAME: `${type}-preview`,
    ARCHETYPE: type,
    BRAND: brand,
    DESCRIPTION: description,
    INSTALL_SUMMARY: `Local ${type} provision bundle preview.`,
    LOCALES: '["en"]',
    CANONICAL_LOCALE: "en",
    STARTER_REF: "local",
    GITHUB_OWNER: "aotter",
    ADMIN_GITHUB_LOGIN: "aotter",
    SITE_URL: `http://localhost:${port}`,
    AFTER_LAUNCH_SKILL_URL: "https://mantle.tools/skill/after-launch?id=local",
    INSTALL_TIMESTAMP: new Date(0).toISOString(),
  };
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
