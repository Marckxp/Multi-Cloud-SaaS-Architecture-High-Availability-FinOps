#!/usr/bin/env node
// Valida fontes/estado.json contra fontes/estado.schema.json, sem dependências.
// Cobre o subconjunto do JSON Schema usado no schema: type, required, properties,
// additionalProperties:false, items, enum, pattern, minimum, maximum e $ref para #/$defs.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const schema = JSON.parse(readFileSync(join(raiz, "fontes", "estado.schema.json"), "utf8"));
const dados = JSON.parse(readFileSync(join(raiz, "fontes", "estado.json"), "utf8"));
const erros = [];

const tipoDe = (v) => (Array.isArray(v) ? "array" : v === null ? "null" : Number.isInteger(v) ? "integer" : typeof v);

function validar(s, v, caminho) {
  if (s.$ref) s = s.$ref.split("/").slice(1).reduce((o, k) => o[k], schema);
  if (s.type) {
    const t = tipoDe(v);
    const ok = s.type === t || (s.type === "number" && t === "integer");
    if (!ok) return erros.push(`${caminho}: esperado ${s.type}, veio ${t}`);
  }
  if (s.enum && !s.enum.includes(v)) erros.push(`${caminho}: "${v}" fora de ${s.enum.join(", ")}`);
  if (s.pattern && !new RegExp(s.pattern).test(v)) erros.push(`${caminho}: "${v}" não casa com ${s.pattern}`);
  if (s.minimum !== undefined && v < s.minimum) erros.push(`${caminho}: menor que ${s.minimum}`);
  if (s.maximum !== undefined && v > s.maximum) erros.push(`${caminho}: maior que ${s.maximum}`);
  if (tipoDe(v) === "object") {
    for (const r of s.required ?? []) if (!(r in v)) erros.push(`${caminho}: falta "${r}"`);
    for (const [k, filho] of Object.entries(v)) {
      if (s.properties?.[k]) validar(s.properties[k], filho, `${caminho}.${k}`);
      else if (s.additionalProperties === false) erros.push(`${caminho}: campo desconhecido "${k}"`);
    }
  }
  if (tipoDe(v) === "array" && s.items) v.forEach((x, i) => validar(s.items, x, `${caminho}[${i}]`));
}

validar(schema, dados, "estado");

const ids = dados.arquitetura?.componentes?.map((c) => c.id) ?? [];
for (const c of dados.arquitetura?.componentes ?? [])
  for (const d of c.conectaCom ?? []) if (!ids.includes(d)) erros.push(`componente ${c.id}: conectaCom "${d}" não existe`);

if (erros.length) {
  console.error(`fontes/estado.json inválido (${erros.length}):`);
  for (const e of erros) console.error(`  ${e}`);
  process.exit(1);
}
console.log("fontes/estado.json válido.");
