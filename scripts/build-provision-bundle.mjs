#!/usr/bin/env node
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const outPath = join(root, "provision-bundles", "blank.json");
const checkOnly = process.argv.includes("--check");
const files = {};

walk("_common", "");
walk("blank", "");
resolveCatalogPackageJson();

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
  '  "handoff": ".mantle/handoff.md"',
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
  "- First task: open the live site URL from Mantle landing, then use `mantle:next`.",
  "",
].join("\n");

const mantleNextSkill = [
  "---",
  "name: mantle:next",
  "description: Continue a blank Mantle site after landing created the repo and started Cloudflare Workers CI.",
  "---",
  "",
  "# Mantle Next",
  "",
  "Read `.mantle/launch-state.json`, `.mantle/features.json`, and `.mantle/handoff.md` first. Then open the live Workers URL shown on Mantle landing and confirm what is currently deployed.",
  "",
  "Do not run the old launch theme picker. Do not switch to a legacy themed starter. This repo starts blank on purpose.",
  "",
  "## Build From Type Intent",
  "",
  "Use the `archetype` in `.mantle/launch-state.json` as intent only:",
  "",
  "- add the smallest useful 4-atoms manifest for that type;",
  "- seed tiny example data in the user's canonical locale;",
  "- add only the type-specific layout/code needed to make the first page understandable;",
  "- keep custom runtime logic out unless the type cannot work without it.",
  "",
  "If the user chose publication, presence, intake, or transaction, build upward from this blank base rather than copying an old starter wholesale.",
  "",
  "## Design Direction",
  "",
  "Use Kiwa UI marketing blocks as layout references when helpful, especially Navigation, Hero, Blog, Contact, CTA, Footer, Pricing, and product/listing patterns. Start from official docs: https://kiwaui.com/docs",
  "",
  "Do not expose a theme picker to the user. Apply brand and L4 visual direction as normal code changes with the user's feedback.",
  "",
  "## Then",
  "",
  "After the first useful site shape is in place, run `mantle:provision` to finish GitHub OAuth app setup, Wrangler secrets, admin auth, and smoke tests.",
  "",
].join("\n");

files[".agent/skills/mantle-next/SKILL.md"] = mantleNextSkill;
files[".claude/skills/mantle-next/SKILL.md"] = mantleNextSkill;

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
  ".agent/skills/mantle-next/SKILL.md",
  ".claude/skills/mantle-next/SKILL.md",
]) {
  if (!bundle.files[required]) throw new Error(`bundle missing ${required}`);
}

function walk(from, to) {
  for (const name of readdirSync(join(root, from))) {
    if (skip(from, name)) continue;
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

function skip(parent, name) {
  return [".git", ".DS_Store", ".wrangler", ".wrangler-test", ".pnpm-store", "node_modules", "dist", "_compose"].includes(name) ||
    (parent === "_common" && name === "features");
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
