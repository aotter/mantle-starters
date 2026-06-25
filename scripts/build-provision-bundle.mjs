#!/usr/bin/env node
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const checkOnly = process.argv.includes("--check");
const archetypes = ["blank", "publication", "transaction", "reservation", "community"];

for (const archetype of archetypes) {
  const files = buildBundleFiles(archetype);
  const outPath = join(root, "provision-bundles", `${archetype}.json`);
  const bundleText = JSON.stringify({
    version,
    kind: "mantle-provision-bundle",
    archetype,
    files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))),
  }, null, 2) + "\n";

  if (checkOnly) {
    const current = readFileSync(outPath, "utf8");
    if (current !== bundleText) {
      console.error(`provision-bundles/${archetype}.json is stale; run pnpm build:provision-bundle`);
      process.exit(1);
    }
  } else {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, bundleText);
  }

  assertBundle(JSON.parse(bundleText), archetype);
}

function buildBundleFiles(archetype) {
  const files = {};
  walk(files, "blank", "");
  resolveCatalogPackageJson(files);
  if (archetype === "blank") {
    walk(files, "overlays", "overlays");
  } else {
    applyOverlay(files, archetype);
  }
  walk(files, "kiwa", "kiwa");
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
    '  "purpose": "{{DESCRIPTION}}",',
    '  "description": "{{DESCRIPTION}}",',
    '  "summary": "{{INSTALL_SUMMARY}}",',
    '  "site_url": "{{SITE_URL}}",',
    '  "after_launch_skill_url": "{{AFTER_LAUNCH_SKILL_URL}}",',
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
      appliedAt: archetype === "blank" ? null : "{{INSTALL_TIMESTAMP}}",
    },
    theme: null,
    features: [],
    resolvedAt: "{{INSTALL_TIMESTAMP}}",
  }, null, 2) + "\n";

  files[".mantle/handoff.md.template"] = [
    "# Mantle launch handoff",
    "",
    "Mantle landing created this site repo, pushed it to GitHub, and started Cloudflare Workers CI.",
    "",
    "- Repo: https://github.com/{{GITHUB_OWNER}}/{{PROJECT_NAME}}",
    "- Site: {{SITE_URL}}",
    "- Type intent: {{ARCHETYPE}}",
    "- Purpose: {{DESCRIPTION}}",
    "- Full after-launch skill: {{AFTER_LAUNCH_SKILL_URL}}",
    "",
    "The public homepage is for visitors. The coding-agent handoff lives in Mantle landing and this repo file.",
    "",
    "For chat-provided images, use Staff MCP upload sessions: the agent reads attachment bytes, prepares variants, PUTs to signed URLs, and commits the asset. Never pass base64 bytes as MCP tool arguments.",
    "",
    "Next: clone/open this repo, read the launch files above, inspect the already-composed manifest/pages/seed, then make the smallest useful improvement and push.",
    "",
  ].join("\n");
  return files;
}

function assertBundle(bundle, archetype) {
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
    if (!bundle.files[required]) throw new Error(`${archetype} bundle missing ${required}`);
  }
  if (archetype !== "blank" && !bundle.files[`manifests/${archetype}.yaml`]) {
    throw new Error(`${archetype} bundle missing applied manifest`);
  }
}

function walk(files, from, to) {
  for (const name of readdirSync(join(root, from))) {
    if (skip(name)) continue;
    const source = join(root, from, name);
    const target = posix.join(to, name).replace(/\.template$/, "");
    const stat = statSync(source);
    if (stat.isDirectory()) {
      walk(files, posix.join(from, name), target);
    } else if (stat.isFile()) {
      files[target] = readFileSync(source, "utf8");
    }
  }
}

function applyOverlay(files, archetype) {
  walk(files, `overlays/${archetype}`, `overlays/${archetype}`);
  walk(files, `overlays/${archetype}/manifests`, "manifests");
  for (const name of ["handoff.md", "layout.md", "seed-prompt.md", "seed.json"]) {
    const path = join(root, "overlays", archetype, name);
    try {
      if (statSync(path).isFile()) {
        files[`.mantle/overlays/${archetype}/${name}`] = readFileSync(path, "utf8");
      }
    } catch {
      // optional
    }
  }
}

function skip(name) {
  return [".git", ".DS_Store", ".wrangler", ".wrangler-test", ".pnpm-store", "node_modules", "dist"].includes(name);
}

function resolveCatalogPackageJson(files) {
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
