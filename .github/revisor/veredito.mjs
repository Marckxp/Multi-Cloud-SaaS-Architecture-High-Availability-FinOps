#!/usr/bin/env node
// Junta as regras determinísticas e a revisão semântica num veredito e o publica como o check
// "revisao", que o ruleset da main exige.
//   success          aprovado (ou PR que não é de agente: fica com a revisão humana)
//   failure          reprovado: o job também falha, para o CI Fixer do Jules refazer o PR
//   action_required  falha do próprio revisor (token, limite, saída inválida) ou tentativas
//                    esgotadas: bloqueia o merge, tira o merge automático e chama uma pessoa,
//                    sem fazer o agente "consertar" o que não é erro dele
//
// Ambiente: GH_TOKEN, GH_REPO, PR, HEAD_SHA, EH_AGENTE e o outcome de cada etapa: REGRAS,
// SONAR (success = gate aprovado, failure = gate reprovado, outro = falha da consulta), CLAUDE.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const MAX_TENTATIVAS = 3;
const MARCADOR = "<!-- revisor:reprovado -->";
const { GH_REPO, PR, HEAD_SHA, EH_AGENTE, REGRAS, SONAR, CLAUDE } = process.env;
// NOSONAR(S4036): gh vem do PATH do runner do GitHub ou da máquina do mantenedor; caminho absoluto quebraria entre Linux e Windows.
const gh = (...a) => execFileSync("gh", a, { encoding: "utf8" }); // NOSONAR

function publicar(conclusao, titulo, resumo) {
  const corpo = { name: "revisao", head_sha: HEAD_SHA, status: "completed", conclusion: conclusao, output: { title: titulo, summary: resumo.slice(0, 65000) } };
  writeFileSync("check.json", JSON.stringify(corpo));
  gh("api", `repos/${GH_REPO}/check-runs`, "--method", "POST", "--input", "check.json");
  console.log(`revisao: ${conclusao}: ${titulo}\n\n${resumo}`);
}

function comentar(texto) {
  writeFileSync("comentario.md", texto);
  gh("pr", "comment", PR, "--repo", GH_REPO, "--body-file", "comentario.md");
}

function chamarPessoa(titulo, resumo) {
  try { gh("pr", "merge", PR, "--repo", GH_REPO, "--disable-auto"); } catch { /* o merge automático pode não estar ligado */ }
  gh("label", "create", "precisa-humano", "--repo", GH_REPO, "--color", "D93F0B", "--description", "O revisor automático parou; precisa de uma pessoa", "--force");
  gh("pr", "edit", PR, "--repo", GH_REPO, "--add-label", "precisa-humano");
  comentar(`## Revisor: ${titulo}\n\n${resumo}\n\nO merge automático foi desligado. **Agente: não altere o PR por causa desta mensagem.** Uma pessoa vai decidir.`);
  publicar("action_required", titulo, resumo);
}

if (EH_AGENTE !== "true") {
  publicar("success", "PR humano: sem revisão automática", "Este PR não vem de um agente; a revisão é de quem fizer o merge.");
  process.exit(0);
}

const regras = existsSync("regras.md") ? readFileSync("regras.md", "utf8") : "";
const anteriores = JSON.parse(gh("pr", "view", PR, "--repo", GH_REPO, "--json", "comments"))
  .comments.filter((c) => c.body.includes(MARCADOR)).length;

// sonar.md é escrito por sonar.mjs: quality gate do SonarQube Cloud e achados novos do PR.
const sonar = existsSync("sonar.md") ? readFileSync("sonar.md", "utf8") : "";

let motivos = null;
if (REGRAS !== "success") {
  motivos = regras || "As regras determinísticas falharam sem relatório; veja o log do job.";
} else if (SONAR !== "success" && SONAR !== "failure") {
  chamarPessoa("falha na consulta ao SonarQube Cloud",
    `O quality gate do PR não pôde ser lido (resultado: \`${SONAR || "não rodou"}\`). ${sonar}Confira o secret \`SONAR_TOKEN\` e se a análise do Sonar terminou, e rode o job de novo.`);
  process.exit(0);
} else if (CLAUDE !== "success" || !existsSync("revisao.json")) {
  chamarPessoa("falha do revisor semântico",
    `A revisão semântica não terminou (resultado: \`${CLAUDE || "não rodou"}\`). Confira o secret \`CLAUDE_CODE_OAUTH_TOKEN\` e os limites da assinatura, e rode o job de novo. As regras determinísticas passaram.`);
  process.exit(0);
} else {
  let r;
  try {
    r = JSON.parse(readFileSync("revisao.json", "utf8"));
    if (!["aprovado", "reprovado"].includes(r.veredito)) throw new Error(`veredito "${r.veredito}"`);
  } catch (e) {
    chamarPessoa("saída inválida do revisor semântico", `\`revisao.json\` não pôde ser lido: ${e.message}.`);
    process.exit(0);
  }
  const obs = (r.observacoes ?? []).map((o) => "- " + o).join("\n");
  const blocoObs = obs ? "\nObservações (não bloqueiam):\n" + obs + "\n" : "";
  if (r.veredito === "aprovado" && SONAR === "success") {
    publicar("success", "aprovado", `${regras}\n${sonar}\n### Revisão semântica: aprovado\n${blocoObs}`);
    process.exit(0);
  }
  const partes = [];
  if (SONAR === "failure") partes.push(sonar);
  if (r.veredito === "reprovado") {
    const local = (m) => (m.linha ? `${m.arquivo}:${m.linha}` : m.arquivo);
    const lista = (r.motivos ?? []).map((m) => `- \`${local(m)}\` (critério ${m.criterio}): ${m.problema} **Corrija:** ${m.correcao}`).join("\n");
    partes.push(`### Revisão semântica: reprovado\n\n${lista || "- (o revisor reprovou sem listar motivos)"}`);
  }
  motivos = partes.join("\n\n");
}

if (anteriores + 1 >= MAX_TENTATIVAS) {
  chamarPessoa(`reprovado ${MAX_TENTATIVAS} vezes`, `${motivos}\n\nLimite de ${MAX_TENTATIVAS} tentativas atingido.`);
  process.exit(0);
}
comentar(`${MARCADOR}\n## Revisor: reprovado (tentativa ${anteriores + 1} de ${MAX_TENTATIVAS})\n\n${motivos}\n\nRefaça seguindo o \`AGENTS.md\` e só o que está listado acima.`);
publicar("failure", `reprovado (tentativa ${anteriores + 1} de ${MAX_TENTATIVAS})`, motivos);
process.exit(1);
