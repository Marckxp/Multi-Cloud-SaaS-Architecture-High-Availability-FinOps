#!/usr/bin/env node
// Generates the README data blocks from facts/state.json, between the markers
// <!-- generated:NAME:start --> and <!-- generated:NAME:end -->. Text outside the markers is free-form.
// Numbers and states only get in through here, so that no agent ever writes them by hand.
//
//   node tools/generate-readme.mjs          rewrites the README and docs/engineering.md
//   node tools/generate-readme.mjs --check  fails if one of them is out of date (CI)

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const state = JSON.parse(readFileSync(join(root, "facts", "state.json"), "utf8"));
// Files that carry generated blocks. A file that does not exist is skipped.
const targets = [["README.md", join(root, "README.md")], ["docs/engineering.md", join(root, "docs", "engineering.md")]];
const decisionCount = () => readdirSync(join(root, "facts", "decisions")).filter((f) => /^\d{4}-.*\.md$/.test(f)).length;

const label = {
  published: "🟢 published", implemented: "🟢 implemented", "in-test": "🟡 in test", evaluated: "🔵 evaluated",
  planned: "⚪ planned", reserve: "🟠 reserve", legacy: "⚫ legacy", discarded: "✖️ discarded",
};
const layers = {
  client: "Client", "local-data": "On-device data", edge: "Edge", identity: "Identity",
  "cloud-data": "Cloud data", compute: "Compute", ci: "CI", operations: "Operations",
};
const num = (n) => n.toLocaleString("en-US");
const table = (header, rows) =>
  [`| ${header.join(" | ")} |`, `|${header.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");

function diagram() {
  const c = state.architecture.components;
  const lines = ["```mermaid", "flowchart LR", '  user(["User"])'];
  for (const [layer, title] of Object.entries(layers)) {
    const inLayer = c.filter((x) => x.layer === layer);
    if (!inLayer.length) continue;
    lines.push(`  subgraph c_${layer.replaceAll("-", "_")}["${title}"]`);
    for (const x of inLayer) lines.push(`    ${x.id.replaceAll("-", "_")}["${x.technology.replaceAll('"', "'")}"]:::${x.state.replaceAll("-", "_")}`);
    lines.push("  end");
  }
  lines.push("  user --> native_app & web_app");
  for (const x of c)
    for (const d of x.connectsTo ?? []) {
      const target = c.find((y) => y.id === d);
      const arrow = target && ["planned", "reserve", "evaluated"].includes(target.state) ? "-.->" : "-->";
      lines.push(`  ${x.id.replaceAll("-", "_")} ${arrow} ${d.replaceAll("-", "_")}`);
    }
  lines.push(
    "  classDef published fill:#1f883d,color:#fff,stroke:#116329",
    "  classDef implemented fill:#2da44e,color:#fff,stroke:#1a7f37",
    "  classDef in_test fill:#bf8700,color:#fff,stroke:#9a6700",
    "  classDef evaluated fill:#0969da,color:#fff,stroke:#0550ae",
    "  classDef planned fill:#f6f8fa,color:#24292f,stroke:#8c959f,stroke-dasharray:4 3",
    "  classDef reserve fill:#fb8f44,color:#fff,stroke:#bc4c00",
    "  classDef legacy fill:#6e7781,color:#fff,stroke:#57606a",
    "```",
    "",
    "Solid line: in use. Dashed: reserve, evaluated or planned.",
  );
  return lines.join("\n");
}

const blocks = {
  diagram,
  components: () =>
    table(["Layer", "Technology", "Role", "State"],
      state.architecture.components.map((x) => [layers[x.layer], x.technology, x.role, label[x.state]])),
  clouds: () =>
    state.clouds.map((n) =>
      [`#### ${n.provider}`, "", `> ${n.rule}`, "",
        table(["Service", "SKU", "Region", "Role", "State"],
          n.services.map((s) => [s.service, s.sku ?? "—", s.region ?? "—", s.role, label[s.state]]))].join("\n")).join("\n\n"),
  protections: () =>
    table(["Cloud", "Type", "Protection", "State", "File"],
      state.clouds.flatMap((n) => n.protections.map((p) => [n.provider, p.type, p.description + (p.verification ? ` (verified: ${p.verification})` : ""), p.state, p.file ? `[${p.file}](${p.file})` : "—"]))),
  measurements: () =>
    [table(["Measurement", "Value", "How"], state.finops.measurements.map((m) => [m.name, `${num(m.value)} ${m.unit}`, m.how])),
      "", `Operational limit: alert at **${state.finops.operationalLimitPercent}%** of each free quota.`,
      ...(state.finops.reevaluationTriggers?.length ? ["", "Reevaluation triggers:", ...state.finops.reevaluationTriggers.map((g) => `- ${g}`)] : [])].join("\n"),
  glance: () => {
    const featured = state.featured?.measurements ?? [];
    const totalTests = state.quality.suites.reduce((sum, s) => sum + s.count, 0);
    return table(["What", "Value", "How it was obtained"], [
      ["Architecture decisions recorded", num(decisionCount()), "One file per decision in [`docs/adr/`](docs/adr/), with context, decision, consequences and alternatives"],
      ["Automated test cases", num(totalTests), `Sum of the ${state.quality.suites.length} suites in [Quality](#quality)`],
      ...state.finops.measurements.filter((m) => featured.includes(m.name)).map((m) => [m.name, `${num(m.value)} ${m.unit}`, m.how]),
    ]);
  },
  quality: () =>
    [table(["Suite", "Tool", "Target", "Count"], state.quality.suites.map((s) => [s.name, s.tool, s.target, num(s.count)])),
      "", ...(state.featured?.practices ?? state.quality.practices).map((p) => `- ${p}`),
      ...(state.featured ? ["", "All practices: [docs/engineering.md](docs/engineering.md)."] : [])].join("\n"),
  process: () =>
    [...(state.featured?.process ?? state.process).map((p) => `- ${p}`),
      ...(state.featured ? ["", "The full process: [docs/engineering.md](docs/engineering.md)."] : [])].join("\n"),
  "practices-all": () => state.quality.practices.map((p) => `- ${p}`).join("\n"),
  "process-all": () => state.process.map((p) => `- ${p}`).join("\n"),
  roadmap: () =>
    table(["Item", "State", "Condition"], state.roadmap.map((r) => [r.item, label[r.state], r.condition ?? "—"])),
  updated: () => `Facts as of ${state.generatedAt} (package v${state.packageVersion}).`,
};

const render = (original) => {
  const eol = original.includes("\r\n") ? "\r\n" : "\n";
  let updated = original;
  for (const [name, generate] of Object.entries(blocks)) {
    const re = new RegExp(String.raw`(<!-- generated:${name}:start -->)[\s\S]*?(<!-- generated:${name}:end -->)`);
    if (!re.test(updated)) continue;
    updated = updated.replace(re, (_, a, b) => `${a}${eol}${generate().replaceAll("\n", eol)}${eol}${b}`);
  }
  return updated;
};

const check = process.argv.includes("--check");
let stale = false;
for (const [path, file] of targets.filter(([, f]) => existsSync(f))) {
  const original = readFileSync(file, "utf8");
  const updated = render(original);
  if (check) {
    if (updated !== original) {
      console.error(`${path} is out of date: run node tools/generate-readme.mjs`);
      stale = true;
    } else console.log(`${path} is up to date with facts/state.json.`);
  } else {
    writeFileSync(file, updated);
    console.log(updated === original ? `${path} was already up to date.` : `${path} updated.`);
  }
}
if (stale) process.exit(1);
