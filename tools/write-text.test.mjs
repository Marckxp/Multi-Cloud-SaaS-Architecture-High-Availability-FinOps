// Tests of the free-text writer: node --test tools/
// No test uses the network: the provider is a fake function or a fake fetch.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { ExitError, callProvider, write, readConfig, cleanResponse, buildRequest, validateTarget } from "./write-text.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const KEY = "test-key-not-real";
const TERM = "fictional-test-term";
const URLS = {
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  cloudflare: "https://api.cloudflare.com/client/v4/accounts/TEST-ACCOUNT/ai/v1/",
  lmstudio: "http://localhost:1234/v1",
};
const envOk = { WRITER_URL: URLS.gemini, WRITER_MODEL: "model-x", WRITER_KEY: KEY, VITRINE_PROIBIDOS: TERM, PATH: process.env.PATH, SystemRoot: process.env.SystemRoot };
const publicIp = ["8", "8", "8", "8"].join(".");

function captureStderr(fn) {
  const saved = console.error;
  const lines = [];
  console.error = (...a) => lines.push(a.join(" "));
  return fn().finally(() => (console.error = saved)).then((r) => ({ r, error: lines.join("\n") }));
}

describe("configuration", () => {
  it("without a key it exits with a clear error, code 2, and prints no value", () => {
    assert.throws(() => readConfig({ WRITER_URL: URLS.gemini, WRITER_MODEL: "m" }), (x) => {
      assert.ok(x instanceof ExitError);
      assert.equal(x.code, 2);
      assert.match(x.message, /WRITER_KEY/);
      assert.doesNotMatch(x.message, /generativelanguage/);
      return true;
    });
  });

  it("each missing variable is named", () => {
    assert.throws(() => readConfig({}), (x) => {
      assert.equal(x.code, 2);
      for (const n of ["WRITER_URL", "WRITER_MODEL", "WRITER_KEY"]) assert.match(x.message, new RegExp(n));
      return true;
    });
  });

  it("http is only valid for localhost; an invalid URL is rejected", () => {
    assert.throws(() => readConfig({ ...envOk, WRITER_URL: "http://example.org/v1" }), /https/);
    assert.throws(() => readConfig({ ...envOk, WRITER_URL: "not a url" }), /valid URL/);
    assert.equal(readConfig({ ...envOk, WRITER_URL: URLS.lmstudio }).host, "localhost");
  });

  it("the CLI without variables exits with 2 and does not touch the file", () => {
    const before = readFileSync(join(root, "docs", "roadmap.md"), "utf8");
    try {
      execFileSync(process.execPath, [join(root, "tools", "write-text.mjs"), "--target", "docs/roadmap.md", "--task", "x"], {
        cwd: root, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      });
      assert.fail("should have exited with an error");
    } catch (error) {
      assert.equal(error.status, 2);
      assert.match(error.stderr, /WRITER_KEY/);
    }
    assert.equal(readFileSync(join(root, "docs", "roadmap.md"), "utf8"), before);
  });
});

describe("request (Gemini, Cloudflare Workers AI, LM Studio)", () => {
  const messages = [{ role: "user", content: "hi" }];
  for (const [name, url] of Object.entries(URLS)) {
    it(`builds the call for ${name} from variables only`, () => {
      const config = readConfig({ ...envOk, WRITER_URL: url });
      const { endpoint, options } = buildRequest(config, messages);
      assert.equal(endpoint, `${url.replace(/\/+$/, "")}/chat/completions`);
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, `Bearer ${KEY}`);
      assert.deepEqual(JSON.parse(options.body), { model: "model-x", messages, temperature: 0.2 });
    });
  }

  it("callProvider sends through the given network function and returns the text", async () => {
    let seen;
    const fakeFetch = async (endpoint, options) => {
      seen = { endpoint, options };
      return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: "new text" } }] }) };
    };
    const text = await callProvider(readConfig(envOk), messages, fakeFetch);
    assert.equal(text, "new text");
    assert.equal(seen.endpoint, `${URLS.gemini}/chat/completions`);
    assert.equal(seen.options.headers.Authorization, `Bearer ${KEY}`);
  });

  it("a provider error exits with 3 and the key never appears in the message", async () => {
    const fakeFetch = async () => ({ ok: false, status: 401, text: async () => `invalid key: ${KEY}` });
    await assert.rejects(callProvider(readConfig(envOk), messages, fakeFetch), (e) => {
      assert.equal(e.code, 3);
      assert.match(e.message, /401/);
      assert.doesNotMatch(e.message, new RegExp(KEY));
      return true;
    });
    const networkFailure = async () => {
      throw new Error(`no network (${KEY})`);
    };
    await assert.rejects(callProvider(readConfig(envOk), messages, networkFailure), (e) => e.code === 3 && !e.message.includes(KEY));
  });

  it("a response without text is error 3", async () => {
    const empty = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ choices: [] }) });
    await assert.rejects(callProvider(readConfig(envOk), messages, empty), (e) => e.code === 3);
    const notJson = async () => ({ ok: true, status: 200, text: async () => "<html>" });
    await assert.rejects(callProvider(readConfig(envOk), messages, notJson), (e) => e.code === 3);
  });
});

