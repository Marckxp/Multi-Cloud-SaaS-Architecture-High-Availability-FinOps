#!/usr/bin/env node
// Escreve o texto livre da vitrine (trechos do README, docs/roteiro.md, finops/*.md) com UMA chamada
// a um modelo, a partir só de fontes/. Sem laço de agente: o modelo só devolve texto, e o script grava
// o arquivo-alvo apenas depois que os verificadores aprovam.
//
//   node ferramentas/escrever-texto.mjs --alvo docs/roteiro.md --tarefa "Atualize as condições do roteiro."
//
// O provedor é qualquer endpoint compatível com a API de chat da OpenAI; trocar de provedor é trocar variáveis:
//   ESCRITOR_URL     base do endpoint, sem /chat/completions
//                    Gemini API:            https://generativelanguage.googleapis.com/v1beta/openai
//                    Cloudflare Workers AI: https://api.cloudflare.com/client/v4/accounts/<ID_DA_CONTA>/ai/v1
//                    LM Studio (local):     http://localhost:1234/v1
//   ESCRITOR_MODELO  nome do modelo no provedor
//   ESCRITOR_CHAVE   chave de API (no LM Studio, qualquer valor). Só variável de ambiente: nunca é gravada nem impressa.
//
// Códigos de saída: 0 aceito (gravado, ou sem mudança), 1 texto reprovado (nada é gravado),
// 2 uso ou configuração (inclui chave ausente), 3 falha do provedor.
//
// Aceite do texto: o candidato entra numa cópia temporária do repositório e passa por
// verificar-vazamento (arquivos e histórico), regras R1 a R6 (revisar-pr-jules), gerar-readme --verificar,
// gerar-adrs --verificar (a regra R7 estendida: docs/adr/ é gerado) e verificar-fontes.

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const raizPadrao = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIMITE_MS = 300_000;
const ALVOS = /^(README\.md|docs\/roteiro\.md|finops\/[^/]+\.md)$/;

export class ErroSaida extends Error {
  constructor(codigo, mensagem) {
    super(mensagem);
    this.codigo = codigo;
  }
}

export function lerConfig(env) {
  const faltam = ["ESCRITOR_URL", "ESCRITOR_MODELO", "ESCRITOR_CHAVE"].filter((n) => !env[n]);
  if (faltam.length) throw new ErroSaida(2, `Variáveis de ambiente ausentes: ${faltam.join(", ")}. Veja o cabeçalho de escrever-texto.mjs.`);
  let url;
  try {
    url = new URL(env.ESCRITOR_URL);
  } catch {
    throw new ErroSaida(2, "ESCRITOR_URL não é uma URL válida.");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local))
    throw new ErroSaida(2, "ESCRITOR_URL precisa ser https (http só para localhost), para a chave não trafegar aberta.");
  return { url: url.href.replace(/\/+$/, ""), host: url.hostname, modelo: env.ESCRITOR_MODELO, chave: env.ESCRITOR_CHAVE };
}

