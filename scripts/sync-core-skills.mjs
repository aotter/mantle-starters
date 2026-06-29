#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const explicitSource = args.includes("--source");
const sourceArg = args.find((arg, i) => args[i - 1] === "--source");
const sourceRoot = resolve(root, sourceArg ?? "../mantle");
const skills = [
  ["develop", "mantle-develop"],
  ["plugin", "mantle-plugin"],
  ["theme", "mantle-theme"],
  ["update", "mantle-update"],
];
const failures = [];

if (checkOnly && !explicitSource && !existsSync(join(sourceRoot, "skills"))) {
  console.log("core skills: source unavailable; skipped external check");
  process.exit(0);
}

for (const [sourceDir, targetDir] of skills) {
  const sourcePath = join(sourceRoot, "skills", sourceDir, "SKILL.md");
  if (!existsSync(sourcePath)) {
    failures.push(`missing core skill source: ${sourcePath}`);
    continue;
  }
  const text = readFileSync(sourcePath, "utf8");
  for (const base of [".agent", ".claude"]) {
    const targetPath = join(root, "blank", base, "skills", targetDir, "SKILL.md.template");
    if (checkOnly) {
      const current = existsSync(targetPath) ? readFileSync(targetPath, "utf8") : "";
      if (current !== text) failures.push(`${targetPath} differs from ${sourcePath}`);
    } else {
      mkdirSync(dirname(targetPath), { recursive: true });
      writeFileSync(targetPath, text);
    }
  }
}

if (failures.length) {
  for (const failure of failures) console.error(`core skills: ${failure}`);
  process.exit(1);
}

console.log(checkOnly ? "core skills: ok" : "core skills: synced");
