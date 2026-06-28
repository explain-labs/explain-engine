// Generic calibrated-patient builder for the Explain engine.
//
// Given a SPEC (a baseline scenario + a set of TARGET physiological values), this
// builds the baseline headless, applies a structural pass (size / pathophysiology /
// fixed solutes), then runs a closed-loop calibration: warm to steady state ->
// measure the monitor vitals + ABG -> nudge one lever per off-target vital ->
// repeat until every target is within tolerance or max_iters is reached. It then
// bakes the equilibrium state and prints the full, runnable scenario JSON to
// STDOUT (the convergence trace + final probe go to STDERR).
//
// This is the engine the Explain bot drives to turn "build me a 1.2 kg 28-week
// preterm, MAP 33, SpO2 90, pCO2 52" into a definition the app loads immediately.
//
// Usage:
//   node scripts/build_patient.mjs --spec spec.json          (spec from a file)
//   echo '{...}' | node scripts/build_patient.mjs            (spec from stdin)
//   node scripts/build_patient.mjs --spec spec.json --pretty > patient.json
//
// SPEC schema (all fields optional except `baseline`):
//   {
//     "baseline": "term_neonate",          // a name in public/model_definitions/
//     "name": "custom_patient",            // output scenario name (metadata)
//     "description": "...",                // output description (auto-generated if absent)
//     "targets": {                          // only listed vitals are calibrated
//       "weight": 1.2, "gestational_age": 28, "height": 0.355, "age": 0,  // structural
//       "hb": 9.5,            // hemoglobin in mmol/L (the model's unit)
//       "hb_gdl": 15.3,       // OR hemoglobin in g/dL — builder converts to mmol/L
//       "temp": 36.8, "pda": 0.4,                                         // structural
//       "hr": 160, "map": 33, "cvp": 4, "pap_m": 28,                      // iterated
//       "spo2": 90, "po2": 55, "pco2": 52, "ph": 7.28, "be": -5, "co": 0.3 // iterated
//     },
//     "pathophysiology": { "rds": "moderate", "pvr_scale": 1.7 },         // named modifiers
//     "tolerance": { "map": 3, "pco2": 4 },                               // per-vital override
//     "profile": "preterm_28",             // normal-range table (else auto from weight/GA)
//     "max_iters": 12, "warm_seconds": 45, "settle_seconds": 90, "final_seconds": 200
//   }
//
// Units mirror the monitor/ABG the app shows: pressures mmHg, SpO2/SvO2 %, temp °C,
// pH unitless, pCO2/pO2 mmHg, BE mmol/L, weight kg, height m, CO L/min. Hb is
// mmol/L (the model's unit) — pass `hb` in mmol/L, or `hb_gdl` in g/dL to convert.

import fs from "node:fs";
import { createEngine } from "./_harness.mjs";
import { serializeState } from "./_serialize_state.mjs";
import { measureVitals, selectProfile, RANGES, flagOf } from "./_probe.mjs";

// ---------------------------------------------------------------------------
// 0. read the SPEC (from --spec <file> or stdin)
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const PRETTY = argv.includes("--pretty");
const specIdx = argv.indexOf("--spec");

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}
const specRaw = specIdx >= 0 ? fs.readFileSync(argv[specIdx + 1], "utf8") : readStdin();
let spec;
try {
  spec = JSON.parse(specRaw || "{}");
} catch (e) {
  console.error("build_patient: SPEC is not valid JSON —", String(e));
  process.exit(1);
}

const baseline = spec.baseline || "term_neonate";
const targets = spec.targets || {};
const patho = spec.pathophysiology || {};
const MAX_ITERS = Number.isFinite(spec.max_iters) ? spec.max_iters : 12;
const WARM = Number.isFinite(spec.warm_seconds) ? spec.warm_seconds : 45;
const SETTLE = Number.isFinite(spec.settle_seconds) ? spec.settle_seconds : 90;
const FINAL = Number.isFinite(spec.final_seconds) ? spec.final_seconds : 200;
const WINDOW = Number.isFinite(spec.window_seconds) ? spec.window_seconds : 12;

// default tolerances per vital (clinician-meaningful bands); overridable via spec.tolerance
const DEFAULT_TOL = { hr: 6, map: 3, cvp: 1.5, pap_m: 3, spo2: 2, po2: 6, pco2: 4, ph: 0.03, be: 1.5, co: 0.05 };
const tolOf = (k) => (spec.tolerance && spec.tolerance[k] != null ? spec.tolerance[k] : DEFAULT_TOL[k]);

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const round = (x, n = 2) => (typeof x === "number" && isFinite(x) ? Number(x.toFixed(n)) : x);

