#!/usr/bin/env node
/**
 * Migrate a starter's local seed assets into the deployed mantle Worker's
 * R2-backed media store. Lifted from project-toa-shop's TOA-specific
 * script and parameterized for any starter — see #221.
 *
 * The orchestration is three-phase so reruns can resume from where they
 * left off:
 *
 *   plan    Scan the source directory, group entries by purpose, write
 *           a `.migration-state.json` plan with one row per source file.
 *   encode  Read planned rows that are still pending, encode variants
 *           via `@aotter/mantle-media-tools` (sharp under the hood), and
 *           stash the encoded bytes back on the state row (in-memory for
 *           this run only — bytes aren't persisted to disk).
 *   upload  For each planned row, drive create → PUT → commit through
 *           `mantle-media-tools`'s upload-client. The committed asset id
 *           lands in `.migration-state.json` so seed scripts can join on
 *           `named:<slug>`.
 *
 * Re-running an already-finished plan is a no-op: rows with a recorded
 * `assetId` are skipped at upload time, and `plan` refuses to overwrite
 * an existing state file unless `--force` is passed.
 *
 * Out of scope (per #221):
 *   - Multi-source backends (S3 / GCS). Local FS only for v1.
 *   - Variant role autodetection. Config declares variants explicitly.
 *
 * Usage:
 *   node _common/scripts/migrate-media.mjs plan   --config mantle/media-migration.config.json
 *   node _common/scripts/migrate-media.mjs encode --config mantle/media-migration.config.json
 *   node _common/scripts/migrate-media.mjs upload --config mantle/media-migration.config.json \
 *                                                 --base-url https://my-shop.example \
 *                                                 --bearer  $MANTLE_STAFF_BEARER
 *
 * `sharp` is an opt-in peer dep — install via `pnpm i -D sharp` in the
 * starter project before running encode/upload.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";

// `@aotter/mantle-media-tools` is an opt-in dependency — `--help` and
// `plan` should work in a project that hasn't installed it yet. Import
// dynamically inside `encode` / `upload` so a missing dep surfaces as
// a clear message instead of a module-load crash before we can format
// the error.
async function loadMediaTools() {
  try {
    return await import("@aotter/mantle-media-tools");
  } catch {
    fail(
      "@aotter/mantle-media-tools is not installed. Run `pnpm i -D sharp @aotter/mantle-media-tools` and retry.",
    );
  }
}

const VERBS = new Set(["plan", "encode", "upload"]);
const MIME_BY_EXT = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
};

function fail(msg) {
  process.stderr.write(`migrate-media: ${msg}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const [verb, ...rest] = argv;
  if (!verb || verb === "--help" || verb === "-h") {
    process.stdout.write(
      `Usage: migrate-media.mjs <${[...VERBS].join("|")}> --config <path> [--force]\n` +
        `       migrate-media.mjs upload  --config <path> --base-url <origin> --bearer <token>\n` +
        `See _common/scripts/README.md for the config schema and end-to-end flow.\n`,
    );
    process.exit(verb ? 0 : 1);
  }
  if (!VERBS.has(verb)) {
    fail(`unknown verb '${verb}'. Use one of: ${[...VERBS].join(", ")}.`);
  }
  const out = { verb, flags: {} };
  for (let i = 0; i < rest.length; i++) {
    const k = rest[i];
    if (!k.startsWith("--")) fail(`unexpected positional argument '${k}'.`);
    const v = rest[i + 1];
    if (v === undefined || v.startsWith("--")) {
      out.flags[k.slice(2)] = true;
    } else {
      out.flags[k.slice(2)] = v;
      i++;
    }
  }
  return out;
}

function loadConfig(path) {
  if (!existsSync(path)) fail(`config '${path}' not found.`);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    fail(`config '${path}' is not valid JSON: ${err.message}`);
  }
  for (const k of ["sourceDir", "purposes", "outputState"]) {
    if (!(k in parsed)) fail(`config missing required field '${k}'.`);
  }
  if (!Array.isArray(parsed.purposes) || parsed.purposes.length === 0) {
    fail("config.purposes must be a non-empty array.");
  }
  return parsed;
}

function readState(path) {
  if (!existsSync(path)) return { rows: [] };
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    fail(`state file '${path}' is not valid JSON: ${err.message}`);
  }
}

function writeState(path, state) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2) + "\n", "utf8");
}

function scanPurpose(rootDir, purpose) {
  const dir = resolve(rootDir, purpose.sourceSubdir ?? purpose.name);
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir);
  const allow = new Set((purpose.mimeAllowlist ?? Object.values(MIME_BY_EXT)).map(String));
  const out = [];
  for (const file of entries) {
    const full = join(dir, file);
    if (!statSync(full).isFile()) continue;
    const ext = extname(file).toLowerCase();
    const mime = MIME_BY_EXT[ext];
    if (!mime || !allow.has(mime)) continue;
    const slug = file.slice(0, file.length - ext.length).replace(/[^a-zA-Z0-9_-]/g, "-");
    out.push({
      slug: `${purpose.name}/${slug}`,
      purpose: purpose.name,
      source: full,
      mimeType: mime,
    });
  }
  return out;
}

function planRows(config) {
  const rows = [];
  for (const purpose of config.purposes) {
    rows.push(...scanPurpose(config.sourceDir, purpose));
  }
  return rows;
}

async function encodeRow(row, { encodeTrio }) {
  const buf = readFileSync(row.source);
  const variants = await encodeTrio(buf);
  return { ...row, variants };
}

async function uploadRow(row, client, { encodeTrio, uploadVariants }) {
  if (row.assetId) return row;
  if (!row.variants) {
    const buf = readFileSync(row.source);
    row = { ...row, variants: await encodeTrio(buf) };
  }
  const { uploadGroupId, asset } = await uploadVariants({
    client,
    purpose: row.purpose,
    filename: row.source.split("/").pop() ?? row.slug,
    variants: row.variants,
  });
  return {
    slug: row.slug,
    purpose: row.purpose,
    source: row.source,
    mimeType: row.mimeType,
    uploadGroupId,
    assetId: asset.id,
    variants: asset.variants.map((v) => ({
      mimeType: v.mimeType,
      role: v.role,
      publicUrl: v.publicUrl,
      byteSize: v.byteSize,
    })),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = args.flags.config;
  if (!configPath) fail("--config <path> is required.");
  const config = loadConfig(configPath);
  const statePath = resolve(config.outputState);

  if (args.verb === "plan") {
    if (existsSync(statePath) && !args.flags.force) {
      fail(`state file '${statePath}' exists; pass --force to overwrite.`);
    }
    const rows = planRows(config);
    writeState(statePath, { rows });
    process.stdout.write(`Wrote ${rows.length} planned rows to ${statePath}.\n`);
    return;
  }

  const state = readState(statePath);
  if (state.rows.length === 0) fail(`state file '${statePath}' has no rows. Run \`plan\` first.`);

  if (args.verb === "encode") {
    // Encode is a dry run: it doesn't persist bytes, just validates that
    // every source decodes and can produce the variant trio. Useful as a
    // pre-flight before upload spends Worker requests.
    const tools = await loadMediaTools();
    let okCount = 0;
    for (const row of state.rows) {
      if (row.assetId) continue;
      try {
        await encodeRow(row, tools);
        okCount++;
      } catch (err) {
        process.stderr.write(`encode failed for ${row.slug}: ${err.message}\n`);
      }
    }
    process.stdout.write(`Encoded ${okCount}/${state.rows.length} rows OK.\n`);
    return;
  }

  if (args.verb === "upload") {
    const baseUrl = args.flags["base-url"];
    const bearer = args.flags.bearer ?? process.env.MANTLE_STAFF_BEARER;
    if (!baseUrl) fail("--base-url <origin> is required for upload.");
    if (!bearer) fail("--bearer <token> or env MANTLE_STAFF_BEARER is required for upload.");
    const tools = await loadMediaTools();
    const client = { baseUrl, bearer };
    const updated = [];
    for (const row of state.rows) {
      const next = await uploadRow(row, client, tools);
      updated.push(next);
      writeState(statePath, { rows: updated.concat(state.rows.slice(updated.length)) });
      process.stdout.write(`uploaded ${next.slug} → ${next.assetId}\n`);
    }
    process.stdout.write(`Done. ${updated.filter((r) => r.assetId).length}/${updated.length} rows have an assetId.\n`);
    return;
  }
}

main().catch((err) => {
  process.stderr.write(`migrate-media: ${err?.stack ?? err}\n`);
  process.exit(1);
});
