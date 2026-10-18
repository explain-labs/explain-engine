// Term neonate (72 h) model-vs-literature probe.
//
// Builds a scenario headless, settles it, measures every variable listed in
// scripts/reference/term_neonate_72h.json (see docs/TermNeonateReference.md) and prints the model
// value next to the reference: mean ± SD, the study's own normal range, the deviation in SD where
// an SD exists, and a flag (ok / LOW / HIGH / ref = no numeric reference).
//
// Usage:
//   node scripts/probe_term_reference.mjs [scenario] [--settle S] [--window W] [--json out.json] [--file path.json]

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);
import { measureVitals } from "./_probe.mjs";

const argv = process.argv.slice(2);
const scenario = argv.find((a) => !a.startsWith("-") && !/^\d/.test(a)) || "term_neonate";
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const SETTLE = Number(opt("--settle", 180));
const WINDOW = Number(opt("--window", 20));
const JSON_OUT = opt("--json", null);

const MMHG_TO_CMH2O = 1.3595;
const HB_MMOL_TO_GDL = 1.611; // Hb monomer mmol/L -> g/dL
const MCHC = 33.0; // g/dL, as in Blood.js
const O2_ML_PER_MMOL = 22.4;
const BLOOD_TYPES = new Set(["BloodCapacitance", "BloodVessel", "BloodTimeVaryingElastance", "HeartChamber", "BloodPump"]);
const NON_PATIENT = /^(ECLS|PL_|UT|MP)/; // device and placenta/uterus compartments

let live = null;
globalThis.self = globalThis;
globalThis.postMessage = (m) => {
  if (!m || !m.type) return;
  if (m.type === "state") live = m.payload;
  if (m.type === "error") console.error("ENGINE ERROR:", m.message, m.payload ?? "");
};
const _log = console.log;
console.log = () => {};

await import("../ModelEngine.js");
const send = (type, message, payload) => self.onmessage({ data: { type, message, payload } });
const FILE = opt("--file", null); // probe a scenario file outside model_definitions/ (e.g. a prototype)
const json = JSON.parse(fs.readFileSync(FILE ?? new URL(`../model_definitions/${scenario}.json`, import.meta.url), "utf8"));
send("POST", "build", json.model_definition || json);
send("GET", "state", []);
const model = live;
if (!model?.models) { console.log = _log; console.error(`Build failed for "${scenario}".`); process.exit(1); }
const M = model.models;
const W = model.weight;
const dt = model.modeling_stepsize;

// settle, then the monitor + arterial gas window (same averaging as probe_vitals / the builder)
send("POST", "calc", SETTLE);
const vit = measureVitals(model, send, { window: WINDOW });

// second window, stepped directly so per-step values (heart volumes, flows, gas uptake, FRC) are sampled
const flowNames = ["LV_AA", "RV_PA", "AA_BR_ART", "AA_RUB", "AAR_AD", "AD_LS_ART", "AD_KID_ART", "AD_INT_ART", "SVC_RASVC", "AAR_DA", "LA_RAIVCI", "LA_RASVC"];
const acc = {};
const add = (k, v) => { acc[k] = (acc[k] || 0) + (Number.isFinite(v) ? v : 0); };
let frcMin = Infinity;
const steps = Math.round(WINDOW / dt);
for (let i = 0; i < steps; i++) {
  for (const k in M) M[k].step_model();
  model.model_time_total += dt;
  for (const n of flowNames) add(n, M[n]?.flow);
  const H = M.Heart;
  for (const k of ["lv_edv", "lv_esv", "lv_sv", "lv_ef", "rv_edv", "rv_esv", "rv_sv", "rv_ef"]) add(k, H?.[k]);
  add("vt", M.Breathing?.exp_tidal_volume);
  add("mv", M.Breathing?.minute_volume);
  add("ds_vol", M.DS?.vol);
  add("o2_uptake", -((M.GASEX_LL?.flux_o2 ?? 0) + (M.GASEX_RL?.flux_o2 ?? 0))); // mmol per step, +ve = blood takes up O2
  const gas = (M.ALL?.vol ?? 0) + (M.ALR?.vol ?? 0) + (M.DS?.vol ?? 0);
  if (gas < frcMin) frcMin = gas;
}
for (const k in acc) acc[k] /= steps;
const perKgMin = (lps) => (lps * 60000) / W; // L/s -> mL/kg/min

// static read-outs at the end of the window
const AA = M.AA;
const lungC = 1 / M.ALL.el_eff + 1 / M.ALR.el_eff; // L/mmHg, the two lungs in parallel
const chestC = 1 / (M.THORAX.el_eff || M.THORAX.el_base);
const crs = (1 / (1 / lungC + 1 / chestC)) * 1000 / MMHG_TO_CMH2O; // mL/cmH2O
const rrs = (M.MOUTH_DS.r_for_eff + 1 / (1 / M.DS_ALL.r_for_eff + 1 / M.DS_ALR.r_for_eff)) * MMHG_TO_CMH2O;
let bloodVol = 0;
for (const [name, m] of Object.entries(M)) if (BLOOD_TYPES.has(m.model_type) && m.is_enabled && !NON_PATIENT.test(name)) bloodVol += m.vol || 0;
const bsa = 0.024265 * Math.pow(W, 0.5378) * Math.pow((model.height || 0.519) * 100, 0.3964); // Haycock, m2
const hb = (AA?.solutes?.hemoglobin ?? NaN) * HB_MMOL_TO_GDL;
const toKgMl = (L) => (L * 1000) / W;

