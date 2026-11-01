// Testes do escritor de texto livre: node --test ferramentas/
// Nenhum teste usa a rede: o provedor é uma função falsa ou um fetch falso.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { ErroSaida, chamarProvedor, escrever, lerConfig, limparResposta, montarRequisicao, validarAlvo } from "./escrever-texto.mjs";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHAVE = "chave-de-teste-nao-real";
const TERMO = "termo-ficticio-do-teste";
const URLS = {
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  cloudflare: "https://api.cloudflare.com/client/v4/accounts/CONTA-DE-TESTE/ai/v1/",
  lmstudio: "http://localhost:1234/v1",
};
const envOk = { ESCRITOR_URL: URLS.gemini, ESCRITOR_MODELO: "modelo-x", ESCRITOR_CHAVE: CHAVE, VITRINE_PROIBIDOS: TERMO, PATH: process.env.PATH, SystemRoot: process.env.SystemRoot };
const ipPublico = ["8", "8", "8", "8"].join(".");

function saidaPadrao(fn) {
  const guardado = console.error;
  const linhas = [];
  console.error = (...a) => linhas.push(a.join(" "));
  return fn().finally(() => (console.error = guardado)).then((r) => ({ r, erro: linhas.join("\n") }));
}

describe("configuração", () => {
  it("sem chave sai com erro claro, código 2, e sem imprimir valor", () => {
    assert.throws(() => lerConfig({ ESCRITOR_URL: URLS.gemini, ESCRITOR_MODELO: "m" }), (x) => {
      assert.ok(x instanceof ErroSaida);
      assert.equal(x.codigo, 2);
      assert.match(x.message, /ESCRITOR_CHAVE/);
      assert.doesNotMatch(x.message, /generativelanguage/);
      return true;
    });
  });

  it("cada variável ausente é nomeada", () => {
    assert.throws(() => lerConfig({}), (x) => {
      assert.equal(x.codigo, 2);
      for (const n of ["ESCRITOR_URL", "ESCRITOR_MODELO", "ESCRITOR_CHAVE"]) assert.match(x.message, new RegExp(n));
      return true;
    });
  });

  it("http só vale para localhost; URL inválida é rejeitada", () => {
    assert.throws(() => lerConfig({ ...envOk, ESCRITOR_URL: "http://exemplo.org/v1" }), /https/);
    assert.throws(() => lerConfig({ ...envOk, ESCRITOR_URL: "não é url" }), /URL válida/);
    assert.equal(lerConfig({ ...envOk, ESCRITOR_URL: URLS.lmstudio }).host, "localhost");
  });

  it("o CLI sem variáveis sai com 2 e não toca no arquivo", () => {
    const antes = readFileSync(join(raiz, "docs", "roteiro.md"), "utf8");
    try {
      execFileSync(process.execPath, [join(raiz, "ferramentas", "escrever-texto.mjs"), "--alvo", "docs/roteiro.md", "--tarefa", "x"], {
        cwd: raiz, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      });
      assert.fail("devia sair com erro");
    } catch (e) {
      assert.equal(e.status, 2);
      assert.match(e.stderr, /ESCRITOR_CHAVE/);
    }
    assert.equal(readFileSync(join(raiz, "docs", "roteiro.md"), "utf8"), antes);
  });
});

describe("requisição (Gemini, Cloudflare Workers AI, LM Studio)", () => {
  const mensagens = [{ role: "user", content: "oi" }];
  for (const [nome, url] of Object.entries(URLS)) {
    it(`monta a chamada para ${nome} só com variáveis`, () => {
      const config = lerConfig({ ...envOk, ESCRITOR_URL: url });
      const { endereco, opcoes } = montarRequisicao(config, mensagens);
      assert.equal(endereco, `${url.replace(/\/+$/, "")}/chat/completions`);
      assert.equal(opcoes.method, "POST");
      assert.equal(opcoes.headers.Authorization, `Bearer ${CHAVE}`);
      assert.deepEqual(JSON.parse(opcoes.body), { model: "modelo-x", messages: mensagens, temperature: 0.2 });
    });
  }

  it("chamarProvedor envia pela função de rede dada e devolve o texto", async () => {
    let visto;
    const fetchFalso = async (endereco, opcoes) => {
      visto = { endereco, opcoes };
      return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: "texto novo" } }] }) };
    };
    const texto = await chamarProvedor(lerConfig(envOk), mensagens, fetchFalso);
    assert.equal(texto, "texto novo");
    assert.equal(visto.endereco, `${URLS.gemini}/chat/completions`);
    assert.equal(visto.opcoes.headers.Authorization, `Bearer ${CHAVE}`);
  });

  it("erro do provedor sai com 3 e a chave nunca aparece na mensagem", async () => {
    const fetchFalso = async () => ({ ok: false, status: 401, text: async () => `chave inválida: ${CHAVE}` });
    await assert.rejects(chamarProvedor(lerConfig(envOk), mensagens, fetchFalso), (e) => {
      assert.equal(e.codigo, 3);
      assert.match(e.message, /401/);
      assert.doesNotMatch(e.message, new RegExp(CHAVE));
      return true;
    });
    const falhaDeRede = async () => {
      throw new Error(`sem rede (${CHAVE})`);
    };
    await assert.rejects(chamarProvedor(lerConfig(envOk), mensagens, falhaDeRede), (e) => e.codigo === 3 && !e.message.includes(CHAVE));
  });

  it("resposta sem texto é erro 3", async () => {
    const vazio = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ choices: [] }) });
    await assert.rejects(chamarProvedor(lerConfig(envOk), mensagens, vazio), (e) => e.codigo === 3);
    const naoJson = async () => ({ ok: true, status: 200, text: async () => "<html>" });
    await assert.rejects(chamarProvedor(lerConfig(envOk), mensagens, naoJson), (e) => e.codigo === 3);
  });
});

