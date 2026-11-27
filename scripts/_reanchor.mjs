// Controller re-anchoring for scenario generators: after levers move a scenario to a new resting state, every
// controller is re-anchored to that state so the saved scenario holds it instead of drifting back. Same code as
// the helpers at the end of scripts/_make_term_transition.mjs (engine 838e959 controller inventory) plus the brain, kidney
// and maintenance anchors, shared by scripts/_make_adult_female.mjs and scripts/_make_adult_female_pregnant.mjs. Each function takes ctx = { eng, M, model, log } (log: array of strings).

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

// Brain anchors at the resting state: the CO2 / O2-content references, baseline CPP and blood volume (ICP reference).
// Captured at the very end, once the ventilation trim has settled: captured earlier, a PaCO2 excursion between trims
// (41.5 vs 37.5 at rest) left the brain sensing "hypocapnia" (co2_factor 0.84, CBF 10.2 instead of 12).
export function reanchorBrain(ctx) {
  const { M, log } = ctx;
  const B = M.Brain;
  const a = avgOver(ctx, 20, () => ({ pco2: M[B.co2_model]?.pco2, to2: M[B.o2_model]?.to2, cpp: B.cpp, cbv: B.cerebral_blood_volume }));
  const before = [B.co2_ref, B.o2_ref, B.cpp_setpoint, B.cbv0].map((x) => x?.toFixed?.(3));
  Object.assign(B, { co2_ref: a.pco2, o2_ref: a.to2, cpp_setpoint: a.cpp, cbv0: a.cbv, co2_factor: 1.0, o2_factor: 1.0 });
  log.push(`Brain co2_ref/o2_ref/cpp_setpoint/cbv0 ${before.join("/")} -> ${[a.pco2, a.to2, a.cpp, a.cbv].map((x) => x.toFixed(3)).join("/")}`);
}

// Kidney anchors: the myogenic set-point at the sensed renal perfusion pressure, the TGF set-point at the resting signal
export function reanchorKidney(ctx) {
  const { M, log } = ctx;
  const K = M.Kidneys;
  const a = avgOver(ctx, 20, () => ({ p: K.sensed_pressure, tgf: K.tgf_signal }));
  const b = [K.myogenic_p_set, K.tgf_setpoint].map((x) => x?.toFixed?.(2));
  K.myogenic_p_set = a.p; K.tgf_setpoint = a.tgf;
  log.push(`Kidneys myogenic_p_set/tgf_setpoint ${b.join("/")} -> ${a.p.toFixed(2)}/${a.tgf.toFixed(2)}`);
}

// maintenance intake (Fluids) = the resting urine output, so the blood volume holds (as the 72 h baby: 1.35 vs urine ~1.4)
export function reanchorMaintenance(ctx) {
  const { M, model, log } = ctx;
  const F = M.Fluids, K = M.Kidneys;
  const u = avgOver(ctx, 120, () => ({ urine: K.urine_flow })).urine * 60 / model.weight; // mL/min -> mL/kg/h
  log.push(`Fluids.maintenance_rate ${F.maintenance_rate.toFixed(3)} -> ${u.toFixed(3)} mL/kg/h (resting urine)`);
  F.maintenance_rate = u;
  // composition = the resting urine composition (plasma x (1 - fr_solute) / (1 - fr_water)), so every filtered solute's
  // intake matches its excretion (the baby's maintenance fluid is its urine composition too)
  const fl = F.fluids[F.maintenance_fluid] ?? (F.fluids[F.maintenance_fluid] = {});
  const frw = K.reabsorption_fraction, before = JSON.stringify(fl);
  for (const s of K.filterable_solutes) fl[s] = +(M.AA.solutes[s] * (1 - K._solute_reabs(s)) / (1 - frw)).toFixed(3);
  log.push(`Fluids.fluids.${F.maintenance_fluid} ${before} -> ${JSON.stringify(fl)}`);
}
