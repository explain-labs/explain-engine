// Sensitivity-analysis PARAMETER REGISTRY for the Explain engine.
//
// The SA input space deliberately MIRRORS the AI-calibration lever space
// (explain/helpers/Calibrator.js + scripts/build_patient.mjs): one perturbation per
// physiologically-interpretable knob, using the exact non-destructive mechanisms the
// calibrator uses (engine scale groups, `*_factor_ps` layers, direct setpoints,
// base-param multipliers). This is what lets the SA TEST the one-lever-per-target
// hypothesis on which the calibration rests.
//
// Each parameter:
//   name            unique id
//   subsystem       grouping for reporting
//   order           apply order within one evaluation (weight first — it resets
//                   resistance scaling — then scale groups, then everything else)
//   scale           "log" | "linear" — the space Morris/Sobol/LHS sample in
//   lo, hi          sampling bounds (reuse the calibrator [lo,hi] clamps where they exist)
//   nominal(model)  the value that reproduces the loaded scenario (for OAT centering /
//                   elasticity normalisation); 1.0 for multiplier/scale levers
//   designatedOut   the clinical output this lever is the DESIGNATED controller of
//                   (the hypothesis the SA checks: this lever should dominate that output)
//   apply(model, eng, v)  perturb the freshly-built model to setting v
//
// Perturbation semantics (all applied ONCE per evaluation, on a fresh `build`):
//   - scale-group levers (systemic/pulmonary R, weight): eng.scale(group, v) — absolute-set,
//     nominal 1.0 (weight is absolute kg).   NEVER touch Circulation.svr_factor_art (Hormones
//     clobbers it every step) — the systemic_resistances scale group is the correct MAP lever.
//   - `*_factor_ps` levers (contractility, O2 diffusion, diastolic stiffness): set = v, nominal 1.0.
//   - multiplier-on-base levers (HR ref, venous u_vol, ventilatory drive, Hb, VO2, vt_rr):
//     prop *= v, nominal 1.0 (multiplies the fresh scenario value).
//   - absolute levers (uma, ductus/FO/VSD diameter, Pda length/Cd, ips_res, temp, BR setpoint):
//     prop = v, nominal read from the scenario.

const setFactorPs = (model, names, prop, v) => {
  for (const n of names) { const m = model.models[n]; if (m) m[prop] = v; }
};
const mulBase = (model, names, prop, v) => {
  for (const n of names) { const m = model.models[n]; if (m && typeof m[prop] === "number") m[prop] *= v; }
};

