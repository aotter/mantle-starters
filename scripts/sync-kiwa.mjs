#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const checkOnly = process.argv.includes("--check");
const registryBase = "https://registry.kiwaui.com";
const githubRaw =
  "https://raw.githubusercontent.com/kiwa-ui/kiwa-ui/d00aba1ce6fc0f0c48c0102d803dc15e5f1ce3d5";
const registryItems = [
  "nav-02",
  "hero-02",
  "social-proof-02",
  "content-01",
  "features-02",
  "bento-02",
  "metrics-02",
  "testimonials-02",
  "faq-02",
  "contact-02",
  "cta-02",
  "footer-02",
  "input",
  "label",
  "textarea",
];
const enhanceVersion = "2.1.0";
const enhanceFiles = [
  "accordion.js",
  "collapsible.js",
  "chunk-7CQYLTMT.js",
  "chunk-BZTFZYW6.js",
  "chunk-XSYCANLE.js",
];
const mirrorRoots = ["kiwa", "blank"];
const blankOverridePaths = new Set([
  "components/blocks/marketing/nav-02.tsx",
  "styles/swirl-images.css",
]);
const manifestPath = join(root, "kiwa", "manifest.json");

if (checkOnly) {
  checkManifest();
} else {
  await sync();
}

async function sync() {
  const files = [];
  const syncedItems = [];
  const seenItems = new Set();
  const queue = [...registryItems];

  for (let i = 0; i < queue.length; i += 1) {
    const itemName = queue[i];
    if (seenItems.has(itemName)) continue;
    seenItems.add(itemName);

    const source = `${registryBase}/r/${itemName}.json`;
    const item = await fetchJson(source);
    if (item?.meta?.free !== true) {
      throw new Error(`Kiwa item ${itemName} is not marked free`);
    }
    syncedItems.push(itemName);
    for (const dependency of item.registryDependencies ?? []) {
      if (!seenItems.has(dependency)) queue.push(dependency);
    }
    for (const file of item.files ?? []) {
      if (typeof file.path !== "string" || typeof file.content !== "string") {
        throw new Error(`Kiwa item ${itemName} has an invalid file entry`);
      }
      if (!isAllowedRegistryPath(file.path)) {
        throw new Error(`Refusing unexpected Kiwa target path ${file.path}`);
      }
      const content = normalizeKiwaFile(file.path, file.content);
      writeMirrored(file.path, content);
      files.push(record(file.path, source, content));
    }
  }

  const utilsSource = `${githubRaw}/registry/lib/utils.ts`;
  const utils = await fetchText(utilsSource);
  writeMirrored("lib/utils.ts", utils);
  files.push(record("lib/utils.ts", utilsSource, utils));

  for (const styleFile of ["globals.css", "swirl-images.css"]) {
    const styleSource = `${githubRaw}/templates/styles/${styleFile}`;
    const style = await fetchText(styleSource);
    writeMirrored(`styles/${styleFile}`, style);
    files.push(record(`styles/${styleFile}`, styleSource, style));
  }

  const licenseSource = `${githubRaw}/LICENSE`;
  const license = await fetchText(licenseSource);
  writeOne("kiwa/LICENSE", license);
  files.push(record("kiwa/LICENSE", licenseSource, license, ["kiwa"]));

  const enhanceAssets = {};
  for (const enhanceFile of enhanceFiles) {
    const source = `https://unpkg.com/@kiwa-ui/enhance@${enhanceVersion}/dist/${enhanceFile}`;
    const content = await fetchText(source);
    const target = `kiwa/enhance/${enhanceFile}`;
    writeOne(target, content);
    files.push(record(target, source, content, ["kiwa"]));
    enhanceAssets[enhanceFile] = content.endsWith("\n") ? content : `${content}\n`;
  }
  const enhanceModule =
    "export const kiwaEnhanceAssets: Readonly<Record<string, string>> = " +
    JSON.stringify(enhanceAssets, null, 2) +
    ";\n";
  writeOne("blank/src/kiwaEnhanceAssets.ts", enhanceModule);
  files.push(
    record(
      "src/kiwaEnhanceAssets.ts",
      `https://unpkg.com/@kiwa-ui/enhance@${enhanceVersion}/dist/`,
      enhanceModule,
      ["blank"],
    ),
  );

  const manifest = {
    version: 1,
    source: {
      registry: registryBase,
      repo: "https://github.com/kiwa-ui/kiwa-ui",
      commit: "d00aba1ce6fc0f0c48c0102d803dc15e5f1ce3d5",
      enhance: `@kiwa-ui/enhance@${enhanceVersion}`,
    },
    items: syncedItems.sort(),
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
  };
  writeOne("kiwa/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
  console.log("kiwa: synced selected free source");
}

function isAllowedRegistryPath(path) {
  return (
    path.startsWith("components/ui/") ||
    path.startsWith("components/blocks/marketing/") ||
    path.startsWith("lib/")
  );
}

function normalizeKiwaFile(path, content) {
  if (path === "components/blocks/marketing/footer-02.tsx") {
    return content.replace(
      "icon: 'twitter' | 'github' | 'linkedin' | 'instagram' | 'facebook' | 'youtube'",
      "icon: 'twitter' | 'x' | 'github' | 'linkedin' | 'instagram' | 'facebook' | 'youtube'",
    );
  }
  if (path === "components/ui/social-icon.tsx") {
    return content.replace(
      "type SocialIconProps = JSX.IntrinsicElements['svg']",
      "type SocialIconProps = { class?: string; [key: string]: unknown }",
    );
  }
  return content;
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
  for (const mirrorRoot of mirrorRoots) {
    if (mirrorRoot === "blank" && blankOverridePaths.has(path)) continue;
    writeOne(`${mirrorRoot}/${path}`, content);
  }
}

function writeOne(path, content) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content.endsWith("\n") ? content : `${content}\n`);
}

function record(path, source, content, mirrors = mirrorRoots) {
  const effectiveMirrors = mirrors.includes("blank") && blankOverridePaths.has(path)
    ? mirrors.filter((mirror) => mirror !== "blank")
    : mirrors;
  return {
    path,
    mirrors: effectiveMirrors,
    source,
    sha256: sha256(content.endsWith("\n") ? content : `${content}\n`),
  };
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}
