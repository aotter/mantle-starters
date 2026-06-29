#!/usr/bin/env node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const archetypes = ["blank", "presence", "publication", "transaction", "reservation", "community"];
const replacements = {
  PROJECT_NAME: "bundle-smoke",
  ARCHETYPE: "publication",
  BRAND: "Bundle Smoke",
  DESCRIPTION: "Bundle smoke test.",
  INSTALL_SUMMARY: "Smoke generated from provision bundle.",
  LOCALES: "[\"en\"]",
  CANONICAL_LOCALE: "en",
  STARTER_REF: "smoke",
  GITHUB_OWNER: "aotter",
  ADMIN_GITHUB_LOGIN: "aotter",
  SITE_URL: "https://bundle-smoke.example",
  AFTER_LAUNCH_SKILL_URL: "https://mantle.tools/skill/after-launch?id=smoke",
  INSTALL_TIMESTAMP: "2026-01-01T00:00:00.000Z",
};

for (const archetype of archetypes) {
  const tempRoot = mkdtempSync(join(tmpdir(), `mantle-bundle-${archetype}-`));
  try {
    const bundle = JSON.parse(readFileSync(join(root, "provision-bundles", `${archetype}.json`), "utf8"));
    for (const [path, raw] of Object.entries(bundle.files ?? {})) {
      const target = join(tempRoot, path.replace(/\.template$/, ""));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, substitute(raw, archetype), "utf8");
    }
    assertNoLeftovers(tempRoot, bundle.files);
    assertPublicHomeIsNotHandoff(tempRoot);
    assertMantleSiteSignature(tempRoot, archetype);
    assertStylesheetMounted(tempRoot, archetype);
    const launchState = JSON.parse(readFileSync(join(tempRoot, ".mantle", "launch-state.json"), "utf8"));
    if (launchState.site_url !== replacements.SITE_URL) throw new Error(`${archetype} missing launch-state site_url`);
    if (launchState.purpose !== replacements.DESCRIPTION) throw new Error(`${archetype} missing launch-state purpose`);
    if (launchState.after_launch_skill_url !== replacements.AFTER_LAUNCH_SKILL_URL) throw new Error(`${archetype} missing after-launch skill URL`);

    const features = JSON.parse(readFileSync(join(tempRoot, ".mantle", "features.json"), "utf8"));
    if (features?.archetype?.name !== archetype) throw new Error(`${archetype} features archetype mismatch`);
    if (archetype !== "blank") {
      if (!features?.archetype?.appliedAt) throw new Error(`${archetype} overlay not marked applied`);
      assertFourAtoms(tempRoot, archetype);
      assertOverlayManifestLoaded(tempRoot, archetype);
      assertNoBlankExampleManifest(tempRoot, archetype);
      readFileSync(join(tempRoot, ".mantle", "overlays", archetype, "seed.json"), "utf8");
      if (archetype === "presence") {
        assertPresenceHandlerLoaded(tempRoot);
        assertPresenceContactForm(tempRoot);
      }
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
console.log("provision bundle smoke passed");

function substitute(text, archetype) {
  return String(text).replace(/\{\{([A-Z_][A-Z0-9_]*)\}\}/g, (match, key) => {
    if (key === "ARCHETYPE") return archetype;
    if (key in replacements) return replacements[key];
    throw new Error(`unknown placeholder ${match}`);
  });
}

function assertNoLeftovers(root, files) {
  const leftovers = [];
  for (const path of Object.keys(files ?? {})) {
    const target = join(root, path.replace(/\.template$/, ""));
    const text = readFileSync(target, "utf8");
    if (/\{\{[A-Z_][A-Z0-9_]*\}\}/.test(text)) leftovers.push(path);
  }
  if (leftovers.length) throw new Error(`unfilled placeholders: ${leftovers.join(", ")}`);
}

function assertPublicHomeIsNotHandoff(root) {
  const text = readSource(root);
  for (const forbidden of ["ready for your coding agent", "Copy this prompt", "Open this live site URL", "<textarea"]) {
    if (text.includes(forbidden)) throw new Error(`public homepage still contains handoff text: ${forbidden}`);
  }
}

function assertMantleSiteSignature(root, archetype) {
  const text = readSource(root);
  if (!text.includes('<meta name="mantle:site" content="v1" />')) {
    throw new Error(`${archetype} missing Mantle site signature meta`);
  }
}

function assertStylesheetMounted(root, archetype) {
  const source = readSource(root);
  const css = readFileSync(join(root, "styles", "generated.css"), "utf8");
  if (!source.includes("/assets/styles.css")) {
    throw new Error(`${archetype} homepage does not link generated stylesheet`);
  }
  if (!source.includes("stylesCss")) {
    throw new Error(`${archetype} worker does not mount generated stylesheet`);
  }
  if (!source.includes("/assets/mantle-ocean-hero.svg")) {
    throw new Error(`${archetype} homepage does not mount Mantle ocean hero asset`);
  }
  if (!source.includes("/assets/mantle-ocean-hero-dark.svg")) {
    throw new Error(`${archetype} homepage does not support dark Mantle ocean hero switching`);
  }
  if (!css.includes("tailwindcss") || !css.includes(".bg-primary")) {
    throw new Error(`${archetype} generated stylesheet does not include Kiwa/Tailwind utilities`);
  }
}

function assertOverlayManifestLoaded(root, archetype) {
  const text = readFileSync(join(root, "src", "loadManifests.ts"), "utf8");
  if (!text.includes(`../manifests/${archetype}.yaml`)) {
    throw new Error(`${archetype} manifest is present but not loaded`);
  }
}

function assertFourAtoms(root, archetype) {
  const text = readFileSync(join(root, "manifests", `${archetype}.yaml`), "utf8");
  for (const atom of ["Schema", "View", "Procedure", "Trigger"]) {
    if (!new RegExp(`kind:\\s*${atom}\\b`).test(text)) {
      throw new Error(`${archetype} manifest missing ${atom}`);
    }
  }
}

function assertPresenceHandlerLoaded(root) {
  const text = readFileSync(join(root, "src", "handlers", "index.ts"), "utf8");
  if (!text.includes('"notify-contact": notifyContact')) {
    throw new Error("presence overlay did not install notify-contact handler");
  }
  if (!text.includes('"verify-contact-turnstile": verifyContactTurnstile')) {
    throw new Error("presence overlay did not install verify-contact-turnstile handler");
  }
}

function assertPresenceContactForm(root) {
  const text = readSource(root);
  if (!text.includes("data-contact-form")) {
    throw new Error("presence homepage does not mark the contact form for JSON submit");
  }
  if (!text.includes("content-type': 'application/json'")) {
    throw new Error("presence contact form submit does not send JSON");
  }
  if (!text.includes("cf-turnstile")) {
    throw new Error("presence contact form is missing Turnstile support");
  }
}

function assertNoBlankExampleManifest(root, archetype) {
  try {
    readFileSync(join(root, "manifests", "example.yaml"), "utf8");
  } catch {
    return;
  }
  throw new Error(`${archetype} bundle still includes blank example manifest`);
}

function readSource(root) {
  return ["src/index.ts", "src/home.tsx"]
    .map((path) => {
      try {
        return readFileSync(join(root, path), "utf8");
      } catch {
        return "";
      }
    })
    .join("\n");
}
