#!/usr/bin/env node
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";

const args = process.argv.slice(2);
const force = args.includes("--force");
const overlayArg = args.find((arg) => !arg.startsWith("--"));
const root = process.cwd();
const launchState = readJsonIfExists(join(root, ".mantle", "launch-state.json"));
const overlay = overlayArg ?? stringField(launchState, "archetype");

if (!overlay || overlay === "blank") {
  console.log("mantle overlay: blank has no overlay to apply.");
  process.exit(0);
}

const sourceRoot = join(root, "overlays", overlay);
if (!isDirectory(sourceRoot)) {
  throw new Error(`Unknown overlay "${overlay}". Expected ${relative(root, sourceRoot)}`);
}

const written = [];
copyDir(join(sourceRoot, "manifests"), join(root, "manifests"));
copyOptional("handoff.md", join(root, ".mantle", "overlays", overlay, "handoff.md"));
copyOptional("seed-prompt.md", join(root, ".mantle", "overlays", overlay, "seed-prompt.md"));
copyOptional("layout.md", join(root, ".mantle", "overlays", overlay, "layout.md"));
markApplied();

console.log(`mantle overlay: applied ${overlay}`);
for (const file of written.sort()) console.log(`  - ${file}`);

function copyDir(from, to) {
  if (!isDirectory(from)) return;
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const src = join(from, entry.name);
    const dst = join(to, entry.name);
    if (entry.isDirectory()) {
      copyDir(src, dst);
    } else if (entry.isFile()) {
      copyOne(src, dst);
    }
  }
}

function copyOptional(name, target) {
  const src = join(sourceRoot, name);
  if (existsSync(src)) copyOne(src, target);
}

function copyOne(src, dst) {
  if (existsSync(dst) && !force) {
    throw new Error(`${relative(root, dst)} already exists; pass --force to overwrite`);
  }
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  written.push(relative(root, dst));
}

function markApplied() {
  const path = join(root, ".mantle", "features.json");
  const features = readJsonIfExists(path) ?? {};
  const archetype = isObject(features.archetype) ? features.archetype : {};
  // ponytail: one explicit marker beats inventing overlay history until
  // generated repos need multi-overlay rollbacks.
  features.archetype = {
    ...archetype,
    name: overlay,
    type: "registry:archetype",
    overlayPath: `overlays/${overlay}`,
    appliedAt: new Date().toISOString(),
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(features, null, 2) + "\n");
  written.push(relative(root, path));
}

function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function stringField(value, key) {
  return isObject(value) && typeof value[key] === "string" ? value[key] : null;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
