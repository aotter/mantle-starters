#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const checkOnly = process.argv.includes("--check");
const archetypes = ["blank", "presence", "intake", "publication", "transaction", "reservation", "community"];
const dependencySectionKeys = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

ensureStarterStyles();

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
  resolveCatalogLockfile(files);
  if (archetype !== "blank") {
    applyOverlay(files, archetype);
    applyOverlayManifestLoader(files, archetype);
    delete files["manifests/example.yaml"];
  }
  walk(files, "kiwa", "kiwa");

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
    '  "site_owner": {',
    '    "email": "{{SITE_OWNER_EMAIL}}",',
    '    "github_login": "{{ADMIN_GITHUB_LOGIN}}"',
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
    `    "path": ${archetype === "blank" ? "null" : '".mantle/overlays/{{ARCHETYPE}}"'}`,
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
      overlayPath: archetype === "blank" ? null : ".mantle/overlays/{{ARCHETYPE}}",
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
    "- Site owner: {{SITE_OWNER_EMAIL}}",
    "- Purpose: {{DESCRIPTION}}",
    "- Full after-launch skill: {{AFTER_LAUNCH_SKILL_URL}}",
    "",
    "The public homepage is for visitors. The coding-agent handoff lives in Mantle landing and this repo file.",
    "",
    "Media uploads are optional post-launch work because R2 may require Cloudflare billing or a credit card. When the owner asks for staff-managed images/files, read node_modules/@aotter/mantle/docs/media-uploads.md or https://raw.githubusercontent.com/aotter/mantle/develop/docs/media-uploads.md, use Staff MCP upload sessions, preserve transparency/animation, PUT variants to signed URLs, then commit the asset. Use Claude Code or another local/non-sandboxed coding agent for that workflow; do not rely on Claude Cowork for R2 uploads. Never pass base64 bytes as MCP tool arguments or ask the user to run terminal uploads.",
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
    ".agent/skills/mantle-plugin/SKILL.md",
    ".agent/skills/mantle-theme/SKILL.md",
    ".agent/skills/mantle-update/SKILL.md",
    ".claude/skills/mantle-develop/SKILL.md",
    ".claude/skills/mantle-plugin/SKILL.md",
    ".claude/skills/mantle-theme/SKILL.md",
    ".claude/skills/mantle-update/SKILL.md",
    "src/contentTypes.ts",
    "kiwa/manifest.json",
    "styles/generated.css",
    "src/mantleOceanHero.ts",
  ]) {
    if (!bundle.files[required]) throw new Error(`${archetype} bundle missing ${required}`);
  }
  if (!bundle.files["src/index.ts"]?.includes("/assets/styles.css")) {
    throw new Error(`${archetype} bundle missing generated stylesheet route`);
  }
  if (!bundle.files["src/index.ts"]?.includes("/assets/mantle-ocean-hero.svg")) {
    throw new Error(`${archetype} bundle missing Mantle ocean hero asset route`);
  }
  if (!bundle.files["src/index.ts"]?.includes("/assets/mantle-ocean-hero-dark.svg")) {
    throw new Error(`${archetype} bundle missing dark Mantle ocean hero asset route`);
  }
  if (!bundle.files["src/home.tsx"]?.includes("/assets/mantle-ocean-hero-light.svg")) {
    throw new Error(`${archetype} homepage missing Mantle ocean hero image`);
  }
  if (!bundle.files["src/index.ts"]?.includes("/assets/mantle-ocean-hero-light.svg', '/assets/mantle-ocean-hero-dark.svg")) {
    throw new Error(`${archetype} homepage hero image must support manual theme switching`);
  }
  if (!bundle.files["src/home.tsx"]?.includes("assetBuild")) {
    throw new Error(`${archetype} homepage assets must be cache-busted`);
  }
  if (!bundle.files["styles/swirl-images.css"]?.includes("?v=")) {
    throw new Error(`${archetype} swirl images must be cache-busted`);
  }
  if (!bundle.files["src/index.ts"]?.includes('const ASSET_CACHE_CONTROL = "public, max-age=300"')) {
    throw new Error(`${archetype} homepage asset routes must avoid immutable caching`);
  }
  if (!bundle.files["pnpm-workspace.yaml"]?.includes('  - "."')) {
    throw new Error(`${archetype} bundle missing root package workspace entry`);
  }
  if (archetype !== "blank" && !bundle.files[`manifests/${archetype}.yaml`]) {
    throw new Error(`${archetype} bundle missing applied manifest`);
  }
  if (archetype !== "blank" && bundle.files["manifests/example.yaml"]) {
    throw new Error(`${archetype} bundle should not include blank example manifest`);
  }
  if (archetype === "blank") {
    const homeContent = bundle.files["src/homeContent.ts"] ?? "";
    const siteContent = bundle.files["src/siteContent.ts"] ?? "";
    for (const forbidden of ["starts here", "contactForm", "Placeholder proof", "Start a conversation"]) {
      if (homeContent.includes(forbidden) || siteContent.includes(forbidden)) {
        throw new Error(`blank bundle contains seeded homepage copy: ${forbidden}`);
      }
    }
  }
  if (archetype === "presence" || archetype === "intake" || archetype === "publication") {
    const seedImport = `../.mantle/overlays/${archetype}/seed.json`;
    if (!bundle.files["src/homeContent.ts"]?.includes(seedImport)) {
      throw new Error(`${archetype} homeContent must read the overlay seed`);
    }
    if (!bundle.files["src/siteContent.ts"]?.includes(seedImport)) {
      throw new Error(`${archetype} siteContent must read the overlay seed`);
    }
  }
  assertLockfileMatchesPackageJson(bundle, archetype);
}