const model_values = {
  hr: vit.hr, sbp: vit.sys, dbp: vit.dia, map: vit.map, pp: vit.sys - vit.dia, cvp: vit.cvp, pap_s: vit.pap_s, pap_m: vit.pap_m,
  lv_edv: toKgMl(acc.lv_edv), lv_esv: toKgMl(acc.lv_esv), lv_sv: toKgMl(acc.lv_sv), lv_ef: acc.lv_ef * 100,
  rv_edv: toKgMl(acc.rv_edv), rv_esv: toKgMl(acc.rv_esv), rv_sv: toKgMl(acc.rv_sv), rv_ef: acc.rv_ef * 100,
  lvo: perKgMin(acc.LV_AA), rvo: perKgMin(acc.RV_PA), svc: perKgMin(acc.SVC_RASVC), dao: perKgMin(acc.AAR_AD),
  cbf: perKgMin(acc.AA_BR_ART), sma: perKgMin(acc.AD_INT_ART), renal: perKgMin(acc.AD_KID_ART), hepatic_art: perKgMin(acc.AD_LS_ART),
  rr: vit.rr, vt: toKgMl(acc.vt), mv: toKgMl(acc.mv), ti_ttot: M.Breathing?.ie_ratio, crs, rrs, frc: toKgMl(frcMin), vd: toKgMl(acc.ds_vol),
  spo2: vit.spo2_pre, ph: vit.ph, pco2: vit.pco2, hco3: vit.hco3, be: vit.be, po2: vit.po2, etco2: vit.etco2, svo2: vit.svo2,
  vo2: (acc.o2_uptake / dt) * 60 * O2_ML_PER_MMOL / W, temp: vit.temp, glucose: AA?.solutes?.glucose, lactate: M.Lactate?.arterial_lactate,
  hb, hct: hb / MCHC * 100, blood_volume: toKgMl(bloodVol),
  gfr: (M.Kidneys?.gfr ?? NaN) * 1.73 / bsa, urine: (M.Kidneys?.urine_flow ?? NaN) * 60 / W,
  pda: perKgMin(acc.AAR_DA), fo: perKgMin(acc.LA_RAIVCI + acc.LA_RASVC),
};
const extras = {
  lv_sv_from_output: model_values.lvo / model_values.hr, // mL/kg per beat, flow-based cross-check of lv_sv
  cbf_pct_lvo: (100 * acc.AA_BR_ART) / acc.LV_AA, sma_pct_lvo: (100 * acc.AD_INT_ART) / acc.LV_AA,
  renal_pct_lvo: (100 * acc.AD_KID_ART) / acc.LV_AA, ls_pct_lvo: (100 * acc.AD_LS_ART) / acc.LV_AA,
  vd_vt: acc.ds_vol / acc.vt, vo2_setting: M.Metabolism?.vo2, bsa,
  pda_no_flow: M.AAR_DA?.no_flow, fo_no_flow: M.LA_RAIVCI?.no_flow && M.LA_RASVC?.no_flow,
};

const ref = JSON.parse(fs.readFileSync(new URL("./reference/term_neonate_72h.json", import.meta.url), "utf8"));
const rows = ref.variables.map((r) => {
  const v = model_values[r.key];
  const hasNum = r.mean != null || r.low != null || r.high != null;
  const z = r.mean != null && r.sd ? (v - r.mean) / r.sd : null;
  let flag = hasNum ? "ok" : "ref";
  if (Number.isFinite(v)) {
    if (r.low != null && v < r.low) flag = "LOW";
    else if (r.high != null && v > r.high) flag = "HIGH";
    else if (z != null && Math.abs(z) > 2) flag = z < 0 ? "LOW" : "HIGH";
  } else flag = "n/a";
  return { key: r.key, group: r.group, label: r.label, unit: r.unit, model: v, mean: r.mean, sd: r.sd, low: r.low, high: r.high, z, flag, grade: r.grade };
});

console.log = _log;
const f = (x, d = 2) => (x == null || !Number.isFinite(x) ? "—" : Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(d));
console.log(`term reference probe — ${scenario}, ${W} kg, settle ${SETTLE} s, window ${WINDOW} s\n`);
let group = "";
for (const r of rows) {
  if (r.group !== group) { group = r.group; console.log(`-- ${group}`); }
  const refTxt = `${f(r.mean)}${r.sd ? " ± " + f(r.sd) : ""}`.padStart(13);
  const rangeTxt = (r.low != null || r.high != null ? `${f(r.low)}–${f(r.high)}` : "").padStart(12);
  console.log(`${r.label.padEnd(36)} ${f(r.model).padStart(8)}  ref ${refTxt} ${rangeTxt}  ${(r.z == null ? "" : (r.z >= 0 ? "+" : "") + r.z.toFixed(1) + " SD").padStart(8)}  ${r.flag.padEnd(4)} ${r.grade} ${r.unit}`);
}
console.log("\n-- cross-checks");
for (const [k, v] of Object.entries(extras)) console.log(`${k.padEnd(20)} ${typeof v === "number" ? f(v) : v}`);
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ scenario, settle: SETTLE, window: WINDOW, rows, extras }, null, 2));
