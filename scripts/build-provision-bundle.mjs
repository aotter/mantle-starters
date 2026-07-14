#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

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
  applyProvisionedReadme(files, archetype);
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
    "src/web/content/types.ts",
    "kiwa/manifest.json",
    "styles/generated.css",
    "src/web/mantleOceanHero.ts",
  ]) {
    if (!bundle.files[required]) throw new Error(`${archetype} bundle missing ${required}`);
  }
  if (!bundle.files["src/worker/routes/assets.ts"]?.includes("/styles.css")) {
    throw new Error(`${archetype} bundle missing generated stylesheet route`);
  }
  if (!bundle.files["src/worker/routes/assets.ts"]?.includes("/mantle-ocean-hero-light.svg")) {
    throw new Error(`${archetype} bundle missing Mantle ocean hero asset route`);
  }
  if (!bundle.files["src/worker/routes/assets.ts"]?.includes("/mantle-ocean-hero-dark.svg")) {
    throw new Error(`${archetype} bundle missing dark Mantle ocean hero asset route`);
  }
  if (!bundle.files["src/web/sections/renderSection.tsx"]?.includes("/assets/mantle-ocean-hero-light.svg")) {
    throw new Error(`${archetype} homepage missing Mantle ocean hero image`);
  }
  if (!bundle.files["src/web/client/homeClient.ts"]?.includes("/assets/mantle-ocean-hero-light.svg', '/assets/mantle-ocean-hero-dark.svg")) {
    throw new Error(`${archetype} homepage hero image must support manual theme switching`);
  }
  if (!bundle.files["src/web/assets.ts"]?.includes("assetBuild")) {
    throw new Error(`${archetype} homepage assets must be cache-busted`);
  }
  if (!bundle.files["styles/swirl-images.css"]?.includes("?v=")) {
    throw new Error(`${archetype} swirl images must be cache-busted`);
  }
  if (!bundle.files["src/worker/routes/assets.ts"]?.includes('const ASSET_CACHE_CONTROL = "public, max-age=300"')) {
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
    const homeContent = bundle.files["src/web/content/homeContent.ts"] ?? "";
    const siteContent = bundle.files["src/web/content/siteContent.ts"] ?? "";
    for (const forbidden of ["starts here", "contactForm", "Placeholder proof", "Start a conversation"]) {
      if (homeContent.includes(forbidden) || siteContent.includes(forbidden)) {
        throw new Error(`blank bundle contains seeded homepage copy: ${forbidden}`);
      }
    }
  }
  if (archetype === "presence" || archetype === "intake" || archetype === "publication") {
    const seedImport = `../../../.mantle/overlays/${archetype}/seed.json`;
    if (!bundle.files["src/web/content/homeContent.ts"]?.includes(seedImport)) {
      throw new Error(`${archetype} homeContent must read the overlay seed`);
    }
    if (!bundle.files["src/web/content/siteContent.ts"]?.includes(seedImport)) {
      throw new Error(`${archetype} siteContent must read the overlay seed`);
    }
  }
  assertLockfileMatchesPackageJson(bundle, archetype);
  assertProvisionedReadme(bundle, archetype);
}

function applyProvisionedReadme(files, archetype) {
  const base = files["README.md"];
  if (!base) return;
  const reusableStart = base.indexOf("## Kiwa UI Credit");
  const reusableBody = reusableStart === -1 ? base : base.slice(reusableStart);
  const manifestPath = archetype === "blank" ? "manifests/example.yaml" : `manifests/${archetype}.yaml`;
  const overview = [
    "# {{BRAND}}",
    "",
    "{{DESCRIPTION}}",
    "",
    "## Launch overview",
    "",
    "Mantle landing provisioned this repository as a Mantle site.",
    "",
    `- Launch type: \`{{ARCHETYPE}}\``,
    "- Site: {{SITE_URL}}",
    "- Site owner: {{SITE_OWNER_EMAIL}}",
    `- Manifest: \`${manifestPath}\``,
    "- Launch facts: `.mantle/launch-state.json`",
    "- Agent handoff: `.mantle/handoff.md`",
    ...(archetype === "blank"
      ? ["- Type notes: this is the blank base with no seeded visible homepage sections"]
      : [
          `- Type notes: \`.mantle/overlays/${archetype}/handoff.md\``,
          `- Layout notes: \`.mantle/overlays/${archetype}/layout.md\``,
          `- Seed data: \`.mantle/overlays/${archetype}/seed.json\``,
        ]),
    "",
    "## Type notes",
    "",
    archetype === "blank"
      ? "`blank` is the base Mantle site: Cloudflare Worker runtime, Mantle API/MCP surfaces, Kiwa components, and an example manifest. It intentionally ships no visible homepage sections until a launch type or coding agent adds them."
      : stripMarkdownTitle(files[`.mantle/overlays/${archetype}/handoff.md`] ?? ""),
    "",
    ...(archetype === "blank"
      ? []
      : [
          "## Layout notes",
          "",
          stripMarkdownTitle(files[`.mantle/overlays/${archetype}/layout.md`] ?? ""),
          "",
        ]),
  ].join("\n");
  files["README.md"] = `${overview}\n${reusableBody}`;
}

