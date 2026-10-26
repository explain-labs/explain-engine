// Systolic coronary inflow resistance.
//
// The coronary bed COR was squeezed only by its own time-varying elastance, which left 61 % of the
// coronary inflow (term_neonate_72h) in diastole; left-coronary inflow is mostly diastolic because the
// contracting myocardium compresses the intramural vessels and raises the coronary resistance.
// Heart.cor_r_systolic_factor (c) multiplies the inflow resistance AA_COR by (1 + c·vaf). Per scenario
// this tool:
//   1. measures the current mean coronary inflow (AA_COR),
//   2. sets Heart.cor_r_systolic_factor = C,
//   3. scales AA_COR.r_for/r_back until the mean coronary inflow is back at the measured value,
//   4. checks that the coronary bed never empties (minimum COR volume > 0),
// and with --write patches only those values in the JSON (the rest of the file is left byte-identical).
// (An intramyocardial-pressure variant was tried first: with COR's compliance it squeezed the bed empty
// in systole, so it was dropped.)
//
//   node scripts/_fix_coronary_systolic_resistance.mjs <scenario> [...] [--c 5] [--write]
import fs from "node:fs";
import { createEngine } from "./_harness.mjs";

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? Number(argv[i + 1]) : d; };
const WRITE = argv.includes("--write");
const C = opt("--c", 5);
const valued = new Set(["--c"]);
const names = argv.filter((a, i) => !a.startsWith("--") && !valued.has(argv[i - 1]));
const out = (...a) => process.stderr.write(a.join(" ") + "\n");
const WARM = 20, MEASURE = 20;

const eng = await createEngine();

// mean AA_COR flow (mL/min), diastolic share of the inflow volume and the minimum COR volume
function measure(def, apply) {
  const m = eng.build(structuredClone(def));
  if (apply) apply(m.models);
  eng.calc(WARM);
  const dt = m.modeling_stepsize, M = m.models;
  let sum = 0, dia = 0, n = 0, vmin = Infinity;
  for (let i = 0; i < MEASURE / dt; i++) {
    eng.calc(dt);
    const q = M.AA_COR.flow;
    sum += q; n++;
    if (M.Heart.cardiac_cycle_state !== 1) dia += q;
    vmin = Math.min(vmin, M.COR.vol);
  }
  return { q: (sum / n) * 60000, dia: dia / sum, vmin };
}

// the [start, end) span of the object `"name": { … }` inside model_definition whose own model_type is
// set (the diagram_definition has components with the same names)
function findModelBlock(src, name) {
  let from = src.indexOf('"model_definition"');
  for (;;) {
    const start = src.indexOf(`"${name}": {`, from);
    if (start < 0) throw new Error(`${name} not found`);
    let depth = 0, end = start;
    for (let i = src.indexOf("{", start); i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
    }
    if (/\n\s*"model_type": "/.test(src.slice(start, end))) return [start, end];
    from = end;
  }
}

// set (or insert after pc_extra_volume) a scalar key in a model's definition block, format-preserving
function setInBlock(src, name, key, value) {
  const [start, end] = findModelBlock(src, name);
  let block = src.slice(start, end);
  const re = new RegExp(`("${key}": )-?[0-9.eE+-]+`);
  if (re.test(block)) block = block.replace(re, `$1${value}`);
  else {
    const anchor = block.match(/\n(\s*)"pc_extra_volume": [^\n]*,\n/);
    if (!anchor) throw new Error(`${name}.${key}: no place to insert`);
    block = block.replace(anchor[0], `${anchor[0]}${anchor[1]}"${key}": ${value},\n`);
  }
  return src.slice(0, start) + block + src.slice(end);
}

for (const name of names) {
  const file = new URL(`../model_definitions/${name}.json`, import.meta.url);
  const src = fs.readFileSync(file, "utf8");
  const def = JSON.parse(src).model_definition;
  const aa_cor = def.models.Mob.components.AA_COR;
  const base = measure(def);
  let f = 1.0, res = null;
  for (let it = 0; it < 6; it++) {
    res = measure(def, (M) => {
      M.Heart.cor_r_systolic_factor = C;
      M.AA_COR.r_for = aa_cor.r_for * f;
      M.AA_COR.r_back = aa_cor.r_back * f;
    });
    if (Math.abs(res.q / base.q - 1) < 0.002) break;
    f *= res.q / base.q; // flow ~ 1/R
  }
  const r_for = +(aa_cor.r_for * f).toFixed(1), r_back = +(aa_cor.r_back * f).toFixed(1);
  out(`${name}: coronary inflow ${base.q.toFixed(2)} mL/min, diastolic ${(100 * base.dia).toFixed(0)} % -> ` +
    `${res.q.toFixed(2)} mL/min, diastolic ${(100 * res.dia).toFixed(0)} %; AA_COR r ${+aa_cor.r_for.toFixed(1)} -> ${r_for} ` +
    `(x${f.toFixed(3)}); COR min volume ${(base.vmin * 1e6).toFixed(0)} -> ${(res.vmin * 1e6).toFixed(0)} µL`);
  if (!(res.vmin > 0)) { out(`${name}: COR empties, not written`); continue; }
  if (!WRITE) continue;
  let patched = setInBlock(src, "Heart", "cor_r_systolic_factor", C);
  patched = setInBlock(patched, "AA_COR", "r_for", r_for);
  patched = setInBlock(patched, "AA_COR", "r_back", r_back);
  const expected = JSON.parse(src);
  const md = expected.model_definition.models;
  md.Heart.cor_r_systolic_factor = C;
  md.Mob.components.AA_COR.r_for = r_for;
  md.Mob.components.AA_COR.r_back = r_back;
  // the inserted key changes the Heart key order; compare canonically
  const canon = (o) => JSON.stringify(o, (k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v));
  if (canon(JSON.parse(patched)) !== canon(expected)) throw new Error(`${name}: patch changed more than intended`);
  fs.writeFileSync(file, patched);
  out(`${name}: written`);
}
