#!/usr/bin/env node
// Blocks identifiers and terms of the source project before they reach a public branch.
//
// Usage:
//   node tools/check-leaks.mjs                  repository files (tracked and new, not ignored)
//   node tools/check-leaks.mjs --range A..B     added lines and commit messages of A..B
//   --require-list   fails if the denylist is not available (CI)
//
// Denylist terms (never versioned): the VITRINE_PROIBIDOS variable (one per line), or the file in
// VITRINE_PROIBIDOS_ARQUIVO, or ~/.vitrine/proibidos.txt. These names are kept as they are because
// the repository secret and the maintainer's local permission rules use them. The output never
// shows the term or the whole line, because the CI logs of a public repository are public.
// Matching is case-insensitive and ignores accents. It does not translate: the list must contain
// every form (language, plural, transliteration) that should be blocked.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const requireList = args.includes("--require-list");
const rangeIndex = args.indexOf("--range");
const range = rangeIndex >= 0 ? args[rangeIndex + 1] : null;

const config = JSON.parse(readFileSync(join(root, "tools", "generic-patterns.json"), "utf8"));
const patterns = config.patterns.map((p) => ({ ...p, re: new RegExp(p.regex, `g${p.flags ?? ""}`) }));
const allowed = config.allowed.map((p) => ({ pattern: p.pattern, re: new RegExp(p.regex, p.flags ?? "") }));
const ignore = new Set(config.ignore);

const normalize = (s) => s.normalize("NFD").replaceAll(/\p{Diacritic}/gu, "").toLowerCase();

function loadDenylist() {
  let text = process.env.VITRINE_PROIBIDOS;
  if (!text) {
    const file = process.env.VITRINE_PROIBIDOS_ARQUIVO || join(homedir(), ".vitrine", "proibidos.txt");
    if (existsSync(file)) text = readFileSync(file, "utf8");
  }
  if (!text) return null;
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map(normalize);
}

const denylist = loadDenylist();
if (!denylist) {
  const msg = "Denylist unavailable (VITRINE_PROIBIDOS or ~/.vitrine/proibidos.txt).";
  if (requireList) {
    console.error(`ERROR: ${msg}`);
    process.exit(2);
  }
  console.warn(`WARNING: ${msg} Only the generic patterns were checked.`);
}

// NOSONAR(S4036): git comes from the PATH of the CI runner or the maintainer's machine; an absolute path would break between Linux and Windows.
const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }); // NOSONAR
const mask = (v) => (v.length <= 4 ? "****" : `${v.slice(0, 3)}…(${v.length})`);
const findings = [];

function checkLine(origin, number, line) {
  for (const p of patterns) {
    p.re.lastIndex = 0;
    for (const m of line.matchAll(p.re)) {
      const value = m[0];
      if (allowed.some((x) => x.pattern === p.id && x.re.test(value))) continue;
      findings.push(`${origin}:${number}  ${p.id} (${p.description}): ${mask(value)}`);
    }
  }
  if (denylist) {
    const n = normalize(line);
    denylist.forEach((term, i) => {
      if (n.includes(term)) findings.push(`${origin}:${number}  denylist term #${i + 1}`);
    });
  }
}

function checkText(origin, text) {
  if (text.includes("\0")) return;
  text.split(/\r?\n/).forEach((line, i) => checkLine(origin, i + 1, line));
}

if (range) {
  const commits = git("rev-list", "--reverse", range).split("\n").filter(Boolean);
  for (const c of commits) {
    const short = c.slice(0, 7);
    checkText(`${short} (message)`, git("log", "-1", "--format=%B", c));
    let file = "?";
    let newLine = 0;
    for (const l of git("show", "--format=", "--unified=0", "--no-color", c).split("\n")) {
      if (l.startsWith("+++ ")) {
        file = l.replace(/^\+\+\+ (b\/)?/, "");
        continue;
      }
      const h = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(l);
      if (h) {
        newLine = Number(h[1]);
        continue;
      }
      if (l.startsWith("+") && !ignore.has(file)) {
        checkLine(`${short} ${file}`, newLine, l.slice(1));
        newLine++;
      }
    }
  }
} else {
  const files = git("ls-files", "-co", "--exclude-standard").split("\n").filter(Boolean);
  for (const f of files) {
    if (ignore.has(f) || !existsSync(join(root, f))) continue;
    checkText(f, readFileSync(join(root, f), "utf8"));
  }
}

if (findings.length) {
  console.error(`${findings.length} leak finding(s):`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
const scope = denylist ? `${denylist.length} denylist terms + generic patterns` : "generic patterns only";
console.log(`No leaks (${scope}).`);
