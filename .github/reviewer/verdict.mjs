#!/usr/bin/env node
// Joins the deterministic rules and the semantic review into one verdict and publishes it as the
// "revisao" check, which the main ruleset requires (the check name is kept because the ruleset
// refers to it).
//   success          approved (or a PR that is not from an agent: it stays with human review)
//   failure          rejected: the job also fails, and the PR comment says what to redo
//   action_required  failure of the reviewer itself (token, limit, invalid output) or attempts
//                    exhausted: blocks the merge, turns off auto-merge and calls a person,
//                    without making the agent "fix" what is not its error
//
// Environment: GH_TOKEN, GH_REPO, PR, HEAD_SHA, IS_AGENT and the outcome of each step: RULES,
// SONAR (success = gate passed, failure = gate failed, other = query failure), CLAUDE.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const MAX_ATTEMPTS = 3;
const MARKER = "<!-- reviewer:rejected -->";
const { GH_REPO, PR, HEAD_SHA, IS_AGENT, RULES, SONAR, CLAUDE } = process.env;
// NOSONAR(S4036): gh comes from the PATH of the GitHub runner or the maintainer's machine; an absolute path would break between Linux and Windows.
const gh = (...a) => execFileSync("gh", a, { encoding: "utf8" }); // NOSONAR

function publish(conclusion, title, summary) {
  const body = { name: "revisao", head_sha: HEAD_SHA, status: "completed", conclusion, output: { title, summary: summary.slice(0, 65000) } };
  writeFileSync("check.json", JSON.stringify(body));
  gh("api", `repos/${GH_REPO}/check-runs`, "--method", "POST", "--input", "check.json");
  console.log(`revisao: ${conclusion}: ${title}\n\n${summary}`);
}

function comment(text) {
  writeFileSync("comment.md", text);
  gh("pr", "comment", PR, "--repo", GH_REPO, "--body-file", "comment.md");
}

function callPerson(title, summary) {
  // Turning off auto-merge needs contents: write (the verdict job has it). If it was not
  // on, gh fails and we move on; the reason stays in the log.
  try {
    gh("pr", "merge", PR, "--repo", GH_REPO, "--disable-auto");
  } catch (error) {
    console.warn(`Auto-merge not turned off: ${error.message}`);
  }
  gh("label", "create", "needs-human", "--repo", GH_REPO, "--color", "D93F0B", "--description", "The automatic reviewer stopped; a person is needed", "--force");
  gh("pr", "edit", PR, "--repo", GH_REPO, "--add-label", "needs-human");
  comment(`## Reviewer: ${title}\n\n${summary}\n\nAuto-merge, if it was on, was turned off. **Agent: do not change the PR because of this message.** A person will decide.`);
  publish("action_required", title, summary);
}

// Approved on a new run after having called a person (for example, after replacing a token):
// removes the label. The merge stays human: a free-text PR has no auto-merge.
function release() {
  const labels = JSON.parse(gh("pr", "view", PR, "--repo", GH_REPO, "--json", "labels")).labels.map((l) => l.name);
  if (!labels.includes("needs-human")) return;
  gh("pr", "edit", PR, "--repo", GH_REPO, "--remove-label", "needs-human");
  comment("## Reviewer: approved on a new run\n\nThe `needs-human` label was removed.");
}

if (IS_AGENT !== "true") {
  publish("success", "Human PR: no automatic review", "This PR does not come from an agent; the review belongs to whoever merges it.");
  process.exit(0);
}

const rules = existsSync("rules.md") ? readFileSync("rules.md", "utf8") : "";
const previous = JSON.parse(gh("pr", "view", PR, "--repo", GH_REPO, "--json", "comments"))
  .comments.filter((c) => c.body.includes(MARKER)).length;

// sonar.md is written by sonar.mjs: SonarQube Cloud quality gate and the new findings of the PR.
const sonar = existsSync("sonar.md") ? readFileSync("sonar.md", "utf8") : "";

let reasons = null;
if (RULES !== "success") {
  reasons = rules || "The deterministic rules failed without a report; see the job log.";
} else if (SONAR !== "success" && SONAR !== "failure") {
  callPerson("SonarQube Cloud query failed",
    `The PR quality gate could not be read (result: \`${SONAR || "did not run"}\`). ${sonar}Check the \`SONAR_TOKEN\` secret and whether the Sonar analysis finished, and run the job again.`);
  process.exit(0);
} else if (CLAUDE !== "success" || !existsSync("review.json")) {
  callPerson("semantic reviewer failed",
    `The semantic review did not finish (result: \`${CLAUDE || "did not run"}\`). Check the \`CLAUDE_CODE_OAUTH_TOKEN\` secret and the subscription limits, and run the job again. The deterministic rules passed.`);
  process.exit(0);
} else {
  let review;
  try {
    review = JSON.parse(readFileSync("review.json", "utf8"));
    if (!["approved", "rejected"].includes(review.verdict)) throw new Error(`verdict "${review.verdict}"`);
  } catch (error) {
    callPerson("invalid output from the semantic reviewer", `\`review.json\` could not be read: ${error.message}.`);
    process.exit(0);
  }
  const notes = (review.notes ?? []).map((o) => "- " + o).join("\n");
  const notesBlock = notes ? "\nNotes (non-blocking):\n" + notes + "\n" : "";
  if (review.verdict === "approved" && SONAR === "success") {
    release();
    publish("success", "approved", `${rules}\n${sonar}\n### Semantic review: approved\n${notesBlock}`);
    process.exit(0);
  }
  const parts = [];
  if (SONAR === "failure") parts.push(sonar);
  if (review.verdict === "rejected") {
    const where = (m) => (m.line ? `${m.file}:${m.line}` : m.file);
    const list = (review.reasons ?? []).map((m) => `- \`${where(m)}\` (criterion ${m.criterion}): ${m.problem} **Fix:** ${m.fix}`).join("\n");
    parts.push(`### Semantic review: rejected\n\n${list || "- (the reviewer rejected without listing reasons)"}`);
  }
  reasons = parts.join("\n\n");
}

if (previous + 1 >= MAX_ATTEMPTS) {
  callPerson(`rejected ${MAX_ATTEMPTS} times`, `${reasons}\n\nLimit of ${MAX_ATTEMPTS} attempts reached.`);
  process.exit(0);
}
comment(`${MARKER}\n## Reviewer: rejected (attempt ${previous + 1} of ${MAX_ATTEMPTS})\n\n${reasons}\n\nRedo it following \`AGENTS.md\` and only what is listed above.`);
publish("failure", `rejected (attempt ${previous + 1} of ${MAX_ATTEMPTS})`, reasons);
process.exit(1);