// ---- REDUCED SET (11): one lever per subsystem, each a designated single-target controller ----
export const REDUCED = [
  { name: "systemic_R", subsystem: "vascular", order: 10, scale: "log", lo: 0.3, hi: 8, nominal: () => 1,
    designatedOut: "map", apply: (m, eng, v) => eng.scale("systemic_resistances", v) },
  { name: "pulmonary_R", subsystem: "vascular", order: 10, scale: "log", lo: 0.3, hi: 12, nominal: () => 1,
    designatedOut: "pap_m", apply: (m, eng, v) => eng.scale("pulmonary_resistances", v) },
  { name: "contractility", subsystem: "cardiac", order: 20, scale: "log", lo: 0.3, hi: 3, nominal: () => 1,
    designatedOut: "co", apply: (m, e, v) => setFactorPs(m, ["LV", "RV"], "el_max_factor_ps", v) },
  { name: "heart_rate_ref", subsystem: "cardiac", order: 20, scale: "linear", lo: 0.5, hi: 1.6, nominal: () => 1,
    designatedOut: "hr", apply: (m, e, v) => mulBase(m, ["Heart"], "heart_rate_ref", v) },
  { name: "O2_diffusion", subsystem: "gas-exchange", order: 20, scale: "log", lo: 0.1, hi: 8, nominal: () => 1,
    designatedOut: "spo2", apply: (m, e, v) => setFactorPs(m, ["GASEX_LL", "GASEX_RL"], "dif_o2_factor_ps", v) },
  { name: "vent_drive", subsystem: "respiratory", order: 20, scale: "log", lo: 0.2, hi: 2.5, nominal: () => 1,
    designatedOut: "pco2", apply: (m, e, v) => mulBase(m, ["Breathing"], "minute_volume_ref", v) },
  { name: "uma", subsystem: "acid-base", order: 20, scale: "linear", lo: 0, hi: 40,
    nominal: (m) => m.models.AA?.solutes?.uma ?? 0,
    designatedOut: "be", apply: (m, e, v) => m.models.Blood?.set_solute("uma", Math.max(0, v)) },
  { name: "venous_uvol", subsystem: "vascular", order: 20, scale: "linear", lo: 0.5, hi: 1.3, nominal: () => 1,
    designatedOut: "cvp", apply: (m, e, v) => mulBase(m, ["VLB", "VUB"], "u_vol", v) },
  { name: "pda_diameter", subsystem: "shunt", order: 20, scale: "linear", lo: 0, hi: 1,
    nominal: (m) => m.models.Pda?.diameter_relative ?? 0,
    designatedOut: "q_da", apply: (m, e, v) => { if (m.models.Pda) m.models.Pda.diameter_relative = v; } },
  { name: "fo_diameter", subsystem: "shunt", order: 20, scale: "linear", lo: 0, hi: 12,
    nominal: (m) => m.models.Shunts?.diameter_fo ?? 0,
    designatedOut: "q_fo", apply: (m, e, v) => { if (m.models.Shunts) m.models.Shunts.diameter_fo = v; } },
  // weight is a MEASURED input (birth weight), set directly and never tuned to hit a vital sign.
  // context:true => held fixed (conditioned on), NOT sampled, in the calibration-oriented SA — otherwise
  // its wide 0.6-4 kg range dominates the variance of size-dependent outputs and masks the conditional
  // one-lever structure. Still reachable via run_sa --include-context for the population variance decomposition.
  // (The same principle would apply to other measured inputs — haemoglobin, temperature — but only weight
  // materially distorts the results, so only it is flagged context.)
  { name: "weight", subsystem: "body-size", order: 0, scale: "log", lo: 0.6, hi: 4, context: true,
    nominal: (m) => m.weight,
    designatedOut: null, apply: (m, eng, v) => { eng.scale("weight_scale", v); m.weight = v; } },
];

