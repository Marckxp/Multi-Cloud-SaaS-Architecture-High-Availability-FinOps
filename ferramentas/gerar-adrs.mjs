#!/usr/bin/env node
// Gera docs/adr/ a partir de fontes/decisoes/, sem IA e sem rede: cada decisão vira o ADR de mesmo nome.
// docs/adr/ é arquivo gerado e não se edita à mão; o CI roda --verificar.
//
//   node ferramentas/gerar-adrs.mjs              reescreve docs/adr/
//   node ferramentas/gerar-adrs.mjs --verificar  falha se docs/adr/ estiver desatualizado (CI)
//   --fontes <pasta> --destino <pasta>           outras pastas (testes); o padrão é o repositório
//
// Códigos de saída: 0 em dia, 1 decisão inválida, ADR desatualizado ou sobrando.
// Um ADR sem decisão correspondente nunca é apagado pelo script (regra R2): ele é apontado.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opcao = (nome, padrao) => {
  const i = args.indexOf(nome);
  return i >= 0 && args[i + 1] ? args[i + 1] : padrao;
};
const pastaFontes = opcao("--fontes", join(raiz, "fontes", "decisoes"));
const pastaDestino = opcao("--destino", join(raiz, "docs", "adr"));
const verificar = args.includes("--verificar");

const listar = (pasta) => (existsSync(pasta) ? readdirSync(pasta).filter((n) => n.endsWith(".md")).sort() : []);
const lf = (texto) => texto.replaceAll("\r\n", "\n");
const problemas = [];

// A decisão tem de ter o formato que o revisor exige do ADR (R3), para o erro aparecer na fonte.
function validar(nome, texto) {
  if (!/^\d{4}-.+\.md$/.test(nome)) problemas.push(`${nome}: o nome deve ser NNNN-assunto.md.`);
  if (!/^# \d{4} · .+/m.test(texto)) problemas.push(`${nome}: o título deve ser "# NNNN · Título".`);
  for (const secao of ["Estado", "Contexto", "Decisão"])
    if (!new RegExp(String.raw`^- \*\*${secao}:\*\*`, "m").test(texto)) problemas.push(`${nome}: falta a seção "- **${secao}:**".`);
}

const decisoes = new Map();
for (const nome of listar(pastaFontes)) {
  const texto = lf(readFileSync(join(pastaFontes, nome), "utf8"));
  validar(nome, texto);
  decisoes.set(nome, texto);
}

const atuais = new Set(listar(pastaDestino));
const sobrando = [...atuais].filter((n) => !decisoes.has(n));
const desatualizados = [];
for (const [nome, texto] of decisoes) {
  const caminho = join(pastaDestino, nome);
  if (!atuais.has(nome) || readFileSync(caminho, "utf8") !== texto) desatualizados.push(nome);
}

for (const nome of sobrando) problemas.push(`${nome}: ADR sem decisão em fontes/decisoes/ (o script não apaga; marque "Estado: substituída" na fonte).`);

if (verificar) {
  for (const nome of desatualizados) problemas.push(`${nome}: desatualizado em relação a fontes/decisoes/.`);
  if (problemas.length) {
    console.error("docs/adr/ desatualizado ou inválido: rode node ferramentas/gerar-adrs.mjs");
    for (const p of problemas) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`docs/adr/ em dia com fontes/decisoes/ (${decisoes.size} ADRs).`);
} else {
  if (problemas.length === 0 || problemas.every((p) => sobrando.some((n) => p.startsWith(`${n}:`)))) {
    mkdirSync(pastaDestino, { recursive: true });
    for (const nome of desatualizados) writeFileSync(join(pastaDestino, nome), decisoes.get(nome));
    console.log(desatualizados.length ? `docs/adr/ atualizado (${desatualizados.length} de ${decisoes.size}).` : "docs/adr/ já estava em dia.");
  }
  if (problemas.length) {
    for (const p of problemas) console.error(`  ${p}`);
    process.exit(1);
  }
}
