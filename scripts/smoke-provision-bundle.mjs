#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const tempRoot = mkdtempSync(join(tmpdir(), "mantle-bundle-"));
const replacements = {
  PROJECT_NAME: "bundle-smoke",
  ARCHETYPE: "publication",
  BRAND: "Bundle Smoke",
  DESCRIPTION: "Bundle smoke test.",
  INSTALL_SUMMARY: "Smoke generated from provision bundle.",
  LOCALES: "[\"en\"]",
  CANONICAL_LOCALE: "en",
  STARTER_REF: "smoke",
  GITHUB_OWNER: "aotter",
  ADMIN_GITHUB_LOGIN: "aotter",
  SITE_URL: "https://bundle-smoke.example",
  INSTALL_TIMESTAMP: "2026-01-01T00:00:00.000Z",
};

try {
  const bundle = JSON.parse(readFileSync(join(root, "provision-bundles", "blank.json"), "utf8"));
  for (const [path, raw] of Object.entries(bundle.files ?? {})) {
    const target = join(tempRoot, path.replace(/\.template$/, ""));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, substitute(raw), "utf8");
  }
  execFileSync("node", ["scripts/apply-overlay.mjs", "publication"], {
    cwd: tempRoot,
    stdio: "inherit",
  });
  assertNoLeftovers(tempRoot, bundle.files);
  const features = JSON.parse(readFileSync(join(tempRoot, ".mantle", "features.json"), "utf8"));
  if (features?.archetype?.name !== "publication" || !features?.archetype?.appliedAt) {
    throw new Error("publication overlay did not mark .mantle/features.json");
  }
  console.log("provision bundle smoke passed");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

function substitute(text) {
  return String(text).replace(/\{\{([A-Z_][A-Z0-9_]*)\}\}/g, (match, key) => {
    if (key in replacements) return replacements[key];
    throw new Error(`unknown placeholder ${match}`);
  });
}

function assertNoLeftovers(root, files) {
  const leftovers = [];
  for (const path of Object.keys(files ?? {})) {
    const target = join(root, path.replace(/\.template$/, ""));
    const text = readFileSync(target, "utf8");
    if (/\{\{[A-Z_][A-Z0-9_]*\}\}/.test(text)) leftovers.push(path);
  }
  if (leftovers.length) throw new Error(`unfilled placeholders: ${leftovers.join(", ")}`);
}
