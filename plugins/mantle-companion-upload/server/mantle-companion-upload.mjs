#!/usr/bin/env node
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { basename, isAbsolute, resolve } from "node:path";

const DEFAULT_MEDIA_TOOLS_URL =
  "https://github.com/aotter/mantle-starters/releases/download/v0.0.11-alpha.20/aotter-mantle-media-tools.tgz";

const TOOLS = [
  {
    name: "upload_mantle_image_from_file",
    description:
      "Upload a local image file into a Mantle site through create_media_upload, signed PUT URLs, and commit_media_upload. Pass file paths and metadata only; never pass base64 image bytes.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        filePath: {
          type: "string",
          description:
            "Absolute path, or path relative to CLAUDE_PROJECT_DIR/current working directory, for the image file to upload.",
        },
        purpose: {
          type: "string",
          description:
            "Declared Mantle media purpose, for example post-cover, page-hero, product-cover, or product-image.",
        },
        workerOrigin: {
          type: "string",
          description: "Mantle Worker origin. Defaults to MANTLE_WORKER_ORIGIN.",
        },
        staffBearer: {
          type: "string",
          description:
            "OAuth bearer for the Staff MCP endpoint. Defaults to MANTLE_STAFF_BEARER.",
        },
        mcpPath: {
          type: "string",
          description: "Staff MCP path. Defaults to /mcp/staff.",
        },
        filename: {
          type: "string",
          description: "Optional filename override recorded on the Mantle upload session.",
        },
        alt: {
          type: "string",
          description: "Optional image alt text.",
        },
        caption: {
          type: "string",
          description: "Optional image caption.",
        },
        maxEdge: {
          type: "number",
          description: "Optional longest-edge resize cap passed to mantle-media-tools.",
        },
        mediaToolsUrl: {
          type: "string",
          description: "Optional aotter-mantle-media-tools tarball URL override for testing.",
        },
      },
      required: ["filePath", "purpose"],
    },
  },
];

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    void handleLine(line);
  }
});

async function handleLine(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch (e) {
    log(`invalid JSON-RPC message: ${e?.message ?? e}`);
    return;
  }
  if (message.id === undefined && String(message.method ?? "").startsWith("notifications/")) {
    return;
  }
  try {
    const result = await dispatch(message);
    if (message.id !== undefined) send({ jsonrpc: "2.0", id: message.id, result });
  } catch (e) {
    if (message.id === undefined) {
      log(e?.stack ?? String(e));
      return;
    }
    send({
      jsonrpc: "2.0",
      id: message.id,
      error: {
        code: e?.code ?? -32000,
        message: e?.message ?? String(e),
        data: e?.data,
      },
    });
  }
}

async function dispatch(message) {
  switch (message.method) {
    case "initialize":
      return {
        protocolVersion: message.params?.protocolVersion ?? "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: {
          name: "mantle-companion-upload",
          version: "0.1.0",
        },
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools: TOOLS };
    case "tools/call":
      return callTool(message.params ?? {});
    default:
      throw rpcError(-32601, `Unknown method: ${message.method}`);
  }
}

async function callTool(params) {
  if (params.name !== "upload_mantle_image_from_file") {
    throw rpcError(-32601, `Unknown tool: ${params.name}`);
  }
  const args = params.arguments ?? {};
  const result = await uploadMantleImage(args);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

async function uploadMantleImage(args) {
  const filePath = requiredString(args.filePath, "filePath");
  const purpose = requiredString(args.purpose, "purpose");
  const workerOrigin = normalizeOrigin(
    stringOrNull(args.workerOrigin) ??
      process.env.MANTLE_WORKER_ORIGIN,
  );
  if (!workerOrigin) {
    throw rpcError(
      -32602,
      "Missing workerOrigin. Set MANTLE_WORKER_ORIGIN or pass workerOrigin.",
    );
  }
  const staffBearer =
    stringOrNull(args.staffBearer) ??
    process.env.MANTLE_STAFF_BEARER;
  if (!staffBearer) {
    throw rpcError(
      -32602,
      "Missing staffBearer. Set MANTLE_STAFF_BEARER or pass staffBearer.",
    );
  }
  const mcpPath = stringOrNull(args.mcpPath) ?? process.env.MANTLE_MCP_PATH ?? "/mcp/staff";
  const mediaToolsUrl =
    stringOrNull(args.mediaToolsUrl) ??
    process.env.MANTLE_MEDIA_TOOLS_TARBALL_URL ??
    DEFAULT_MEDIA_TOOLS_URL;
  const resolvedFile = resolveFilePath(filePath);
  await access(resolvedFile);

  const npxArgs = [
    "-y",
    mediaToolsUrl,
    "upload",
    "--file",
    resolvedFile,
    "--purpose",
    purpose,
    "--endpoint",
    workerOrigin,
    "--mcp-path",
    mcpPath,
  ];
  pushOptional(npxArgs, "--filename", stringOrNull(args.filename) ?? basename(resolvedFile));
  pushOptional(npxArgs, "--alt", stringOrNull(args.alt));
  pushOptional(npxArgs, "--caption", stringOrNull(args.caption));
  if (args.maxEdge !== undefined) {
    const maxEdge = Number(args.maxEdge);
    if (!Number.isFinite(maxEdge) || maxEdge <= 0) {
      throw rpcError(-32602, "maxEdge must be a positive number.");
    }
    pushOptional(npxArgs, "--max-edge", String(Math.trunc(maxEdge)));
  }

  const child = await run("npx", npxArgs, {
    ...process.env,
    MANTLE_STAFF_BEARER: staffBearer,
  });
  let parsed;
  try {
    parsed = JSON.parse(child.stdout);
  } catch (e) {
    throw rpcError(-32000, "mantle-media-tools returned non-JSON output.", {
      stdout: child.stdout,
      stderr: child.stderr,
      parseError: e?.message ?? String(e),
    });
  }
  return {
    workerOrigin,
    purpose,
    filePath: resolvedFile,
    uploadGroupId: parsed.uploadGroupId,
    asset: parsed.asset,
  };
}

function run(command, args, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      reject(rpcError(-32000, `${command} failed to start: ${error.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }
      reject(
        rpcError(-32000, `mantle-media-tools upload failed with exit code ${code}.`, {
          stdout,
          stderr,
        }),
      );
    });
  });
}

function requiredString(value, name) {
  const str = stringOrNull(value);
  if (!str) throw rpcError(-32602, `${name} must be a non-empty string.`);
  return str;
}

function stringOrNull(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeOrigin(value) {
  const raw = stringOrNull(value);
  if (!raw) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw rpcError(-32602, `workerOrigin must be a valid URL: ${raw}`);
  }
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function resolveFilePath(filePath) {
  if (isAbsolute(filePath)) return filePath;
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  return resolve(root, filePath);
}

function pushOptional(argv, flag, value) {
  if (value !== undefined && value !== null && value !== "") {
    argv.push(flag, value);
  }
}

function rpcError(code, message, data) {
  const error = new Error(message);
  error.code = code;
  if (data !== undefined) error.data = data;
  return error;
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function log(message) {
  process.stderr.write(`[mantle-companion-upload] ${message}\n`);
}
