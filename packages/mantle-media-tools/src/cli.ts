#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { encodeTrio } from "./encode.js";
import { MediaUploadError, uploadVariants } from "./upload-client.js";

/**
 * Single-purpose CLI: `mantle-media-tools upload --file ... --purpose ...`.
 *
 * Reads a source image, encodes the avif/webp/jpeg trio via sharp,
 * drives the multi-variant upload lifecycle against a deployed mantle
 * worker, prints the resulting MediaAsset to stdout as JSON. Non-zero
 * exit on any step's failure; structured diagnostics surface in
 * stderr for agent consumers to parse.
 *
 * Mantle install skill consumes this via `npx <tarball>` — see
 * skills/media/SKILL.md once that lands.
 */
async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h") {
    printUsage(process.stdout);
    return 0;
  }
  if (command !== "upload") {
    process.stderr.write(`mantle-media-tools: unknown command '${command}'\n`);
    printUsage(process.stderr);
    return 2;
  }
  const opts = parseUploadArgs(rest);
  if (!opts) {
    printUsage(process.stderr);
    return 2;
  }

  let source: Buffer;
  try {
    source = await readFile(opts.file);
  } catch (e) {
    process.stderr.write(`mantle-media-tools: cannot read ${opts.file}: ${(e as Error).message}\n`);
    return 1;
  }

  const variants = await encodeTrio(source, { maxLongestEdge: opts.maxEdge });

  try {
    const result = await uploadVariants({
      client: {
        baseUrl: opts.endpoint,
        auth:
          opts.bearer !== undefined
            ? { kind: "bearer", value: opts.bearer }
            : { kind: "cookie", value: opts.cookie! },
      },
      purpose: opts.purpose,
      filename: opts.filename ?? basename(opts.file),
      variants,
      alt: opts.alt,
      caption: opts.caption,
    });
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return 0;
  } catch (e) {
    if (e instanceof MediaUploadError) {
      process.stderr.write(
        JSON.stringify(
          { error: { step: e.step, status: e.status, body: e.body } },
          null,
          2,
        ) + "\n",
      );
      return 1;
    }
    process.stderr.write(`mantle-media-tools: ${(e as Error).message}\n`);
    return 1;
  }
}

interface UploadArgs {
  readonly file: string;
  readonly purpose: string;
  readonly endpoint: string;
  readonly bearer?: string;
  readonly cookie?: string;
  readonly filename?: string;
  readonly alt?: string;
  readonly caption?: string;
  readonly maxEdge?: number;
}

function parseUploadArgs(argv: readonly string[]): UploadArgs | null {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) return null;
    const eq = arg.indexOf("=");
    if (eq >= 0) {
      flags.set(arg.slice(2, eq), arg.slice(eq + 1));
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) return null;
    flags.set(arg.slice(2), next);
    i++;
  }
  const file = flags.get("file");
  const purpose = flags.get("purpose");
  const endpoint = flags.get("endpoint");
  if (!file || !purpose || !endpoint) return null;
  const bearer = flags.get("bearer");
  const cookie = flags.get("cookie");
  if (!bearer && !cookie) return null;
  const maxEdgeRaw = flags.get("max-edge");
  return {
    file,
    purpose,
    endpoint,
    bearer,
    cookie,
    filename: flags.get("filename"),
    alt: flags.get("alt"),
    caption: flags.get("caption"),
    maxEdge: maxEdgeRaw !== undefined ? Number(maxEdgeRaw) : undefined,
  };
}

function printUsage(out: NodeJS.WritableStream): void {
  out.write(
    [
      "Usage:",
      "  mantle-media-tools upload \\",
      "    --file <path>           Source image (jpeg/png/etc — any sharp input)",
      "    --purpose <slug>        Declared in siteDefaults.media.purposes",
      "    --endpoint <origin>     Mantle Worker origin, e.g. https://my-blog.example",
      "    [--bearer <token> | --cookie <name=value>]   Admin auth (exactly one)",
      "    [--filename <name>]     Override basename(file) on the wire",
      "    [--alt <text>] [--caption <text>]",
      "    [--max-edge <px>]       Longest-edge cap; default 1600",
      "",
      "Encodes avif + webp + jpeg via sharp, uploads each variant directly to",
      "R2 (Worker bypassed), commits the bundle, prints the committed MediaAsset",
      "as JSON to stdout. Errors surface structured diagnostics on stderr.",
      "",
      "Distributed via mantle-starters' GitHub release tarball — not npm.",
      "See aotter/mantle#272 and ADR-0017.",
      "",
    ].join("\n"),
  );
}

const exitCode = await main(process.argv.slice(2));
process.exit(exitCode);
