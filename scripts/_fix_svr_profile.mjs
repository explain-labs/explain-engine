// One-off repair: give term_neonate_72h a physiological systemic pressure profile.
//
// In term_neonate_72h about half (upper body) to 60 % (lower body) of the systemic resistance sat in
// the venous-return resistors (VUB/VLB r_for), so organ capillaries and veins ran at 26-40 mmHg.
// This script redistributes the resistance of each organ bed so that, as a fraction of
// (source - central venous) pressure above central venous pressure:
//   X_ART ~55 %, X_CAP ~30 %, X_VEN ~15 %   (aorta -> X_ART -> X_CAP -> X_VEN -> VUB/VLB)
// for the brain (AA -> VUB), liver/spleen and intestine (AD -> VLB). Each vessel's r_for is shared
// by all its input resistors, so:
//   - VUB/VLB r_for = the mean venous-return R of the beds draining into it;
//   - the lumped RUB/RLB beds keep their total R (their node ends at the venous level);
//   - the kidney keeps its afferent (KID_ART) and glomerular (KID_CAP) state from #62; KID_VEN r_for
//     (its efferent) takes the extra drop so the renal vein also ends at ~15 %.
// Total bed resistance is unchanged. The blood that the lower-pressure compartments would release
// is kept in place by raising their unstressed volume (u_vol), so every compartment holds the
// same volume as before. Brain autoregulation is held neutral during the solve; it re-seeds itself
// on every load. Only the touched fields are patched in the JSON.
//
//   node scripts/_fix_svr_profile.mjs [scenario=term_neonate_72h] [--write]
import fs from "node:fs";
import { createEngine } from "./_harness.mjs";
import { measureVitals } from "./_probe.mjs";

const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const name = argv.find((a) => !a.startsWith("--")) ?? "term_neonate_72h";
const file = new URL(`../model_definitions/${name}.json`, import.meta.url);
const raw = fs.readFileSync(file, "utf8");
const json = JSON.parse(raw);
const out = (s) => process.stderr.write(s + "\n");

const FRAC = { art: 0.55, cap: 0.30, ven: 0.15 };
const BEDS = [["BR", "AA", "VUB"], ["LS", "AD", "VLB"], ["INT", "AD", "VLB"]];
const LUMPED = [["RUB", "AA", "VUB"], ["RLB", "AD", "VLB"]];
const NODES = ["AA", "AD", "VUB", "VLB", "RUB", "RLB", "KID_ART", "KID_CAP", "KID_VEN",
  ...BEDS.flatMap(([b]) => [`${b}_ART`, `${b}_CAP`, `${b}_VEN`])];
const R_SET = [...BEDS.flatMap(([b]) => [`${b}_ART`, `${b}_CAP`, `${b}_VEN`]), "RUB", "RLB", "KID_VEN", "VUB", "VLB"];
const U_SET = [...BEDS.flatMap(([b]) => [`${b}_ART`, `${b}_CAP`, `${b}_VEN`]), "RUB", "RLB", "KID_VEN", "VUB", "VLB"];

const eng = await createEngine();
const send = eng.send;

function avg(M, sec) {
  const N = Math.round(sec / 0.02), p = {}, q = {}, v = {};
  for (const n of NODES) p[n] = q[n] = v[n] = 0;
  for (let i = 0; i < N; i++) {
    send("POST", "calc", 0.02);
    for (const n of NODES) { p[n] += M[n].pres / N; q[n] += (M[n].flow ?? 0) / N; v[n] += M[n].vol / N; }
  }
  return { p, q, v };
}
// scale a vessel's base resistance so its effective input resistance becomes R
function setR(M, n, R) {
  const v = M[n], k = R / v.r_for_eff;
  v.r_for *= k; v.r_back *= k; v.r_k *= k;
}
function brainNeutral(M) {
  M.Brain.autoregulation_enabled = false;
  M.Brain.autoreg_factor = 1.0; M.Brain._ar_int = 1.0;
  if (M.AA_BR_ART) M.AA_BR_ART.r_factor_ps = 1.0;
}
const KEYS = ["map", "sys", "dia", "hr", "lvo", "rvo", "svc", "cvp", "pap_m", "svo2", "spo2_pre", "pco2", "ph"];
function report(label, def) {
  const model = eng.build(def), M = model.models;
  eng.calc(90); brainNeutral(M); eng.calc(90);
  const a = avg(M, 20), v = measureVitals(model, send, { window: 30 });
  out(`${label}: ` + BEDS.map(([b, , c]) => `${b} ${a.p[`${b}_ART`].toFixed(1)}/${a.p[`${b}_CAP`].toFixed(1)}/${a.p[`${b}_VEN`].toFixed(1)}`).join("  ") +
    `  KID ${a.p.KID_ART.toFixed(1)}/${a.p.KID_CAP.toFixed(1)}/${a.p.KID_VEN.toFixed(1)}  RUB ${a.p.RUB.toFixed(1)} RLB ${a.p.RLB.toFixed(1)}  VUB ${a.p.VUB.toFixed(1)} VLB ${a.p.VLB.toFixed(1)}`);
  out(`  ` + KEYS.map((k) => `${k} ${v[k]?.toFixed(k === "ph" ? 3 : 2)}`).join(", "));
}

