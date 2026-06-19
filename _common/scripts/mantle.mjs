#!/usr/bin/env node
/**
 * Mantle workflow helpers — runs from the consumer project root.
 *
 * Verbs:
 *   emit-openapi [mantle args...] --output <file>
 *     Run `mantle emit-openapi` and write UTF-8 JSON from Node instead
 *     of relying on shell redirection. This keeps generated files
 *     Windows CMD / PowerShell safe.
 *   emit-types [mantle args...] --output <file>
 *     Run `mantle emit-types` and write UTF-8 declarations from Node
 *     instead of relying on shell redirection.
 *
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

function fail(msg) {
  process.stderr.write(`mantle: ${msg}\n`);
  process.exit(1);
}


function parseOutputArgs(rawArgs, defaultOutput) {
  const args = [];
  let output = defaultOutput;
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === "--output" || arg === "-o") {
      const value = rawArgs[++i];
      if (!value) fail(`${arg} requires a file path`);
      output = value;
      continue;
    }
    args.push(arg);
  }
  return { args, output };
}

function runMantleCli(args) {
  const result = spawnSync(
    process.platform === "win32" ? "mantle.cmd" : "mantle",
    args,
    {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      shell: process.platform === "win32",
    },
  );
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) fail(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout;
}

function runEmit(command, rawArgs, defaultOutput) {
  const { args, output } = parseOutputArgs(rawArgs, defaultOutput);
  const source = runMantleCli([command, ...args]);
  writeFileSync(resolve(output), source, "utf8");
}

async function main() {
  const verb = process.argv[2];
  switch (verb) {
    case "emit-openapi":
      runEmit("emit-openapi", process.argv.slice(3), "openapi.json");
      return;
    case "emit-types":
      runEmit("emit-types", process.argv.slice(3), "mantle-types.d.ts");
      return;
    default:
      process.stderr.write(
        `usage: node scripts/mantle.mjs emit-openapi [mantle args...] --output openapi.json\n` +
          `       node scripts/mantle.mjs emit-types [mantle args...] --output mantle-types.d.ts\n`,
      );
      process.exit(2);
  }
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
