// Generate term_neonate_12h (a healthy term neonate 12 h after birth, in transition) from term_neonate_72h.
// Reference values: docs/TermTransitionReference.md and scripts/reference/term_neonate_12h.json; check with
//   node scripts/probe_term_reference.mjs term_neonate_12h --ref scripts/reference/term_neonate_12h.json
//
//   node scripts/_make_term_12h.mjs [--settle 300] [--final 600] [--write | --out FILE] [--levers none|all|a,b,...]
//
// The 12 h baby is the SAME baby as term_neonate_72h, 60 h younger (same cord clamping, same red cell mass).
// The scenario is a SNAPSHOT of that age: the levers (LEVERS below, factors relative to 72 h) are applied,
// the model settles, and then every controller is re-anchored to the new resting state, so the loaded
// scenario holds it instead of drifting back toward 72 h. Controller inventory (engine 838e959):
//   re-anchored here     baroreflex (resting effector activity folded into the base values it acts on,
//                        BR_MAP.set_value -> mean firing 0.5, as scripts/_fix_baro_setpoint.mjs);
//                        chemoreflex CR_PCO2 / CR_PO2 / CR_PH set-points = the resting arterial gases;
//                        Hormones volume / renal perfusion / Na / K set-points = the resting values;
//                        Glucose set-point = the resting arterial glucose; Lactate resting site O2
//                        (re-captured); Thermoregulation heat-loss trim (re-seeded); HeartFunction resting
//                        wall-stress set-points (re-learned, as scripts/_relearn_heartfunction.mjs);
//                        Blood.viscosity_ref (re-calibrated after a haemoglobin change).
//   kept from 72 h       (user decision 2026-11-05) Brain cbf_setpoint / co2_ref / o2_ref: the 12 h CBF is
//                        the 72 h set-point moved by the CO2 and O2-content reactivity; Mob.cor_ext_ref: the
//                        coronary flow follows demand at the 72 h extraction; Kidneys myogenic_p_set /
//                        tgf_setpoint: renal autoregulation keeps its set-points, Kidneys.kf is the lever.
//   re-seeds itself      Interstitium (its resting balance is not saved; it seeds 30 s after every load).
//                        Here it is re-seeded after the levers so it does not filter while they settle.
// Then the live state is serialized at a sinus-node firing (as scripts/reseed_term_neonate.mjs).
//
// With --levers none the generator must reproduce term_neonate_72h (the neutrality check of the
// re-anchoring); levers are added one at a time, each checked with the reference probe.
import fs from "node:fs";
import { createEngine } from "./_harness.mjs";
import { serializeState } from "./_serialize_state.mjs";

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const SETTLE = Number(opt("--settle", 300)); // s after the levers, before re-anchoring
const FINAL = Number(opt("--final", 600)); // s after re-anchoring, before saving
const WRITE = argv.includes("--write");
const OUT = opt("--out", null);
const SOURCE = opt("--source", "term_neonate_72h");
const say = (...a) => process.stderr.write(a.join(" ") + "\n");

const NAME = "term_neonate_12h";
const DESCRIPTION = "healthy term neonate (3.545 kg) 12 h after a vaginal birth: the term_neonate_72h baby 60 h younger, " +
  "in transition (constricting duct, raised pulmonary pressure, higher output); room air, dressed at room temperature";

// --- levers (applied to the live 72 h model, in this order) -------------------------------------
// Each: { why, apply(M, model) }. Added one at a time (step 3 onwards of the 12 h plan).
const LEVERS = {
  // 1. the duct, open at its 12 h size. Kang 2016: 2.47 +/- 0.49 mm at 12 h (narrowest, pulmonary end).
  //    Constriction starts as a focal narrowing at the pulmonary end (Hiraishi 1987) and leaves the
  //    aortic ampulla (Rudolph): the ampulla keeps the 72 h anatomic maximum (3 mm over the 14 mm length),
  //    the last constriction_length mm (default 2) narrow to the pulmonary-end diameter. Cd 0.9 (smooth
  //    converging duct); the earlier Cd 0.3 was a workaround for the pre-#131 cylinder.
  duct: {
    why: "Pda pulmonary end 2.47 mm (Kang 2016), aortic ampulla 3 mm, constriction length 2 mm, Cd 0.9",
    apply(M) {
      const P = M.Pda;
      P.diameter_ao_max = 3.0;
      P.diameter_pa_max = 3.0;
      P.diameter_relative = 2.47 / P.diameter_pa_max;
      P.constriction_length = 2.0;
      P.discharge_coeff = 0.9;
      M.AAR_DA.no_flow = false;
    },
  },
};
const pick = opt("--levers", "all");
const active = pick === "none" ? [] : pick === "all" ? Object.keys(LEVERS) : pick.split(",");
for (const k of active) if (!LEVERS[k]) { say(`unknown lever ${k}; known: ${Object.keys(LEVERS).join(", ") || "(none yet)"}`); process.exit(1); }

