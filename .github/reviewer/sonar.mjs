#!/usr/bin/env node
// Reads from SonarQube Cloud the quality gate of the analysis of the PR's current commit and, if
// it failed, the open findings. Writes sonar.md and the "result" output for the verdict. Always
// exits with 0: verdict.mjs is the one that decides.
//
// Environment: SONAR_TOKEN, SONAR_PROJECT, PR, HEAD_SHA, GITHUB_OUTPUT; optional SONAR_WAIT_S (600).

import { appendFileSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const { SONAR_TOKEN, SONAR_PROJECT, PR, HEAD_SHA, GITHUB_OUTPUT } = process.env;
const API = "https://sonarcloud.io/api";
const deadline = Date.now() + Number(process.env.SONAR_WAIT_S ?? 600) * 1000;

// No process.exit: on Windows it can abort while a fetch is still closing (libuv).
class Done extends Error {}
function finish(result, text) {
  writeFileSync("sonar.md", text);
  if (GITHUB_OUTPUT) appendFileSync(GITHUB_OUTPUT, `result=${result}\n`);
  console.log(`sonar: ${result}\n${text}`);
  throw new Done();
}

async function api(path) {
  const r = await fetch(`${API}/${path}`, { headers: { Authorization: `Bearer ${SONAR_TOKEN}` } });
  if (!r.ok) throw new Error(`${path.split("?")[0]}: HTTP ${r.status}`);
  return r.json();
}

try {
  if (!SONAR_TOKEN) finish("error", "Secret `SONAR_TOKEN` is missing. ");
  // The Sonar analysis is asynchronous: wait for the one of the PR's current commit, polling every 20 s.
  const waitForAnalysis = async () => {
    const list = await api(`project_pull_requests/list?project=${encodeURIComponent(SONAR_PROJECT)}`);
    const current = list.pullRequests.find((p) => p.key === String(PR));
    if (current?.commit?.sha === HEAD_SHA && current.status?.qualityGateStatus) return current;
    if (Date.now() > deadline) finish("error", `The Sonar analysis of commit ${HEAD_SHA.slice(0, 7)} did not finish in time. `);
    await sleep(20000);
    return waitForAnalysis();
  };
  const pr = await waitForAnalysis();

  const dashboard = `https://sonarcloud.io/summary/new_code?id=${encodeURIComponent(SONAR_PROJECT)}&pullRequest=${PR}`;
  if (pr.status.qualityGateStatus === "OK") finish("success", `### SonarQube Cloud: quality gate passed\n\n[Dashboard](${dashboard})\n`);

  const gate = await api(`qualitygates/project_status?projectKey=${encodeURIComponent(SONAR_PROJECT)}&pullRequest=${PR}`);
  const conditions = gate.projectStatus.conditions
    .filter((c) => c.status === "ERROR")
    .map((c) => `- \`${c.metricKey}\`: ${c.actualValue} (limit ${c.comparator} ${c.errorThreshold})`);
  const findings = await api(`issues/search?componentKeys=${encodeURIComponent(SONAR_PROJECT)}&pullRequest=${PR}&resolved=false&ps=100`);
  const lines = findings.issues.map((i) => {
    const file = i.component.split(":").slice(1).join(":");
    const where = i.line ? `${file}:${i.line}` : file;
    return `- \`${where}\` ${i.rule} (${i.severity}): ${i.message}`;
  });
  finish("failure", [
    "### SonarQube Cloud: quality gate failed", "",
    "Conditions that failed:", ...conditions, "",
    "Open findings on the PR (fix each one in the code; do not disable the rule):", ...(lines.length ? lines : ["- (no findings listed; see the dashboard)"]), "",
    `[Dashboard](${dashboard})`, "",
  ].join("\n"));
} catch (error) {
  if (!(error instanceof Done)) {
    try { finish("error", `The SonarQube Cloud query failed: ${error.message}. `); } catch { /* Done */ }
  }
}
