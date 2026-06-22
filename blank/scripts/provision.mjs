#!/usr/bin/env node
const localShared = new URL("./.mantle-shared-provision.mjs", import.meta.url);
await import(localShared.href);
