#!/usr/bin/env node
// Regras determinísticas para um PR do Jules (ou de qualquer agente) que atualiza a vitrine.
// Complementa o CI de vazamento: aqui se confere o que o agente pode mudar e se o texto novo
// tem origem nas fontes. Sai com 1 e lista os motivos quando alguma regra falha.
//
//   node ferramentas/revisar-pr-jules.mjs --base <sha> --head <sha> [--saida motivos.md]

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : null;
};
const base = arg("--base");
const head = arg("--head") ?? "HEAD";
const saida = arg("--saida");
if (!base) {
  console.error("Uso: revisar-pr-jules.mjs --base <sha> --head <sha> [--saida arquivo]");
  process.exit(2);
}

// NOSONAR(S4036): git vem do PATH do runner do GitHub ou da máquina do mantenedor; caminho absoluto quebraria entre Linux e Windows.
const git = (...a) => execFileSync("git", a, { cwd: raiz, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }); // NOSONAR
const mostrar = (caminho) => {
  try {
    return git("show", `${head}:${caminho}`);
  } catch {
    return null;
  }
};
const motivos = [];

// R1: só caminhos de saída da tarefa padrão.
const permitido = /^(README\.md|docs\/adr\/[^/]+\.md|docs\/roteiro\.md|finops\/.+)$/;
const mudancas = git("diff", "--name-status", "--no-renames", base, head)
  .split("\n").filter(Boolean).map((l) => l.split("\t"));
for (const [status, caminho] of mudancas) {
  if (!permitido.test(caminho)) motivos.push(`R1 caminho fora da tarefa: \`${caminho}\` (só README.md, docs/adr/, docs/roteiro.md e finops/).`);
  // R2: ADR nunca é apagado; uma decisão retirada vira "Estado: substituída".
  if (status === "D" && caminho.startsWith("docs/adr/")) motivos.push(`R2 ADR apagado: \`${caminho}\`. Marque "Estado: substituída" em vez de apagar.`);
}

// R3: cada ADR corresponde a uma decisão das fontes e tem as seções obrigatórias.
const decisoes = new Set(git("ls-tree", "--name-only", `${head}:fontes/decisoes`).split("\n").filter(Boolean));
for (const [status, caminho] of mudancas) {
  if (status === "D" || !/^docs\/adr\/[^/]+\.md$/.test(caminho)) continue;
  const nome = caminho.slice("docs/adr/".length);
  if (!decisoes.has(nome)) motivos.push(`R3 \`${caminho}\` não corresponde a nenhum arquivo de fontes/decisoes/.`);
  const texto = mostrar(caminho) ?? "";
  if (!/^# \d{4} · .+/m.test(texto)) motivos.push(`R3 \`${caminho}\`: o título deve ser "# NNNN · Título".`);
  for (const secao of ["Estado", "Contexto", "Decisão"])
    if (!new RegExp(String.raw`^- \*\*${secao}:\*\*`, "m").test(texto)) motivos.push(`R3 \`${caminho}\`: falta a seção "- **${secao}:**".`);
}

// R4: todos os marcadores de blocos gerados continuam no README.
const blocos = ["atualizado", "diagrama", "componentes", "nuvens", "protecoes", "medicoes", "qualidade", "processo", "roteiro"];
const readme = mostrar("README.md") ?? "";
for (const b of blocos)
  if (!readme.includes(`<!-- gerado:${b}:inicio -->`) || !readme.includes(`<!-- gerado:${b}:fim -->`))
    motivos.push(`R4 README sem os marcadores do bloco \`${b}\`.`);

// Linhas adicionadas fora dos blocos gerados, com o número da linha no arquivo novo.
const dentroDeBloco = (() => {
  const linhas = readme.split(/\r?\n/);
  const dentro = new Set();
  let aberto = false;
  linhas.forEach((l, i) => {
    if (/<!-- gerado:\w+:inicio -->/.test(l)) aberto = true;
    if (aberto) dentro.add(i + 1);
    if (/<!-- gerado:\w+:fim -->/.test(l)) aberto = false;
  });
  return dentro;
})();
const adicionadas = [];
let arquivo = null;
let n = 0;
for (const l of git("diff", "--unified=0", "--no-color", base, head, "--", "README.md", "docs", "finops").split("\n")) {
  if (l.startsWith("+++ ")) { arquivo = l.replace(/^\+\+\+ (b\/)?/, ""); continue; }
  const h = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(l);
  if (h) { n = Number(h[1]); continue; }
  if (l.startsWith("+")) {
    if (!(arquivo === "README.md" && dentroDeBloco.has(n))) adicionadas.push({ arquivo, n, texto: l.slice(1) });
    n++;
  }
}

// R5: todo número do texto novo existe nas fontes ou em finops/ (nada de número inventado).
const corpus = [
  ...git("ls-tree", "-r", "--name-only", head, "fontes", "finops").split("\n").filter(Boolean),
].map((c) => mostrar(c) ?? "").join("\n");
// "7.800" é milhar (pt-BR), "12,8" e "4.08" são decimais; cada forma vira um valor normalizado.
const formas = (t) => {
  const s = new Set();
  if (/^\d{1,3}(?:\.\d{3})+$/.test(t)) s.add(t.replaceAll(".", ""));
  else if (/^\d{1,3}(?:,\d{3})+$/.test(t)) s.add(t.replaceAll(",", ""));
  else s.add(t.replace(",", "."));
  return [...s].map((x) => String(Number(x))).filter((x) => x !== "NaN");
};
const conhecidos = new Set((corpus.match(/\d+(?:[.,]\d+)*/g) ?? []).flatMap(formas));
for (const a of adicionadas) {
  const limpo = a.texto
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\]\([^)]*\)/g, "]")
    .replace(/#\d+/g, "")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "")
    .replace(/^#+ \d{4} · /, "")
    .replace(/\bADR \d{4}\b/g, "");
  for (const t of limpo.match(/\d+(?:[.,]\d+)*/g) ?? []) {
    const fs = formas(t);
    if (/^\d+$/.test(t) && Number(t) <= 10) continue; // enumerações e contagens pequenas
    if (!fs.some((f) => conhecidos.has(f))) motivos.push(`R5 ${a.arquivo}:${a.n}: o número "${t}" não aparece nas fontes nem em finops/.`);
  }
}

// R6: nada de afirmação de capacidade sem medição nas fontes.
const capacidade = /\bRPS\b|requisi[cç][oõ]es por segundo|\bSLA de\b|99[.,]9+\s*%|usu[aá]rios simult[aâ]neos|milh[oõ]es de usu[aá]rios/i;
for (const a of adicionadas)
  if (capacidade.test(a.texto)) motivos.push(`R6 ${a.arquivo}:${a.n}: afirmação de capacidade sem medição nas fontes.`);

const listaDeMotivos = motivos.map((m) => "- " + m).join("\n");
const relatorio = motivos.length
  ? `### Regras determinísticas: reprovado\n\n${listaDeMotivos}\n`
  : "### Regras determinísticas: aprovado\n\nNenhuma regra violada.\n";
if (saida) writeFileSync(saida, relatorio);
console.log(relatorio);
process.exit(motivos.length ? 1 : 0);
