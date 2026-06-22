#!/usr/bin/env node
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const outPath = join(root, "provision-bundles", "blank.json");
const checkOnly = process.argv.includes("--check");
const files = {};

walk("blank", "");
resolveCatalogPackageJson();
walk("overlays", "overlays");
walk("kiwa", "kiwa");
files["scripts/apply-overlay.mjs"] = readFileSync(
  join(root, "scripts", "apply-overlay.mjs"),
  "utf8",
);

files[".mantle/launch-state.json.template"] = [
  "{",
  '  "schema_version": 2,',
  '  "launch_source": "mantle-landing-v2",',
  '  "project_name": "{{PROJECT_NAME}}",',
  '  "archetype": "{{ARCHETYPE}}",',
  '  "brand": "{{BRAND}}",',
  '  "description": "{{DESCRIPTION}}",',
  '  "summary": "{{INSTALL_SUMMARY}}",',
  '  "locales": {{LOCALES}},',
  '  "canonical_locale": "{{CANONICAL_LOCALE}}",',
  '  "theme": null,',
  '  "features": [],',
  '  "starter_ref": "{{STARTER_REF}}",',
  '  "github": {',
  '    "owner": "{{GITHUB_OWNER}}",',
  '    "admin_login": "{{ADMIN_GITHUB_LOGIN}}"',
  "  },",
  '  "repo": {',
  '    "owner": "{{GITHUB_OWNER}}",',
  '    "name": "{{PROJECT_NAME}}",',
  '    "visibility": "private",',
  '    "defaultBranch": "main"',
  "  },",
  '  "handoff": ".mantle/handoff.md",',
  '  "overlay": {',
  '    "suggested": "{{ARCHETYPE}}",',
  '    "path": "overlays/{{ARCHETYPE}}"',
  "  }",
  "}",
  "",
].join("\n");

files[".mantle/features.json.template"] = JSON.stringify({
  registry: {
    name: "mantle-starters",
    url: "https://mantle.tools/registry.json",
    version: "{{STARTER_REF}}",
  },
  archetype: {
    name: "{{ARCHETYPE}}",
    type: "registry:archetype",
    overlayPath: "overlays/{{ARCHETYPE}}",
    appliedAt: null,
  },
  theme: null,
  features: [],
  resolvedAt: "{{INSTALL_TIMESTAMP}}",
}, null, 2) + "\n";

files[".mantle/handoff.md.template"] = [
  "# Mantle launch handoff",
  "",
  "Mantle landing created this blank site repo, pushed it to GitHub, and started Cloudflare Workers CI.",
  "",
  "- Repo: https://github.com/{{GITHUB_OWNER}}/{{PROJECT_NAME}}",
  "- Landing final page is the source of truth for the live Workers URL.",
  "- Generated fallback site hint: {{SITE_URL}}",
  "- Type intent: {{ARCHETYPE}}",
  "- First task: open the live site URL from Mantle landing, then use `mantle:overlay`.",
  "",
  "Copy this prompt into your coding agent:",
  "",
  "```text",
  "Read .mantle/launch-state.json, .mantle/features.json, and .mantle/handoff.md.",
  "Open the live site URL from Mantle landing and confirm the blank Worker boots.",
  "Then run mantle:overlay to apply the selected type intent as the smallest useful Mantle overlay.",
  "```",
  "",
].join("\n");

const bundleText = JSON.stringify({
  version,
  kind: "mantle-provision-bundle",
  files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))),
}, null, 2) + "\n";

if (checkOnly) {
  const current = readFileSync(outPath, "utf8");
  if (current !== bundleText) {
    console.error("provision-bundles/blank.json is stale; run pnpm build:provision-bundle");
    process.exit(1);
  }
} else {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, bundleText);
}

const bundle = JSON.parse(bundleText);
for (const required of [
  "package.json",
  "wrangler.toml",
  ".mantle/launch-state.json.template",
  ".mantle/features.json.template",
  ".mantle/handoff.md.template",
  ".agent/skills/mantle-develop/SKILL.md",
  ".agent/skills/mantle-overlay/SKILL.md",
  ".agent/skills/mantle-theme/SKILL.md",
  ".agent/skills/mantle-update/SKILL.md",
  ".claude/skills/mantle-develop/SKILL.md",
  ".claude/skills/mantle-overlay/SKILL.md",
  ".claude/skills/mantle-theme/SKILL.md",
  ".claude/skills/mantle-update/SKILL.md",
  "scripts/apply-overlay.mjs",
  "kiwa/manifest.json",
]) {
  if (!bundle.files[required]) throw new Error(`bundle missing ${required}`);
}

function walk(from, to) {
  for (const name of readdirSync(join(root, from))) {
    if (skip(name)) continue;
    const source = join(root, from, name);
    const target = posix.join(to, name).replace(/\.template$/, "");
    const stat = statSync(source);
    if (stat.isDirectory()) {
      walk(posix.join(from, name), target);
    } else if (stat.isFile()) {
      files[target] = readFileSync(source, "utf8");
    }
  }
}

function skip(name) {
  return [".git", ".DS_Store", ".wrangler", ".wrangler-test", ".pnpm-store", "node_modules", "dist"].includes(name);
}

function resolveCatalogPackageJson() {
  const raw = files["package.json"];
  if (!raw) return;
  const catalog = parseCatalog(readFileSync(join(root, "pnpm-workspace.yaml"), "utf8"));
  const manifest = JSON.parse(raw);
  for (const key of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    const deps = manifest[key];
    if (!deps || typeof deps !== "object" || Array.isArray(deps)) continue;
    for (const [name, spec] of Object.entries(deps)) {
      if (spec === "catalog:") deps[name] = catalog.get(name) ?? fail(`catalog missing ${name}`);
    }
  }
  files["package.json"] = JSON.stringify(manifest, null, 2) + "\n";
}

function parseCatalog(text) {
  const catalog = new Map();
  let inCatalog = false;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "catalog:") {
      inCatalog = true;
      continue;
    }
    if (!inCatalog) continue;
    if (!line.startsWith("  ")) break;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf(":");
    if (separator === -1) continue;
    catalog.set(
      trimmed.slice(0, separator).trim().replace(/^['"]|['"]$/g, ""),
      trimmed.slice(separator + 1).trim().replace(/\s+#.*$/, ""),
    );
  }
  return catalog;
}

function fail(message) {
  throw new Error(message);
}