// 1. warm with brain autoregulation neutral, take the reference volumes
const model = eng.build(structuredClone(json.model_definition));
const M = model.models;
eng.calc(90); brainNeutral(M); eng.calc(90);
const ref = avg(M, 20);

// 2. iterate: resistances to the target profile, unstressed volumes to the reference volumes
for (let it = 0; it < 8; it++) {
  const { p, q, v } = avg(M, 10);
  const r4 = { VUB: [], VLB: [] };
  for (const [b, src, c] of BEDS) {
    const Q = q[`${b}_ART`], d = p[src] - p[c];
    setR(M, `${b}_ART`, ((1 - FRAC.art) * d) / Q);
    setR(M, `${b}_CAP`, ((FRAC.art - FRAC.cap) * d) / Q);
    setR(M, `${b}_VEN`, ((FRAC.cap - FRAC.ven) * d) / Q);
    r4[c].push((FRAC.ven * d) / Q);
  }
  const shared = { VUB: r4.VUB.reduce((a, b) => a + b) / r4.VUB.length, VLB: r4.VLB.reduce((a, b) => a + b) / r4.VLB.length };
  for (const [n, src, c] of LUMPED) setR(M, n, (p[src] - p[c]) / q[n] - shared[c]);
  setR(M, "KID_VEN", (p.KID_CAP - (p.VLB + FRAC.ven * (p.AD - p.VLB))) / q.KID_VEN);
  setR(M, "VUB", shared.VUB); setR(M, "VLB", shared.VLB);
  for (const n of U_SET) { const c = M[n]; c.u_vol += (0.8 * (ref.v[n] - v[n])) / (c.u_vol_eff / c.u_vol); }
  eng.calc(60);
}

// 3. patch only the touched fields in the scenario JSON
function findModel(o, n) {
  if (!o || typeof o !== "object") return null;
  if (o.name === n && o.model_type) return o;
  for (const x of Object.values(o)) { const r = findModel(x, n); if (r) return r; }
  return null;
}
const md = json.model_definition;
const changes = [];
for (const n of new Set([...R_SET, ...U_SET])) {
  const t = findModel(md.models, n);
  for (const k of ["r_for", "r_back", "r_k", "u_vol"]) {
    if (typeof t?.[k] !== "number") throw new Error(`${n}.${k} not found in ${name}.json`);
    if (t[k] !== M[n][k]) { if (k === "r_for" || k === "u_vol") changes.push(`${n}.${k} ${k === "u_vol" ? (t[k] * 1000).toFixed(2) + "->" + (M[n][k] * 1000).toFixed(2) + " mL" : t[k].toFixed(0) + "->" + M[n][k].toFixed(0)}`); t[k] = M[n][k]; }
  }
}
out(`${name}: ${changes.join(", ")}`);

// keep the file's own formatting: 1-space indent, \u-escaped non-ASCII, trailing newline as found
const text = JSON.stringify(json, null, 1).replace(/[\u007f-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")) +
  (raw.endsWith("\n") ? "\n" : "");

// 4. check: original vs patched, both rebuilt from file contents (brain autoregulation neutral, so
//    its pre-existing oscillation doesn't blur the comparison). Profile: ART/CAP/VEN mmHg.
report("before", JSON.parse(raw).model_definition);
report("after ", JSON.parse(text).model_definition);

if (WRITE) { fs.writeFileSync(file, text); out(`written ${name}.json`); }
