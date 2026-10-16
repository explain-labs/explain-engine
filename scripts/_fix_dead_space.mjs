// One-off repair: give term_neonate a physiological anatomical dead space.
//
// The conducting airways (DS) held 5.1 mL = 1.44 mL/kg; infants and children have ~2.2 mL/kg
// (Numa & Newth 1996). A larger dead space at the same tidal volume would raise pCO2, so the breathing
// pattern is re-fitted with the builder's own breathing levers, keeping RR and pCO2 (alveolar
// ventilation) at their resting values:
//   - DS.u_vol so the mean DS volume is DS_ML_KG x weight;
//   - Breathing.minute_volume_ref (drive) for pCO2 and Breathing.vt_rr_ratio (split) for RR,
//     iterated with the chemoreflex live.
// Only those three fields are patched.
//
//   node scripts/_fix_dead_space.mjs [scenario=term_neonate] [--ds 2.2] [--write]
import fs from "node:fs";
import { createEngine } from "./_harness.mjs";
import { measureVitals } from "./_probe.mjs";

const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const name = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--ds") ?? "term_neonate";
const DS_ML_KG = argv.includes("--ds") ? Number(argv[argv.indexOf("--ds") + 1]) : 2.2;
const file = new URL(`../model_definitions/${name}.json`, import.meta.url);
const raw = fs.readFileSync(file, "utf8");
const json = JSON.parse(raw);
const out = (s) => process.stderr.write(s + "\n");

const eng = await createEngine();
const send = eng.send;

function avg(model, sec) {
  const M = model.models, N = Math.round(sec / 0.02), a = { ds: 0, vt: 0, mv: 0, rr: 0, pco2: 0 };
  for (let i = 0; i < N; i++) {
    send("POST", "calc", 0.02);
    a.ds += M.DS.vol; a.vt += M.Breathing.exp_tidal_volume; a.mv += M.Breathing.minute_volume;
    a.rr += M.Breathing.resp_rate; a.pco2 += M.AA.pco2;
  }
  for (const k in a) a[k] /= N;
  return a;
}
const KEYS = ["rr", "pco2", "etco2", "ph", "spo2_pre", "po2", "hr", "map"];
function report(label, def) {
  const model = eng.build(def);
  eng.calc(240);
  const a = avg(model, 30), v = measureVitals(model, send, { window: 30 }), w = model.weight;
  out(`${label}: DS ${(a.ds * 1000 / w).toFixed(2)} mL/kg, Vt ${(a.vt * 1000 / w).toFixed(2)} mL/kg, MV ${(a.mv * 1000 / w).toFixed(0)} mL/kg/min, Vd/Vt ${(a.ds / a.vt).toFixed(2)} | ` +
    KEYS.map((k) => `${k} ${v[k].toFixed(k === "ph" ? 3 : 1)}`).join(", ") + `, chemo ${model.models.Breathing.mv_ans_factor.toFixed(2)}`);
}

// 1. resting reference
const model = eng.build(structuredClone(json.model_definition));
const M = model.models, B = M.Breathing, w = model.weight;
eng.calc(180);
const ref = avg(model, 30);

// 2. dead space to target, then re-fit drive (pCO2) and split (RR) with the chemoreflex live
const dsTarget = (DS_ML_KG * w) / 1000;
for (let it = 0; it < 10; it++) {
  const a = avg(model, 30);
  const ok = Math.abs(a.ds - dsTarget) < 0.00005 && Math.abs(a.rr - ref.rr) < 0.3 && Math.abs(a.pco2 - ref.pco2) < 0.2;
  if (process.env.DEBUG) out(`it ${it}: DS ${(a.ds * 1000).toFixed(2)} RR ${a.rr.toFixed(1)} pCO2 ${a.pco2.toFixed(2)} Vt ${(a.vt * 1000).toFixed(2)}`);
  if (ok) break;
  M.DS.u_vol += (dsTarget - a.ds) / (M.DS.u_vol_eff / M.DS.u_vol);
  B.minute_volume_ref *= Math.pow(a.pco2 / ref.pco2, 1.5); // pCO2 ~ 1/alveolar ventilation, damped by the chemoreflex
  B.vt_rr_ratio *= Math.pow(a.rr / ref.rr, 2); // RR = sqrt(MV / (ratio * weight))
  eng.calc(120);
}

// 3. patch only these fields
function findModel(o, n) {
  if (!o || typeof o !== "object") return null;
  if (o.name === n && o.model_type) return o;
  for (const x of Object.values(o)) { const r = findModel(x, n); if (r) return r; }
  return null;
}
const jDS = findModel(json.model_definition.models, "DS"), jB = findModel(json.model_definition.models, "Breathing");
for (const [t, k] of [[jDS, "u_vol"], [jB, "minute_volume_ref"], [jB, "vt_rr_ratio"]]) if (typeof t?.[k] !== "number") throw new Error(`${k} not found in ${name}.json`);
out(`${name}: DS.u_vol ${(jDS.u_vol * 1000).toFixed(2)} -> ${(M.DS.u_vol * 1000).toFixed(2)} mL, minute_volume_ref ${jB.minute_volume_ref} -> ${B.minute_volume_ref.toFixed(4)}, vt_rr_ratio ${jB.vt_rr_ratio} -> ${B.vt_rr_ratio.toExponential(4)}`);
jDS.u_vol = M.DS.u_vol; jB.minute_volume_ref = B.minute_volume_ref; jB.vt_rr_ratio = B.vt_rr_ratio;

const text = JSON.stringify(json, null, 1).replace(/[\u007f-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")) +
  (raw.endsWith("\n") ? "\n" : "");

// 4. check: original vs patched, both rebuilt from file contents
report("before", JSON.parse(raw).model_definition);
report("after ", JSON.parse(text).model_definition);

if (WRITE) { fs.writeFileSync(file, text); out(`written ${name}.json`); }