function ensureStarterStyles() {
  const args = [join(root, "blank", "scripts", "build-styles.mjs"), "--root", join(root, "blank")];
  if (checkOnly) args.push("--check");
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
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
  walk(files, `overlays/${archetype}/manifests`, "manifests");
  walkIfExists(files, `overlays/${archetype}/src`, "src");
  let seedText = null;
  for (const name of ["handoff.md", "layout.md", "seed-prompt.md", "seed.json"]) {
    const path = join(root, "overlays", archetype, name);
    try {
      if (statSync(path).isFile()) {
        const text = readFileSync(path, "utf8");
        files[`.mantle/overlays/${archetype}/${name}`] = text;
        if (name === "seed.json") seedText = text;
      }
    } catch {
      // optional
    }
  }
  if (seedText) applyOverlaySeedContent(files, archetype, seedText);
}

function applyOverlaySeedContent(files, archetype, seedText) {
  let seed;
  try {
    seed = JSON.parse(seedText);
  } catch {
    return;
  }
  const seedImport = `../.mantle/overlays/${archetype}/seed.json`;
  if (seed?.site) {
    files["src/siteContent.ts"] = [
      `import seed from "${seedImport}";`,
      'import type { SiteContent } from "./contentTypes.js";',
      "",
      "type Seed = { readonly site?: SiteContent };",
      "const seedData = seed as Seed;",
      "export const siteContent: SiteContent = seedData.site ?? {",
      '  brand: "{{BRAND}}",',
      '  description: "{{DESCRIPTION}}".trim(),',
      "  navLinks: [],",
      "  footer: { columns: [], socialLinks: [], bottomLinks: [] },",
      "};",
      "",
    ].join("\n");
  }
  if (Array.isArray(seed?.collections?.page)) {
    files["src/homeContent.ts"] = [
      `import seed from "${seedImport}";`,
      'import type { HomeContent, HomeSection } from "./contentTypes.js";',
      "",
      "type SeedPage = { readonly type?: string; readonly sections?: readonly HomeSection[] };",
      "type Seed = { readonly collections?: { readonly page?: readonly SeedPage[] } };",
      "const seedData = seed as Seed;",
      'const homePage = (seedData.collections?.page ?? []).find((page) => page.type === "home");',
      "export const homeContent: HomeContent = { sections: homePage?.sections ?? [] };",
      "",
    ].join("\n");
  }
}

function walkIfExists(files, from, to) {
  try {
    statSync(join(root, from));
  } catch {
    return;
  }
  walk(files, from, to);
}

function applyOverlayManifestLoader(files, archetype) {
  const bindingName = `${archetype.replace(/[^a-zA-Z0-9]/g, "_")}Yaml`;
  files["src/loadManifests.ts"] = [
    'import { parseManifestsOrThrow, type Manifest } from "@aotter/mantle/spec";',
    `import ${bindingName} from "../manifests/${archetype}.yaml";`,
    "",
    "export function loadManifests(): readonly Manifest[] {",
    `  return parseManifestsOrThrow([${bindingName}], { context: "starters/${archetype}" });`,
    "}",
    "",
  ].join("\n");
}

