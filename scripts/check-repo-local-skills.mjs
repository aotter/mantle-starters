#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const coreRoot = resolve(root, "../mantle");
const expected = [
  ["mantle-develop", "develop", "skills/develop/SKILL.md"],
  ["mantle-plugin", "plugin", "skills/plugin/SKILL.md"],
  ["mantle-theme", "theme", "skills/theme/SKILL.md"],
  ["mantle-update", "update", "skills/update/SKILL.md"],
];
const failures = [];

for (const [dir, name, sourcePath] of expected) {
  const agentPath = join(root, "blank", ".agent", "skills", dir, "SKILL.md.template");
  const claudePath = join(root, "blank", ".claude", "skills", dir, "SKILL.md.template");
  assertSkill(agentPath, name, sourcePath);
  assertSkill(claudePath, name, sourcePath);
  assertSame(agentPath, claudePath);
  const corePath = join(coreRoot, sourcePath);
  if (existsSync(corePath)) assertSame(agentPath, corePath);
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

function assertSkill(path, expectedName, expectedSourcePath) {
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
  const source = text.match(/^\s*source:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
  if (source !== "@aotter/mantle") {
    failures.push(`${path} source is ${source ?? "(missing)"}; expected @aotter/mantle`);
  }
  const sourcePath = text.match(/^\s*sourcePath:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
  if (sourcePath !== expectedSourcePath) {
    failures.push(`${path} sourcePath is ${sourcePath ?? "(missing)"}; expected ${expectedSourcePath}`);
  }
}

function assertSame(left, right) {
  if (!existsSync(left) || !existsSync(right)) return;
  const a = readFileSync(left, "utf8");
  const b = readFileSync(right, "utf8");
  if (a !== b) failures.push(`${left} differs from ${right}`);
}
