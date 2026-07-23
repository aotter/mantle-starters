#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const archetypes = ["blank", "presence", "intake", "publication", "transaction", "reservation", "community"];
const replacements = {
  PROJECT_NAME: "bundle-smoke",
  ARCHETYPE: "publication",
  AUTH_MODE: "hosted",
  BRAND: "Bundle Smoke",
  DESCRIPTION: "Bundle smoke test.",
  INSTALL_SUMMARY: "Smoke generated from provision bundle.",
  LOCALES: "[\"en\"]",
  CANONICAL_LOCALE: "en",
  STARTER_REF: "smoke",
  GITHUB_OWNER: "aotter",
  ADMIN_GITHUB_LOGIN: "aotter",
  SITE_OWNER_EMAIL: "owner@example.com",
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
    assertAuthSwitchUsesSelectedProvider(tempRoot, archetype);
    assertRuntimeHasNoKiwaDemoCopy(tempRoot, archetype);
    const launchState = JSON.parse(readFileSync(join(tempRoot, ".mantle", "launch-state.json"), "utf8"));
    if (launchState.launch_source !== "mantle-landing-v2") throw new Error(`${archetype} changed landing launch source`);
    if (launchState.github?.owner !== replacements.GITHUB_OWNER) throw new Error(`${archetype} missing landing GitHub owner`);
    if (launchState.site_url !== replacements.SITE_URL) throw new Error(`${archetype} missing launch-state site_url`);
    if (launchState.purpose !== replacements.DESCRIPTION) throw new Error(`${archetype} missing launch-state purpose`);
    if (launchState.after_launch_skill_url !== replacements.AFTER_LAUNCH_SKILL_URL) throw new Error(`${archetype} missing after-launch skill URL`);
    const handoff = readFileSync(join(tempRoot, ".mantle", "handoff.md"), "utf8");
    if (!handoff.includes(`Auth intent: ${replacements.AUTH_MODE}`)) throw new Error(`${archetype} missing auth intent handoff`);

    const features = JSON.parse(readFileSync(join(tempRoot, ".mantle", "features.json"), "utf8"));
    if (features?.archetype?.name !== archetype) throw new Error(`${archetype} features archetype mismatch`);
    if (archetype !== "blank") {
      if (!features?.archetype?.appliedAt) throw new Error(`${archetype} overlay not marked applied`);
      assertFourAtoms(tempRoot, archetype);
      assertOverlayManifestLoaded(tempRoot, archetype);
      assertNoBlankExampleManifest(tempRoot, archetype);
      readFileSync(join(tempRoot, ".mantle", "overlays", archetype, "seed.json"), "utf8");
      if (archetype === "presence") {
        assertPresenceSeedDrivenHome(tempRoot);
        assertPresenceHandlerLoaded(tempRoot);
        assertPresenceContactForm(tempRoot);
      }
      if (archetype === "intake") {
        assertIntakeSeedDrivenHome(tempRoot);
        assertIntakeHandlerLoaded(tempRoot);
        assertIntakeForm(tempRoot);
      }
      if (archetype === "publication") {
        assertPublicationSeedDrivenHome(tempRoot);
        assertPublicationSeed(tempRoot);
      }
    } else {
      assertBlankHomeDataIsBlank(tempRoot);
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
smokeLocalMaterializer();
console.log("provision bundle smoke passed");

function smokeLocalMaterializer() {
  const tempRoot = mkdtempSync(join(tmpdir(), "mantle-materialize-"));
  const output = join(tempRoot, "northstar");
  try {
    const result = spawnSync(process.execPath, [
      "scripts/dev-provision-bundle.mjs",
      "presence",
      "--out",
      output,
      "--brand",
      "Northstar Studio",
      "--description",
      "A local Mantle presence site.",
      "--locales",
      "en,zh-TW",
    ], { cwd: root, encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(`local materializer failed: ${result.stderr || result.stdout}`);
    }
    const launch = JSON.parse(readFileSync(join(output, ".mantle", "launch-state.json"), "utf8"));
    if (launch.launch_source !== "mantle-local-v2") throw new Error("local launch source missing");
    if (launch.authMode !== "self-managed") throw new Error("local auth mode missing");
    if (launch.brand !== "Northstar Studio") throw new Error("local brand mismatch");
    if (JSON.stringify(launch.locales) !== '["en","zh-TW"]') throw new Error("local locales mismatch");
    const wrangler = readFileSync(join(output, "wrangler.toml"), "utf8");
    if (!wrangler.includes('name = "northstar"')) throw new Error("local Worker name mismatch");
    if (!wrangler.includes('database_name = "northstar-db"')) throw new Error("local D1 name mismatch");
    if (!wrangler.includes('PUBLIC_ORIGIN = "http://localhost:8787"')) throw new Error("local origin missing");
    const overwrite = spawnSync(process.execPath, [
      "scripts/dev-provision-bundle.mjs",
      "blank",
      "--out",
      output,
    ], { cwd: root, encoding: "utf8" });
    if (overwrite.status === 0) throw new Error("local materializer overwrote a non-empty directory");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

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
  if (!source.includes("/mantle-ocean-hero-light.svg")) {
    throw new Error(`${archetype} homepage does not mount Mantle ocean hero asset`);
  }
  if (!source.includes("/mantle-ocean-hero-dark.svg")) {
    throw new Error(`${archetype} homepage does not support dark Mantle ocean hero switching`);
  }
  if (!css.includes("tailwindcss") || !css.includes(".bg-primary")) {
    throw new Error(`${archetype} generated stylesheet does not include Kiwa/Tailwind utilities`);
  }
}

function assertAuthSwitchUsesSelectedProvider(root, archetype) {
  const source = readFileSync(join(root, "src", "worker", "auth.ts"), "utf8");
  if (!/const hostedAuth = platformIssuer && env\.MANTLE_PLATFORM_AUTH_CLIENT_ID\s*\?/.test(source)) {
    throw new Error(`${archetype} auth switch does not name the selected hosted provider mode`);
  }
  if (!source.includes("bootstrapOwner: hostedAuth")) {
    throw new Error(`${archetype} auth bootstrap owner is not tied to the selected auth provider`);
  }
}

function assertRuntimeHasNoKiwaDemoCopy(root, archetype) {
  const files = [
    "src/web/pages/HomePage.tsx",
    "src/web/sections/renderSection.tsx",
    "src/web/content/homeContent.ts",
    "src/web/content/siteContent.ts",
    "components/blocks/marketing/bento-02.tsx",
    "components/blocks/marketing/contact-02.tsx",
    "components/blocks/marketing/content-01.tsx",
    "components/blocks/marketing/cta-02.tsx",
    "components/blocks/marketing/faq-02.tsx",
    "components/blocks/marketing/features-02.tsx",
    "components/blocks/marketing/footer-02.tsx",
    "components/blocks/marketing/hero-02.tsx",
    "components/blocks/marketing/metrics-02.tsx",
    "components/blocks/marketing/nav-02.tsx",
    "components/blocks/marketing/social-proof-02.tsx",
    "components/blocks/marketing/testimonials-02.tsx",
  ];
  const forbidden = [
    "Kiwa UI",
    "Your workflow, supercharged with AI",
    "Start free trial",
    "Book a demo",
    "Trusted by product-led teams everywhere",
    "We started Kiwa UI",
    "hello@kiwaui.com",
    "Frequently asked questions",
    "Get in touch",
    "Your Company",
  ];
  for (const file of files) {
    const text = readFileSync(join(root, file), "utf8");
    for (const needle of forbidden) {
      if (text.includes(needle)) {
        throw new Error(`${archetype} runtime still contains Kiwa demo copy: ${file}: ${needle}`);
      }
    }
  }
}

function assertOverlayManifestLoaded(root, archetype) {
  const text = readFileSync(join(root, "src", "mantle", "manifests.ts"), "utf8");
  if (!text.includes(`../../manifests/${archetype}.yaml`)) {
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
  const text = readFileSync(join(root, "src", "mantle", "handlers", "index.ts"), "utf8");
  if (!text.includes('"notify-contact": notifyContact')) {
    throw new Error("presence overlay did not install notify-contact handler");
  }
  if (!text.includes('"verify-contact-turnstile": verifyContactTurnstile')) {
    throw new Error("presence overlay did not install verify-contact-turnstile handler");
  }
}

function assertPresenceContactForm(root) {
  const text = readSource(root);
  const seed = readFileSync(join(root, ".mantle", "overlays", "presence", "seed.json"), "utf8");
  if (!text.includes("data-mantle-form")) {
    throw new Error("presence homepage does not mark forms for JSON submit");
  }
  if (!text.includes("content-type': 'application/json'")) {
    throw new Error("presence contact form submit does not send JSON");
  }
  if (!text.includes("cf-turnstile")) {
    throw new Error("presence contact form is missing Turnstile support");
  }
  if (!seed.includes('"type": "form"') || !seed.includes('"/api/contact"')) {
    throw new Error("presence seed does not define the contact form section");
  }
}

function assertPresenceSeedDrivenHome(root) {
  const homeContent = readFileSync(join(root, "src", "web", "content", "homeContent.ts"), "utf8");
  const siteContent = readFileSync(join(root, "src", "web", "content", "siteContent.ts"), "utf8");
  const seedImport = '../../../.mantle/overlays/presence/seed.json';
  if (!homeContent.includes(seedImport) || !siteContent.includes(seedImport)) {
    throw new Error("presence homepage content is not driven by the overlay seed");
  }
}

function assertIntakeHandlerLoaded(root) {
  const text = readFileSync(join(root, "src", "mantle", "handlers", "index.ts"), "utf8");
  if (!text.includes('"notify-intake": notifyIntake')) {
    throw new Error("intake overlay did not install notify-intake handler");
  }
  if (!text.includes('"verify-intake-turnstile": verifyIntakeTurnstile')) {
    throw new Error("intake overlay did not install verify-intake-turnstile handler");
  }
}

function assertIntakeForm(root) {
  const text = readSource(root);
  const seed = readFileSync(join(root, ".mantle", "overlays", "intake", "seed.json"), "utf8");
  if (!text.includes("data-intake-form")) {
    throw new Error("intake homepage does not render the intake form surface");
  }
  if (!text.includes("mantle:form-success")) {
    throw new Error("intake homepage does not render a saved-response result state");
  }
  if (!seed.includes('"type": "intake"') || !seed.includes('"/api/intake"')) {
    throw new Error("intake seed does not define the intake section");
  }
}

function assertIntakeSeedDrivenHome(root) {
  const homeContent = readFileSync(join(root, "src", "web", "content", "homeContent.ts"), "utf8");
  const siteContent = readFileSync(join(root, "src", "web", "content", "siteContent.ts"), "utf8");
  const seedImport = '../../../.mantle/overlays/intake/seed.json';
  if (!homeContent.includes(seedImport) || !siteContent.includes(seedImport)) {
    throw new Error("intake homepage content is not driven by the overlay seed");
  }
}

function assertPublicationSeed(root) {
  const seed = readFileSync(join(root, ".mantle", "overlays", "publication", "seed.json"), "utf8");
  if (!seed.includes('"site"') || !seed.includes('"type": "home"')) {
    throw new Error("publication seed does not drive site/page content");
  }
  if (!seed.includes('"posts"') || !seed.includes('"slug": "welcome"')) {
    throw new Error("publication seed does not include starter posts");
  }
}

function assertPublicationSeedDrivenHome(root) {
  const homeContent = readFileSync(join(root, "src", "web", "content", "homeContent.ts"), "utf8");
  const siteContent = readFileSync(join(root, "src", "web", "content", "siteContent.ts"), "utf8");
  const seedImport = '../../../.mantle/overlays/publication/seed.json';
  if (!homeContent.includes(seedImport) || !siteContent.includes(seedImport)) {
    throw new Error("publication homepage content is not driven by the overlay seed");
  }
}

function assertBlankHomeDataIsBlank(root) {
  const homeContent = readFileSync(join(root, "src", "web", "content", "homeContent.ts"), "utf8");
  const siteContent = readFileSync(join(root, "src", "web", "content", "siteContent.ts"), "utf8");
  if (!homeContent.includes("sections: []")) {
    throw new Error("blank homepage should not seed visible sections");
  }
  for (const forbidden of ["contactForm", "Placeholder proof", "Start a conversation", "navAction"]) {
    if (homeContent.includes(forbidden) || siteContent.includes(forbidden)) {
      throw new Error(`blank homepage still seeds visible copy: ${forbidden}`);
    }
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
  return [
    "src/index.ts",
    "src/renderer.tsx",
    "src/worker/app.ts",
    "src/worker/routes/assets.ts",
    "src/worker/routes/home.tsx",
    "src/web/client/homeClient.ts",
    "src/web/pages/HomePage.tsx",
    "src/web/sections/renderSection.tsx",
  ]
    .map((path) => {
      try {
        return readFileSync(join(root, path), "utf8");
      } catch {
        return "";
      }
    })
    .join("\n");
}
