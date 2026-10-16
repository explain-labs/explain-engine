// One-off repair: give term_neonate a kidney whose two afferent controllers are at rest.
//
// After #65 the term kidney's myogenic limb (myogenic_p_set 40, a historical term value) and its
// TGF limb (tgf_setpoint 582.7, idem) pushed against each other at rest (myogenic ~1.14, TGF ~0.89,
// net afferent factor ~1.02), so any change in renal pressure or flow started from two opposing,
// unbalanced reflexes. The glomerular pressure (KID_CAP ~37 mmHg, 0.64 x MAP) and GFR are kept.
// This script:
//   1. warms the scenario and measures the mean afferent factor, KID_ART pressure and TGF signal;
//   2. folds the mean afferent factor into the base KID_ART r_for/r_back/r_k (renal R unchanged);
//   3. sets myogenic_p_set and tgf_setpoint to the resting values, controller state to 1.0, and
//      iterates both set-points until the mean factors are within +-0.01 of 1;
//   4. patches ONLY those fields in the scenario JSON, then rebuilds the patched file and prints
//      the kidney state, renal outputs and vitals before and after.
//
//   node scripts/_fix_kidney_rest.mjs [scenario=term_neonate] [--write]
import fs from "node:fs";
import { createEngine } from "./_harness.mjs";
import { measureVitals } from "./_probe.mjs";

const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const name = argv.find((a) => !a.startsWith("--")) ?? "term_neonate";
const file = new URL(`../model_definitions/${name}.json`, import.meta.url);
const raw = fs.readFileSync(file, "utf8");
const json = JSON.parse(raw);
const out = (s) => process.stderr.write(s + "\n");

const eng = await createEngine();
const send = eng.send;

function avg(M, sec) {
  const K = M.Kidneys, N = Math.round(sec / 0.02);
  const a = { myo: 0, tgf: 0, aff: 0, p_art: 0, p_cap: 0, sig: 0, gfr: 0, rbf: 0 };
  for (let i = 0; i < N; i++) {
    send("POST", "calc", 0.02);
    a.myo += K.myogenic_factor; a.tgf += K.tgf_factor; a.aff += K.afferent_factor;
    a.p_art += M.KID_ART.pres; a.p_cap += M.KID_CAP.pres; a.sig += K.tgf_signal;
    a.gfr += K.gfr; a.rbf += M.KID_ART.flow * 60000;
  }
  for (const k in a) a[k] /= N;
  return a;
}
function neutral(K, art) {
  K.myogenic_factor = 1.0; K.tgf_factor = 1.0; K.afferent_factor = 1.0;
  art.r_factor_ps = 1.0;
}
const KEYS = ["map", "hr", "lvo", "svc", "cvp", "pap_m", "svo2", "ph", "pco2"];
function report(label, def) {
  const model = eng.build(def), M = model.models;
  eng.calc(240);
  const a = avg(M, 60), v = measureVitals(model, send, { window: 30 });
  out(`${label}: myo ${a.myo.toFixed(3)} tgf ${a.tgf.toFixed(3)} afferent ${a.aff.toFixed(3)} | KID_ART ${a.p_art.toFixed(1)} KID_CAP ${a.p_cap.toFixed(1)} | ` +
    `GFR ${a.gfr.toFixed(2)} mL/min, RBF ${(a.rbf / model.weight).toFixed(1)} mL/min/kg`);
  out(`  ` + KEYS.map((k) => `${k} ${v[k]?.toFixed(k === "ph" ? 3 : 2)}`).join(", "));
}

// 1. measure at rest
const model = eng.build(structuredClone(json.model_definition));
const M = model.models, K = M.Kidneys, ART = M[K.aff_vessel_name];
eng.calc(150);
const rest = avg(M, 60);

// 2. fold the resting afferent factor into the base afferent resistance
const fold = rest.aff;
for (const p of ["r_for", "r_back", "r_k"]) ART[p] *= fold;

// 3. resting set-points, neutral state, then iterate
K.myogenic_p_set = rest.p_art;
K.tgf_setpoint = rest.sig;
neutral(K, ART);
let a;
for (let it = 0; it < 8; it++) {
  eng.calc(90);
  a = avg(M, 60);
  if (Math.abs(a.myo - 1) < 0.01 && Math.abs(a.tgf - 1) < 0.01) break;
  K.myogenic_p_set += (a.myo - 1) / K.myogenic_gain_up; // factor = 1 + gain*(p - set)
  K.tgf_setpoint *= 1 + (a.tgf - 1) / K.tgf_gain; // factor = 1 + gain*(sig - set)/set
}

// 4. patch only these fields in the scenario JSON
function findModel(o, n) {
  if (!o || typeof o !== "object") return null;
  if (o.name === n && o.model_type) return o;
  for (const x of Object.values(o)) { const r = findModel(x, n); if (r) return r; }
  return null;
}
const md = json.model_definition;
const jK = findModel(md.models, "Kidneys"), jA = findModel(md.models, K.aff_vessel_name);
for (const p of ["r_for", "r_back", "r_k"]) {
  if (typeof jA?.[p] !== "number") throw new Error(`${K.aff_vessel_name}.${p} not found in ${name}.json`);
  jA[p] = ART[p];
}
const set = (o, k, v) => { if (k in o) o[k] = v; };
set(jA, "r_factor_ps", 1.0);
jK.myogenic_p_set = +K.myogenic_p_set.toFixed(3);
jK.tgf_setpoint = +K.tgf_setpoint.toFixed(3);
for (const k of ["myogenic_factor", "tgf_factor", "afferent_factor"]) set(jK, k, 1.0);
out(`${name}: resting myo ${rest.myo.toFixed(3)} tgf ${rest.tgf.toFixed(3)} afferent ${rest.aff.toFixed(3)} -> folded into ${K.aff_vessel_name} R x${fold.toFixed(4)}; ` +
  `myogenic_p_set 40 -> ${jK.myogenic_p_set}, tgf_setpoint ${findModel(JSON.parse(raw).model_definition.models, "Kidneys").tgf_setpoint.toFixed(1)} -> ${jK.tgf_setpoint}`);

const text = JSON.stringify(json, null, 1).replace(/[\u007f-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")) +
  (raw.endsWith("\n") ? "\n" : "");

// 5. check: original vs patched, both rebuilt from file contents
report("before", JSON.parse(raw).model_definition);
report("after ", JSON.parse(text).model_definition);

if (WRITE) { fs.writeFileSync(file, text); out(`written ${name}.json`); }
