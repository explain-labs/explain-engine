// One-off re-balance after hemoglobin became a blood buffer (BloodComposition, this PR).
//
// The extra buffer shifts term_neonate_72h's resting acid-base slightly (pH 7.368 -> 7.380). This script
// moves the unmeasured anions (uma, the residual acid-base lever) until the arterial pH is back at
// the scenario's own value, then patches ONLY the uma values in the JSON (every blood compartment
// stores its own solutes) and prints the arterial gas before and after.
//
//   node scripts/_fix_term_acidbase.mjs [scenario=term_neonate_72h] [--ph 7.368] [--write]
import fs from "node:fs";
import { createEngine } from "./_harness.mjs";
import { measureVitals } from "./_probe.mjs";

const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const name = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--ph") ?? "term_neonate_72h";
const PH = argv.includes("--ph") ? Number(argv[argv.indexOf("--ph") + 1]) : 7.368;
const file = new URL(`../model_definitions/${name}.json`, import.meta.url);
const raw = fs.readFileSync(file, "utf8");
const json = JSON.parse(raw);
const out = (s) => process.stderr.write(s + "\n");

const eng = await createEngine();
const send = eng.send;
const KEYS = ["ph", "pco2", "hco3", "be", "po2", "spo2_pre", "etco2", "rr", "map", "hr"];
const report = (label, def) => {
  const model = eng.build(def);
  eng.calc(240);
  const v = measureVitals(model, send, { window: 30 });
  out(`${label}: uma ${model.models.AA.solutes.uma.toFixed(3)} | ` + KEYS.map((k) => `${k} ${v[k]?.toFixed(k === "ph" ? 3 : 2)}`).join(", "));
  return v;
};

// 1. solve uma for the target pH (secant on the steady-state pH)
const model = eng.build(structuredClone(json.model_definition));
const M = model.models;
eng.calc(180);
let u0 = M.AA.solutes.uma, p0 = measureVitals(model, send, { window: 20 }).ph;
let u1 = u0 + 0.5;
M.Blood.set_solute("uma", u1);
eng.calc(120);
let p1 = measureVitals(model, send, { window: 20 }).ph;
for (let it = 0; it < 8 && Math.abs(p1 - PH) > 0.001; it++) {
  const u2 = u1 + ((PH - p1) * (u1 - u0)) / (p1 - p0);
  u0 = u1; p0 = p1; u1 = u2;
  M.Blood.set_solute("uma", u1);
  eng.calc(120);
  p1 = measureVitals(model, send, { window: 20 }).ph;
}
const uma = +u1.toFixed(4);

// 2. patch only the uma values
let count = 0;
const walk = (o) => {
  if (!o || typeof o !== "object") return;
  if (o.solutes && typeof o.solutes.uma === "number") { o.solutes.uma = uma; count++; }
  for (const x of Object.values(o)) walk(x);
};
walk(json.model_definition.models);
out(`${name}: uma -> ${uma} in ${count} compartments (target pH ${PH})`);

const text = JSON.stringify(json, null, 1).replace(/[\u007f-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")) +
  (raw.endsWith("\n") ? "\n" : "");

// 3. check: original vs patched, both rebuilt from file contents
report("before", JSON.parse(raw).model_definition);
report("after ", JSON.parse(text).model_definition);

if (WRITE) { fs.writeFileSync(file, text); out(`written ${name}.json`); }
