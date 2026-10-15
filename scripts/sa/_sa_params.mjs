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
// A resistance scale group RELATIVE to the scenario as loaded: each member's r_factor_scaling_ps
// is multiplied by v, so v = 1 is the patient as built. eng.scale(group, v) sets that layer
// absolutely, which on a size-scaled scenario (bischoff_cohort, preterm_*) wiped the baked weight
// scaling at nominal: MAP 42 -> 30 mmHg on the Bischoff infant before any lever had moved. Each
// evaluation starts from a fresh build, so reading the layer at apply time is the loaded value.
const scaleGroupRel = (model, eng, group, v) => {
  const cfg = model.scaler_config ?? eng.model?.scaler_config;
  for (const n of cfg?.[group]?.resistance ?? []) {
    const c = model.models[n];
    if (c && typeof c.r_factor_scaling_ps === "number") c.r_factor_scaling_ps *= v;
  }
};
// the scenario's own value of an absolute-set factor (a preterm baseline bakes e.g. contractility
// x0.5), so OAT centres on the patient as loaded rather than on 1.0
const readFactor = (model, name, prop) => model.models[name]?.[prop] ?? 1;
const mulBase = (model, names, prop, v) => {
  for (const n of names) { const m = model.models[n]; if (m && typeof m[prop] === "number") m[prop] *= v; }
};

// compartment groups shared with the builder's levers
const LARGE_ARTERIES = ["AA", "AAR", "AD"];
const UPPER_BODY_ART = ["AA_BR_ART", "AA_RUB"];
const LOWER_BODY_ART = ["AD_INT_ART", "AD_LS_ART", "AD_KID_ART", "AD_RLB"];
const PULMONARY_ARTERIES = ["PA", "PAAL", "PAAR"];
const PERIPHERAL_ARTERIES = ["BR_ART", "INT_ART", "KID_ART", "LS_ART", "RUB", "RLB"];

// ---- REDUCED SET (15): one lever per builder target, plus two candidate elastance levers ----
export const REDUCED = [
  { name: "systemic_R", subsystem: "vascular", order: 10, scale: "log", lo: 0.3, hi: 8, nominal: () => 1,
    designatedOut: "map", apply: (m, eng, v) => scaleGroupRel(m, eng, "blood_systemic", v) },
  // the intrapulmonary shunt (IPSL/IPSR) moves with the bed, as build_patient's scalePvr does
  // (raised PVR does not create intrapulmonary shunt; without this the shunt's share of pulmonary
  // flow rose with every PVR sample and SpO2 fell for the wrong reason)
  { name: "pulmonary_R", subsystem: "vascular", order: 10, scale: "log", lo: 0.3, hi: 12, nominal: () => 1,
    designatedOut: "pap_m", apply: (m, eng, v) => { scaleGroupRel(m, eng, "blood_pulmonary", v); mulBase(m, ["IPSL", "IPSR"], "r_factor_scaling_ps", v); } },
  { name: "contractility", subsystem: "cardiac", order: 20, scale: "log", lo: 0.3, hi: 3, nominal: (m) => readFactor(m, "LV", "el_max_factor_ps"),
    designatedOut: "co", apply: (m, e, v) => setFactorPs(m, ["LV", "RV"], "el_max_factor_ps", v) },
  { name: "heart_rate_ref", subsystem: "cardiac", order: 20, scale: "linear", lo: 0.5, hi: 1.6, nominal: () => 1,
    designatedOut: "hr", apply: (m, e, v) => mulBase(m, ["Heart"], "heart_rate_ref", v) },
  { name: "O2_diffusion", subsystem: "gas-exchange", order: 20, scale: "log", lo: 0.1, hi: 8, nominal: (m) => readFactor(m, "GASEX_LL", "dif_o2_factor_ps"),
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
  // ---- the patient builder's remaining levers (scripts/build_patient.mjs), same mechanisms ----
  // pulse pressure <- large-artery stiffness (the windkessel). Upper bound 2.5: ARTERIAL_EL_MAX (6)
  // over the builder's size factor at 0.72 kg (2.2), so every sample stays inside what the builder
  // may set; the aortic resistors are integrated implicitly in every evaluation (_sa_eval)
  { name: "artery_stiffness", subsystem: "vascular", order: 20, scale: "log", lo: 0.3, hi: 2.5, nominal: (m) => readFactor(m, "AA", "el_base_factor_ps"),
    designatedOut: "pp", apply: (m, e, v) => setFactorPs(m, LARGE_ARTERIES, "el_base_factor_ps", v) },
  // SVC flow <- the upper/lower-body arteriolar resistance split u (upper / u, lower x u)
  { name: "svc_split", subsystem: "vascular", order: 20, scale: "log", lo: 0.4, hi: 3, nominal: () => 1,
    designatedOut: "svc", apply: (m, e, v) => { setFactorPs(m, UPPER_BODY_ART, "r_factor_ps", 1 / v); setFactorPs(m, LOWER_BODY_ART, "r_factor_ps", v); } },
  // ---- candidate levers (not in the builder yet; the SA decides whether they earn a place) ----
  // pulmonary artery elastance: P1 obtained its bidirectional duct with PVR AND this (PA x2)
  { name: "pulmonary_el", subsystem: "vascular", order: 20, scale: "log", lo: 0.5, hi: 4, nominal: (m) => readFactor(m, "PA", "el_base_factor_ps"),
    designatedOut: "da_fwd", apply: (m, e, v) => setFactorPs(m, PULMONARY_ARTERIES, "el_base_factor_ps", v) },
  // peripheral systemic arteries (regional arteries and the two body remainders), apart from the aorta
  { name: "systemic_el", subsystem: "vascular", order: 20, scale: "log", lo: 0.5, hi: 4, nominal: (m) => readFactor(m, "BR_ART", "el_base_factor_ps"),
    designatedOut: "dia", apply: (m, e, v) => setFactorPs(m, PERIPHERAL_ARTERIES, "el_base_factor_ps", v) },
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
  { name: "diastolic_stiffness", subsystem: "cardiac", order: 20, scale: "log", lo: 0.3, hi: 3, nominal: (m) => readFactor(m, "LV", "el_min_factor_ps"),
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
  // the builder's newer targets and the ductal direction
  "svc", "pp", "pap_s", "da_fwd",
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
  svc: [0, 5], pp: [0, 150], pap_s: [0, 250], da_fwd: [0, 1],
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
    svc: vit.svc,                                            // L/min
    pp: (vit.sys != null && vit.dia != null) ? vit.sys - vit.dia : undefined,
    pap_s: vit.pap_s,
    // fraction of the last beat with left-to-right ductal flow (Pda latch); 1 = never right-to-left
    da_fwd: extra.da_fwd,
  };
}

// designated controller: output -> lever name (the one-lever hypothesis to test)
export const DESIGNATED = {
  map: "systemic_R", pap_m: "pulmonary_R", co: "contractility", hr: "heart_rate_ref",
  spo2: "O2_diffusion", po2: "O2_diffusion", pco2: "vent_drive", be: "uma", ph: "uma",
  cvp: "venous_uvol", q_da: "pda_diameter", q_fo: "fo_diameter",
  rr: "vent_drive",
  // the builder takes the duct as measured (pda_mm), so the tunable lever of the net shunt is PVR
  lvo_minus_rvo: "pulmonary_R",
  pp: "artery_stiffness", svc: "svc_split", da_fwd: "pulmonary_el",
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
