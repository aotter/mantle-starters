#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const check = process.argv.includes("--check");
const keepTemp = process.argv.includes("--keep-temp");

const distIndex = join(root, "packages/create-mantle/dist/index.js");
execFileSync("pnpm", ["-C", "packages/create-mantle", "build"], {
  cwd: root,
  stdio: "inherit",
});

const { installFromExtractedRoot } = await import(pathToFileURL(distIndex).href);
const sources = JSON.parse(readFileSync(join(root, "sources.json"), "utf8"));
const archetypes = uniqueArchetypesByPath(sources);
const changed = [];

for (const archetype of archetypes) {
  const destination = mkdtempSync(join(tmpdir(), `mantle-lock-${archetype}-`));
  try {
    installFromExtractedRoot({
      extractedRoot: root,
      sources,
      destination,
      archetype,
      projectName: `${archetype}-lock`,
      brand: "Lock Fixture",
      description: "Standalone lockfile fixture.",
      locales: ["en"],
      canonicalLocale: "en",
      githubOwner: "aotter",
      summary: "Standalone starter lockfile fixture",
      features: [],
      skipGitInit: true,
      skipInstall: true,
    });

    execFileSync(
      "pnpm",
      [
        "-C",
        destination,
        "install",
        "--lockfile-only",
        "--ignore-scripts",
        "--no-frozen-lockfile",
      ],
      { cwd: root, stdio: "inherit" },
    );

    const generated = join(destination, "pnpm-lock.yaml");
    const target = join(root, sources.archetypes[archetype].path, "pnpm-lock.yaml");
    if (!existsSync(generated)) {
      throw new Error(`${archetype}: generated scaffold did not produce pnpm-lock.yaml`);
    }
    const generatedBytes = readFileSync(generated);
    const currentBytes = existsSync(target) ? readFileSync(target) : null;
    if (!currentBytes || !generatedBytes.equals(currentBytes)) {
      changed.push(`${sources.archetypes[archetype].path}/pnpm-lock.yaml`);
      if (!check) copyFileSync(generated, target);
    }
  } finally {
    if (!keepTemp) rmSync(destination, { recursive: true, force: true });
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

function uniqueArchetypesByPath(sources) {
  const seen = new Set();
  const result = [];
  for (const [archetype, source] of Object.entries(sources.archetypes ?? {})) {
    if (!source?.path || seen.has(source.path)) continue;
    seen.add(source.path);
    result.push(archetype);
  }
  return result;
}
