#!/usr/bin/env node
// Deterministic rules for the showcase free text, written by an agent or by write-text.mjs.
// It complements the leak CI: here we check what the agent may change and whether the new text
// comes from the facts. Exits with 1 and lists the reasons when a rule fails.
//
//   node tools/review-text.mjs --base <sha> --head <sha> [--output reasons.md]

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : null;
};
const base = arg("--base");
const head = arg("--head") ?? "HEAD";
const output = arg("--output");
if (!base) {
  console.error("Usage: review-text.mjs --base <sha> --head <sha> [--output file]");
  process.exit(2);
}

// NOSONAR(S4036): git comes from the PATH of the GitHub runner or the maintainer's machine; an absolute path would break between Linux and Windows.
const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }); // NOSONAR
const show = (path) => {
  try {
    return git("show", `${head}:${path}`);
  } catch {
    return null;
  }
};
const reasons = [];

// R1: only output paths of the default task.
const allowedPath = /^(README\.md|docs\/adr\/[^/]+\.md|docs\/[^/]+\.md|finops\/.+)$/;
const changes = git("diff", "--name-status", "--no-renames", base, head)
  .split("\n").filter(Boolean).map((l) => l.split("\t"));
for (const [status, path] of changes) {
  if (!allowedPath.test(path)) reasons.push(`R1 path outside the task: \`${path}\` (only README.md, docs/adr/, docs/*.md and finops/).`);
  // R2: an ADR is never deleted; a withdrawn decision becomes "Status: superseded".
  if (status === "D" && path.startsWith("docs/adr/")) reasons.push(`R2 ADR deleted: \`${path}\`. Mark "Status: superseded" instead of deleting.`);
}

// R3: each ADR matches a decision in the facts and has the required sections.
const decisions = new Set(git("ls-tree", "--name-only", `${head}:facts/decisions`).split("\n").filter(Boolean));
for (const [status, path] of changes) {
  // docs/adr/README.md is the generated index, not a decision.
  if (status === "D" || !/^docs\/adr\/[^/]+\.md$/.test(path) || path === "docs/adr/README.md") continue;
  const name = path.slice("docs/adr/".length);
  if (!decisions.has(name)) reasons.push(`R3 \`${path}\` does not match any file in facts/decisions/.`);
  const text = show(path) ?? "";
  if (!/^# \d{4} · .+/m.test(text)) reasons.push(`R3 \`${path}\`: the title must be "# NNNN · Title".`);
  for (const section of ["Status", "Context", "Decision"])
    if (!new RegExp(String.raw`^- \*\*${section}:\*\*`, "m").test(text)) reasons.push(`R3 \`${path}\`: missing section "- **${section}:**".`);
}

// R4: all markers of the generated blocks are still in the README.
const blocks = ["updated", "glance", "diagram", "components", "clouds", "protections", "measurements", "quality", "process", "roadmap"];
const readme = show("README.md") ?? "";
for (const b of blocks)
  if (!readme.includes(`<!-- generated:${b}:start -->`) || !readme.includes(`<!-- generated:${b}:end -->`))
    reasons.push(`R4 README is missing the markers of block \`${b}\`.`);

// Lines added outside the generated blocks, with the line number in the new file.
const insideBlock = (() => {
  const lines = readme.split(/\r?\n/);
  const inside = new Set();
  let open = false;
  lines.forEach((l, i) => {
    if (/<!-- generated:\w+:start -->/.test(l)) open = true;
    if (open) inside.add(i + 1);
    if (/<!-- generated:\w+:end -->/.test(l)) open = false;
  });
  return inside;
})();
const added = [];
let file = null;
let n = 0;
for (const l of git("diff", "--unified=0", "--no-color", base, head, "--", "README.md", "docs", "finops").split("\n")) {
  if (l.startsWith("+++ ")) { file = l.replace(/^\+\+\+ (b\/)?/, ""); continue; }
  const h = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(l);
  if (h) { n = Number(h[1]); continue; }
  if (l.startsWith("+")) {
    if (!(file === "README.md" && insideBlock.has(n))) added.push({ file, n, text: l.slice(1) });
    n++;
  }
}

// R5: every number in the new text exists in the facts or in finops/ (no invented numbers).
const corpus = [
  ...git("ls-tree", "-r", "--name-only", head, "facts", "finops").split("\n").filter(Boolean),
].map((c) => show(c) ?? "").join("\n");
// en-US notation: "7,800" is a thousands separator, "12.8" and "4.08" are decimals.
const numberPattern = /\d+(?:,\d{3})*(?:\.\d+)?/g;
const normalizeNumber = (t) => String(Number(t.replaceAll(",", "")));
const known = new Set((corpus.match(numberPattern) ?? []).map(normalizeNumber));
for (const a of added) {
  const cleaned = a.text
    .replaceAll(/https?:\/\/\S+/g, "")
    .replaceAll(/\]\([^)]*\)/g, "]")
    .replaceAll(/#\d+/g, "")
    .replaceAll(/\b\d{4}-\d{2}-\d{2}\b/g, "")
    .replace(/^#+ \d{4} · /, "")
    .replaceAll(/\bADR \d{4}\b/g, "");
  for (const t of cleaned.match(numberPattern) ?? []) {
    if (/^\d+$/.test(t) && Number(t) <= 10) continue; // enumerations and small counts
    if (!known.has(normalizeNumber(t))) reasons.push(`R5 ${a.file}:${a.n}: the number "${t}" is not in the facts or in finops/.`);
  }
}

// R6: no capacity claim without a measurement in the facts.
const capacity = /\bRPS\b|requests per second|\bSLA of\b|\buptime guarantee\b|99(?:\.9+)?\s*%\s*(?:availability|uptime)|concurrent users|millions of users/i;
for (const a of added)
  if (capacity.test(a.text)) reasons.push(`R6 ${a.file}:${a.n}: capacity claim without a measurement in the facts.`);

const reasonList = reasons.map((m) => "- " + m).join("\n");
const report = reasons.length
  ? `### Deterministic rules: rejected\n\n${reasonList}\n`
  : "### Deterministic rules: approved\n\nNo rule violated.\n";
if (output) writeFileSync(output, report);
console.log(report);
process.exit(reasons.length ? 1 : 0);
