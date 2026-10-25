#!/usr/bin/env node
// Bloqueia identificadores e termos do projeto de origem antes que cheguem a um branch público.
//
// Uso:
//   node ferramentas/verificar-vazamento.mjs                 arquivos do repositório (versionados e novos não ignorados)
//   node ferramentas/verificar-vazamento.mjs --intervalo A..B linhas adicionadas e mensagens dos commits de A..B
//   --exigir-lista   falha se a lista de termos proibidos não estiver disponível (CI)
//
// Termos proibidos (nunca versionados): variável VITRINE_PROIBIDOS (um por linha), ou o arquivo
// em VITRINE_PROIBIDOS_ARQUIVO, ou ~/.vitrine/proibidos.txt. A saída nunca mostra o termo nem a
// linha inteira, porque os logs do CI de um repositório público são públicos.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const exigirLista = args.includes("--exigir-lista");
const iIntervalo = args.indexOf("--intervalo");
const intervalo = iIntervalo >= 0 ? args[iIntervalo + 1] : null;

const config = JSON.parse(readFileSync(join(raiz, "ferramentas", "padroes-genericos.json"), "utf8"));
const padroes = config.padroes.map((p) => ({ ...p, re: new RegExp(p.regex, `g${p.flags ?? ""}`) }));
const permitidos = config.permitidos.map((p) => ({ padrao: p.padrao, re: new RegExp(p.regex, p.flags ?? "") }));
const ignorar = new Set(config.ignorar);

const normalizar = (s) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function carregarProibidos() {
  let texto = process.env.VITRINE_PROIBIDOS;
  if (!texto) {
    const arquivo = process.env.VITRINE_PROIBIDOS_ARQUIVO || join(homedir(), ".vitrine", "proibidos.txt");
    if (existsSync(arquivo)) texto = readFileSync(arquivo, "utf8");
  }
  if (!texto) return null;
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map(normalizar);
}

const proibidos = carregarProibidos();
if (!proibidos) {
  const msg = "Lista de termos proibidos indisponível (VITRINE_PROIBIDOS ou ~/.vitrine/proibidos.txt).";
  if (exigirLista) {
    console.error(`ERRO: ${msg}`);
    process.exit(2);
  }
  console.warn(`AVISO: ${msg} Só os padrões genéricos foram verificados.`);
}

const git = (...a) => execFileSync("git", a, { cwd: raiz, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
const mascarar = (v) => (v.length <= 4 ? "****" : `${v.slice(0, 3)}…(${v.length})`);
const achados = [];

function verificarLinha(origem, numero, linha) {
  for (const p of padroes) {
    p.re.lastIndex = 0;
    for (const m of linha.matchAll(p.re)) {
      const valor = m[0];
      if (permitidos.some((x) => x.padrao === p.id && x.re.test(valor))) continue;
      achados.push(`${origem}:${numero}  ${p.id} (${p.descricao}): ${mascarar(valor)}`);
    }
  }
  if (proibidos) {
    const n = normalizar(linha);
    proibidos.forEach((termo, i) => {
      if (n.includes(termo)) achados.push(`${origem}:${numero}  termo proibido nº ${i + 1}`);
    });
  }
}

function verificarTexto(origem, texto) {
  if (texto.includes("\0")) return;
  texto.split(/\r?\n/).forEach((linha, i) => verificarLinha(origem, i + 1, linha));
}

if (intervalo) {
  const commits = git("rev-list", "--reverse", intervalo).split("\n").filter(Boolean);
  for (const c of commits) {
    const curto = c.slice(0, 7);
    verificarTexto(`${curto} (mensagem)`, git("log", "-1", "--format=%B", c));
    let arquivo = "?";
    let linhaNova = 0;
    for (const l of git("show", "--format=", "--unified=0", "--no-color", c).split("\n")) {
      if (l.startsWith("+++ ")) {
        arquivo = l.replace(/^\+\+\+ (b\/)?/, "");
        continue;
      }
      const h = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(l);
      if (h) {
        linhaNova = Number(h[1]);
        continue;
      }
      if (l.startsWith("+") && !ignorar.has(arquivo)) {
        verificarLinha(`${curto} ${arquivo}`, linhaNova, l.slice(1));
        linhaNova++;
      }
    }
  }
} else {
  const arquivos = git("ls-files", "-co", "--exclude-standard").split("\n").filter(Boolean);
  for (const a of arquivos) {
    if (ignorar.has(a) || !existsSync(join(raiz, a))) continue;
    verificarTexto(a, readFileSync(join(raiz, a), "utf8"));
  }
}

if (achados.length) {
  console.error(`${achados.length} achado(s) de vazamento:`);
  for (const a of achados) console.error(`  ${a}`);
  process.exit(1);
}
console.log(`Sem vazamento${proibidos ? ` (${proibidos.length} termos proibidos + padrões genéricos)` : " (só padrões genéricos)"}.`);