// the preterm seed table — when a GA is given we start from the matching lever
// bundle so calibration begins near-converged (mirrors scripts/_make_preterm.mjs:43-51).
const PRETERM_SEED = {
  24: { weight: 0.64, height: 0.310, rds_el: 4.0, rds_uvol: 0.36, gasex: 0.32, hr_ref: 151, vt_rr: 0.72, br_map: 24, ips_res: 1900, ven_uvol: 0.78, cont: 0.90, relax: 1.15, pda: 0.40, svr: 1.85, pvr: 3.0 },
  26: { weight: 0.85, height: 0.330, rds_el: 3.5, rds_uvol: 0.42, gasex: 0.38, hr_ref: 153, vt_rr: 0.76, br_map: 26, ips_res: 1600, ven_uvol: 0.80, cont: 0.90, relax: 1.12, pda: 0.42, svr: 1.35, pvr: 1.9 },
  28: { weight: 1.0, height: 0.355, rds_el: 3.0, rds_uvol: 0.50, gasex: 0.45, hr_ref: 152, vt_rr: 0.80, br_map: 28, ips_res: 1900, ven_uvol: 0.82, cont: 0.90, relax: 1.10, pda: 0.45, svr: 1.0, pvr: 1.75 },
  30: { weight: 1.35, height: 0.385, rds_el: 2.5, rds_uvol: 0.58, gasex: 0.55, hr_ref: 151, vt_rr: 0.85, br_map: 31, ips_res: 2200, ven_uvol: 0.84, cont: 0.91, relax: 1.08, pda: 0.36, svr: 1.0, pvr: 1.65 },
  32: { weight: 1.7, height: 0.420, rds_el: 2.0, rds_uvol: 0.65, gasex: 0.65, hr_ref: 150, vt_rr: 0.90, br_map: 35, ips_res: 2500, ven_uvol: 0.85, cont: 0.92, relax: 1.07, pda: 0.28, svr: 1.0, pvr: 1.6 },
  34: { weight: 2.2, height: 0.450, rds_el: 1.4, rds_uvol: 0.80, gasex: 0.80, hr_ref: 148, vt_rr: 0.95, br_map: 41, ips_res: 3400, ven_uvol: 0.88, cont: 0.96, relax: 1.03, pda: 0.22, svr: 1.0, pvr: 1.4 },
  36: { weight: 2.7, height: 0.480, rds_el: 1.2, rds_uvol: 0.88, gasex: 0.90, hr_ref: 145, vt_rr: 0.97, br_map: 45, ips_res: 4200, ven_uvol: 0.93, cont: 0.98, relax: 1.02, pda: 0.15, svr: 1.0, pvr: 1.3 },
};
const nearestGa = (ga) => [24, 26, 28, 30, 32, 34, 36].reduce((a, b) => (Math.abs(b - ga) < Math.abs(a - ga) ? b : a));

// RDS severity -> lung-stiffness / FRC / diffusion bundle (named modifier)
const RDS_BUNDLE = {
  mild: { rds_el: 1.4, rds_uvol: 0.85, gasex: 0.85, ips_res: 3800 },
  moderate: { rds_el: 2.5, rds_uvol: 0.6, gasex: 0.55, ips_res: 2400 },
  severe: { rds_el: 3.5, rds_uvol: 0.45, gasex: 0.4, ips_res: 1700 },
};

