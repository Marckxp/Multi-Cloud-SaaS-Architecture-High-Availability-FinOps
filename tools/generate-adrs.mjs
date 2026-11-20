#!/usr/bin/env node
// Generates docs/adr/ from facts/decisions/, with no AI and no network: each decision becomes the ADR of the same name.
// docs/adr/ is a generated folder and is never edited by hand; CI runs --check.
//
//   node tools/generate-adrs.mjs                         rewrites docs/adr/
//   node tools/generate-adrs.mjs --check                 fails if docs/adr/ is out of date (CI)
//   --sources <folder> --dest <folder>                   other folders (tests); the default is the repository
//
// Exit codes: 0 up to date, 1 invalid decision, ADR out of date or left over.
// An ADR with no matching decision is never deleted by the script (rule R2): it is reported.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const sourcesDir = option("--sources", join(root, "facts", "decisions"));
const destDir = option("--dest", join(root, "docs", "adr"));
const check = args.includes("--check");

// Only NNNN-subject.md files are decisions; the index (README.md) lives next to them and is generated too.
const list = (folder) => (existsSync(folder) ? readdirSync(folder).filter((n) => /^\d{4}-.*\.md$/.test(n)).sort() : []);
const lf = (text) => text.replaceAll("\r\n", "\n");
const problems = [];

// A decision must have the format the reviewer requires of an ADR (R3), so the error shows up at the source.
function validate(name, text) {
  if (!/^\d{4}-.+\.md$/.test(name)) problems.push(`${name}: the name must be NNNN-subject.md.`);
  if (!/^# \d{4} · .+/m.test(text)) problems.push(`${name}: the title must be "# NNNN · Title".`);
  for (const section of ["Status", "Context", "Decision"])
    if (!new RegExp(String.raw`^- \*\*${section}:\*\*`, "m").test(text)) problems.push(`${name}: missing section "- **${section}:**".`);
}

const decisions = new Map();
for (const name of list(sourcesDir)) {
  const text = lf(readFileSync(join(sourcesDir, name), "utf8"));
  validate(name, text);
  decisions.set(name, text);
}

// The index is a table of the decisions: number, title, status. It makes the folder readable without opening each file.
function index() {
  const rows = [...decisions].map(([name, text]) => {
    const title = /^# \d{4} · (.+)$/m.exec(text)?.[1] ?? name;
    const status = /^- \*\*Status:\*\* (.+)$/m.exec(text)?.[1] ?? "";
    return `| [${name.slice(0, 4)}](${name}) | ${title} | ${status} |`;
  });
  return [
    "# Architecture decision records", "",
    "Generated from `facts/decisions/`; never edited by hand. Each record has the context, the decision, the alternatives considered where the source has them, the evidence and the consequences.", "",
    "| ADR | Decision | Status |", "|---|---|---|", ...rows, "",
  ].join("\n");
}
const count = decisions.size;
decisions.set("README.md", index());

const current = new Set([...list(destDir), ...(existsSync(join(destDir, "README.md")) ? ["README.md"] : [])]);
const leftover = [...current].filter((n) => !decisions.has(n));
const outdated = [];
for (const [name, text] of decisions) {
  const path = join(destDir, name);
  if (!current.has(name) || readFileSync(path, "utf8") !== text) outdated.push(name);
}

for (const name of leftover) problems.push(`${name}: ADR without a decision in facts/decisions/ (the script does not delete; mark "Status: superseded" at the source).`);

if (check) {
  for (const name of outdated) problems.push(`${name}: out of date with facts/decisions/.`);
  if (problems.length) {
    console.error("docs/adr/ is out of date or invalid: run node tools/generate-adrs.mjs");
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`docs/adr/ is up to date with facts/decisions/ (${count} ADRs).`);
} else {
  if (problems.length === 0 || problems.every((p) => leftover.some((n) => p.startsWith(`${n}:`)))) {
    mkdirSync(destDir, { recursive: true });
    for (const name of outdated) writeFileSync(join(destDir, name), decisions.get(name));
    console.log(outdated.length ? `docs/adr/ updated (${outdated.length} of ${decisions.size} files).` : "docs/adr/ was already up to date.");
  }
  if (problems.length) {
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
}
