// Shared closed-loop calibrator for the Explain engine.
//
// Drives measured physiological quantities toward target values by iterating one
// lever per target: apply lever -> advance the model -> measure -> nudge -> repeat
// (proportional seed, then the secant method once two samples exist). It is the
// same loop the headless patient-builder uses; this module factors it out so it
// can ALSO run inside the Web Worker against the live `model` (in-place live tune).
//
// Two callers, both with direct `model` access:
//   - scripts/build_patient.mjs (Node) — builds a fresh patient from a baseline.
//   - explain/ModelEngine.js (worker)  — tunes the running model in place.
// Each injects a `step(seconds)` callback (advance the model) and a `measureAll()`
// (read averaged vitals); the loop itself is environment-agnostic.
//
// LIVE-TUNE LEVERS (buildLiveControllers below) deliberately use the persistent
// `*_factor_ps` / direct-setter layers — NOT ModelScaler groups — so they COMPOSE
// with whatever scaling a loaded patient already baked in, instead of overwriting
// it. (ModelScaler's `_apply` SETS the scaling layer absolutely, which would clobber
// a preterm's baked SVR/PVR scaling.)

const SLICE = 0.02; // sub-cardiac-cycle sample step for windowed averaging

// ---------------------------------------------------------------------------
// Controller — one lever driving one measured quantity toward `target`.
// ---------------------------------------------------------------------------
// spec: { key, readKey?, lo, hi, sign, gain, value, set, target, tol }
//   key     canonical target name (e.g. "co")
//   readKey key into the measured dict (defaults to `key`; e.g. co -> "lvo")
//   sign    +1 if increasing the lever increases the measured value
//   gain    proportional seed gain (lever units per measured unit)
//   value   current lever value
//   set     (v) => void   apply the lever value to the model
//   target  desired measured value
//   tol     convergence tolerance on the measured value
export function makeController(spec) {
  return {
    ...spec,
    readKey: spec.readKey ?? spec.key,
    prevL: null,
    prevM: null,
    // nudge the lever given the latest measured value; returns true if it moved
    step(measured) {
      if (typeof measured !== "number" || Number.isNaN(measured)) return false;
      if (Math.abs(this.target - measured) <= this.tol) {
        this.prevL = this.value;
        this.prevM = measured;
        return false;
      }
      let nl;
      if (
        this.prevL != null &&
        this.prevM != null &&
        Math.abs(measured - this.prevM) > 1e-9 &&
        Math.abs(this.value - this.prevL) > 1e-12
      ) {
        const slope = (measured - this.prevM) / (this.value - this.prevL);
        nl = this.value + (this.target - measured) / slope;
      } else {
        nl = this.value + this.sign * this.gain * (this.target - measured);
      }
      nl = Math.min(this.hi, Math.max(this.lo, nl));
      this.prevL = this.value;
      this.prevM = measured;
      this.value = nl;
      this.set(nl);
      return true;
    },
  };
}

// ---------------------------------------------------------------------------
// Generic calibration loop. Shared by build + live tune.
// ---------------------------------------------------------------------------
// controllers : makeController[] (each already applied to the model once)
// opts.measureAll : () => dict   averaged vitals (keys match controller.readKey)
// opts.step       : (seconds) => void   advance the model
// returns { iters, converged, residuals:[{key,target,value,within}] }
export function runCalibration(controllers, opts) {
  const { measureAll, step, settle = 90, warm = 45, maxIters = 12, final = 0, log = () => {} } = opts;
  if (!controllers.length) return { iters: 0, converged: true, residuals: [] };

  step(settle); // settle after any structural changes / from the live operating point
  let v = {};
  let it = 0;
  for (; it < maxIters; it++) {
    v = measureAll();
    log(
      `iter ${it}: ` +
        controllers
          .map((c) => {
            const m = v[c.readKey];
            const ok = typeof m === "number" && Math.abs(c.target - m) <= c.tol;
            return `${c.key}=${fmt(m)}/${c.target}${ok ? "✓" : ""}`;
          })
          .join("  "),
    );
    let moved = false;
    for (const c of controllers) if (c.step(v[c.readKey])) moved = true;
    if (!moved) {
      log(`converged at iter ${it}`);
      break;
    }
    step(warm);
  }
  if (final > 0) step(final);

  const vf = measureAll();
  const residuals = controllers.map((c) => {
    const m = vf[c.readKey];
    return { key: c.key, target: c.target, value: m, within: typeof m === "number" && Math.abs(c.target - m) <= c.tol };
  });
  return { iters: it, converged: residuals.every((r) => r.within), residuals, measured: vf };
}

