#!/usr/bin/env node
// Gera os blocos de dados do README a partir de fontes/estado.json, entre os marcadores
// <!-- gerado:NOME:inicio --> e <!-- gerado:NOME:fim -->. O texto fora dos marcadores é livre.
// Números e estados só entram por aqui, para que nenhum agente os escreva à mão.
//
//   node ferramentas/gerar-readme.mjs              reescreve o README
//   node ferramentas/gerar-readme.mjs --verificar  falha se o README estiver desatualizado (CI)

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const estado = JSON.parse(readFileSync(join(raiz, "fontes", "estado.json"), "utf8"));
const caminhoReadme = join(raiz, "README.md");

const rotulo = {
  publicado: "🟢 publicado", implementado: "🟢 implementado", "em-teste": "🟡 em teste", avaliado: "🔵 avaliado",
  planejado: "⚪ planejado", reserva: "🟠 reserva", legado: "⚫ legado", descartado: "✖️ descartado",
};
const camadas = {
  cliente: "Cliente", "dados-locais": "Dados no aparelho", borda: "Borda", identidade: "Identidade",
  "dados-nuvem": "Dados na nuvem", computacao: "Computação", ci: "CI", operacao: "Operação",
};
const num = (n) => n.toLocaleString("pt-BR");
const tabela = (cab, linhas) =>
  [`| ${cab.join(" | ")} |`, `|${cab.map(() => "---").join("|")}|`, ...linhas.map((l) => `| ${l.join(" | ")} |`)].join("\n");

function diagrama() {
  const c = estado.arquitetura.componentes;
  const linhas = ["```mermaid", "flowchart LR", '  usuario(["Usuário"])'];
  for (const [camada, titulo] of Object.entries(camadas)) {
    const da = c.filter((x) => x.camada === camada);
    if (!da.length) continue;
    linhas.push(`  subgraph c_${camada.replace(/-/g, "_")}["${titulo}"]`);
    for (const x of da) linhas.push(`    ${x.id.replace(/-/g, "_")}["${x.tecnologia.replace(/"/g, "'")}"]:::${x.estado.replace(/-/g, "_")}`);
    linhas.push("  end");
  }
  linhas.push("  usuario --> app_nativo & app_web");
  for (const x of c)
    for (const d of x.conectaCom ?? []) {
      const alvo = c.find((y) => y.id === d);
      const seta = alvo && ["planejado", "reserva", "avaliado"].includes(alvo.estado) ? "-.->" : "-->";
      linhas.push(`  ${x.id.replace(/-/g, "_")} ${seta} ${d.replace(/-/g, "_")}`);
    }
  linhas.push(
    "  classDef publicado fill:#1f883d,color:#fff,stroke:#116329",
    "  classDef implementado fill:#2da44e,color:#fff,stroke:#1a7f37",
    "  classDef em_teste fill:#bf8700,color:#fff,stroke:#9a6700",
    "  classDef avaliado fill:#0969da,color:#fff,stroke:#0550ae",
    "  classDef planejado fill:#f6f8fa,color:#24292f,stroke:#8c959f,stroke-dasharray:4 3",
    "  classDef reserva fill:#fb8f44,color:#fff,stroke:#bc4c00",
    "  classDef legado fill:#6e7781,color:#fff,stroke:#57606a",
    "```",
    "",
    "Linha cheia: em uso. Tracejada: reserva, avaliado ou planejado.",
  );
  return linhas.join("\n");
}

const blocos = {
  diagrama,
  componentes: () =>
    tabela(["Camada", "Tecnologia", "Papel", "Estado"],
      estado.arquitetura.componentes.map((x) => [camadas[x.camada], x.tecnologia, x.papel, rotulo[x.estado]])),
  nuvens: () =>
    estado.nuvens.map((n) =>
      [`#### ${n.provedor}`, "", `> ${n.regra}`, "",
        tabela(["Serviço", "SKU", "Região", "Papel", "Estado"],
          n.servicos.map((s) => [s.servico, s.sku ?? "—", s.regiao ?? "—", s.papel, rotulo[s.estado]]))].join("\n")).join("\n\n"),
  protecoes: () =>
    tabela(["Nuvem", "Tipo", "Proteção", "Estado", "Arquivo"],
      estado.nuvens.flatMap((n) => n.protecoes.map((p) => [n.provedor, p.tipo, p.descricao + (p.verificacao ? ` (conferido: ${p.verificacao})` : ""), p.estado, p.arquivo ? `[${p.arquivo}](${p.arquivo})` : "—"]))),
  medicoes: () =>
    [tabela(["Medição", "Valor", "Como"], estado.finops.medicoes.map((m) => [m.nome, `${num(m.valor)} ${m.unidade}`, m.como])),
      "", `Limite operacional: alerta em **${estado.finops.limiteOperacionalPercentual}%** de cada cota gratuita.`,
      ...(estado.finops.gatilhosDeReavaliacao?.length ? ["", "Gatilhos de reavaliação:", ...estado.finops.gatilhosDeReavaliacao.map((g) => `- ${g}`)] : [])].join("\n"),
  qualidade: () =>
    [tabela(["Suíte", "Ferramenta", "Alvo", "Quantidade"], estado.qualidade.suites.map((s) => [s.nome, s.ferramenta, s.alvo, num(s.quantidade)])),
      "", ...estado.qualidade.praticas.map((p) => `- ${p}`)].join("\n"),
  processo: () => estado.processo.map((p) => `- ${p}`).join("\n"),
  roteiro: () =>
    tabela(["Item", "Estado", "Condição"], estado.roteiro.map((r) => [r.item, rotulo[r.estado], r.condicao ?? "—"])),
  atualizado: () => `Fatos de ${estado.geradoEm} (pacote v${estado.versaoPacote}).`,
};

const original = readFileSync(caminhoReadme, "utf8");
const eol = original.includes("\r\n") ? "\r\n" : "\n";
let novo = original;
for (const [nome, gerar] of Object.entries(blocos)) {
  const re = new RegExp(`(<!-- gerado:${nome}:inicio -->)[\\s\\S]*?(<!-- gerado:${nome}:fim -->)`);
  if (!re.test(novo)) continue;
  novo = novo.replace(re, (_, a, b) => `${a}${eol}${gerar().replace(/\n/g, eol)}${eol}${b}`);
}

if (process.argv.includes("--verificar")) {
  if (novo !== original) {
    console.error("README.md desatualizado: rode node ferramentas/gerar-readme.mjs");
    process.exit(1);
  }
  console.log("README.md em dia com fontes/estado.json.");
} else {
  writeFileSync(caminhoReadme, novo);
  console.log(novo === original ? "README.md já estava em dia." : "README.md atualizado.");
}
