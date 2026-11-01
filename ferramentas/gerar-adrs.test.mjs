// Testes do gerador de ADRs: node --test ferramentas/
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(raiz, "ferramentas", "gerar-adrs.mjs");
const decisao = (n, extra = "") =>
  `# ${n} · Assunto ${n}\r\n\r\n- **Estado:** aceita\r\n- **Contexto:** contexto.\r\n- **Decisão:** decisão.${extra}\r\n`;

function rodar(fontes, destino, ...extra) {
  try {
    const saida = execFileSync(process.execPath, [script, "--fontes", fontes, "--destino", destino, ...extra], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { codigo: 0, saida };
  } catch (e) {
    return { codigo: e.status, saida: `${e.stdout}${e.stderr}` };
  }
}

describe("gerar-adrs", () => {
  let base;
  let fontes;
  let destino;
  before(() => {
    base = mkdtempSync(join(tmpdir(), "adrs-"));
  });
  after(() => rmSync(base, { recursive: true, force: true }));
  const novo = (nome, arquivos) => {
    fontes = join(base, nome, "fontes");
    destino = join(base, nome, "adr");
    mkdirSync(fontes, { recursive: true });
    for (const [n, t] of Object.entries(arquivos)) writeFileSync(join(fontes, n), t);
  };

  it("gera um ADR por decisão, com LF, e fica em dia", () => {
    novo("a", { "0001-um.md": decisao("0001"), "0002-dois.md": decisao("0002") });
    assert.equal(rodar(fontes, destino).codigo, 0);
    assert.deepEqual(readdirSync(destino), ["0001-um.md", "0002-dois.md"]);
    assert.equal(readFileSync(join(destino, "0001-um.md"), "utf8"), decisao("0001").replaceAll("\r\n", "\n"));
    assert.equal(rodar(fontes, destino, "--verificar").codigo, 0);
    assert.match(rodar(fontes, destino).saida, /já estava em dia/);
  });

  it("--verificar reprova ADR editado à mão e ADR faltando", () => {
    novo("b", { "0001-um.md": decisao("0001") });
    rodar(fontes, destino);
    writeFileSync(join(destino, "0001-um.md"), `${readFileSync(join(destino, "0001-um.md"), "utf8")}linha à mão\n`);
    const editado = rodar(fontes, destino, "--verificar");
    assert.equal(editado.codigo, 1);
    assert.match(editado.saida, /desatualizado/);
    rmSync(join(destino, "0001-um.md"));
    assert.equal(rodar(fontes, destino, "--verificar").codigo, 1);
    assert.equal(rodar(fontes, destino).codigo, 0);
    assert.equal(rodar(fontes, destino, "--verificar").codigo, 0);
  });

  it("a mudança na fonte aparece no ADR", () => {
    novo("c", { "0001-um.md": decisao("0001") });
    rodar(fontes, destino);
    writeFileSync(join(fontes, "0001-um.md"), decisao("0001", " Mais um trecho."));
    assert.equal(rodar(fontes, destino, "--verificar").codigo, 1);
    rodar(fontes, destino);
    assert.match(readFileSync(join(destino, "0001-um.md"), "utf8"), /Mais um trecho\./);
  });

  it("ADR sem decisão é apontado e nunca apagado (R2)", () => {
    novo("d", { "0001-um.md": decisao("0001") });
    mkdirSync(destino, { recursive: true });
    writeFileSync(join(destino, "0009-sobra.md"), "x\n");
    const r = rodar(fontes, destino);
    assert.equal(r.codigo, 1);
    assert.match(r.saida, /0009-sobra\.md: ADR sem decisão/);
    assert.ok(existsSync(join(destino, "0009-sobra.md")));
    assert.ok(existsSync(join(destino, "0001-um.md")));
    assert.equal(rodar(fontes, destino, "--verificar").codigo, 1);
  });

  it("decisão fora do formato do revisor não gera nada", () => {
    novo("e", { "0001-um.md": "sem título\n- **Estado:** aceita\n" });
    const r = rodar(fontes, destino);
    assert.equal(r.codigo, 1);
    assert.match(r.saida, /o título deve ser/);
    assert.match(r.saida, /falta a seção "- \*\*Contexto:\*\*"/);
    assert.equal(existsSync(destino), false);
  });

  it("o repositório real está em dia", () => {
    const r = execFileSync(process.execPath, [script, "--verificar"], { cwd: raiz, encoding: "utf8" });
    assert.match(r, /em dia/);
  });
});
