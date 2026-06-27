#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, resolve } from "node:path";
import { compile } from "tailwindcss";

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const rootArg = valueAfter("--root") ?? ".";
const root = resolve(rootArg);
const inputPath = join(root, "styles", "globals.css");
const outputPath = join(root, "styles", "generated.css");
const require = createRequire(import.meta.url);

const compiler = await compile(readFileSync(inputPath, "utf8"), {
  from: inputPath,
  loadStylesheet: async (id, base) => {
    const path =
      id === "tailwindcss"
        ? require.resolve("tailwindcss/index.css", { paths: [root] })
        : id === "./tokens.css"
          ? join(root, "styles", "tokens.css")
        : resolveStylesheet(id, base);
    return {
      base: dirname(path),
      content: readFileSync(path, "utf8"),
    };
  },
});

const css = compiler.build(collectCandidates(root));

if (checkOnly) {
  const current = existsSync(outputPath) ? readFileSync(outputPath, "utf8") : "";
  if (current !== css) {
    console.error("styles/generated.css is stale; run node scripts/build-styles.mjs");
    process.exit(1);
  }
} else {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, css);
}

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index === -1 ? null : args[index + 1] ?? null;
}

function resolveStylesheet(id, base) {
  const baseDir = base ? (extname(base) ? dirname(base) : base) : root;
  if (id.startsWith(".")) return resolve(baseDir, id);
  return require.resolve(id, { paths: [baseDir] });
}

function collectCandidates(root) {
  const candidates = new Set();
  for (const dir of ["src", "components"]) {
    collectFromDir(join(root, dir), candidates);
  }
  return [...candidates].sort();
}

function collectFromDir(dir, candidates) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    if (name.isDirectory()) {
      collectFromDir(path, candidates);
      continue;
    }
    if (![".js", ".jsx", ".ts", ".tsx"].includes(extname(name.name))) continue;
    for (const token of readFileSync(path, "utf8").match(/[A-Za-z0-9_!:[\]./%#(),=>*+-]+/g) ?? []) {
      candidates.add(token);
    }
  }
}
