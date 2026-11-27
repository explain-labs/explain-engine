// Controller re-anchoring for scenario generators: after levers move a scenario to a new resting state, every
// controller is re-anchored to that state so the saved scenario holds it instead of drifting back. Same code as
// the helpers at the end of scripts/_make_term_transition.mjs (engine 838e959 controller inventory), shared here
// for scripts/_make_adult_female.mjs. Each function takes ctx = { eng, M, model, log } (log: array of strings).

// time-average fn() over sec of model time in 20 ms steps (each fn() returns an object of numbers)
export function avgOver(ctx, sec, fn) {
  const N = Math.round(sec / 0.02), acc = {};
  for (let i = 0; i < N; i++) {
    ctx.eng.calc(0.02);
    const v = fn();
    for (const k in v) acc[k] = (acc[k] ?? 0) + v[k] / N;
  }
  return acc;
}

// Baroreflex: fold the resting effector activity into the base values the effectors act on (the engine's own
// formulas, as scripts/_fix_baro_setpoint.mjs), reset the reflex to neutral and find the BR_MAP set-point that
// gives a mean firing rate of 0.5 at the resting arch pressure.
export function reanchorBaroreflex(ctx) {
  const { eng, M, log } = ctx;
  const EF = ["EF_HR", "EF_SVR", "EF_HEART"];
  const rest = avgOver(ctx, 20, () => ({ aar: M.AAR.pres, ...Object.fromEntries(EF.map((k) => [k, M[k].effector])) }));
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
    const d = avgOver(ctx, 20, () => ({ fr: M.BR_MAP.firing_rate })).fr - 0.5;
    if (Math.abs(d) < 0.002) break;
    M.BR_MAP.set_value += d / (0.5 / (M.BR_MAP.max_value - M.BR_MAP.set_value));
  }
  const maxf = Math.max(...Object.values(mult).map((f) => Math.abs(f - 1)));
  log.push(`baroreflex: resting ${EF.map((k) => `${k} ${rest[k].toFixed(3)}`).join(" ")}, AAR ${rest.aar.toFixed(2)}; ` +
    `folded ${Object.keys(mult).length} base values (max |f-1| ${maxf.toExponential(2)}); BR_MAP.set_value ${before.toFixed(2)} -> ${M.BR_MAP.set_value.toFixed(2)}`);
}

// Chemoreflex: set-points = the resting (time-averaged) inputs, so the firing rates rest at 0.5
export function reanchorChemoreflex(ctx) {
  const { M, log } = ctx;
  const CR = ["CR_PCO2", "CR_PO2", "CR_PH"];
  const a = avgOver(ctx, 20, () => Object.fromEntries(CR.map((k) => [k, M[M[k].input_model][M[k].input_prop]])));
  for (const k of CR) { const b = M[k].set_value; M[k].set_value = a[k]; log.push(`${k}.set_value ${b} -> ${a[k].toFixed(4)}`); }
}

// Hormones and Glucose: set-points = the resting sensed values
export function reanchorHormonesGlucose(ctx) {
  const { M, log } = ctx;
  const Hm = M.Hormones, G = M.Glucose;
  const a = avgOver(ctx, 20, () => ({ vol: Hm.sensed_volume, perf: Hm.sensed_perfusion, na: Hm.sensed_na, k: Hm.sensed_k, glu: G.glucose }));
  const pairs = [["volume_setpoint", a.vol], ["perfusion_setpoint", a.perf], ["osmo_na_setpoint", a.na], ["k_setpoint", a.k]];
  for (const [p, v] of pairs) { const b = Hm[p]; Hm[p] = v; log.push(`Hormones.${p} ${b} -> ${v.toFixed(5)}`); }
  const b = G.glucose_setpoint; G.glucose_setpoint = a.glu; log.push(`Glucose.glucose_setpoint ${b} -> ${a.glu.toFixed(4)}`);
}

// Lactate resting site O2 and the Thermoregulation heat-loss trim re-seed themselves after a warm-up
export function reseedLactateThermo(ctx) {
  const { M, log } = ctx;
  const L = M.Lactate, T = M.Thermoregulation;
  L.baseline_captured = false; L.baseline_to2 = {}; L._warmup_counter = 0.0;
  const trim = T.loss_trim;
  T.loss_trim_seeded = false; T._warmup_counter = 0.0;
  log.push(`Lactate baseline_to2 re-captured (${L._warmup_delay} s); Thermoregulation loss_trim ${trim.toFixed(4)} re-seeded`);
}

// Interstitium: re-seed its resting balance (offsets, lymph pressure) at the current state
export function reseedInterstitium(ctx) {
  const I = ctx.M.Interstitium;
  if (!I?.is_enabled) return;
  I.p_offsets = []; I._seed_sums = null; I.isf_volume_rest = I.isf_volume;
}

// HeartFunction: clear the four resting wall-stress set-points and let it learn them at rest
export function relearnHeartFunction(ctx) {
  const { eng, M, log } = ctx;
  const HF = M.HeartFunction;
  const KEYS = ["sigma_es_ref_lv", "sigma_ed_ref_lv", "sigma_es_ref_rv", "sigma_ed_ref_rv"];
  const before = KEYS.map((k) => HF[k].toFixed(2));
  for (const k of KEYS) { HF[k] = 0.0; HF._learn[k] = true; }
  HF._warmup_elapsed = 0.0;
  eng.calc(HF.setpoint_warmup + 5.0);
  log.push(`HeartFunction ${KEYS.join("/")} ${before.join("/")} -> ${KEYS.map((k) => HF[k].toFixed(2)).join("/")}`);
}

// save at a sinus-node firing: a loaded heart fires on its first step, so the stored volumes belong to the
// phase the cycle restarts in
export function advanceToSinusFiring(ctx) {
  const { eng, M, model } = ctx;
  const H = M.Heart;
  for (let i = 0; i < 400; i++) { const b = H._sa_node_timer; eng.calc(model.modeling_stepsize); if (H._sa_node_timer < b) break; }
}
