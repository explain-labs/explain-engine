// One-off repair: give term_neonate_72h a baroreflex that is neutral at rest.
//
// term_neonate_72h's BR_MAP set_value (50 mmHg) sat ~9 mmHg below its resting AAR pressure, so the
// baroreflex braked permanently at rest (EF_HR 0.90, EF_SVR 0.91, EF_HEART 0.97). Any lever then
// acted on top of a reflex that a healthy baby at rest should not have running. This script:
//   1. warms the scenario and measures the resting effector values;
//   2. folds them into the base values the effectors act on, using the engine's own formulas
//      (Heart.heart_rate_ref; HeartChamber el_max/el_min; BloodVessel r_for/r_back/r_k and
//      el_base^alpha), so the patient stays the same;
//   3. sets BR_MAP.set_value to the resting AAR pressure (tuned so the mean firing rate is 0.5);
//   4. patches ONLY those fields (and the stored reflex state) in the scenario JSON, then rebuilds
//      the patched file and prints vitals + reflexes before and after.
// The BR_MAP min/max window (25-100) is left as is.
//
//   node scripts/_fix_baro_setpoint.mjs [scenario=term_neonate_72h] [--write]
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

const EF = ["EF_HR", "EF_SVR", "EF_HEART"];
const KEYS = ["hr", "sys", "dia", "map", "pap_m", "cvp", "lvo", "rvo", "svc", "ef", "spo2_pre", "pco2", "ph", "etco2"];
const eng = await createEngine();
const send = eng.send;

function avg(M, sec) {
  const N = Math.round(sec / 0.02), a = { aar: 0, br_fr: 0, EF_HR: 0, EF_SVR: 0, EF_HEART: 0 };
  for (let i = 0; i < N; i++) {
    send("POST", "calc", 0.02);
    a.aar += M.AAR.pres; a.br_fr += M.BR_MAP.firing_rate;
    EF.forEach((k) => (a[k] += M[k].effector));
  }
  for (const k in a) a[k] /= N;
  return a;
}
function report(label, model, sec = 150) {
  eng.calc(sec);
  const a = avg(model.models, 20);
  const v = measureVitals(model, send, { window: 20 });
  out(`${label}: BR set ${model.models.BR_MAP.set_value.toFixed(2)} | AAR ${a.aar.toFixed(1)} fr ${a.br_fr.toFixed(3)} | ` +
    EF.map((k) => `${k} ${a[k].toFixed(3)}`).join(" "));
  out(`  ` + KEYS.map((k) => `${k} ${v[k]?.toFixed(k === "ph" ? 3 : 2)}`).join(", "));
}

// 1. measure at rest
let model = eng.build(structuredClone(json.model_definition));
let M = model.models;
eng.calc(90);
const rest = avg(M, 20);

// 2. fold the resting ANS activity into the base values (multipliers by model.prop)
const mult = {};
const H = M.Heart;
mult["Heart.heart_rate_ref"] = 1 + (M.EF_HR.effector - 1) * H.ans_sens;
// HeartChamber: the ANS adds (a-1)·sens·el_max to el_max, and subtracts (a-1)·sens from the diastolic
// modulation that scales both el_min and el_k (HeartChamber.calc_elastances); a = the chamber's own
// ans_activity, as Heart passes it
for (const [n, c] of Object.entries(M)) {
  if (c.model_type !== "HeartChamber" || !c.ans_sens) continue;
  const a = c.ans_activity;
  mult[`${n}.el_max`] = 1 + (a - 1) * c.ans_sens;
  for (const p of ["el_min", "el_k"]) if (c[p] > 0) mult[`${n}.${p}`] = 1 - (a - 1) * c.ans_sens;
}
// BloodVessel: R (and r_k) x (1 + (a-1)·sens), el_base x that^alpha, u_vol x (1 - (a-1)·u_vol_ans_sens)
// (BloodVessel.calc_resistances / calc_elastances / calc_volumes)
for (const [n, v] of Object.entries(M)) {
  if (v.model_type !== "BloodVessel" || !(v.ans_sens || v.u_vol_ans_sens)) continue;
  const f = 1 + (v.ans_activity - 1) * (v.ans_sens ?? 0);
  if (Math.abs(f - 1) > 1e-9) {
    for (const p of ["r_for", "r_back", "r_k"]) mult[`${n}.${p}`] = f;
    mult[`${n}.el_base`] = Math.pow(f, v.alpha);
  }
  const fu = 1 - (v.ans_activity - 1) * (v.u_vol_ans_sens ?? 0);
  if (Math.abs(fu - 1) > 1e-9) mult[`${n}.u_vol`] = fu;
}