function skip(name) {
  return [
    ".git",
    ".DS_Store",
    ".dry-build",
    ".wrangler",
    ".wrangler-test",
    ".pnpm-store",
    "node_modules",
    "dist",
  ].includes(name);
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

function resolveCatalogLockfile(files) {
  const raw = files["pnpm-lock.yaml"];
  const manifestRaw = files["package.json"];
  if (!raw || !manifestRaw) return;
  const expected = collectPackageSpecifiers(JSON.parse(manifestRaw));
  const lines = raw.split("\n");
  let inImporters = false;
  let inRootImporter = false;
  let inDependencySection = false;
  let dependencyName = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === "importers:") {
      inImporters = true;
      inRootImporter = false;
      inDependencySection = false;
      dependencyName = null;
      continue;
    }
    if (!inImporters) continue;
    if (/^\S/.test(line) && line.trim() && line !== "importers:") {
      inImporters = false;
      inRootImporter = false;
      inDependencySection = false;
      dependencyName = null;
      continue;
    }
    if (line === "  .:") {
      inRootImporter = true;
      inDependencySection = false;
      dependencyName = null;
      continue;
    }
    if (!inRootImporter) continue;
    if (/^  \S/.test(line) && line !== "  .:") {
      inRootImporter = false;
      inDependencySection = false;
      dependencyName = null;
      continue;
    }

    const sectionMatch = line.match(/^    ([A-Za-z]+Dependencies|dependencies):$/);
    if (sectionMatch) {
      inDependencySection = dependencySectionKeys.includes(sectionMatch[1]);
      dependencyName = null;
      continue;
    }
    if (!inDependencySection) continue;
    const dependencyMatch = line.match(/^      (.+):$/);
    if (dependencyMatch) {
      dependencyName = parseLockfileKey(dependencyMatch[1]);
      continue;
    }
    if (!dependencyName) continue;
    if (/^        specifier:/.test(line) && expected.has(dependencyName)) {
      lines[index] = `        specifier: ${formatLockfileScalar(expected.get(dependencyName))}`;
    }
  }

  files["pnpm-lock.yaml"] = stripLockfileCatalogs(lines).join("\n");
}

function assertLockfileMatchesPackageJson(bundle, archetype) {
  const manifest = JSON.parse(bundle.files["package.json"]);
  if (/^catalogs:\n/m.test(bundle.files["pnpm-lock.yaml"])) {
    throw new Error(`${archetype} bundle lockfile still contains workspace catalog metadata`);
  }
  const expected = collectPackageSpecifiers(manifest);
  const actual = collectRootLockfileSpecifiers(bundle.files["pnpm-lock.yaml"]);
  for (const [name, specifier] of expected) {
    const lockfileSpecifier = actual.get(name);
    if (lockfileSpecifier !== specifier) {
      throw new Error(
        `${archetype} bundle lockfile mismatch for ${name}: package.json=${specifier}, pnpm-lock.yaml=${lockfileSpecifier ?? "(missing)"}`,
      );
    }
  }
}

function stripLockfileCatalogs(lines) {
  const next = [];
  let skipping = false;
  for (const line of lines) {
    if (line === "catalogs:") {
      skipping = true;
      continue;
    }
    if (skipping && /^\S/.test(line) && line.trim()) {
      skipping = false;
    }
    if (!skipping) next.push(line);
  }
  return next;
}

function collectPackageSpecifiers(manifest) {
  const specifiers = new Map();
  for (const key of dependencySectionKeys) {
    const deps = manifest[key];
    if (!deps || typeof deps !== "object" || Array.isArray(deps)) continue;
    for (const [name, specifier] of Object.entries(deps)) {
      specifiers.set(name, specifier);
    }
  }
  return specifiers;
}

function collectRootLockfileSpecifiers(text) {
  const specifiers = new Map();
  if (!text) return specifiers;
  const lines = text.split("\n");
  let inImporters = false;
  let inRootImporter = false;
  let inDependencySection = false;
  let dependencyName = null;

  for (const line of lines) {
    if (line === "importers:") {
      inImporters = true;
      inRootImporter = false;
      inDependencySection = false;
      dependencyName = null;
      continue;
    }
    if (!inImporters) continue;
    if (/^\S/.test(line) && line.trim() && line !== "importers:") break;
    if (line === "  .:") {
      inRootImporter = true;
      inDependencySection = false;
      dependencyName = null;
      continue;
    }
    if (!inRootImporter) continue;
    if (/^  \S/.test(line) && line !== "  .:") break;

    const sectionMatch = line.match(/^    ([A-Za-z]+Dependencies|dependencies):$/);
    if (sectionMatch) {
      inDependencySection = dependencySectionKeys.includes(sectionMatch[1]);
      dependencyName = null;
      continue;
    }
    if (!inDependencySection) continue;
    const dependencyMatch = line.match(/^      (.+):$/);
    if (dependencyMatch) {
      dependencyName = parseLockfileKey(dependencyMatch[1]);
      continue;
    }
    const specifierMatch = line.match(/^        specifier:\s+(.+)$/);
    if (dependencyName && specifierMatch) {
      specifiers.set(dependencyName, parseLockfileScalar(specifierMatch[1]));
    }
  }
  return specifiers;
}

function parseLockfileKey(value) {
  return parseLockfileScalar(value.trim());
}

function parseLockfileScalar(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replaceAll("''", "'");
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return JSON.parse(trimmed);
  }
  return trimmed;
}

function formatLockfileScalar(value) {
  if (/^[A-Za-z0-9^~<>=.*| -]+$/.test(value) && !value.includes(":")) {
    return value;
  }
  return `'${String(value).replaceAll("'", "''")}'`;
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
