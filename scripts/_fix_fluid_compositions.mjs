// Scenario migration: correct three fluid compositions in Fluids.fluids (format-preserving).
//
//   albumin_20%     albumin 20 -> 200 g/L (20 % = 200 g/L; solutes.albumin is g/L, as in the blood), with
//                   Na 130 and its anions: albumin's own charge (~56 mEq/L at 200 g/L), the caprylate and
//                   N-acetyltryptophan stabilisers (~32 mmol/L, as unmeasured anions) and Cl 42
//   packed_cells    Hb 12 mmol/L (~19 g/dL) plus a plasma-equivalent base (Na 140, K 4.5, Cl 105,
//                   glucose 25) instead of none, so a transfusion no longer dilutes the electrolytes like
//                   free water. A fresh unit: the storage lesion (high K, low pH, lactate) is not represented
//   ringers_lactate adds lactate 28 mmol/L (Na 130, Cl 109, K 4, Ca 1.4 unchanged); the Lactate model clears
//                   it toward baseline, standing in for its hepatic metabolism
//
//   node scripts/_fix_fluid_compositions.mjs <scenario> [...] [--write]
import fs from "node:fs";

const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const names = argv.filter((a) => !a.startsWith("--"));
const NEW = {
  "albumin_20%": { albumin: 200, na: 130, cl: 42, uma: 32 },
  packed_cells: { hemoglobin: 12, na: 140, k: 4.5, cl: 105, glucose: 25 },
  ringers_lactate: { na: 130, cl: 109, ca: 1.4, k: 4, lact: 28 },
};

for (const name of names) {
  const file = new URL(`../model_definitions/${name}.json`, import.meta.url);
  const src = fs.readFileSync(file, "utf8");
  let p = src;
  const at = p.indexOf('"model_definition"');
  for (const [key, comp] of Object.entries(NEW)) {
    const re = new RegExp(`\\n(\\s*)"${key.replace("%", "%")}": \\{[^{}]*\\}(,?)`);
    const head = p.slice(0, at), tail = p.slice(at);
    const m = tail.match(re);
    if (!m) throw new Error(`${name}: ${key} not found`);
    const ind = m[1], inner = ind + "  ";
    const body = Object.entries(comp).map(([k, v]) => `${inner}"${k}": ${v}`).join(",\n");
    p = head + tail.replace(re, `\n${ind}"${key}": {\n${body}\n${ind}}${m[2]}`);
  }
  const exp = JSON.parse(src);
  Object.assign(exp.model_definition.models.Fluids.fluids, NEW);
  const canon = (o) => JSON.stringify(o, (k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v));
  if (canon(JSON.parse(p)) !== canon(exp)) throw new Error(`${name}: patch changed more than the three fluids`);
  process.stderr.write(`${name}: albumin_20%, packed_cells, ringers_lactate updated\n`);
  if (WRITE) fs.writeFileSync(file, p);
}