// --- build --------------------------------------------------------------------------------------
const dir = new URL("../model_definitions/", import.meta.url);
const j = JSON.parse(fs.readFileSync(new URL(`${SOURCE}.json`, dir), "utf8"));
const baselineWeight = j.model_definition._baseline_weight;
const eng = await createEngine();
const send = eng.send;
const model = eng.build(j.model_definition);
if (!model?.models) { say(`build of ${SOURCE} failed`); process.exit(1); }
const M = model.models;
eng.calc(60); // the loaded state settles (the Interstitium seeds at 30 s)

let hbChanged = false;
for (const k of active) {
  const r = LEVERS[k].apply(M, model);
  if (r?.hb) hbChanged = true;
  say(`lever ${k}: ${LEVERS[k].why}`);
}
if (hbChanged) M.Blood.calibrate_viscosity_ref();
if (active.length) reseedInterstitium();
eng.calc(SETTLE);

// --- re-anchor ----------------------------------------------------------------------------------
const log = [];
reanchorBaroreflex();
eng.calc(60);
reanchorChemoreflex();
reanchorHormonesGlucose();
reseedLactateThermo();
reseedInterstitium();
relearnHeartFunction();
eng.calc(FINAL);
// save at a sinus-node firing: a loaded heart fires on its first step, so the stored volumes belong to
// the phase the cycle restarts in
const H = M.Heart;
for (let i = 0; i < 400; i++) { const b = H._sa_node_timer; eng.calc(model.modeling_stepsize); if (H._sa_node_timer < b) break; }
log.forEach((l) => say("  " + l));

const Mon = M.Monitor;
say(`${NAME}: levers [${active.join(", ") || "none"}]; after ${SETTLE}+${FINAL} s HR ${Mon.heart_rate.toFixed(1)}, ` +
  `MAP ${Mon.abp_pre?.toFixed?.(1) ?? "?"}, SpO2 ${Mon.sao2_pre.toFixed(1)}`);

model.name = NAME;
model.description = DESCRIPTION;
j.name = NAME;
j.description = DESCRIPTION;
j.provenance = "script-generated";
j.provenance_note = `derived from ${SOURCE} by scripts/_make_term_12h.mjs; reference values in docs/TermTransitionReference.md`;
j.model_definition = serializeState(model);
if (baselineWeight !== undefined) j.model_definition._baseline_weight = baselineWeight;
const text = JSON.stringify(j, null, 2);
JSON.parse(text);
if (WRITE) {
  fs.writeFileSync(new URL(`${NAME}.json`, dir), text);
  const idxUrl = new URL("index.json", dir);
  const idx = JSON.parse(fs.readFileSync(idxUrl, "utf8"));
  if (!idx.includes(NAME)) { idx.splice(1, 0, NAME); fs.writeFileSync(idxUrl, JSON.stringify(idx, null, 2) + "\n"); }
  say(`wrote model_definitions/${NAME}.json`);
} else if (OUT) {
  fs.writeFileSync(OUT, text);
  say(`wrote ${OUT}`);
} else say("dry run (pass --write or --out FILE)");

// --- helpers --------------------------------------------------------------------------------------
// time-average fn() over sec of model time in 20 ms steps (each fn() returns an object of numbers)
function avgOver(sec, fn) {
  const N = Math.round(sec / 0.02), acc = {};
  for (let i = 0; i < N; i++) {
    send("POST", "calc", 0.02);
    const v = fn();
    for (const k in v) acc[k] = (acc[k] ?? 0) + v[k] / N;
  }
  return acc;
}