// neutral reflex state (also what gets stored)
const neutral = {
  "Heart.ans_activity": 1, "Heart.ans_activity_hr": 1,
  "Circulation.ans_activity": 1, "Circulation.prev_ans_activity": 1,
  "BR_MAP.firing_rate": 0.5,
  ...Object.fromEntries(EF.flatMap((k) => [[`${k}.effector`, 1], [`${k}.firing_rate`, 0.5]])),
};
for (const [n, v] of Object.entries(M)) {
  if ((v.model_type === "BloodVessel" || v.model_type === "HeartChamber") && v.ans_sens) neutral[`${n}.ans_activity`] = 1;
}

// 3. apply in memory, find the set-point that gives a mean firing rate of 0.5
const apply = (models) => {
  for (const [k, f] of Object.entries(mult)) { const [n, p] = k.split("."); models[n][p] *= f; }
  for (const [k, v] of Object.entries(neutral)) { const [n, p] = k.split("."); models[n][p] = v; }
};
apply(M);
M.BR_MAP.set_value = rest.aar;
for (let it = 0; it < 6; it++) {
  eng.calc(60);
  const a = avg(M, 20);
  const d = a.br_fr - 0.5;
  if (Math.abs(d) < 0.002) break;
  M.BR_MAP.set_value += d / (0.5 / (M.BR_MAP.max_value - M.BR_MAP.set_value));
}
const setValue = +M.BR_MAP.set_value.toFixed(2);

// 4. patch only these fields in the scenario JSON
function findModel(o, n) {
  if (!o || typeof o !== "object") return null;
  if (o.name === n && o.model_type) return o;
  for (const v of Object.values(o)) { const r = findModel(v, n); if (r) return r; }
  return null;
}
const md = json.model_definition;
const patched = [];
for (const [k, f] of Object.entries(mult)) {
  const [n, p] = k.split(".");
  const m = findModel(md.models, n);
  if (typeof m?.[p] !== "number") throw new Error(`${k} not found in ${name}.json`);
  m[p] *= f;
  patched.push(`${k} x${f.toFixed(4)}`);
}
for (const [k, v] of Object.entries(neutral)) {
  const [n, p] = k.split(".");
  const m = findModel(md.models, n);
  if (m && p in m) m[p] = v;
}
findModel(md.models, "BR_MAP").set_value = setValue;
patched.push(`BR_MAP.set_value ${rest.aar.toFixed(2)} -> ${setValue}`);
out(`${name}: resting reflex ` + EF.map((k) => `${k} ${rest[k].toFixed(3)}`).join(" ") + `, AAR ${rest.aar.toFixed(1)}`);
out(`  folded: ${patched.join(", ")}`);

// keep the file's own formatting: 2-space indent (as written by reseed_term_neonate.mjs), trailing
// newline as found
const text = JSON.stringify(json, null, 2) + (raw.endsWith("\n") ? "\n" : "");

// 5. check: original vs patched, both rebuilt from file contents
report("before", eng.build(JSON.parse(raw).model_definition));
report("after ", eng.build(JSON.parse(text).model_definition));

if (WRITE) { fs.writeFileSync(file, text); out(`written ${name}.json`); }