// ---- EXPANDED SET: reduced + interaction/identifiability parameters ----
export const EXPANDED = [
  ...REDUCED,
  { name: "diastolic_stiffness", subsystem: "cardiac", order: 20, scale: "log", lo: 0.3, hi: 3, nominal: () => 1,
    designatedOut: "cvp", apply: (m, e, v) => setFactorPs(m, ["LV", "RV"], "el_min_factor_ps", v) },
  { name: "pericardium", subsystem: "cardiac", order: 20, scale: "linear", lo: 0.5, hi: 3,
    nominal: (m) => m.models.Heart?.pc_el_factor ?? 1,
    designatedOut: "cvp", apply: (m, e, v) => { if (m.models.Heart) m.models.Heart.pc_el_factor = v; } },
  { name: "baroreflex_setpoint", subsystem: "control", order: 20, scale: "linear", lo: 30, hi: 70,
    nominal: (m) => m.models.BR_MAP?.set_value ?? 50,
    designatedOut: "map", apply: (m, e, v) => { if (m.models.BR_MAP) m.models.BR_MAP.set_value = v; } },
  { name: "ans_hr_gain", subsystem: "control", order: 20, scale: "linear", lo: 0.5, hi: 1.5, nominal: () => 1,
    designatedOut: "hr", apply: (m, e, v) => mulBase(m, ["EF_HR"], "effect_at_max_firing_rate", v) },
  { name: "ans_svr_gain", subsystem: "control", order: 20, scale: "linear", lo: 0.5, hi: 1.5, nominal: () => 1,
    designatedOut: "map", apply: (m, e, v) => mulBase(m, ["EF_SVR"], "effect_at_max_firing_rate", v) },
  { name: "vt_rr_ratio", subsystem: "respiratory", order: 20, scale: "log", lo: 0.5, hi: 1.6, nominal: () => 1,
    designatedOut: "pco2", apply: (m, e, v) => mulBase(m, ["Breathing"], "vt_rr_ratio", v) },
  { name: "vo2", subsystem: "metabolic", order: 20, scale: "log", lo: 0.5, hi: 1.8, nominal: () => 1,
    designatedOut: "svo2", apply: (m, e, v) => mulBase(m, ["Metabolism"], "vo2", v) },
  { name: "resp_q", subsystem: "metabolic", order: 20, scale: "linear", lo: 0.7, hi: 1.0,
    nominal: (m) => m.models.Metabolism?.resp_q ?? 0.8,
    designatedOut: "etco2", apply: (m, e, v) => { if (m.models.Metabolism) m.models.Metabolism.resp_q = v; } },
  { name: "hemoglobin", subsystem: "blood", order: 20, scale: "linear", lo: 4, hi: 12,
    nominal: (m) => m.models.AA?.solutes?.hemoglobin ?? 8,
    designatedOut: "po2", apply: (m, e, v) => m.models.Blood?.set_solute("hemoglobin", v) },
  { name: "ips_res", subsystem: "shunt", order: 20, scale: "log", lo: 800, hi: 12000,
    nominal: (m) => m.models.Shunts?.ips_res ?? 5000,
    designatedOut: "spo2", apply: (m, e, v) => { if (m.models.Shunts) m.models.Shunts.ips_res = v; } },
  { name: "vsd_diameter", subsystem: "shunt", order: 20, scale: "linear", lo: 0, hi: 10,
    nominal: (m) => m.models.Shunts?.diameter_vsd ?? 0,
    designatedOut: "q_fo", apply: (m, e, v) => { if (m.models.Shunts) m.models.Shunts.diameter_vsd = v; } },
  { name: "pda_length", subsystem: "shunt", order: 20, scale: "linear", lo: 1.5, hi: 14,
    nominal: (m) => m.models.Pda?.length ?? 14,
    designatedOut: "q_da", apply: (m, e, v) => { if (m.models.Pda) m.models.Pda.length = v; } },
  { name: "pda_discharge", subsystem: "shunt", order: 20, scale: "linear", lo: 0.3, hi: 1,
    nominal: (m) => m.models.Pda?.discharge_coeff ?? 0.8,
    designatedOut: "q_da", apply: (m, e, v) => { if (m.models.Pda) m.models.Pda.discharge_coeff = v; } },
  { name: "lung_stiffness", subsystem: "respiratory", order: 20, scale: "log", lo: 0.5, hi: 5, nominal: () => 1,
    designatedOut: "pco2", apply: (m, e, v) => mulBase(m, ["ALL", "ALR"], "el_base", v) },
  { name: "temp_setpoint", subsystem: "metabolic", order: 20, scale: "linear", lo: 35, hi: 39,
    nominal: (m) => m.models.Thermoregulation?.setpoint_temp ?? 37,
    designatedOut: "hr", apply: (m, e, v) => { if (m.models.Thermoregulation) m.models.Thermoregulation.setpoint_temp = v; } },
];

// ---- OUTPUT VECTOR (from measureVitals + atrial shunt), the clinical targets ----
// BASE outputs are live in every scenario, ventilated or spontaneous.
// `rvo` and `rr` were always measured by measureVitals but never surfaced here;
// `lvo_minus_rvo` is the bi-ventricular output difference, which IS the net shunt and is
// a far more direct observation of the duct/FO than q_da alone (whose variance is
// dominated by the PVR/SVR ratio rather than by duct calibre).
export const BASE_OUTPUTS = [
  "hr", "map", "sys", "dia", "cvp", "pap_m", "co", "rvo", "lvo_minus_rvo",
  "spo2", "spo2_post", "svo2", "po2", "pco2", "ph", "be", "etco2",
  "rr", "vt", "mv", "q_da", "q_fo",
];

// Airway mechanics exist only under positive-pressure ventilation. In a spontaneously
// breathing scenario they are identically 0, which would give a zero-variance column and
// divide-by-zero in the Sobol estimator — so they are opt-in, never in the default set.
export const VENT_OUTPUTS = ["c_dyn", "r_aw"];

export const OUTPUTS = BASE_OUTPUTS;

export function getOutputs({ ventilated = false } = {}) {
  return ventilated ? [...BASE_OUTPUTS, ...VENT_OUTPUTS] : [...BASE_OUTPUTS];
}