// ---------------------------------------------------------------------------
// 1. build the baseline headless
// ---------------------------------------------------------------------------
const eng = await createEngine();
const baseUrl = new URL(`../public/model_definitions/${baseline}.json`, import.meta.url);
let baseJson;
try {
  baseJson = JSON.parse(fs.readFileSync(baseUrl, "utf8"));
} catch (e) {
  console.error(`build_patient: cannot read baseline "${baseline}" —`, String(e));
  process.exit(1);
}
const model = eng.build(baseJson.model_definition || baseJson);
if (!model || !model.models) {
  console.error(`build_patient: build failed for baseline "${baseline}".`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. structural pass (applied ONCE, not iterated)
// ---------------------------------------------------------------------------
const trace = (...a) => console.error(...a);
const has = (k) => targets[k] != null;

// gestational-age seed bundle (used to seed both structure and starting lever values)
let seed = null;
if (has("gestational_age") && targets.gestational_age < 37) {
  seed = PRETERM_SEED[nearestGa(targets.gestational_age)];
}

// weight: allometric volume scaling (scale_to_weight sets model.weight too). Apply
// FIRST — weight_scale resets systemic/pulmonary resistance scaling to 1.0, so the
// SVR/PVR levers below (and the iterative controllers) must come after it.
const weightKg = has("weight") ? targets.weight : seed ? seed.weight : null;
if (weightKg != null) {
  eng.scale("weight_scale", weightKg);
  model.weight = weightKg;
  trace(`structural: weight -> ${weightKg} kg (allometric volume scaling)`);
}
if (has("height")) model.height = targets.height >= 3 ? targets.height / 100 : targets.height;
else if (seed) model.height = seed.height;
if (has("gestational_age")) model.gestational_age = targets.gestational_age;
if (has("age")) model.age = targets.age;

// pathophysiology + GA-seed RDS lung phenotype (stiff, low-FRC, reduced diffusion)
const rds = patho.rds ? RDS_BUNDLE[patho.rds] : seed ? { rds_el: seed.rds_el, rds_uvol: seed.rds_uvol, gasex: seed.gasex, ips_res: seed.ips_res } : null;
if (rds) {
  for (const n of ["ALL", "ALR"]) {
    const c = model.models[n];
    if (c) { c.el_base *= rds.rds_el; c.u_vol *= rds.rds_uvol; }
  }
  for (const n of ["GASEX_LL", "GASEX_RL"]) {
    const c = model.models[n];
    if (c) { c.dif_o2 *= rds.gasex; c.dif_co2 *= rds.gasex; }
  }
  if (model.models.Shunts && rds.ips_res) model.models.Shunts.ips_res = rds.ips_res;
  trace(`structural: RDS lungs (el x${rds.rds_el}, u_vol x${rds.rds_uvol}, dif x${rds.gasex}, ips_res ${rds.ips_res})`);
}

// venous preload trim for the smallest babies (uniform scaling leaves CVP near zero)
if (seed && seed.ven_uvol !== 1.0) {
  for (const n of ["VLB", "VUB"]) { const c = model.models[n]; if (c) c.u_vol *= seed.ven_uvol; }
}

// cardiac immaturity (weaker systole, stiffer diastole) from the GA seed
if (seed) {
  const H = model.models.Heart;
  if (H) {
    H.cont_factor_left = seed.cont; H.cont_factor_right = seed.cont;
    H.relax_factor_left = seed.relax; H.relax_factor_right = seed.relax;
  }
}

// patent ductus
const pda = has("pda") ? targets.pda : seed ? seed.pda : null;
if (pda != null && model.models.Pda) { model.models.Pda.diameter_relative = pda; trace(`structural: PDA diameter_relative ${pda}`); }

// hemoglobin — the model's unit is mmol/L. Accept `hb` (mmol/L) directly, or
// `hb_gdl` (g/dL) which is converted (1 g/dL = 0.6206 mmol/L). The model NEVER
// sees g/dL — always feed set_solute("hemoglobin", …) a mmol/L value.
if (model.models.Blood && (has("hb") || has("hb_gdl"))) {
  const hbMmol = has("hb") ? targets.hb : targets.hb_gdl * 0.6206;
  model.models.Blood.set_solute("hemoglobin", hbMmol);
  trace(`structural: Hb ${round(hbMmol, 2)} mmol/L${!has("hb") && has("hb_gdl") ? ` (converted from ${targets.hb_gdl} g/dL)` : ""}`);
}

// thermoregulation set-point -> target core/blood temperature
if (has("temp") && model.models.Thermoregulation) { model.models.Thermoregulation.setpoint_temp = targets.temp; trace(`structural: temp setpoint ${targets.temp}`); }

// baroreflex MAP set-point: defend the requested MAP so the ANS doesn't fight it
if (has("map") && model.models.BR_MAP) { model.models.BR_MAP.set_value = targets.map; trace(`structural: baroreflex MAP set-point ${targets.map}`); }

// heart-rate reference seed (also an iterated lever below if hr is targeted)
if (seed && model.models.Heart && !has("hr")) model.models.Heart.heart_rate_ref = seed.hr_ref;

// ---------------------------------------------------------------------------
// 3. controllers (one lever per off-target vital) — applied iteratively
// ---------------------------------------------------------------------------
// Each controller drives one measured vital toward its target via one lever. The
// first step uses a signed proportional seed (sign = does ↑lever ↑vital?); once two
// samples exist it switches to the secant method (sign-agnostic, self-correcting).
function makeController({ key, lo, hi, sign, gain, value, set }) {
  return {
    key, lo, hi, sign, gain, value, set, prevL: null, prevM: null,
    target: targets[key === "spo2" ? "spo2" : key],
    tol: tolOf(key),
    step(measured) {
      const target = this.target;
      if (Math.abs(target - measured) <= this.tol) { this.prevL = this.value; this.prevM = measured; return false; }
      let nl;
      if (this.prevL != null && this.prevM != null && Math.abs(measured - this.prevM) > 1e-9 && Math.abs(this.value - this.prevL) > 1e-12) {
        const slope = (measured - this.prevM) / (this.value - this.prevL);
        nl = this.value + (target - measured) / slope;
      } else {
        nl = this.value + this.sign * this.gain * (target - measured);
      }
      nl = clamp(nl, this.lo, this.hi);
      this.prevL = this.value; this.prevM = measured; this.value = nl; this.set(nl);
      return true;
    },
  };
}

const controllers = [];

// MAP  <- systemic vascular resistance scaling (↑SVR ↑MAP)
if (has("map")) {
  let f = seed && seed.svr ? seed.svr : 1.0;
  eng.scale("systemic_resistances", f);
  controllers.push(makeController({ key: "map", lo: 0.3, hi: 8, sign: +1, gain: 0.04, value: f, set: (v) => eng.scale("systemic_resistances", v) }));
}
// PAP mean <- pulmonary vascular resistance scaling (↑PVR ↑PAP)
if (has("pap_m")) {
  let f = patho.pvr_scale || (seed && seed.pvr) || 1.0;
  eng.scale("pulmonary_resistances", f);
  controllers.push(makeController({ key: "pap_m", lo: 0.3, hi: 12, sign: +1, gain: 0.05, value: f, set: (v) => eng.scale("pulmonary_resistances", v) }));
} else if (patho.pvr_scale || (seed && seed.pvr)) {
  eng.scale("pulmonary_resistances", patho.pvr_scale || seed.pvr); // structural-only PVR
}
// CVP <- venous unstressed-volume multiplier on VLB/VUB (↓u_vol ↑CVP -> sign -1)
if (has("cvp")) {
  const base = {};
  for (const n of ["VLB", "VUB"]) { const c = model.models[n]; if (c) base[n] = c.u_vol; }
  const apply = (mult) => { for (const n in base) model.models[n].u_vol = base[n] * mult; };
  controllers.push(makeController({ key: "cvp", lo: 0.5, hi: 1.3, sign: -1, gain: 0.05, value: 1.0, set: apply }));
}
// HR <- heart-rate reference setpoint (direct)
if (has("hr")) {
  const start = model.models.Heart?.heart_rate_ref ?? targets.hr;
  controllers.push(makeController({ key: "hr", lo: 60, hi: 240, sign: +1, gain: 0.8, value: start, set: (v) => { if (model.models.Heart) model.models.Heart.heart_rate_ref = v; } }));
}
// CO (LV output) <- ventricular contractility (el_max persistent factor)
if (has("co")) {
  const apply = (f) => { for (const n of ["LV", "RV"]) { const m = model.models[n]; if (m) m.el_max_factor_ps = f; } };
  controllers.push({ ...makeController({ key: "co", lo: 0.3, hi: 3, sign: +1, gain: 0.8, value: 1.0, set: apply }), key: "co", target: targets.co });
}
// PO2 / SpO2 <- alveolar O2 diffusion persistent factor (↑dif ↑PO2)
if (has("po2") || has("spo2")) {
  const key = has("po2") ? "po2" : "spo2";
  const apply = (f) => { for (const n of ["GASEX_LL", "GASEX_RL"]) { const m = model.models[n]; if (m) m.dif_o2_factor_ps = f; } };
  controllers.push(makeController({ key, lo: 0.1, hi: 8, sign: +1, gain: key === "po2" ? 0.03 : 0.06, value: 1.0, set: apply }));
}
// pCO2 <- spontaneous ventilatory drive (Breathing.minute_volume_ref multiplier).
// ↓drive ↑pCO2 -> sign -1. This is the lever that actually shifts the *regulated*
// CO2 operating point: the chemoreflex (mv_ans_factor, Breathing.js:60) defends a
// pCO2 setpoint, so gas-exchange dif_co2 alone is fought back to baseline — only
// changing the drive moves steady-state pCO2. (Assumes spontaneous breathing; for
// a ventilated baseline the bot sets ventilator rate/Vt instead.)
if (has("pco2") && model.models.Breathing) {
  const B = model.models.Breathing;
  const baseMv = B.minute_volume_ref;
  const apply = (mult) => { B.minute_volume_ref = baseMv * mult; };
  controllers.push(makeController({ key: "pco2", lo: 0.2, hi: 2.5, sign: -1, gain: 0.03, value: 1.0, set: apply }));
}
// BE / pH (metabolic) <- Stewart unmeasured anions uma (↑uma ↓BE/pH -> sign -1)
if (has("be") || has("ph")) {
  const key = has("be") ? "be" : "ph";
  const startUma = model.models.AA?.solutes?.uma ?? 0;
  const apply = (v) => { if (model.models.Blood) model.models.Blood.set_solute("uma", Math.max(0, v)); };
  controllers.push(makeController({ key, lo: 0, hi: 40, sign: -1, gain: key === "be" ? 0.8 : 18, value: startUma, set: apply }));
}

// ---------------------------------------------------------------------------
// 4. calibration loop
// ---------------------------------------------------------------------------
const profile = selectProfile({ weight: model.weight, gestational_age: model.gestational_age, profile: spec.profile });
const ranges = RANGES[profile] || RANGES.adult;
trace(`\ncalibrating "${spec.name || baseline}" (baseline ${baseline}, profile ${profile}) — ${controllers.length} target(s)`);

eng.calc(SETTLE); // settle after the structural pass
let v = {};
let it = 0;
for (; it < MAX_ITERS; it++) {
  v = measureVitals(model, eng.send, { window: WINDOW });
  const line = controllers
    .map((c) => `${c.key}=${round(v[c.key === "spo2" ? "spo2_pre" : c.key])}/${c.target}${Math.abs(c.target - (c.key === "spo2" ? v.spo2_pre : v[c.key])) <= c.tol ? "✓" : ""}`)
    .join("  ");
  trace(`  iter ${it}: ${line}`);
  let any = false;
  for (const c of controllers) {
    const meas = c.key === "spo2" ? v.spo2_pre : v[c.key];
    if (c.step(meas)) any = true;
  }
  if (!any) { trace(`  converged at iter ${it}`); break; }
  eng.calc(WARM);
}

// equilibrium bake (kills startup transients, seeds the steady gas/volume state)
eng.calc(FINAL);
const vf = measureVitals(model, eng.send, { window: WINDOW });

// ---------------------------------------------------------------------------
// 5. residual report (stderr)
// ---------------------------------------------------------------------------
trace(`\n=== ${spec.name || baseline} — final vitals (profile ${profile}) ===`);
const REPORT = ["hr", "map", "cvp", "pap_m", "spo2_pre", "po2", "pco2", "ph", "be", "hco3"];
for (const k of REPORT) {
  const tk = k === "spo2_pre" ? "spo2" : k;
  const tgt = targets[tk];
  const flag = flagOf(ranges, k, vf[k]);
  trace(`  ${k.padEnd(10)} ${String(round(vf[k])).padStart(8)}${tgt != null ? `  (target ${tgt}, Δ ${round(vf[k] - tgt)})` : ""}  [${flag}]`);
}
const residuals = controllers.map((c) => {
  const meas = c.key === "spo2" ? vf.spo2_pre : vf[c.key];
  return { key: c.key, target: c.target, value: round(meas), within: Math.abs(c.target - meas) <= c.tol };
});
const allWithin = residuals.every((r) => r.within);
trace(`  calibration ${allWithin ? "CONVERGED" : "INCOMPLETE"} after ${it} iter — ${residuals.filter((r) => !r.within).map((r) => r.key).join(", ") || "all targets met"}`);

// ---------------------------------------------------------------------------
// 6. serialize and emit the runnable scenario JSON (stdout)
// ---------------------------------------------------------------------------
const name = spec.name || `${baseline}_custom`;
const description =
  spec.description ||
  `AI-built patient from ${baseline}: ` +
    REPORT.filter((k) => targets[k === "spo2_pre" ? "spo2" : k] != null)
      .map((k) => `${k === "spo2_pre" ? "SpO2" : k}≈${round(vf[k])}`)
      .join(", ");

model.name = name;
model.description = description;
model.age = model.age ?? 0;
serializeState(model);

const out = { ...baseJson, name, description, user: spec.user || "explain-bot", model_definition: model };
const json = JSON.stringify(out, null, PRETTY ? 1 : 0);
JSON.parse(json); // fail loudly before emitting if anything is non-serializable
process.stdout.write(json + "\n");
