#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const check = process.argv.includes("--check");
const keepTemp = process.argv.includes("--keep-temp");
const sources = JSON.parse(readFileSync(join(root, "sources.json"), "utf8"));
const changed = [];

for (const starterPath of uniqueStarterPaths(sources)) {
  const tempRoot = mkdtempSync(join(tmpdir(), "mantle-lock-"));
  try {
    cpSync(join(root, "pnpm-workspace.yaml"), join(tempRoot, "pnpm-workspace.yaml"));
    cpSync(join(root, starterPath), join(tempRoot, starterPath), {
      recursive: true,
      filter: (path) => !path.includes(`${starterPath}/node_modules`),
    });
    execFileSync(
      "pnpm",
      [
        "-C",
        join(tempRoot, starterPath),
        "install",
        "--lockfile-only",
        "--ignore-scripts",
        "--no-frozen-lockfile",
      ],
      { cwd: tempRoot, stdio: "inherit" },
    );

    const generated = join(tempRoot, starterPath, "pnpm-lock.yaml");
    const target = join(root, starterPath, "pnpm-lock.yaml");
    if (!existsSync(generated)) throw new Error(`${starterPath}: missing generated pnpm-lock.yaml`);
    const generatedBytes = readFileSync(generated);
    const currentBytes = existsSync(target) ? readFileSync(target) : null;
    if (!currentBytes || !generatedBytes.equals(currentBytes)) {
      changed.push(`${starterPath}/pnpm-lock.yaml`);
      if (!check) cpSync(generated, target);
    }
  } finally {
    if (!keepTemp) rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (changed.length > 0) {
  if (check) {
    console.error("Starter lockfiles are stale. Run `pnpm refresh:starter-locks`.");
    for (const file of changed) console.error(`  - ${file}`);
    process.exit(1);
  }
  console.log("Updated starter lockfiles:");
  for (const file of changed) console.log(`  - ${file}`);
} else {
  console.log("Starter lockfiles are current.");
}

function uniqueStarterPaths(sources) {
  return [
    ...new Set(
      Object.values(sources.archetypes ?? {})
        .map((source) => source?.path)
        .filter(Boolean),
    ),
  ].sort();
}
