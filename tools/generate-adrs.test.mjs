// Tests of the ADR generator: node --test tools/
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(root, "tools", "generate-adrs.mjs");
const decision = (n, extra = "") =>
  `# ${n} · Subject ${n}\r\n\r\n- **Status:** accepted\r\n- **Context:** context.\r\n- **Decision:** decision.${extra}\r\n`;

function run(sources, dest, ...extra) {
  try {
    const output = execFileSync(process.execPath, [script, "--sources", sources, "--dest", dest, ...extra], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, output };
  } catch (error) {
    return { code: error.status, output: `${error.stdout}${error.stderr}` };
  }
}

describe("generate-adrs", () => {
  let base;
  let sources;
  let dest;
  before(() => {
    base = mkdtempSync(join(tmpdir(), "adrs-"));
  });
  after(() => rmSync(base, { recursive: true, force: true }));
  const fresh = (name, files) => {
    sources = join(base, name, "sources");
    dest = join(base, name, "adr");
    mkdirSync(sources, { recursive: true });
    for (const [n, t] of Object.entries(files)) writeFileSync(join(sources, n), t);
  };

  it("generates one ADR per decision, with LF, and stays up to date", () => {
    fresh("a", { "0001-one.md": decision("0001"), "0002-two.md": decision("0002") });
    assert.equal(run(sources, dest).code, 0);
    assert.deepEqual(readdirSync(dest), ["0001-one.md", "0002-two.md", "README.md"]);
    assert.equal(readFileSync(join(dest, "0001-one.md"), "utf8"), decision("0001").replaceAll("\r\n", "\n"));
    assert.equal(run(sources, dest, "--check").code, 0);
    assert.match(run(sources, dest).output, /already up to date/);
  });

  it("the index lists every decision with its title and status, and --check rejects a hand-edited index", () => {
    fresh("i", { "0001-one.md": decision("0001"), "0002-two.md": decision("0002") });
    run(sources, dest);
    const index = readFileSync(join(dest, "README.md"), "utf8");
    assert.match(index, /\| \[0001\]\(0001-one\.md\) \| Subject 0001 \| accepted \|/);
    assert.match(index, /\| \[0002\]\(0002-two\.md\) \| Subject 0002 \| accepted \|/);
    writeFileSync(join(dest, "README.md"), `${index}hand-written line\n`);
    const edited = run(sources, dest, "--check");
    assert.equal(edited.code, 1);
    assert.match(edited.output, /README\.md: out of date/);
  });

  it("--check rejects a hand-edited ADR and a missing ADR", () => {
    fresh("b", { "0001-one.md": decision("0001") });
    run(sources, dest);
    writeFileSync(join(dest, "0001-one.md"), `${readFileSync(join(dest, "0001-one.md"), "utf8")}hand-written line\n`);
    const edited = run(sources, dest, "--check");
    assert.equal(edited.code, 1);
    assert.match(edited.output, /out of date/);
    rmSync(join(dest, "0001-one.md"));
    assert.equal(run(sources, dest, "--check").code, 1);
    assert.equal(run(sources, dest).code, 0);
    assert.equal(run(sources, dest, "--check").code, 0);
  });

  it("a change at the source shows up in the ADR", () => {
    fresh("c", { "0001-one.md": decision("0001") });
    run(sources, dest);
    writeFileSync(join(sources, "0001-one.md"), decision("0001", " One more sentence."));
    assert.equal(run(sources, dest, "--check").code, 1);
    run(sources, dest);
    assert.match(readFileSync(join(dest, "0001-one.md"), "utf8"), /One more sentence\./);
  });

  it("an ADR without a decision is reported and never deleted (R2)", () => {
    fresh("d", { "0001-one.md": decision("0001") });
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, "0009-leftover.md"), "x\n");
    const r = run(sources, dest);
    assert.equal(r.code, 1);
    assert.match(r.output, /0009-leftover\.md: ADR without a decision/);
    assert.ok(existsSync(join(dest, "0009-leftover.md")));
    assert.ok(existsSync(join(dest, "0001-one.md")));
    assert.equal(run(sources, dest, "--check").code, 1);
  });

  it("a decision outside the reviewer format generates nothing", () => {
    fresh("e", { "0001-one.md": "no title\n- **Status:** accepted\n" });
    const r = run(sources, dest);
    assert.equal(r.code, 1);
    assert.match(r.output, /the title must be/);
    assert.match(r.output, /missing section "- \*\*Context:\*\*"/);
    assert.equal(existsSync(dest), false);
  });

  it("the real repository is up to date", () => {
    const r = execFileSync(process.execPath, [script, "--check"], { cwd: root, encoding: "utf8" });
    assert.match(r, /up to date/);
  });
});
