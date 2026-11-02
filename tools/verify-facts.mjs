#!/usr/bin/env node
// Validates facts/state.json against facts/state.schema.json, with no dependencies.
// Covers the JSON Schema subset used in the schema: type, required, properties,
// additionalProperties:false, items, enum, pattern, minimum, maximum and $ref to #/$defs.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schema = JSON.parse(readFileSync(join(root, "facts", "state.schema.json"), "utf8"));
const data = JSON.parse(readFileSync(join(root, "facts", "state.json"), "utf8"));
const errors = [];

const typeOf = (v) => (Array.isArray(v) ? "array" : v === null ? "null" : Number.isInteger(v) ? "integer" : typeof v);

function validate(s, v, path) {
  if (s.$ref) s = s.$ref.split("/").slice(1).reduce((o, k) => o[k], schema);
  if (s.type) {
    const t = typeOf(v);
    const ok = s.type === t || (s.type === "number" && t === "integer");
    if (!ok) return errors.push(`${path}: expected ${s.type}, got ${t}`);
  }
  if (s.enum && !s.enum.includes(v)) errors.push(`${path}: "${v}" is not one of ${s.enum.join(", ")}`);
  if (s.pattern && !new RegExp(s.pattern).test(v)) errors.push(`${path}: "${v}" does not match ${s.pattern}`);
  if (s.minimum !== undefined && v < s.minimum) errors.push(`${path}: below ${s.minimum}`);
  if (s.maximum !== undefined && v > s.maximum) errors.push(`${path}: above ${s.maximum}`);
  if (typeOf(v) === "object") {
    for (const r of s.required ?? []) if (!(r in v)) errors.push(`${path}: missing "${r}"`);
    for (const [k, child] of Object.entries(v)) {
      if (s.properties?.[k]) validate(s.properties[k], child, `${path}.${k}`);
      else if (s.additionalProperties === false) errors.push(`${path}: unknown field "${k}"`);
    }
  }
  if (typeOf(v) === "array" && s.items) v.forEach((x, i) => validate(s.items, x, `${path}[${i}]`));
}

validate(schema, data, "state");

const ids = data.architecture?.components?.map((c) => c.id) ?? [];
for (const c of data.architecture?.components ?? [])
  for (const d of c.connectsTo ?? []) if (!ids.includes(d)) errors.push(`component ${c.id}: connectsTo "${d}" does not exist`);

// "featured" repeats entries of the full lists: a name that does not exist would show a claim the facts do not have.
const featuredSources = {
  measurements: (data.finops?.measurements ?? []).map((m) => m.name),
  practices: data.quality?.practices ?? [],
  process: data.process ?? [],
};
for (const [key, source] of Object.entries(featuredSources))
  for (const entry of data.featured?.[key] ?? [])
    if (!source.includes(entry)) errors.push(`featured.${key}: "${entry}" is not in the full list`);

if (errors.length) {
  console.error(`facts/state.json is invalid (${errors.length}):`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log("facts/state.json is valid.");
