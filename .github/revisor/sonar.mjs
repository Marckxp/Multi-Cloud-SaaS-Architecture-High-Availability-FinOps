#!/usr/bin/env node
// Lê no SonarQube Cloud o quality gate da análise do commit atual do PR e, se reprovado, os
// achados abertos. Escreve sonar.md e a saída "resultado" (success, failure ou erro) para o
// veredito. Sai sempre com 0: quem decide é o veredito.mjs.
//
// Ambiente: SONAR_TOKEN, SONAR_PROJETO, PR, HEAD_SHA, GITHUB_OUTPUT; opcional SONAR_ESPERA_S (600).

import { appendFileSync, writeFileSync } from "node:fs";
import { setTimeout as esperar } from "node:timers/promises";

const { SONAR_TOKEN, SONAR_PROJETO, PR, HEAD_SHA, GITHUB_OUTPUT } = process.env;
const API = "https://sonarcloud.io/api";
const limite = Date.now() + Number(process.env.SONAR_ESPERA_S ?? 600) * 1000;

// Sem process.exit: no Windows ele pode abortar com um fetch ainda fechando (libuv).
class Fim extends Error {}
function terminar(resultado, texto) {
  writeFileSync("sonar.md", texto);
  if (GITHUB_OUTPUT) appendFileSync(GITHUB_OUTPUT, `resultado=${resultado}\n`);
  console.log(`sonar: ${resultado}\n${texto}`);
  throw new Fim();
}

async function api(caminho) {
  const r = await fetch(`${API}/${caminho}`, { headers: { Authorization: `Bearer ${SONAR_TOKEN}` } });
  if (!r.ok) throw new Error(`${caminho.split("?")[0]}: HTTP ${r.status}`);
  return r.json();
}

try {
  if (!SONAR_TOKEN) terminar("erro", "Secret `SONAR_TOKEN` ausente. ");
  // A análise do Sonar é assíncrona: espera a do commit atual do PR, consultando a cada 20 s.
  const aguardarAnalise = async () => {
    const lista = await api(`project_pull_requests/list?project=${encodeURIComponent(SONAR_PROJETO)}`);
    const atual = lista.pullRequests.find((p) => p.key === String(PR));
    if (atual?.commit?.sha === HEAD_SHA && atual.status?.qualityGateStatus) return atual;
    if (Date.now() > limite) terminar("erro", `A análise do Sonar do commit ${HEAD_SHA.slice(0, 7)} não terminou a tempo. `);
    await esperar(20000);
    return aguardarAnalise();
  };
  const pr = await aguardarAnalise();

  const painel = `https://sonarcloud.io/summary/new_code?id=${encodeURIComponent(SONAR_PROJETO)}&pullRequest=${PR}`;
  if (pr.status.qualityGateStatus === "OK") terminar("success", `### SonarQube Cloud: quality gate aprovado\n\n[Painel](${painel})\n`);

  const gate = await api(`qualitygates/project_status?projectKey=${encodeURIComponent(SONAR_PROJETO)}&pullRequest=${PR}`);
  const condicoes = gate.projectStatus.conditions
    .filter((c) => c.status === "ERROR")
    .map((c) => `- \`${c.metricKey}\`: ${c.actualValue} (limite ${c.comparator} ${c.errorThreshold})`);
  const achados = await api(`issues/search?componentKeys=${encodeURIComponent(SONAR_PROJETO)}&pullRequest=${PR}&resolved=false&ps=100`);
  const linhas = achados.issues.map((i) => {
    const arquivo = i.component.split(":").slice(1).join(":");
    const onde = i.line ? `${arquivo}:${i.line}` : arquivo;
    return `- \`${onde}\` ${i.rule} (${i.severity}): ${i.message}`;
  });
  terminar("failure", [
    "### SonarQube Cloud: quality gate reprovado", "",
    "Condições que falharam:", ...condicoes, "",
    "Achados abertos no PR (corrija cada um no código; não desative a regra):", ...(linhas.length ? linhas : ["- (nenhum achado listado; veja o painel)"]), "",
    `[Painel](${painel})`, "",
  ].join("\n"));
} catch (e) {
  if (!(e instanceof Fim)) {
    try { terminar("erro", `Consulta ao SonarQube Cloud falhou: ${e.message}. `); } catch { /* Fim */ }
  }
}