// Monta a requisição sem enviá-la: é o que o teste confere.
export function montarRequisicao(config, mensagens) {
  return {
    endereco: `${config.url}/chat/completions`,
    opcoes: {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.chave}` },
      body: JSON.stringify({ model: config.modelo, messages: mensagens, temperature: 0.2 }),
    },
  };
}

// Única função que usa a rede. O teste passa um fetch falso.
export async function chamarProvedor(config, mensagens, fetchFn = globalThis.fetch) {
  const { endereco, opcoes } = montarRequisicao(config, mensagens);
  const ocultar = (t) => String(t).replaceAll(config.chave, "***");
  let resposta;
  try {
    resposta = await fetchFn(endereco, { ...opcoes, signal: AbortSignal.timeout(LIMITE_MS) });
  } catch (e) {
    throw new ErroSaida(3, `Falha de rede com ${config.host}: ${ocultar(e.message)}`);
  }
  const corpo = await resposta.text();
  if (!resposta.ok) throw new ErroSaida(3, `${config.host} respondeu ${resposta.status}: ${ocultar(corpo).slice(0, 200)}`);
  let texto;
  try {
    texto = JSON.parse(corpo).choices?.[0]?.message?.content;
  } catch {
    texto = null;
  }
  if (typeof texto !== "string" || !texto.trim()) throw new ErroSaida(3, `${config.host} respondeu sem texto em choices[0].message.content.`);
  return texto;
}

// Remove a cerca de código com que os modelos costumam embrulhar o arquivo inteiro.
export function limparResposta(texto) {
  const linhas = texto.trim().replaceAll("\r\n", "\n").split("\n");
  if (linhas.length > 2 && linhas[0].startsWith("```") && linhas.at(-1).trim() === "```") {
    linhas.pop();
    linhas.shift();
  }
  return linhas.join("\n").trim() + "\n";
}

export function validarAlvo(alvo) {
  const limpo = posix.normalize(String(alvo ?? ""));
  if (!ALVOS.test(limpo)) throw new ErroSaida(2, "--alvo deve ser README.md, docs/roteiro.md ou finops/<arquivo>.md (docs/adr/ é gerado por gerar-adrs.mjs).");
  return limpo;
}

const SISTEMA = [
  "Você escreve o texto livre da vitrine pública de uma arquitetura de SaaS, em português do Brasil.",
  "A única fonte de fatos é o conteúdo de fontes/ que o usuário enviar. Não use nenhum outro conhecimento.",
  "Regras: frases curtas, sem marketing; nenhum número, serviço, estado ou nome que não esteja nas fontes;",
  "nenhuma afirmação de capacidade (RPS, SLA, usuários simultâneos); nada do domínio de negócio do produto;",
  "nenhum identificador de conta, IP, e-mail, hostname de provedor ou caminho de usuário; use <MARCADOR> para valores de conta.",
  "Nunca altere o que está entre <!-- gerado:X:inicio --> e <!-- gerado:X:fim -->; mantenha esses marcadores.",
  "Responda SOMENTE com o conteúdo completo e novo do arquivo-alvo, sem cercas de código e sem comentários seus.",
].join(" ");

function lerFontes(raiz) {
  const partes = [`### fontes/estado.json\n${readFileSync(join(raiz, "fontes", "estado.json"), "utf8")}`];
  const pasta = join(raiz, "fontes", "decisoes");
  for (const n of readdirSync(pasta).filter((x) => x.endsWith(".md")).sort())
    partes.push(`### fontes/decisoes/${n}\n${readFileSync(join(pasta, n), "utf8")}`);
  return partes.join("\n\n");
}

export function montarMensagens(raiz, alvo, tarefa) {
  const atual = readFileSync(join(raiz, alvo), "utf8");
  const usuario = `Tarefa: ${tarefa}\n\nArquivo-alvo: ${alvo}\n\n## Fontes\n\n${lerFontes(raiz)}\n\n## Conteúdo atual de ${alvo}\n\n${atual}`;
  return [{ role: "system", content: SISTEMA }, { role: "user", content: usuario }];
}

// NOSONAR(S4036): git vem do PATH do runner ou da máquina do mantenedor; caminho absoluto quebraria entre Linux e Windows.
const git = (cwd, ...a) => execFileSync("git", ["-c", "user.name=escritor", "-c", "user.email=escritor@example.org", "-c", "commit.gpgsign=false", ...a], { cwd, encoding: "utf8" }); // NOSONAR

function rodar(cwd, env, script, ...a) {
  try {
    const saida = execFileSync(process.execPath, [join("ferramentas", script), ...a], { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, saida };
  } catch (e) {
    return { ok: false, saida: `${e.stdout ?? ""}${e.stderr ?? ""}`.trim(), codigo: e.status };
  }
}

// Põe o candidato numa cópia temporária (estado atual do disco como base) e roda os verificadores.
export function avaliar(raiz, alvo, candidato, env = process.env) {
  const tmp = mkdtempSync(join(tmpdir(), "vitrine-escritor-"));
  const motivos = [];
  try {
    const arquivos = git(raiz, "ls-files", "-co", "--exclude-standard").split("\n").filter(Boolean);
    for (const a of arquivos) {
      mkdirSync(dirname(join(tmp, a)), { recursive: true });
      copyFileSync(join(raiz, a), join(tmp, a));
    }
    git(tmp, "init", "-q");
    git(tmp, "add", "--", ...arquivos);
    git(tmp, "commit", "-q", "-m", "base");
    const base = git(tmp, "rev-parse", "HEAD").trim();
    mkdirSync(dirname(join(tmp, alvo)), { recursive: true });
    writeFileSync(join(tmp, alvo), candidato);
    git(tmp, "add", "--", alvo);
    git(tmp, "commit", "-q", "-m", "texto livre a partir das fontes");
    const verificacoes = [
      ["vazamento", "verificar-vazamento.mjs", "--exigir-lista", "--intervalo", `${base}..HEAD`],
      ["regras R1 a R6", "revisar-pr-jules.mjs", "--base", base, "--head", "HEAD"],
      ["README em dia", "gerar-readme.mjs", "--verificar"],
      ["ADRs em dia (R7 estendida)", "gerar-adrs.mjs", "--verificar"],
      ["fontes válidas", "verificar-fontes.mjs"],
    ];
    for (const [nome, script, ...a] of verificacoes) {
      const r = rodar(tmp, env, script, ...a);
      if (!r.ok) motivos.push(`${nome}:\n${r.saida}`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return { ok: motivos.length === 0, motivos };
}

// Fluxo inteiro; `chamar` é a função de rede (trocada nos testes).
export async function escrever({ raiz = raizPadrao, alvo, tarefa, env = process.env, chamar = chamarProvedor, log = console.log }) {
  if (!tarefa?.trim()) throw new ErroSaida(2, "Falta --tarefa.");
  const caminho = validarAlvo(alvo);
  const config = lerConfig(env);
  const bruto = await chamar(config, montarMensagens(raiz, caminho, tarefa));
  const candidato = limparResposta(bruto);
  const atual = readFileSync(join(raiz, caminho), "utf8").replaceAll("\r\n", "\n");
  if (candidato === atual) {
    log(`${caminho}: sem mudança.`);
    return 0;
  }
  const veredito = avaliar(raiz, caminho, candidato, env);
  if (!veredito.ok) {
    for (const m of veredito.motivos) console.error(`REPROVADO em ${m}`);
    console.error(`Texto reprovado: ${caminho} não foi alterado.`);
    return 1;
  }
  writeFileSync(join(raiz, caminho), candidato);
  log(`${caminho}: texto aceito pelos verificadores e gravado.`);
  return 0;
}

function lerArgs(argv) {
  const pega = (n) => {
    const i = argv.indexOf(n);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return { alvo: pega("--alvo"), tarefa: pega("--tarefa") };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await escrever(lerArgs(process.argv.slice(2)));
  } catch (e) {
    if (!(e instanceof ErroSaida)) throw e;
    console.error(`ERRO: ${e.message}`);
    process.exitCode = e.codigo;
  }
}