describe("response and target", () => {
  it("strips the code fence and guarantees a trailing newline", () => {
    assert.equal(cleanResponse("```markdown\n# A\n\ntext\n```\n"), "# A\n\ntext\n");
    assert.equal(cleanResponse("# A\r\ntext"), "# A\ntext\n");
  });

  it("accepts only README, roadmap and finops/*.md", () => {
    for (const ok of ["README.md", "docs/roadmap.md", "finops/README.md"]) assert.equal(validateTarget(ok), ok);
    for (const bad of ["docs/adr/0001-offline-first-no-server.md", "../outside.md", "facts/state.json", "/etc/passwd", "tools/x.mjs", "finops/azure/x.md", undefined])
      assert.throws(() => validateTarget(bad), (e) => e.code === 2);
  });
});

describe("full flow with a fake provider, on a disk clone", () => {
  let copy;
  before(() => {
    copy = mkdtempSync(join(tmpdir(), "writer-"));
    const list = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean); // NOSONAR
    for (const f of list) {
      mkdirSync(dirname(join(copy, f)), { recursive: true });
      copyFileSync(join(root, f), join(copy, f));
    }
    execFileSync("git", ["init", "-q"], { cwd: copy }); // NOSONAR
  });
  after(() => rmSync(copy, { recursive: true, force: true }));

  const roadmap = () => readFileSync(join(copy, "docs", "roadmap.md"), "utf8");
  const attempt = (addition, env = envOk, target = "docs/roadmap.md") => {
    const current = readFileSync(join(copy, target), "utf8");
    let sent;
    const call = async (config, messages) => {
      sent = { config, messages };
      return `${current}${addition}`;
    };
    return captureStderr(() => write({ root: copy, target, task: "Review the text.", env, call, log: () => {} })).then((x) => ({ ...x, sent }));
  };

  it("clean text is accepted and written; the message carries the facts and the current file", async () => {
    const { r, sent } = await attempt("\nTest text with no numbers.\n");
    assert.equal(r, 0);
    assert.match(roadmap(), /Test text with no numbers\./);
    assert.equal(sent.messages[0].role, "system");
    assert.match(sent.messages[1].content, /facts\/state\.json/);
    assert.match(sent.messages[1].content, /facts\/decisions\/0001/);
    assert.equal(JSON.stringify(sent.messages).includes(KEY), false);
  });

  const rejected = [
    ["term from the secret list", `\nmentions ${TERM}.\n`, envOk, /leak check/],
    ["public IP", `\nserver ${publicIp}.\n`, envOk, /leak check/],
    ["number that is not in the facts (R5)", "\nIt has 98765 items.\n", envOk, /R5/],
    ["capacity claim (R6)", "\nHandles high RPS.\n", envOk, /R6/],
    ["without the term list (cannot verify)", "\nHarmless text.\n", { ...envOk, VITRINE_PROIBIDOS: "", VITRINE_PROIBIDOS_ARQUIVO: join(tmpdir(), "does-not-exist.txt"), USERPROFILE: tmpdir(), HOME: tmpdir() }, /leak check/],
  ];
  for (const [name, addition, env, expected] of rejected) {
    it(`rejects and does not write: ${name}`, async () => {
      const previous = roadmap();
      const { r, error } = await attempt(addition, env);
      assert.equal(r, 1);
      assert.match(error, expected);
      assert.match(error, /was not changed/);
      assert.equal(roadmap(), previous);
      assert.equal(error.includes(TERM), false, "the output never shows the term");
    });
  }

  it("rejects a generated README block edited by hand", async () => {
    const previous = readFileSync(join(copy, "README.md"), "utf8");
    const changed = previous.replace(/(<!-- generated:updated:start -->\r?\n)/, "$1Hand-written line.\n");
    assert.notEqual(changed, previous);
    const call = async () => changed;
    const { r, error } = await captureStderr(() => write({ root: copy, target: "README.md", task: "t", env: envOk, call, log: () => {} }));
    assert.equal(r, 1);
    assert.match(error, /README/);
    assert.equal(readFileSync(join(copy, "README.md"), "utf8"), previous);
  });

  it("no change writes nothing and exits with 0", async () => {
    const previous = roadmap();
    const { r } = await attempt("");
    assert.equal(r, 0);
    assert.equal(roadmap(), previous);
  });

  it("without a key it does not even call the provider", async () => {
    let called = false;
    const call = async () => {
      called = true;
      return "x";
    };
    await assert.rejects(write({ root: copy, target: "README.md", task: "t", env: { ...envOk, WRITER_KEY: "" }, call }), (e) => e.code === 2);
    assert.equal(called, false);
  });
});