function fmt(x) {
  return typeof x === "number" && isFinite(x) ? Number(x.toFixed(2)) : x;
}

// ---------------------------------------------------------------------------
// Live measurement — read the monitor/ABG straight off the running model.
// ---------------------------------------------------------------------------
// The Monitor model already beat-averages flows/pressures; we additionally average
// over a short window for robustness. Returns only the requested keys.
const LIVE_READ = {
  map: (m) => m.models.Monitor?.minmax?.abp_pre_pres_mean,
  cvp: (m) => m.models.Monitor?.minmax?.cvp_pres_mean,
  pap_m: (m) => m.models.Monitor?.minmax?.pap_pres_mean,
  hr: (m) => m.models.Monitor?.heart_rate,
  lvo: (m) => m.models.Monitor?.flows?.lvo, // cardiac output (L/min)
  spo2_pre: (m) => m.models.Monitor?.sao2_pre,
  po2: (m) => m.models.AA?.po2,
  pco2: (m) => m.models.AA?.pco2,
  ph: (m) => m.models.AA?.ph,
  be: (m) => m.models.AA?.be,
  total_blood_volume: (m) => m.models.Circulation?.total_blood_volume,
};

export function measureWindow(model, step, keys, window = 12) {
  const n = Math.max(1, Math.round(window / SLICE));
  const acc = {};
  for (const k of keys) acc[k] = 0;
  for (let i = 0; i < n; i++) {
    step(SLICE);
    for (const k of keys) acc[k] += LIVE_READ[k] ? LIVE_READ[k](model) ?? 0 : 0;
  }
  for (const k of keys) acc[k] /= n;
  return acc;
}

// ---------------------------------------------------------------------------
// Live-tune controller specs (composable levers). Keyed by canonical target name.
// ---------------------------------------------------------------------------
export const DEFAULT_TOL = {
  map: 3, cvp: 1.5, pap_m: 3, hr: 6, co: 0.03, spo2: 2,
  po2: 6, pco2: 4, ph: 0.03, be: 1.5, blood_volume: 0.02,
};

// which monitor key each target reads
const READ_KEY = { co: "lvo", spo2: "spo2_pre", blood_volume: "total_blood_volume" };

