#!/usr/bin/env node
/**
 * Mantle workflow helpers — runs from the consumer project root.
 *
 * Verbs:
 *   prompt
 *     Output the filled Mantle subagent prompt to stdout. Reads
 *     mantle/site.md (frontmatter + ## site / ## voice / ## history),
 *     fetches the archetype hint from clam-cms-starters, substitutes
 *     {{MANTLE_*}} placeholders in mantle-subagent-prompt.md, writes
 *     to stdout. The install agent pipes this into the Agent tool to
 *     dispatch the Mantle subagent that writes the 5-card welcome
 *     letter.
 *
 * Phase 2 will add:
 *   scribe --by <skill-name> --summary <one-line>
 *     Append a revision entry to mantle/site.md `revisions:`.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const STARTERS_REPO = "AotterClam/clam-cms-starters";
const STARTERS_REF = "main";

function fail(msg) {
  process.stderr.write(`mantle: ${msg}\n`);
  process.exit(1);
}

function readSiteMd() {
  const path = resolve("mantle/site.md");
  if (!existsSync(path)) {
    fail(
      `mantle/site.md not found at ${path}. Are you in the project root? ` +
        `Or has the scaffold been corrupted?`,
    );
  }
  return readFileSync(path, "utf8");
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) fail("mantle/site.md has no frontmatter");
  return { yaml: match[1], body: match[2] };
}

/**
 * Minimal scalar / list extraction. Avoids pulling in a yaml lib for
 * this small helper. Supports:
 *   key: scalar
 *   key: "scalar"
 *   key: ["a", "b"]
 *   key: [a, b]
 * Returns the raw RHS text (no list-flattening); callers can re-parse.
 */
function readScalar(yaml, key) {
  const re = new RegExp(`^${key}:\\s*(.*)$`, "m");
  const m = yaml.match(re);
  if (!m) return null;
  return m[1].trim().replace(/^"(.*)"$/, "$1");
}

function extractSection(body, heading) {
  // Returns content under `## <heading>` up to the next `## ` heading
  // (or end of file).
  const re = new RegExp(
    `(?:^|\\n)## ${heading}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`,
  );
  const m = body.match(re);
  return m ? m[1] : null;
}

function checkSectionWritten(section, name) {
  if (section == null) {
    fail(`mantle/site.md is missing the ## ${name} section`);
  }
  // Strip template chrome — the `> purpose:` callout line and any HTML
  // comments — then check the remaining body for prose.
  const stripped = section
    .replace(/^>\s+purpose:.*$/gm, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  if (!stripped) {
    fail(
      `mantle/site.md ## ${name} is still empty (only template placeholders ` +
        `remain). Fill it from the interview before running mantle:prompt — ` +
        `the Mantle subagent reads ## site / ## voice / ## history as its ` +
        `interview transcript.`,
    );
  }
  return section;
}

async function fetchArchetypeHint(archetype) {
  const url =
    `https://raw.githubusercontent.com/${STARTERS_REPO}/${STARTERS_REF}` +
    `/${archetype}/SKILL.md`;
  const res = await fetch(url);
  if (!res.ok) {
    fail(
      `failed to fetch archetype hint at ${url} (HTTP ${res.status}). ` +
        `Check network, or that the archetype frontmatter value matches a ` +
        `known starter directory.`,
    );
  }
  return await res.text();
}

async function runPrompt() {
  const site = readSiteMd();
  const { yaml, body } = parseFrontmatter(site);

  const archetype = readScalar(yaml, "archetype") || fail("frontmatter missing archetype");
  const brand = readScalar(yaml, "brand") || fail("frontmatter missing brand");
  const locales = readScalar(yaml, "locales") || fail("frontmatter missing locales");
  const githubOwner =
    readScalar(yaml, "github_owner") || fail("frontmatter missing github_owner");

  const siteSection = checkSectionWritten(extractSection(body, "site"), "site");
  const voiceSection = checkSectionWritten(extractSection(body, "voice"), "voice");
  const historySection = checkSectionWritten(
    extractSection(body, "history"),
    "history",
  );

  const archetypeHint = await fetchArchetypeHint(archetype);

  const templatePath = resolve("mantle-subagent-prompt.md");
  if (!existsSync(templatePath)) {
    fail(
      `mantle-subagent-prompt.md not found at ${templatePath}. The ` +
        `scaffold should have placed it at the project root.`,
    );
  }
  const template = readFileSync(templatePath, "utf8");

  const filled = template
    .replace(/\{\{MANTLE_BRAND\}\}/g, brand)
    .replace(/\{\{MANTLE_LOCALES\}\}/g, locales)
    .replace(/\{\{MANTLE_GITHUB_IDENTITY\}\}/g, githubOwner)
    .replace(/\{\{MANTLE_PURPOSE_NOTES\}\}/g, siteSection.trim())
    .replace(/\{\{MANTLE_VOICE_NOTES\}\}/g, voiceSection.trim())
    .replace(/\{\{MANTLE_HISTORY_NOTES\}\}/g, historySection.trim())
    .replace(/\{\{MANTLE_ARCHETYPE_HINT\}\}/g, archetypeHint.trim())
    .replace(/\{\{MANTLE_SCAFFOLD_PATH\}\}/g, resolve("."));

  process.stdout.write(filled);
}

async function main() {
  const verb = process.argv[2];
  switch (verb) {
    case "prompt":
      await runPrompt();
      return;
    default:
      process.stderr.write(
        `usage: node scripts/mantle.mjs prompt\n` +
          `       (Phase 2 will add: scribe --by <skill> --summary "<one line>")\n`,
      );
      process.exit(2);
  }
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