function stripMarkdownTitle(text) {
  return text.replace(/^# .*\n+/, "").trim();
}

function assertProvisionedReadme(bundle, archetype) {
  const readme = bundle.files["README.md"] ?? "";
  if (!readme.startsWith("# {{BRAND}}\n")) {
    throw new Error(`${archetype} README must start with the provisioned brand placeholder`);
  }
  for (const required of ["## Launch overview", "## Type notes", ".mantle/handoff.md", ".mantle/launch-state.json"]) {
    if (!readme.includes(required)) throw new Error(`${archetype} README missing ${required}`);
  }
  if (readme.includes("aotter/mantle-starters/blank")) {
    throw new Error(`${archetype} README still reads like the source starter README`);
  }
  const manifestPath = archetype === "blank" ? "manifests/example.yaml" : `manifests/${archetype}.yaml`;
  if (!readme.includes(manifestPath)) throw new Error(`${archetype} README missing manifest path`);
  if (archetype !== "blank") {
    for (const required of [
      `.mantle/overlays/${archetype}/handoff.md`,
      `.mantle/overlays/${archetype}/layout.md`,
      `.mantle/overlays/${archetype}/seed.json`,
      "## Layout notes",
    ]) {
      if (!readme.includes(required)) throw new Error(`${archetype} README missing ${required}`);
    }
  }
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
  const seedImport = `../../../.mantle/overlays/${archetype}/seed.json`;
  if (seed?.site) {
    files["src/web/content/siteContent.ts"] = [
      `import seed from "${seedImport}";`,
      'import type { SiteContent } from "./types.js";',
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
    files["src/web/content/homeContent.ts"] = [
      `import seed from "${seedImport}";`,
      'import type { HomeContent, HomeSection } from "./types.js";',
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
  files["src/mantle/manifests.ts"] = [
    'import { parseManifestsOrThrow, type Manifest } from "@aotter/mantle/spec";',
    `import ${bindingName} from "../../manifests/${archetype}.yaml";`,
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
  const catalog = parseYaml(readFileSync(join(root, "pnpm-workspace.yaml"), "utf8"))?.catalog ?? {};
  const manifest = JSON.parse(raw);
  for (const key of dependencySectionKeys) {
    const deps = manifest[key];
    if (!deps || typeof deps !== "object" || Array.isArray(deps)) continue;
    for (const [name, spec] of Object.entries(deps)) {
      if (spec === "catalog:") deps[name] = catalog[name] ?? fail(`catalog missing ${name}`);
    }
  }
  files["package.json"] = JSON.stringify(manifest, null, 2) + "\n";
}

function resolveCatalogLockfile(files) {
  const raw = files["pnpm-lock.yaml"];
  const manifestRaw = files["package.json"];
  if (!raw || !manifestRaw) return;
  const expected = collectPackageSpecifiers(JSON.parse(manifestRaw));
  const lockfile = parseYaml(raw);
  delete lockfile.catalogs;
  const importer = lockfile.importers?.["."] ?? {};
  for (const key of dependencySectionKeys) {
    for (const [name, entry] of Object.entries(importer[key] ?? {})) {
      if (expected.has(name)) entry.specifier = expected.get(name);
    }
  }
  files["pnpm-lock.yaml"] = stringifyYaml(lockfile, { lineWidth: 0, singleQuote: true });
}

function assertLockfileMatchesPackageJson(bundle, archetype) {
  const manifest = JSON.parse(bundle.files["package.json"]);
  const lockfile = parseYaml(bundle.files["pnpm-lock.yaml"] ?? "") ?? {};
  if (lockfile.catalogs) {
    throw new Error(`${archetype} bundle lockfile still contains workspace catalog metadata`);
  }
  const expected = collectPackageSpecifiers(manifest);
  const actual = collectRootLockfileSpecifiers(lockfile);
  for (const [name, specifier] of expected) {
    const lockfileSpecifier = actual.get(name);
    if (lockfileSpecifier !== specifier) {
      throw new Error(
        `${archetype} bundle lockfile mismatch for ${name}: package.json=${specifier}, pnpm-lock.yaml=${lockfileSpecifier ?? "(missing)"}`,
      );
    }
  }
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

function collectRootLockfileSpecifiers(lockfile) {
  const specifiers = new Map();
  const importer = lockfile.importers?.["."] ?? {};
  for (const key of dependencySectionKeys) {
    for (const [name, entry] of Object.entries(importer[key] ?? {})) {
      specifiers.set(name, entry?.specifier);
    }
  }
  return specifiers;
}

function fail(message) {
  throw new Error(message);
}