// PLAUSIBILITY BOUNDS — deliberately far wider than any normal range (RANGES in
// scripts/_probe.mjs is the normal-range table; this is not that). The purpose is only to
// catch numerical blow-up, never to constrain pathology: a candidate may legitimately be
// in extremis, but it may not have a heart rate of 900.
//
// Motivation: the committed term_neonate Sobol run reported SD(hr) = 342 bpm and
// SD(q_fo) = 673 mL/min, giving sum(S_T) ~ 6.8 and individual S_T > 2 — impossible for a
// valid decomposition. The cause is heavy tails, not a real effect: Monitor derives
// beat-to-beat HR as 60/interval, which explodes when a candidate barely beats, and q_fo
// changes sign. Values outside these bounds are masked to NaN PER OUTPUT (not per row),
// so analyzeSobol's existing per-column `keep` filter drops them from that column only and
// every other output keeps the row.
export const PLAUSIBLE = {
  hr: [5, 320], map: [1, 200], sys: [1, 250], dia: [0, 200], cvp: [-15, 60], pap_m: [0, 200],
  co: [0, 5], rvo: [0, 5], lvo_minus_rvo: [-3000, 3000],
  spo2: [0, 100], spo2_post: [0, 100], svo2: [0, 100],
  po2: [0, 800], pco2: [0, 300], ph: [6.2, 8.0], be: [-50, 50], etco2: [0, 200],
  rr: [0, 200], vt: [0, 0.2], mv: [0, 10],
  c_dyn: [0, 100], r_aw: [0, 2000],
  q_da: [-5000, 5000], q_fo: [-5000, 5000],
};

// Outputs whose non-finiteness means the simulation itself diverged, rather than one
// channel being unreadable. Only these justify discarding the whole evaluation.
export const CORE_OUTPUTS = ["map", "co", "ph", "po2"];

// Mask implausible values to NaN in place. Returns the number of channels masked.
export function maskImplausible(out, outputs = OUTPUTS) {
  let masked = 0;
  for (const k of outputs) {
    const v = out[k];
    const b = PLAUSIBLE[k];
    if (!Number.isFinite(v)) { out[k] = NaN; masked++; continue; }
    if (b && (v < b[0] || v > b[1])) { out[k] = NaN; masked++; }
  }
  return masked;
}

// map a measureVitals result (+ extra reads) to the OUTPUTS vector
export function toOutputVector(vit, extra = {}) {
  return {
    hr: vit.hr, map: vit.map, sys: vit.sys, dia: vit.dia, cvp: vit.cvp, pap_m: vit.pap_m,
    co: vit.lvo, spo2: vit.spo2_pre, spo2_post: vit.spo2_post, svo2: vit.svo2,
    po2: vit.po2, pco2: vit.pco2, ph: vit.ph, be: vit.be, etco2: vit.etco2,
    rvo: vit.rvo,                                            // L/min
    // net shunt, in mL/min to match the q_da/q_fo convention. LVO is inflated by a ductal
    // L->R shunt and RVO by an atrial one, so the difference carries the shunt directly.
    lvo_minus_rvo: (vit.lvo != null && vit.rvo != null) ? (vit.lvo - vit.rvo) * 1000 : undefined,
    rr: vit.rr, vt: vit.vt, mv: vit.mv,                      // breaths/min, L, L/min
    c_dyn: vit.c_dyn, r_aw: vit.r_aw,                        // mL/cmH2O, cmH2O/(L/s)
    q_da: vit.q_da != null ? vit.q_da * 60000 : undefined,   // L/s -> mL/min
    q_fo: extra.q_fo != null ? extra.q_fo * 60000 : undefined,
  };
}

// designated controller: output -> lever name (the one-lever hypothesis to test)
export const DESIGNATED = {
  map: "systemic_R", pap_m: "pulmonary_R", co: "contractility", hr: "heart_rate_ref",
  spo2: "O2_diffusion", po2: "O2_diffusion", pco2: "vent_drive", be: "uma", ph: "uma",
  cvp: "venous_uvol", q_da: "pda_diameter", q_fo: "fo_diameter",
  lvo_minus_rvo: "pda_diameter", rr: "vent_drive",
};

export function getParamSet(name) {
  if (name === "reduced") return REDUCED;
  if (name === "expanded") return EXPANDED;
  throw new Error(`unknown param set "${name}" (use reduced|expanded)`);
}

// the TUNABLE lever set = the param set minus measured `context` inputs (weight). This is the default
// input space for the calibration-oriented SA; pass includeContext=true for the population decomposition.
export function getLeverSet(name, { includeContext = false } = {}) {
  const set = getParamSet(name);
  return includeContext ? set : set.filter((p) => !p.context);
}

// apply a full parameter vector to a freshly-built model, in the correct order
export function applyAll(model, eng, params, values) {
  const idx = params.map((p, i) => i).sort((a, b) => params[a].order - params[b].order);
  for (const i of idx) params[i].apply(model, eng, values[i]);
}
