#!/usr/bin/env node
import { existsSync } from "node:fs";

const localShared = new URL("./.mantle-shared-provision.mjs", import.meta.url);
const repoShared = new URL("../../_common/scripts/.mantle-shared-provision.mjs", import.meta.url);
const shared = existsSync(localShared) ? localShared : repoShared;

await import(shared.href);
