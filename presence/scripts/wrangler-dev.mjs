#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const home = resolve(root, ".wrangler-home");
const cache = resolve(home, "cache");
const config = resolve(home, "config");
const data = resolve(home, "data");
const state = resolve(home, "state");
const logs = resolve(home, "logs");

for (const dir of [home, cache, config, data, state, logs]) {
  mkdirSync(dir, { recursive: true });
}

const args = [
  "dev",
  "--ip",
  process.env.WRANGLER_DEV_IP ?? "localhost",
  "--port",
  process.env.WRANGLER_DEV_PORT ?? "8787",
  "--inspector-port",
  process.env.WRANGLER_INSPECTOR_PORT ?? "0",
  "--persist-to",
  process.env.WRANGLER_PERSIST_TO ?? ".wrangler",
  ...process.argv.slice(2),
];

const child = spawn("wrangler", args, {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    HOME: home,
    XDG_CACHE_HOME: cache,
    XDG_CONFIG_HOME: config,
    XDG_DATA_HOME: data,
    XDG_STATE_HOME: state,
    WRANGLER_LOG_PATH:
      process.env.WRANGLER_LOG_PATH ?? resolve(logs, "wrangler.log"),
    WRANGLER_WRITE_LOGS: process.env.WRANGLER_WRITE_LOGS ?? "false",
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