describe("resposta e alvo", () => {
  it("tira a cerca de código e garante um fim de linha", () => {
    assert.equal(limparResposta("```markdown\n# A\n\ntexto\n```\n"), "# A\n\ntexto\n");
    assert.equal(limparResposta("# A\r\ntexto"), "# A\ntexto\n");
  });

  it("aceita só README, roteiro e finops/*.md", () => {
    for (const ok of ["README.md", "docs/roteiro.md", "finops/README.md"]) assert.equal(validarAlvo(ok), ok);
    for (const ruim of ["docs/adr/0001-offline-first-sem-servidor.md", "../fora.md", "fontes/estado.json", "/etc/passwd", "ferramentas/x.mjs", "finops/azure/x.md", undefined])
      assert.throws(() => validarAlvo(ruim), (e) => e.codigo === 2);
  });
});

describe("fluxo completo com provedor falso, num clone do disco", () => {
  let copia;
  before(() => {
    copia = mkdtempSync(join(tmpdir(), "escritor-"));
    const lista = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { cwd: raiz, encoding: "utf8" }).split("\n").filter(Boolean); // NOSONAR
    for (const a of lista) {
      mkdirSync(dirname(join(copia, a)), { recursive: true });
      copyFileSync(join(raiz, a), join(copia, a));
    }
    execFileSync("git", ["init", "-q"], { cwd: copia }); // NOSONAR
  });
  after(() => rmSync(copia, { recursive: true, force: true }));

  const roteiro = () => readFileSync(join(copia, "docs", "roteiro.md"), "utf8");
  const tentar = (acrescimo, env = envOk, alvo = "docs/roteiro.md") => {
    const atual = readFileSync(join(copia, alvo), "utf8");
    let enviado;
    const chamar = async (config, mensagens) => {
      enviado = { config, mensagens };
      return `${atual}${acrescimo}`;
    };
    return saidaPadrao(() => escrever({ raiz: copia, alvo, tarefa: "Revise o texto.", env, chamar, log: () => {} })).then((x) => ({ ...x, enviado }));
  };

  it("texto limpo é aceito e gravado; a mensagem leva as fontes e o arquivo atual", async () => {
    const { r, enviado } = await tentar("\nTexto de teste sem números.\n");
    assert.equal(r, 0);
    assert.match(roteiro(), /Texto de teste sem números\./);
    assert.equal(enviado.mensagens[0].role, "system");
    assert.match(enviado.mensagens[1].content, /fontes\/estado\.json/);
    assert.match(enviado.mensagens[1].content, /fontes\/decisoes\/0001/);
    assert.equal(JSON.stringify(enviado.mensagens).includes(CHAVE), false);
  });

  const reprovados = [
    ["termo da lista secreta", `\nfala de ${TERMO}.\n`, envOk, /vazamento/],
    ["IP público", `\nservidor ${ipPublico}.\n`, envOk, /vazamento/],
    ["número que não está nas fontes (R5)", "\nTem 98765 itens.\n", envOk, /R5/],
    ["afirmação de capacidade (R6)", "\nAguenta alto RPS.\n", envOk, /R6/],
    ["sem a lista de termos (não dá para verificar)", "\nTexto inofensivo.\n", { ...envOk, VITRINE_PROIBIDOS: "", VITRINE_PROIBIDOS_ARQUIVO: join(tmpdir(), "nao-existe.txt"), USERPROFILE: tmpdir(), HOME: tmpdir() }, /vazamento/],
  ];
  for (const [nome, acrescimo, env, esperado] of reprovados) {
    it(`reprova e não grava: ${nome}`, async () => {
      const antes = roteiro();
      const { r, erro } = await tentar(acrescimo, env);
      assert.equal(r, 1);
      assert.match(erro, esperado);
      assert.match(erro, /não foi alterado/);
      assert.equal(roteiro(), antes);
      assert.equal(erro.includes(TERMO), false, "a saída nunca mostra o termo");
    });
  }

  it("reprova bloco gerado do README alterado à mão", async () => {
    const antes = readFileSync(join(copia, "README.md"), "utf8");
    const alterado = antes.replace(/(<!-- gerado:atualizado:inicio -->\r?\n)/, "$1Linha à mão.\n");
    assert.notEqual(alterado, antes);
    const chamar = async () => alterado;
    const { r, erro } = await saidaPadrao(() => escrever({ raiz: copia, alvo: "README.md", tarefa: "t", env: envOk, chamar, log: () => {} }));
    assert.equal(r, 1);
    assert.match(erro, /README/);
    assert.equal(readFileSync(join(copia, "README.md"), "utf8"), antes);
  });

  it("sem mudança não grava e sai com 0", async () => {
    const antes = roteiro();
    const { r } = await tentar("");
    assert.equal(r, 0);
    assert.equal(roteiro(), antes);
  });

  it("sem chave nem chama o provedor", async () => {
    let chamado = false;
    const chamar = async () => {
      chamado = true;
      return "x";
    };
    await assert.rejects(escrever({ raiz: copia, alvo: "README.md", tarefa: "t", env: { ...envOk, ESCRITOR_CHAVE: "" }, chamar }), (e) => e.codigo === 2);
    assert.equal(chamado, false);
  });
});