// Build the controllers for a live tune of `targets` (a {name:value} map) on the
// given live `model`. Levers compose with baked scaling (use *_factor_ps / setters).
// Returns { controllers, keys } where keys are the measure-dict keys to sample.
export function buildLiveControllers(model, targets, tolOverrides = {}) {
  const controllers = [];
  const tol = (k) => tolOverrides[k] ?? DEFAULT_TOL[k];
  const mk = (key, spec) =>
    controllers.push(
      makeController({ key, readKey: READ_KEY[key] ?? key, target: targets[key], tol: tol(key), ...spec }),
    );

  // MAP <- systemic arteriolar resistance. Nudge the arterioles' persistent r_factor_ps DIRECTLY
  // (delta-accumulating), NOT Circulation.svr_factor_art: that master knob is owned and OVERWRITTEN
  // every step by the Hormones model (RAAS, Hormones.js -> _circ.svr_factor_art = svr_factor), so a
  // write to it does not stick and the live MAP tune cannot lower MAP. Circulation's own master knobs
  // (svr_factor_art/_ven/_drug) all fan out DELTAS to these same arterioles' r_factor_ps, so applying
  // our own delta composes additively with the Hormones/ANS/Drugs contributions instead of colliding,
  // and is not clobbered. ↑ factor => ↑ resistance => ↑ MAP.
  if (targets.map != null && model.models.Circulation) {
    // Align the baroreflex arterial-pressure set-point to the target so the ANS defends the NEW
    // operating point instead of dragging MAP back toward the loaded baseline (mirrors the offline
    // builder's BR_MAP.set_value = target.map). Without this the arteriolar lever below is opposed
    // each step by the baroreflex and MAP only partly moves.
    if (model.models.BR_MAP && typeof model.models.BR_MAP.set_value === "number") {
      model.models.BR_MAP.set_value = targets.map;
    }
    // Use the SAME broad systemic-resistance vessel set the offline builder scales
    // (scaler_config.blood_systemic.resistance: the whole systemic tree, not just the four organ
    // arterioles). Nudging only Circulation.systemic_arterioles has weak MAP authority — halving
    // those organ beds barely moves MAP because flow/CO compensates — whereas the full systemic set
    // gives clean bidirectional authority. Fall back to the arterioles if no scaler config is present.
    const sysRes =
      model.scaler_config?.blood_systemic?.resistance ||
      model.ModelScaler?._config?.blood_systemic?.resistance ||
      model.models.Circulation.systemic_arterioles ||
      [];
    let applied = 1.0;
    const set = (v) => {
      const delta = v - applied;
      for (const n of sysRes) {
        const m = model.models[n];
        if (m && typeof m.r_factor_ps === "number") {
          let f = m.r_factor_ps + delta;
          if (f < 0) f = 0;
          m.r_factor_ps = f;
        }
      }
      applied = v;
    };
    // Gentle seed gain: the broad systemic set is a strong lever (~30 mmHg per unit r_factor_ps), so
    // a large first step overshoots; keep the seed small and let the secant refine.
    mk("map", { lo: 0.2, hi: 8, sign: +1, gain: 0.02, value: 1.0, set });
  }
  // Cardiac output <- ventricular contractility (el_max persistent factor)
  if (targets.co != null) {
    const set = (v) => { for (const n of ["LV", "RV"]) { const x = model.models[n]; if (x) x.el_max_factor_ps = v; } };
    mk("co", { lo: 0.2, hi: 4, sign: +1, gain: 0.8, value: model.models.LV?.el_max_factor_ps ?? 1, set });
  }
  // Heart rate <- HR reference setpoint
  if (targets.hr != null && model.models.Heart) {
    mk("hr", { lo: 60, hi: 240, sign: +1, gain: 0.8, value: model.models.Heart.heart_rate_ref ?? 120,
      set: (v) => (model.models.Heart.heart_rate_ref = v) });
  }
  // PO2 / SpO2 <- alveolar O2 diffusion persistent factor
  if (targets.po2 != null || targets.spo2 != null) {
    const key = targets.po2 != null ? "po2" : "spo2";
    const set = (v) => { for (const n of ["GASEX_LL", "GASEX_RL"]) { const x = model.models[n]; if (x) x.dif_o2_factor_ps = v; } };
    mk(key, { lo: 0.1, hi: 8, sign: +1, gain: key === "po2" ? 0.03 : 0.06, value: model.models.GASEX_LL?.dif_o2_factor_ps ?? 1, set });
  }
  // pCO2 <- spontaneous ventilatory drive (Breathing.minute_volume_ref, ↓ raises pCO2)
  if (targets.pco2 != null && model.models.Breathing) {
    const B = model.models.Breathing;
    const base = B.minute_volume_ref;
    mk("pco2", { lo: 0.2, hi: 2.5, sign: -1, gain: 0.03, value: 1.0, set: (mult) => (B.minute_volume_ref = base * mult) });
  }
  // BE / pH (metabolic) <- Stewart unmeasured anions (uma); ↑ lowers BE/pH
  if ((targets.be != null || targets.ph != null) && model.models.Blood) {
    const key = targets.be != null ? "be" : "ph";
    mk(key, { lo: 0, hi: 40, sign: -1, gain: key === "be" ? 0.8 : 18, value: model.models.AA?.solutes?.uma ?? 0,
      set: (v) => model.models.Blood.set_solute("uma", Math.max(0, v)) });
  }
  // Total blood volume <- direct proportional rescale of every blood compartment.
  // Not a secant lever: each iteration scales blood vols by target/measured (the
  // body redistributes + some leaves, so 1-2 iters converge). Uses a custom step.
  if (targets.blood_volume != null && model.models.Circulation) {
    const bloodComps = Object.entries(model.models).filter(
      ([n, x]) => x && typeof x.vol === "number" && x.solutes && Object.keys(x.solutes).length && !n.startsWith("ECLS") && n !== "URINE",
    );
    const c = makeController({
      key: "blood_volume", readKey: "total_blood_volume", target: targets.blood_volume, tol: tol("blood_volume"),
      lo: 0, hi: 1e9, sign: +1, gain: 0, value: model.models.Circulation.total_blood_volume ?? 0, set: () => {},
    });
    // override step: proportional rescale toward target
    c.step = function (measured) {
      if (typeof measured !== "number" || measured <= 0) return false;
      if (Math.abs(this.target - measured) <= this.tol) return false;
      const ratio = this.target / measured;
      for (const [, x] of bloodComps) { x.vol *= ratio; if (typeof x.u_vol === "number") x.u_vol *= ratio; }
      return true;
    };
    controllers.push(c);
  }

  const keys = [...new Set(controllers.map((c) => c.readKey))];
  return { controllers, keys };
}

// canonical list of live-tunable targets (for validation / UI / docs)
export const LIVE_TARGETS = ["map", "co", "hr", "po2", "spo2", "pco2", "be", "ph", "blood_volume"];
