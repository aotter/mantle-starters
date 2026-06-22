#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const expected = [
  ["mantle-develop", "mantle:develop"],
  ["mantle-overlay", "mantle:overlay"],
  ["mantle-theme", "mantle:theme"],
  ["mantle-update", "mantle:update"],
];
const failures = [];

for (const [dir, name] of expected) {
  assertSkill(join(root, "blank", ".agent", "skills", dir, "SKILL.md.template"), name);
  assertSkill(join(root, "blank", ".claude", "skills", dir, "SKILL.md.template"), name);
}

for (const base of [".agent", ".claude"]) {
  const skillsDir = join(root, "blank", base, "skills");
  const dirs = readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const expectedDirs = expected.map(([dir]) => dir).sort();
  if (dirs.join("\n") !== expectedDirs.join("\n")) {
    failures.push(`${base}/skills has ${dirs.join(", ")}; expected ${expectedDirs.join(", ")}`);
  }
}

const agents = readFileSync(join(root, "blank", "AGENTS.md.template"), "utf8");
const claude = readFileSync(join(root, "blank", "CLAUDE.md.template"), "utf8");
for (const [dir] of expected) {
  if (!agents.includes(`.agent/skills/${dir}/SKILL.md`)) {
    failures.push(`AGENTS.md.template does not mention .agent/skills/${dir}/SKILL.md`);
  }
  if (!claude.includes(`.claude/skills/${dir}/SKILL.md`)) {
    failures.push(`CLAUDE.md.template does not mention .claude/skills/${dir}/SKILL.md`);
  }
}

if (failures.length) {
  for (const failure of failures) console.error(`repo-local skills: ${failure}`);
  process.exit(1);
}
console.log("repo-local skills: ok");

function assertSkill(path, expectedName) {
  if (!existsSync(path)) {
    failures.push(`${path} is missing`);
    return;
  }
  const text = readFileSync(path, "utf8");
  const match = text.match(/^name:\s*(.+)$/m);
  if (!match) {
    failures.push(`${path} has no frontmatter name`);
    return;
  }
  const actual = match[1].trim().replace(/^["']|["']$/g, "");
  if (actual !== expectedName) {
    failures.push(`${path} name is ${actual}; expected ${expectedName}`);
  }
  if (!actual.startsWith("mantle:")) {
    failures.push(`${path} name must start with mantle:`);
  }
}
