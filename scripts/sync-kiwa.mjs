#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const checkOnly = process.argv.includes("--check");
const registryBase = "https://registry.kiwaui.com";
const githubRaw =
  "https://raw.githubusercontent.com/kiwa-ui/kiwa-ui/d00aba1ce6fc0f0c48c0102d803dc15e5f1ce3d5";
const uiItems = ["button", "card", "badge"];
const mirrorRoots = ["kiwa", "blank"];
const manifestPath = join(root, "kiwa", "manifest.json");

if (checkOnly) {
  checkManifest();
} else {
  await sync();
}

async function sync() {
  const files = [];
  for (const itemName of uiItems) {
    const source = `${registryBase}/r/${itemName}.json`;
    const item = await fetchJson(source);
    if (item?.meta?.free !== true) {
      throw new Error(`Kiwa item ${itemName} is not marked free`);
    }
    for (const file of item.files ?? []) {
      if (typeof file.path !== "string" || typeof file.content !== "string") {
        throw new Error(`Kiwa item ${itemName} has an invalid file entry`);
      }
      if (!file.path.startsWith("components/ui/")) {
        throw new Error(`Refusing unexpected Kiwa target path ${file.path}`);
      }
      writeMirrored(file.path, file.content);
      files.push(record(file.path, source, file.content));
    }
  }

  const utilsSource = `${githubRaw}/registry/lib/utils.ts`;
  const utils = await fetchText(utilsSource);
  writeMirrored("lib/utils.ts", utils);
  files.push(record("lib/utils.ts", utilsSource, utils));

  const licenseSource = `${githubRaw}/LICENSE`;
  const license = await fetchText(licenseSource);
  writeOne("kiwa/LICENSE", license);
  files.push(record("kiwa/LICENSE", licenseSource, license, ["kiwa"]));

  const manifest = {
    version: 1,
    source: {
      registry: registryBase,
      repo: "https://github.com/kiwa-ui/kiwa-ui",
      commit: "d00aba1ce6fc0f0c48c0102d803dc15e5f1ce3d5",
    },
    items: uiItems,
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
  };
  writeOne("kiwa/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
  console.log("kiwa: synced selected free source");
}

function checkManifest() {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const failures = [];
  for (const file of manifest.files ?? []) {
    for (const mirror of file.mirrors ?? ["kiwa", "blank"]) {
      const rel = mirror === "kiwa" && file.path.startsWith("kiwa/")
        ? file.path
        : `${mirror}/${file.path}`;
      const path = join(root, rel);
      if (!existsSync(path)) {
        failures.push(`${rel} missing`);
        continue;
      }
      const hash = sha256(readFileSync(path, "utf8"));
      if (hash !== file.sha256) failures.push(`${rel} hash drifted`);
    }
  }
  if (failures.length) {
    for (const failure of failures) console.error(`kiwa: ${failure}`);
    process.exit(1);
  }
  console.log("kiwa: vendored files match manifest");
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

function writeMirrored(path, content) {
  for (const mirrorRoot of mirrorRoots) writeOne(`${mirrorRoot}/${path}`, content);
}

function writeOne(path, content) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content.endsWith("\n") ? content : `${content}\n`);
}

function record(path, source, content, mirrors = mirrorRoots) {
  return {
    path,
    mirrors,
    source,
    sha256: sha256(content.endsWith("\n") ? content : `${content}\n`),
  };
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}
