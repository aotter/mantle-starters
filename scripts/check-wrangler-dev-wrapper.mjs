#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const wrappers = [
  "blank/scripts/wrangler-dev.mjs",
  "presence/scripts/wrangler-dev.mjs",
  "intake/scripts/wrangler-dev.mjs",
  "publication/scripts/wrangler-dev.mjs",
  "transaction/scripts/wrangler-dev.mjs",
];

const common = readFileSync(join(root, wrappers[0]), "utf8");

for (const wrapper of wrappers.slice(1)) {
  const actual = readFileSync(join(root, wrapper), "utf8");
  if (actual !== common) {
    throw new Error(`${wrapper} drifted from ${wrappers[0]}`);
  }
}

for (const wrapper of wrappers) {
  const temp = mkdtempSync(join(tmpdir(), "wrangler-dev-wrapper-"));
  try {
    const bin = join(temp, "bin");
    mkdirSync(bin, { recursive: true });
    const capture = join(temp, "capture.json");
    const fakeWrangler = join(bin, "wrangler");
    writeFileSync(
      fakeWrangler,
      [
        "#!/usr/bin/env node",
        "import { writeFileSync } from 'node:fs';",
        "writeFileSync(process.env.WRANGLER_DEV_CAPTURE, JSON.stringify({",
        "  argv: process.argv.slice(2),",
        "  env: {",
        "    HOME: process.env.HOME,",
        "    XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,",
        "    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,",
        "    XDG_DATA_HOME: process.env.XDG_DATA_HOME,",
        "    XDG_STATE_HOME: process.env.XDG_STATE_HOME,",
        "    WRANGLER_LOG_PATH: process.env.WRANGLER_LOG_PATH,",
        "    WRANGLER_WRITE_LOGS: process.env.WRANGLER_WRITE_LOGS,",
        "  },",
        "}));",
        "",
      ].join("\n"),
    );
    chmodSync(fakeWrangler, 0o755);

    const result = spawnSync(
      process.execPath,
      [join(root, wrapper), "--local-protocol", "http"],
      {
        cwd: temp,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH ?? ""}`,
          WRANGLER_DEV_CAPTURE: capture,
        },
        encoding: "utf8",
      },
    );
    if (result.status !== 0) {
      throw new Error(
        `${wrapper} exited ${result.status}\n${result.stderr}${result.stdout}`,
      );
    }

    const captured = JSON.parse(readFileSync(capture, "utf8"));
    assertArg(captured.argv, "--ip", "localhost", wrapper);
    assertArg(captured.argv, "--port", "8787", wrapper);
    assertArg(captured.argv, "--inspector-port", "0", wrapper);
    assertArg(captured.argv, "--persist-to", ".wrangler", wrapper);
    if (!captured.argv.includes("--local-protocol")) {
      throw new Error(`${wrapper} did not forward extra CLI args`);
    }

    const expectedHome = join(realpathSync(temp), ".wrangler-home");
    if (captured.env.HOME !== expectedHome) {
      throw new Error(`${wrapper} HOME was ${captured.env.HOME}`);
    }
    for (const key of [
      "XDG_CACHE_HOME",
      "XDG_CONFIG_HOME",
      "XDG_DATA_HOME",
      "XDG_STATE_HOME",
      "WRANGLER_LOG_PATH",
    ]) {
      if (!captured.env[key]?.startsWith(expectedHome)) {
        throw new Error(`${wrapper} ${key} was ${captured.env[key]}`);
      }
    }
    if (captured.env.WRANGLER_WRITE_LOGS !== "false") {
      throw new Error(`${wrapper} did not disable Wrangler log writes`);
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

console.log("wrangler-dev wrappers: ok");

function assertArg(argv, name, expected, wrapper) {
  const index = argv.indexOf(name);
  if (index < 0) throw new Error(`${wrapper} missing ${name}`);
  if (argv[index + 1] !== expected) {
    throw new Error(`${wrapper} ${name} was ${argv[index + 1]}`);
  }
}