// Baroreflex: fold the resting effector activity into the base values the effectors act on (the
// engine's own formulas, as scripts/_fix_baro_setpoint.mjs), reset the reflex to neutral and find the
// BR_MAP set-point that gives a mean firing rate of 0.5 at the resting arch pressure.
function reanchorBaroreflex() {
  const EF = ["EF_HR", "EF_SVR", "EF_HEART"];
  const rest = avgOver(20, () => ({ aar: M.AAR.pres, ...Object.fromEntries(EF.map((k) => [k, M[k].effector])) }));
  const mult = {};
  mult["Heart.heart_rate_ref"] = 1 + (M.EF_HR.effector - 1) * M.Heart.ans_sens;
  for (const [n, c] of Object.entries(M)) {
    if (c.model_type !== "HeartChamber" || !c.ans_sens) continue;
    const a = c.ans_activity;
    mult[`${n}.el_max`] = 1 + (a - 1) * c.ans_sens;
    for (const p of ["el_min", "el_k"]) if (c[p] > 0) mult[`${n}.${p}`] = 1 - (a - 1) * c.ans_sens;
  }
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
  for (const [k, f] of Object.entries(mult)) { const [n, p] = k.split("."); M[n][p] *= f; }
  const neutral = {
    "Heart.ans_activity": 1, "Heart.ans_activity_hr": 1, "Circulation.ans_activity": 1, "Circulation.prev_ans_activity": 1,
    "BR_MAP.firing_rate": 0.5, ...Object.fromEntries(EF.flatMap((k) => [[`${k}.effector`, 1], [`${k}.firing_rate`, 0.5]])),
  };
  for (const [n, v] of Object.entries(M)) if ((v.model_type === "BloodVessel" || v.model_type === "HeartChamber") && v.ans_sens) neutral[`${n}.ans_activity`] = 1;
  for (const [k, v] of Object.entries(neutral)) { const [n, p] = k.split("."); if (p in M[n]) M[n][p] = v; }
  const before = M.BR_MAP.set_value;
  M.BR_MAP.set_value = rest.aar;
  for (let it = 0; it < 8; it++) {
    eng.calc(60);
    const d = avgOver(20, () => ({ fr: M.BR_MAP.firing_rate })).fr - 0.5;
    if (Math.abs(d) < 0.002) break;
    M.BR_MAP.set_value += d / (0.5 / (M.BR_MAP.max_value - M.BR_MAP.set_value));
  }
  const maxf = Math.max(...Object.values(mult).map((f) => Math.abs(f - 1)));
  log.push(`baroreflex: resting ${EF.map((k) => `${k} ${rest[k].toFixed(3)}`).join(" ")}, AAR ${rest.aar.toFixed(2)}; ` +
    `folded ${Object.keys(mult).length} base values (max |f-1| ${maxf.toExponential(2)}); BR_MAP.set_value ${before.toFixed(2)} -> ${M.BR_MAP.set_value.toFixed(2)}`);
}

// Chemoreflex: set-points = the resting (time-averaged) inputs, so the firing rates rest at 0.5
function reanchorChemoreflex() {
  const CR = ["CR_PCO2", "CR_PO2", "CR_PH"];
  const a = avgOver(20, () => Object.fromEntries(CR.map((k) => [k, M[M[k].input_model][M[k].input_prop]])));
  for (const k of CR) { const b = M[k].set_value; M[k].set_value = a[k]; log.push(`${k}.set_value ${b} -> ${a[k].toFixed(4)}`); }
}

// Hormones and Glucose: set-points = the resting sensed values
function reanchorHormonesGlucose() {
  const Hm = M.Hormones, G = M.Glucose;
  const a = avgOver(20, () => ({ vol: Hm.sensed_volume, perf: Hm.sensed_perfusion, na: Hm.sensed_na, k: Hm.sensed_k, glu: G.glucose }));
  const pairs = [["volume_setpoint", a.vol], ["perfusion_setpoint", a.perf], ["osmo_na_setpoint", a.na], ["k_setpoint", a.k]];
  for (const [p, v] of pairs) { const b = Hm[p]; Hm[p] = v; log.push(`Hormones.${p} ${b} -> ${v.toFixed(5)}`); }
  const b = G.glucose_setpoint; G.glucose_setpoint = a.glu; log.push(`Glucose.glucose_setpoint ${b} -> ${a.glu.toFixed(4)}`);
}

// Lactate resting site O2 and the Thermoregulation heat-loss trim re-seed themselves after a warm-up
function reseedLactateThermo() {
  const L = M.Lactate, T = M.Thermoregulation;
  L.baseline_captured = false; L.baseline_to2 = {}; L._warmup_counter = 0.0;
  const trim = T.loss_trim;
  T.loss_trim_seeded = false; T._warmup_counter = 0.0;
  log.push(`Lactate baseline_to2 re-captured (${L._warmup_delay} s); Thermoregulation loss_trim ${trim.toFixed(4)} re-seeded`);
}

// Interstitium: re-seed its resting balance (offsets, lymph pressure) at the current state
function reseedInterstitium() {
  const I = M.Interstitium;
  if (!I?.is_enabled) return;
  I.p_offsets = []; I._seed_sums = null; I.isf_volume_rest = I.isf_volume;
}

// HeartFunction: clear the four resting wall-stress set-points and let it learn them at rest
function relearnHeartFunction() {
  const HF = M.HeartFunction;
  const KEYS = ["sigma_es_ref_lv", "sigma_ed_ref_lv", "sigma_es_ref_rv", "sigma_ed_ref_rv"];
  const before = KEYS.map((k) => HF[k].toFixed(2));
  for (const k of KEYS) { HF[k] = 0.0; HF._learn[k] = true; }
  HF._warmup_elapsed = 0.0;
  eng.calc(HF.setpoint_warmup + 5.0);
  log.push(`HeartFunction ${KEYS.join("/")} ${before.join("/")} -> ${KEYS.map((k) => HF[k].toFixed(2)).join("/")}`);
}
