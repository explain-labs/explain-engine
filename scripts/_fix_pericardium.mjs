// One-off repair: give term_neonate_72h's pericardium a J-shaped pressure-volume curve.
//
// The pericardium (a Container around RAIVCI/RASVC/RV/LA/LV/COR) had u_vol 0, el_base 10 and
// el_k 1 mmHg/L^2: its recoil was ~0.25 mmHg and it never constrained the heart, however full.
// It now has a reserve volume and a steep wall:
//   - u_vol = (1 + RESERVE) x the end-diastolic (maximal) heart volume at rest;
//   - el_k such that the recoil is +STEEP_MMHG at STEEP_ML beyond that reserve (el_k only acts
//     above u_vol, Container change in this PR);
//   - el_base 0, so below the reserve the pericardium is exactly slack (recoil 0 at rest; it was
//     0.25 mmHg, which the old linear term pressed on the heart).
// Losing that 0.25 mmHg raises CO ~1.4 % and lowers CVP ~0.14 mmHg, so CVP and CO are restored with
// the builder's CVP+CO lever pair: venous tone (central-vein u_vol) and RV diastolic stiffness
// (RV el_min).
//
//   node scripts/_fix_pericardium.mjs [scenario=term_neonate_72h] [--write]
import fs from "node:fs";
import { createEngine } from "./_harness.mjs";
import { measureVitals } from "./_probe.mjs";

const RESERVE = 0.15, STEEP_ML = 10, STEEP_MMHG = 10;
const CENTRAL = ["VUB", "VLB", "SVC", "IVCI"];
const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const name = argv.find((a) => !a.startsWith("--")) ?? "term_neonate_72h";
const file = new URL(`../model_definitions/${name}.json`, import.meta.url);
const raw = fs.readFileSync(file, "utf8");
const json = JSON.parse(raw);
const out = (s) => process.stderr.write(s + "\n");

const eng = await createEngine();
const send = eng.send;

// 1. maximal (end-diastolic) heart volume at rest
let model = eng.build(structuredClone(json.model_definition));
eng.calc(150);
let vmax = 0;
for (let i = 0; i < 4000; i++) { send("POST", "calc", 0.005); vmax = Math.max(vmax, model.models.PERICARDIUM.vol); }
const u_vol = (1 + RESERVE) * vmax, el_k = STEEP_MMHG / Math.pow(STEEP_ML / 1000, 2);

// 2. patch only u_vol and el_k
function findModel(o, n) {
  if (!o || typeof o !== "object") return null;
  if (o.name === n && o.model_type) return o;
  for (const x of Object.values(o)) { const r = findModel(x, n); if (r) return r; }
  return null;
}
const jP = findModel(json.model_definition.models, "PERICARDIUM");
out(`${name}: end-diastolic heart volume ${(vmax * 1000).toFixed(2)} mL -> PERICARDIUM.u_vol ${(jP.u_vol * 1000).toFixed(2)} -> ${(u_vol * 1000).toFixed(2)} mL, el_k ${jP.el_k} -> ${el_k.toExponential(2)} mmHg/L^2`);
jP.u_vol = u_vol; jP.el_k = el_k; jP.el_base = 0;

// 3. restore resting CVP and CO with venous tone + RV diastolic stiffness (Newton on log factors;
//    sensitivities measured on term_neonate_72h: d(CVP, CO%)/d ln(u_vol) = (-13.1, -166),
//    d(CVP, CO%)/d ln(el_min) = (2.96, -26.4))
const rest = (def) => { const m = eng.build(structuredClone(def)); eng.calc(180); return measureVitals(m, send, { window: 30 }); };
const ref = rest(JSON.parse(raw).model_definition);
const J = [[-13.1, 2.96], [-166, -26.4]], det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
let la = 0, lb = 0; // cumulative log factors on central u_vol and RV el_min
const base = { u: Object.fromEntries(CENTRAL.map((n) => [n, findModel(json.model_definition.models, n).u_vol])), el: findModel(json.model_definition.models, "RV").el_min };
const apply = () => {
  for (const n of CENTRAL) findModel(json.model_definition.models, n).u_vol = base.u[n] * Math.exp(la);
  findModel(json.model_definition.models, "RV").el_min = base.el * Math.exp(lb);
};
for (let it = 0; it < 6; it++) {
  apply();
  const v = rest(json.model_definition);
  const dCvp = ref.cvp - v.cvp, dCo = ((ref.lvo - v.lvo) / v.lvo) * 100;
  if (process.env.DEBUG) out(`  fit ${it}: CVP ${v.cvp.toFixed(3)} (ref ${ref.cvp.toFixed(3)}), CO ${v.lvo.toFixed(4)} (ref ${ref.lvo.toFixed(4)})`);
  if (Math.abs(dCvp) < 0.02 && Math.abs(dCo) < 0.2) break;
  la += (J[1][1] * dCvp - J[0][1] * dCo) / det;
  lb += (-J[1][0] * dCvp + J[0][0] * dCo) / det;
}
out(`  el_base 10 -> 0; venous tone (central u_vol) x${Math.exp(la).toFixed(4)}, RV el_min x${Math.exp(lb).toFixed(4)}`);

const text = JSON.stringify(json, null, 1).replace(/[\u007f-\uffff]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")) +
  (raw.endsWith("\n") ? "\n" : "");

// 3. check: rest, volume loading (venous tone x0.85) and pericardial fluid (vol_extra), before vs after
const KEYS = ["map", "cvp", "lvo", "hr", "pap_m"];
const CASES = [["rest", () => {}], ["volume load", (M) => { for (const n of ["VUB", "VLB", "SVC", "IVCI"]) M[n].u_vol *= 0.85; }],
  ["fluid 10 mL", (M) => { M.Heart.pc_extra_volume = 0.010; }], ["fluid 20 mL", (M) => { M.Heart.pc_extra_volume = 0.020; }]];
function report(label, def) {
  for (const [tag, fn] of CASES) {
    const m = eng.build(structuredClone(def)), M = m.models;
    M.BR_MAP.efferents = []; fn(M);
    eng.calc(150);
    let pin = 0; for (let i = 0; i < 1000; i++) { send("POST", "calc", 0.02); pin += M.PERICARDIUM.pres_in / 1000; }
    const v = measureVitals(m, send, { window: 20 });
    out(`${label} ${tag.padEnd(12)}: pericardial recoil ${pin.toFixed(2)} mmHg | ` + KEYS.map((k) => `${k} ${v[k].toFixed(2)}`).join(", "));
  }
}
report("before", JSON.parse(raw).model_definition);
report("after ", JSON.parse(text).model_definition);

if (WRITE) { fs.writeFileSync(file, text); out(`written ${name}.json`); }
