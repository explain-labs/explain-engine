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
//     "baseline": "term_neonate",          // a name in model_definitions/
//     "fetal": true,                       // force fetal mode (default: auto-detected from the
//                                          //   baseline — see "FETAL MODE" below)
//     "name": "custom_patient",            // output scenario name (metadata)
//     "description": "...",                // output description (auto-generated if absent)
//     "targets": {                          // only listed vitals are calibrated
//       "weight": 1.2, "gestational_age": 28, "height": 0.355, "age": 0,  // structural
//       "hb": 9.5,            // hemoglobin in mmol/L (the model's unit)
//       "hb_gdl": 15.3,       // OR hemoglobin in g/dL — builder converts to mmol/L
//       "temp": 36.8, "pda": 0.4,                                         // structural
//       "pda_mm": 1.8,         // structural: echo duct diameter at its narrowest (pulmonary) end, mm;
//                              //   0 = closed. Takes precedence over the 0..1 "pda" fraction
//       "fo_mm": 3,            // structural: echo foramen ovale / atrial septal opening, mm; 0 = closed
//       "fio2": 0.3,          // inspired O2 fraction (0.21-1.0) the patient breathes; structural.
//                             //   Without it SpO2/PO2 are fitted in room air, which gives a baby
//                             //   on oxygen far healthier lungs than it has.
//       "hr": 160, "map": 33, "cvp": 4, "pap_m": 28,                      // iterated
//       "pap_s": 40,           // iterated: systolic PA pressure (echo TR jet: 4v^2 + RAP), same lever
//                              //   as pap_m (pulmonary resistance); pap_m wins when both are given
//       "sys": 48, "dia": 27,  // iterated as a pair: pulse pressure (sys - dia) via large-artery
//                              //   stiffness, and MAP = dia + (sys - dia)/3 when "map" is absent
//       "rr": 60,              // iterated: spontaneous respiratory rate via the tidal-volume/rate split
//       "na": 138, "k": 4.5, "cl": 104, "lactate": 2.5, "glucose": 4.0,  // structural, mmol/L
//       "albumin": 28,         // structural, g/L. Na/K/Cl/lactate set the strong-ion difference, albumin
//                              //   the weak acids (Stewart): with them a BE target is fitted by the
//                              //   remaining unmeasured anions instead of absorbing everything
//       "spo2": 90, "po2": 55, "pco2": 52, "ph": 7.28, "be": -5, "co": 0.3 // iterated
//       "ef": 60,              // iterated: echo LV ejection fraction, %, via LV contractility. The
//                              //   same lever as "co", which wins when both are given
//     },
//     "pathophysiology": { "rds": "moderate", "pvr_scale": 1.7 },         // named modifiers
//     "tolerance": { "map": 3, "pco2": 4 },                               // per-vital override
//     "profile": "preterm_28",             // normal-range table (else auto from weight/GA)
//     "postnatal_age_days": 3,             // metadata: picks the age-dependent term-neonate PAP ranges
//                                          //   (else targets.age, else the baseline's age; none = day 1)
//     "max_iters": 12, "warm_seconds": 45, "settle_seconds": 90, "final_seconds": 200
//   }
//
// FETAL MODE. A fetal baseline (term_fetus, fetus_<ga>wk) is auto-detected and changes three
// things, because the neonatal levers are actively wrong on a fetus:
//   - the gestational-age seed comes from FETAL, not PRETERM_SEED. The preterm seed would set
//     Shunts.ips_res = 2200 (reopening the intrapulmonary shunts the fetus needs closed at 1e8)
//     and Pda.diameter_relative = 0.36 (constricting a duct that must be wide open). Both
//     silently destroy the fetal circulation while still building and still printing a
//     plausible-looking panel.
//   - the RDS lung phenotype is skipped entirely (the fetal lung is fluid-filled and inert).
//   - PO2/SpO2 and pCO2 are driven from Placenta.mat_to2 / mat_tco2 instead of the alveolar
//     diffusors and the ventilatory drive, both of which are no-ops in a fetus (GASEX dif_* are 0,
//     Breathing is disabled).
// Blood.set_solute / set_P50 reach the MATERNAL pool PL_MAT as well, so fetal mode snapshots and
// restores it after every such write — otherwise the BE/pH controller acidifies the mother and
// shifts the placental gradient under the O2 controller's feet.
//
// The emitted scenario carries a top-level `build_report` (machine-readable: per-target residual,
// lever, lever value and whether the lever ran into its bound; the full measured vitals vector
// with normal-range flags; the structural changes applied; and any `targets` key this builder
// does not know, which it ignores). stderr keeps the human-readable version of the same report.
//
// Units mirror the monitor/ABG the app shows: pressures mmHg, SpO2/SvO2 %, temp °C,
// pH unitless, pCO2/pO2 mmHg, BE mmol/L, weight kg, height m, CO L/min. Hb is
// mmol/L (the model's unit) — pass `hb` in mmol/L, or `hb_gdl` in g/dL to convert.

import fs from "node:fs";
import { createEngine } from "./_harness.mjs";
import { serializeState } from "./_serialize_state.mjs";
import { measureVitals, selectProfile, rangesFor, flagOf, isFetal } from "./_probe.mjs";
import { FETAL, nearestFetalGa } from "./_ga_tables.mjs";
import { makeController, runCalibration, ARTERIAL_EL_MAX, DIF_O2_FLOOR } from "../helpers/Calibrator.js";

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
// a copy: derived targets (pp, and map from sys/dia) are added below, and the caller's spec must
// stay what it sent
const targets = { ...(spec.targets || {}) };
const patho = spec.pathophysiology || {};
const MAX_ITERS = Number.isFinite(spec.max_iters) ? spec.max_iters : 12;
const WARM = Number.isFinite(spec.warm_seconds) ? spec.warm_seconds : 45;
const SETTLE = Number.isFinite(spec.settle_seconds) ? spec.settle_seconds : 90;
const FINAL = Number.isFinite(spec.final_seconds) ? spec.final_seconds : 200;
const WINDOW = Number.isFinite(spec.window_seconds) ? spec.window_seconds : 12;

// default tolerances per vital (clinician-meaningful bands); overridable via spec.tolerance
const DEFAULT_TOL = { hr: 6, map: 3, pp: 2, rr: 4, cvp: 1.5, pap_m: 3, pap_s: 4, ef: 5, spo2: 2, po2: 6, pco2: 4, ph: 0.03, be: 1.5, co: 0.05 };
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
const baseUrl = new URL(`../model_definitions/${baseline}.json`, import.meta.url);
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
// the structural pass changes the weight and the lung mechanics, so the baseline's calibrated
// breathing effort (Breathing.rmp_gain, mmHg per litre of tidal volume) no longer fits: recalibrate
// it during the warm-up, starting from the baseline's value (docs/Breathing.md, Calibration)
if (model.models.Breathing) model.models.Breathing.rmp_calibrated = false;

// ---------------------------------------------------------------------------
// 2. structural pass (applied ONCE, not iterated)
// ---------------------------------------------------------------------------
const trace = (...a) => console.error(...a);
const has = (k) => targets[k] != null;

// every `targets` key this builder acts on; anything else is ignored — and reported, because a
// silently dropped target looks exactly like one that was applied
const KNOWN_TARGETS = new Set([
  "weight", "gestational_age", "height", "age", "hb", "hb_gdl", "temp", "pda", "pda_mm", "fo_mm", "fio2",
  "na", "k", "cl", "lactate", "glucose", "albumin",
  "hr", "map", "sys", "dia", "rr", "cvp", "pap_m", "pap_s", "spo2", "po2", "pco2", "ph", "be", "co", "ef",
]);
const ignoredTargets = Object.keys(targets).filter((k) => targets[k] != null && !KNOWN_TARGETS.has(k));
if (ignoredTargets.length) trace(`ignored targets (not known to the builder): ${ignoredTargets.join(", ")}`);
// drop them, so an internal key (pp) cannot be passed in directly and bypass the sys/dia pairing
for (const k of ignoredTargets) delete targets[k];
// po2 wins over spo2 and be over ph (one lever each); the loser is not calibrated
const supersededTargets = [];
if (has("po2") && has("spo2")) supersededTargets.push({ key: "spo2", by: "po2" });
if (has("pap_m") && has("pap_s")) supersededTargets.push({ key: "pap_s", by: "pap_m" });
if (has("pda_mm") && has("pda")) supersededTargets.push({ key: "pda", by: "pda_mm" });
if (has("co") && has("ef")) supersededTargets.push({ key: "ef", by: "co" });
if (has("be") && has("ph")) supersededTargets.push({ key: "ph", by: "be" });
for (const s of supersededTargets) trace(`target ${s.key} not calibrated: ${s.by} uses the same lever`);
const notes = []; // things the caller should know that are neither a residual nor an error

// Systolic/diastolic are calibrated as a pair: their mean via the MAP lever (systemic resistance)
// and their difference, the pulse pressure, via large-artery stiffness. The two are nearly
// orthogonal (stiffer arteries raise systolic and lower diastolic around an almost unchanged mean).
// With no measured MAP, the mean is derived the usual clinical way.
const derivedTargets = {};
if (has("sys") || has("dia")) {
  if (!(has("sys") && has("dia"))) {
    notes.push(`${has("sys") ? "sys" : "dia"} was given without ${has("sys") ? "dia" : "sys"}; blood pressure is calibrated from the pair only, so it was not used`);
  } else if (!(targets.dia < targets.sys)) {
    console.error(`build_patient: targets.dia (${targets.dia}) must be below targets.sys (${targets.sys}).`);
    process.exit(1);
  } else {
    targets.pp = round(targets.sys - targets.dia, 2);
    derivedTargets.pp = targets.pp;
    if (!has("map")) {
      targets.map = round(targets.dia + targets.pp / 3, 1);
      derivedTargets.map = targets.map;
    }
    trace(`derived targets: pulse pressure ${targets.pp}${derivedTargets.map != null ? `, MAP ${derivedTargets.map} (dia + pp/3)` : ""}`);
  }
}

// fetal vs neonatal baseline. Sniff the baseline JSON (before any structural pass) so the branch
// is decided up front; an explicit spec.fetal overrides.
const FETAL_MODE = spec.fetal != null ? !!spec.fetal : isFetal(baseJson.model_definition || baseJson);
trace(`fetal mode: ${FETAL_MODE ? "ON" : "off"} (${spec.fetal != null ? "spec" : "detected from baseline"})`);

// the maternal placental pool is not the patient. Blood.set_solute()/set_P50() propagate to every
// registered blood component INCLUDING PL_MAT, so snapshot it and restore after any such write.
const matSnap = FETAL_MODE && model.models.PL_MAT
  ? { P50_0: model.models.PL_MAT.P50_0, solutes: { ...model.models.PL_MAT.solutes } }
  : null;
const restoreMaternalPool = () => {
  if (!matSnap) return;
  const plm = model.models.PL_MAT;
  plm.P50_0 = matSnap.P50_0;
  Object.assign(plm.solutes, matSnap.solutes);
};

// gestational-age seed bundle (used to seed both structure and starting lever values)
let seed = null;
if (FETAL_MODE) {
  seed = FETAL[nearestFetalGa(has("gestational_age") ? targets.gestational_age : 40)];
} else if (has("gestational_age") && targets.gestational_age < 37) {
  // the seed is multiplicative (stiff lungs, reduced diffusion, venous trim, cardiac immaturity),
  // and a preterm baseline already carries it, so seeding again would apply prematurity twice
  const baseGa = (baseJson.model_definition || baseJson).gestational_age;
  if (typeof baseGa === "number" && baseGa < 37) {
    console.error(`build_patient: baseline "${baseline}" is already preterm (${baseGa} wk) and carries the prematurity adjustments; adding gestational_age ${targets.gestational_age} would apply them a second time. Use baseline "term_neonate" with gestational_age, or keep "${baseline}" and leave gestational_age out.`);
    process.exit(1);
  }
  seed = PRETERM_SEED[nearestGa(targets.gestational_age)];
}

// weight: allometric volume scaling (scale_to_weight sets model.weight too). Apply FIRST —
// _scale_vol multiplies vol AND u_vol on every listed compartment, so any absolute per-compartment
// volume edit (the venous preload trim, the fetal placental trim) must come after it to be a trim
// on the already-scaled value. NOTE scale_to_weight does NOT reset resistance scaling — every
// elastance/resistance line in it is commented out, so it moves volumes only.
const weightKg = has("weight") ? targets.weight : seed ? seed.weight : null;
if (weightKg != null) {
  eng.scale("weight_scale", weightKg);
  model.weight = weightKg;
  trace(`structural: weight -> ${weightKg} kg (allometric volume scaling)`);
}

// Arterial stiffness with size. weight_scale shrinks arterial volumes but leaves their elastance,
// which makes a small baby's arteries as compliant as a term baby's: a 1.08 kg preterm then has a
// pulse pressure of 11 mmHg (reference at 28 wk: 15-27). By Bramwell-Hill, PWV^2 = V*E/rho, and
// measured aortic PWV falls far less with size than volume does (term ~4.2-4.6 m/s, preterm at 32
// wk corrected ~3.2 m/s), while preterm arteries are intrinsically stiffer than term ones (Tauzin,
// Pediatr Res 2006). Elastance x (W/W0)^-0.5 reproduces that PWV ratio (0.74 of term at 1.08 kg)
// and gives the 28 wk patient a pulse pressure of about 16-18 mmHg (lower at a faster heart rate).
// A larger exponent is not reachable:
// the explicit integration of these compartments goes unstable above about x2 total elastance
// (shared with the pulse-pressure lever below), so the factor is capped at ARTERIAL_SCALE_MAX.
// Neonatal baselines only (the PWV data are neonatal); fetal mode keeps its own seed.
const ARTERIES = ["AA", "AAR", "AD", "RLB", "RUB", "INT_ART", "KID_ART", "LS_ART", "BR_ART"].filter((n) => model.models[n]);
// ARTERIAL_EL_MAX (2.0, from Calibrator.js): total arterial elastance multiplier the integrator tolerates (unstable at ~2.17)
const ARTERIAL_SCALE_MAX = 1.9;
let arterialScale = 1.0;
if (!FETAL_MODE && weightKg != null && model._baseline_weight > 0 && weightKg !== model._baseline_weight) {
  const wanted = Math.pow(weightKg / model._baseline_weight, -0.5);
  arterialScale = Math.min(wanted, ARTERIAL_SCALE_MAX);
  for (const n of ARTERIES) model.models[n].el_base_factor_scaling_ps = arterialScale;
  trace(`structural: arterial elastance x${round(arterialScale, 3)} for size ((W/W0)^-0.5${wanted > ARTERIAL_SCALE_MAX ? `, capped from x${round(wanted, 2)}` : ""})`);
  if (wanted > ARTERIAL_SCALE_MAX) notes.push(`arterial stiffness for a ${weightKg} kg baby was capped at x${ARTERIAL_SCALE_MAX} (x${round(wanted, 2)} would follow from size) to keep the simulation numerically stable, so its pulse pressure may run low`);
}
if (has("height")) model.height = targets.height >= 3 ? targets.height / 100 : targets.height;
else if (seed) model.height = seed.height;
if (has("gestational_age")) model.gestational_age = targets.gestational_age;
if (has("age")) model.age = targets.age;

// pathophysiology + GA-seed RDS lung phenotype (stiff, low-FRC, reduced diffusion)
// The placenta is invisible to scale_to_weight (no PL_* compartment appears in scaler_config), so
// a scaled fetus keeps a term-sized placenta unless it is trimmed explicitly.
if (FETAL_MODE && seed?.pl_vol != null && weightKg != null) {
  for (const n of ["PL_UMB_ART", "PL_FETAL_ART", "PL_FETAL_CAP", "PL_FETAL_VEN", "PL_UMB_VEN"]) {
    const c = model.models[n];
    if (!c) continue;
    if (typeof c.vol === "number") c.vol *= seed.pl_vol;
    if (typeof c.u_vol === "number") c.u_vol *= seed.pl_vol;
  }
  const plm = model.models.PL_MAT;
  if (plm && seed.mat_vol != null) { plm.vol *= seed.mat_vol; plm.u_vol *= seed.mat_vol; }
  trace(`structural: placental volume x${seed.pl_vol} (fetal), PL_MAT x${seed.mat_vol}`);
}

// RDS is a neonatal lung phenotype and must never touch a fetus: the fetal lung is fluid-filled and
// inert, and the bundle's ips_res write would reopen the intrapulmonary shunts.
if (FETAL_MODE && patho.rds) {
  console.error(`build_patient: pathophysiology.rds is meaningless on a fetal baseline ("${baseline}") — the fetal lung is inert.`);
  process.exit(1);
}
const rds = FETAL_MODE ? null : patho.rds ? RDS_BUNDLE[patho.rds] : seed ? { rds_el: seed.rds_el, rds_uvol: seed.rds_uvol, gasex: seed.gasex, ips_res: seed.ips_res } : null;
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
if (FETAL_MODE) {
  // The fetal duct is fully relaxed in utero: diameter_relative is a [0..1] PATENCY fraction and
  // stays 1.0 at every gestation. The SIZE levers are the anatomic millimetres, which no scaler
  // touches — without them a scaled fetus keeps a term-sized duct and foramen.
  if (has("pda") || has("pda_mm")) {
    console.error(`build_patient: targets.pda/pda_mm is not a fetal knob — the fetal duct is wide open. Use a named ductal-constriction pathophysiology instead.`);
    process.exit(1);
  }
  if (has("fo_mm")) {
    console.error(`build_patient: targets.fo_mm is not a fetal knob — the fetal foramen is sized from the gestational-age seed.`);
    process.exit(1);
  }
  const P = model.models.Pda, S = model.models.Shunts;
  if (P && seed?.da_diam != null) { P.diameter_ao_max = seed.da_diam; P.diameter_pa_max = seed.da_diam; P.length = seed.da_len; P.diameter_relative = 1.0; }
  if (S && seed?.fo != null) { S.diameter_fo = seed.fo; S.atrial_septal_width = seed.fo_septum; }
  trace(`structural: fetal shunt anatomy — duct ${seed?.da_diam} mm x ${seed?.da_len} mm (relative 1.0), FO ${seed?.fo} mm`);
  // placental bed
  const PL = model.models.Placenta;
  if (PL && seed?.umb_art_res != null) { PL.umb_art_res = seed.umb_art_res; PL.plf_res = seed.plf_res; PL.dif_o2 = seed.dif_o2; PL.dif_co2 = seed.dif_co2; }
} else {
  const P = model.models.Pda;
  if (has("pda_mm") && P) {
    // An echo measures the duct's narrowest diameter, at the pulmonary end. The model sizes the
    // duct as diameter_relative x diameter_pa_max (and x diameter_ao_max at the aortic end), so
    // the measurement sets the relative opening against the anatomic maximum, widening that
    // maximum (both ends) when the measured duct is larger than it.
    const d = targets.pda_mm;
    if (typeof d !== "number" || !(d >= 0) || d > 10) {
      console.error(`build_patient: targets.pda_mm must be a diameter in mm between 0 and 10 (got ${JSON.stringify(d)}).`);
      process.exit(1);
    }
    if (d > P.diameter_pa_max) P.diameter_pa_max = d;
    if (d > P.diameter_ao_max) P.diameter_ao_max = d;
    P.diameter_relative = d / P.diameter_pa_max;
    trace(`structural: PDA ${d} mm (diameter_relative ${round(P.diameter_relative, 3)} of ${P.diameter_pa_max} mm)`);
  } else {
    const pda = has("pda") ? targets.pda : seed ? seed.pda : null;
    if (pda != null && P) { P.diameter_relative = pda; trace(`structural: PDA diameter_relative ${pda}`); }
  }
  const S = model.models.Shunts;
  if (has("fo_mm")) {
    // An echo measures the opening in the atrial septum. Shunts sizes the FO resistance from
    // diameter_fo by Poiseuille and caps it at diameter_fo_max, so widen that cap for a larger
    // opening. The flap-valve asymmetry (fo_lr_factor) is the baseline's; direction and size of
    // the shunt are outcomes of the atrial pressures (build_report.measured.q_fo)
    const d = targets.fo_mm;
    if (typeof d !== "number" || !(d >= 0) || d > 15) {
      console.error(`build_patient: targets.fo_mm must be a diameter in mm between 0 and 15 (got ${JSON.stringify(d)}).`);
      process.exit(1);
    }
    if (!S) {
      console.error(`build_patient: baseline "${baseline}" has no Shunts model, cannot set fo_mm.`);
      process.exit(1);
    }
    if (d > S.diameter_fo_max) S.diameter_fo_max = d;
    S.diameter_fo = d;
    trace(`structural: foramen ovale ${d} mm (left-to-right resistance x${S.fo_lr_factor})`);
  }
}

// hemoglobin — the model's unit is mmol/L. Accept `hb` (mmol/L) directly, or
// `hb_gdl` (g/dL) which is converted (1 g/dL = 0.6206 mmol/L). The model NEVER
// sees g/dL — always feed set_solute("hemoglobin", …) a mmol/L value.
if (model.models.Blood && (has("hb") || has("hb_gdl"))) {
  const hbMmol = has("hb") ? targets.hb : targets.hb_gdl * 0.6206;
  model.models.Blood.set_solute("hemoglobin", hbMmol);
  restoreMaternalPool(); // PL_MAT is the mother's blood — her Hb does not follow the fetus's
  trace(`structural: Hb ${round(hbMmol, 2)} mmol/L${!has("hb") && has("hb_gdl") ? ` (converted from ${targets.hb_gdl} g/dL)` : ""}`);
}

// plasma solutes (mmol/L; albumin g/L). Written to every blood compartment via Blood.set_solute,
// which the Stewart acid-base solver reads (BloodComposition: sid = na + k + 2ca + 2mg - cl - lact;
// albumin and phosphates as weak acids). Two of them are also controller set-points that would
// otherwise pull the value back: Lactate clears toward lact_baseline (t1/2 ~6 min) and Glucose
// regulates toward glucose_setpoint, so both are moved with the solute. Kidney filtration lets the
// others drift only slightly (term neonate: Na 128 -> 128.1 over 4 min); the final values are read
// back into build_report.solutes.
const SOLUTE_KEY = { na: "na", k: "k", cl: "cl", lactate: "lact", glucose: "glucose", albumin: "albumin" };
const soluteTargets = Object.keys(SOLUTE_KEY).filter(has);
for (const k of soluteTargets) {
  const v = targets[k];
  if (typeof v !== "number" || !(v > 0) || !isFinite(v)) {
    console.error(`build_patient: targets.${k} must be a positive number (got ${JSON.stringify(v)}).`);
    process.exit(1);
  }
}
if (soluteTargets.length && model.models.Blood) {
  for (const k of soluteTargets) model.models.Blood.set_solute(SOLUTE_KEY[k], targets[k]);
  restoreMaternalPool(); // set_solute reaches PL_MAT; the mother is not the patient
  if (has("lactate") && model.models.Lactate) model.models.Lactate.lact_baseline = targets.lactate;
  if (has("glucose") && model.models.Glucose) model.models.Glucose.glucose_setpoint = targets.glucose;
  trace(`structural: solutes ${soluteTargets.map((k) => `${k} ${targets[k]}`).join(", ")}`);
}

// thermoregulation set-point -> target core/blood temperature
if (has("temp") && model.models.Thermoregulation) { model.models.Thermoregulation.setpoint_temp = targets.temp; trace(`structural: temp setpoint ${targets.temp}`); }

// inspired oxygen fraction. Must be in place before calibration: the O2 lever (alveolar
// diffusion) is then fitted to the measured SpO2/PO2 AT this FiO2 — the same saturation on 40 %
// oxygen means much worse lungs than on room air. Gas.set_fio2 rewrites the composition of the
// ambient/mouth gas the patient breathes; an enabled ventilator carries its own fio2 and is not
// touched here.
if (has("fio2")) {
  const f = targets.fio2;
  if (typeof f !== "number" || !(f >= 0.21 && f <= 1.0)) {
    console.error(`build_patient: targets.fio2 must be a fraction between 0.21 and 1.0 (got ${JSON.stringify(f)}).`);
    process.exit(1);
  }
  if (FETAL_MODE) {
    console.error(`build_patient: targets.fio2 is meaningless on a fetal baseline ("${baseline}") — the fetus does not breathe.`);
    process.exit(1);
  }
  if (!model.models.Gas) {
    console.error(`build_patient: baseline "${baseline}" has no Gas model, cannot set fio2.`);
    process.exit(1);
  }
  // set_fio2 skips a missing site, so check that at least one ambient compartment exists rather
  // than set Gas.fio2 with nothing breathing it (no current scenario has OUT)
  const sites = ["OUT", "MOUTH"].filter((n) => model.models[n]);
  if (!sites.length) {
    console.error(`build_patient: baseline "${baseline}" has no ambient gas compartment (OUT/MOUTH), cannot set fio2.`);
    process.exit(1);
  }
  model.models.Gas.set_fio2(f, sites);
  trace(`structural: FiO2 ${f} (${sites.join(", ")})`);
  if (model.models.Ventilator?.is_enabled) notes.push("the baseline has an enabled ventilator, which supplies its own FiO2; targets.fio2 only set the ambient gas");
}

// baroreflex MAP set-point: defend the requested MAP so the ANS doesn't fight it
if (has("map") && model.models.BR_MAP) { model.models.BR_MAP.set_value = targets.map; trace(`structural: baroreflex MAP set-point ${targets.map}`); }

// heart-rate reference seed (also an iterated lever below if hr is targeted)
if (seed && model.models.Heart && !has("hr")) model.models.Heart.heart_rate_ref = seed.hr_ref;
// the baroreflex must defend the gestation's own MAP when the spec does not name one, or it drives
// permanent reflex tachycardia (the fetal setpoint is 50 at term, far above a 30 wk target)
if (seed?.br_map != null && !has("map") && model.models.BR_MAP) model.models.BR_MAP.set_value = seed.br_map;
// fetal haemoglobin affinity (HbF), maternal pool excluded
if (FETAL_MODE && seed?.p50 != null && model.models.Blood) {
  if (model.models.Blood.set_P50) model.models.Blood.set_P50(seed.p50); else model.models.Blood.P50_0 = seed.p50;
  restoreMaternalPool();
  trace(`structural: fetal P50 ${seed.p50} (PL_MAT kept maternal)`);
}

// ---------------------------------------------------------------------------
// 3. controllers (one lever per off-target vital) — applied iteratively
// ---------------------------------------------------------------------------
// Each controller drives one measured vital toward its target via one lever (the
// secant loop lives in explain/helpers/Calibrator.js, shared with the live tuner).
// `mkc` injects this build's target + tolerance + the measure-dict key (co reads
// "lvo", spo2 reads "spo2_pre" from measureVitals).
const READKEY = { co: "lvo", spo2: "spo2_pre" };
// signGuard: a fresh build moves many levers at once, so cross-talk between them must not be
// read as a slope of the wrong sign; maxStepFrac: no lever moves more than half its value in one
// round, so a slope from a flat region cannot throw it to a bound (see makeController)
const mkc = (spec) => makeController({ signGuard: true, maxStepFrac: 0.5, ...spec, readKey: READKEY[spec.key] ?? spec.key, target: targets[spec.key], tol: tolOf(spec.key) });

const controllers = [];
let oxygenShunt = null; // set when the oxygen lever can open the intrapulmonary shunt

// MAP  <- systemic vascular resistance scaling (↑SVR ↑MAP)
if (has("map")) {
  let f = seed && seed.svr ? seed.svr : 1.0;
  eng.scale("systemic_resistances", f);
  controllers.push(mkc({ key: "map", lever: "systemic resistance scale", lo: 0.3, hi: 8, sign: +1, gain: 0.04, value: f, set: (v) => eng.scale("systemic_resistances", v) }));
}
// pulse pressure <- stiffness of the large elastic arteries (AA, AAR, AD: the windkessel).
// ↑stiffness ↑systolic ↓diastolic, MAP nearly unchanged (term neonate: x1.0 -> pp 26, x1.8 -> 43,
// x0.3 -> 7 mmHg). The upper bound is a numerical one: stiffer than about x2 the explicit
// integration of these small compartments goes unstable (pressures swing to hundreds of mmHg;
// measured: term neonate unstable at x2.0, a calibrated 28 wk preterm at x2.4), so the lever stops
// at 1.8 and a higher pulse pressure is reported as out of reach instead. The lever multiplies
// the size scaling above (BloodVessel composes elastance factors multiplicatively), so in a small
// baby, whose arteries already start stiffer, its upper bound is what is left of ARTERIAL_EL_MAX.
if (has("pp")) {
  const arteries = ["AA", "AAR", "AD"].filter((n) => model.models[n]);
  const start = model.models[arteries[0]]?.el_base_factor_ps ?? 1.0;
  const apply = (f) => { for (const n of arteries) model.models[n].el_base_factor_ps = f; };
  const hi = Math.min(1.8, ARTERIAL_EL_MAX / arterialScale);
  controllers.push(mkc({ key: "pp", lever: "large-artery stiffness x", lo: 0.3, hi, sign: +1, gain: 0.03, value: Math.min(start, hi), set: apply }));
}
// PAP (mean, or systolic from an echo TR jet) <- pulmonary vascular resistance scaling (↑PVR ↑PAP).
// The lever moves the intrapulmonary shunt (IPSL/IPSR) with the bed. Those resistors carry the
// blood that perfuses unventilated lung; their vessels belong to the same bed and constrict with
// it (hypoxic vasoconstriction, narrowed extra-alveolar vessels), and raised PVR on its own does
// not create intrapulmonary shunt (inert-gas studies in pulmonary vascular disease: Dantzker &
// Bower, JCI 1979). So the shunt's share of pulmonary flow stays put and the hypoxaemia of
// pulmonary hypertension comes from the duct and foramen, as it does clinically. Without it the
// bed alone stiffened: on a 28 wk build, systolic PAP 36 raised the shunt fraction from 33 to 46 %.
// The shunt follows the lever RELATIVE to its starting value: the seed's ips_res was calibrated
// with the seed PVR applied to the bed only, and that operating point must not move. Same scaling
// layer the ModelScaler group uses; IPSL/IPSR's r_factor_ps stays with Surfactant.
if (has("pap_m") || has("pap_s")) {
  const key = has("pap_m") ? "pap_m" : "pap_s";
  const f0 = patho.pvr_scale || (seed && seed.pvr) || 1.0;
  const ips = ["IPSL", "IPSR"].map((n) => model.models[n]).filter(Boolean);
  const scalePvr = (f) => {
    eng.scale("pulmonary_resistances", f);
    for (const r of ips) r.r_factor_scaling_ps = f / f0;
  };
  scalePvr(f0);
  controllers.push(mkc({ key, lever: "pulmonary resistance scale (incl. intrapulmonary shunt)", lo: 0.3, hi: 12, sign: +1, gain: key === "pap_m" ? 0.05 : 0.04, value: f0, set: scalePvr }));
} else if (patho.pvr_scale || (seed && seed.pvr)) {
  eng.scale("pulmonary_resistances", patho.pvr_scale || seed.pvr); // structural-only PVR
}
// CVP <- venous unstressed-volume multiplier on VLB/VUB (↓u_vol ↑CVP -> sign -1)
if (has("cvp")) {
  const base = {};
  for (const n of ["VLB", "VUB"]) { const c = model.models[n]; if (c) base[n] = c.u_vol; }
  const apply = (mult) => { for (const n in base) model.models[n].u_vol = base[n] * mult; };
  controllers.push(mkc({ key: "cvp", lever: "venous unstressed volume x", lo: 0.5, hi: 1.3, sign: -1, gain: 0.05, value: 1.0, set: apply }));
}
// HR <- heart-rate reference setpoint (direct)
if (has("hr")) {
  const start = model.models.Heart?.heart_rate_ref ?? targets.hr;
  controllers.push(mkc({ key: "hr", lever: "Heart.heart_rate_ref", lo: 60, hi: 240, sign: +1, gain: 0.8, value: start, set: (v) => { if (model.models.Heart) model.models.Heart.heart_rate_ref = v; } }));
}
// LV ejection fraction <- LV contractility (LV only: an echo EF is a left-ventricular measurement).
// It shares the lever with co, which keeps it when both are given: output is the input that
// separates flow from resistance, and EF is then reported for comparison
if (has("ef") && !has("co")) {
  const LV = model.models.LV;
  if (!LV || !model.models.Heart) {
    console.error(`build_patient: baseline "${baseline}" has no LV/Heart model, cannot calibrate ef.`);
    process.exit(1);
  }
  if (typeof targets.ef !== "number" || !(targets.ef > 5 && targets.ef < 95)) {
    console.error(`build_patient: targets.ef must be an ejection fraction in % between 5 and 95 (got ${JSON.stringify(targets.ef)}).`);
    process.exit(1);
  }
  controllers.push(mkc({ key: "ef", lever: "LV el_max_factor_ps", lo: 0.3, hi: 3, sign: +1, gain: 0.03, value: 1.0, set: (f) => { LV.el_max_factor_ps = f; } }));
}
// CO (LV output) <- ventricular contractility (el_max persistent factor)
if (has("co")) {
  const apply = (f) => { for (const n of ["LV", "RV"]) { const m = model.models[n]; if (m) m.el_max_factor_ps = f; } };
  controllers.push(mkc({ key: "co", lever: "LV/RV el_max_factor_ps", lo: 0.3, hi: 3, sign: +1, gain: 0.8, value: 1.0, set: apply }));
}
// PO2 / SpO2 <- alveolar O2 diffusion persistent factor (↑dif ↑PO2); in a FETUS the alveolar
// diffusors are inert (dif_o2 = 0, so the factor multiplies into zero — a complete no-op that would
// burn every iteration on a lever that cannot move the measurement). The fetal setpoint is the
// maternal pool's O2 content: Placenta.calc_model() writes mat_to2 onto PL_MAT every step and the
// exchanger nearly fully equilibrates fetal capillary blood to it, so mat_to2 IS the achievable
// umbilical-vein oxygen content. It reaches arterial (AA) saturation only indirectly via the
// UV -> ductus venosus -> foramen ovale -> LA path, hence the small gain.
if (has("po2") || has("spo2")) {
  const key = has("po2") ? "po2" : "spo2";
  if (FETAL_MODE) {
    const P = model.models.Placenta;
    controllers.push(mkc({ key, lever: "Placenta.mat_to2", lo: 4.0, hi: 10.0, sign: +1, gain: key === "po2" ? 0.05 : 0.03,
      value: P.mat_to2, set: (v) => { P.mat_to2 = v; } }));
  } else {
    // One lever on a continuous scale. Above DIF_FLOOR it is the diffusion factor. Below it,
    // diffusion stays at the floor and the intrapulmonary shunt opens instead: ips_res falls in
    // proportion, to a tenth of its starting value at the lever's bottom. A baby on high FiO2
    // still saturating too well with diffusion at its floor desaturates through shunt, which is
    // also the clinical picture (a sick preterm's hypoxaemia is mostly shunt, not diffusion)
    const DIF_FLOOR = DIF_O2_FLOOR; // shared with the live tuner (Calibrator.js)
    const S = model.models.Shunts;
    const ips0 = S && S.ips_res > 0 ? S.ips_res : null;
    const apply = (x) => {
      const f = Math.max(x, DIF_FLOOR);
      for (const n of ["GASEX_LL", "GASEX_RL"]) { const m = model.models[n]; if (m) m.dif_o2_factor_ps = f; }
      if (ips0) S.ips_res = x < DIF_FLOOR ? ips0 * (x / DIF_FLOOR) : ips0;
    };
    if (ips0) oxygenShunt = { S, ips0 };
    controllers.push(mkc({ key, lever: ips0 ? "alveolar O2 diffusion x (below 0.1: intrapulmonary shunt)" : "alveolar O2 diffusion x",
      lo: ips0 ? DIF_FLOOR / 10 : DIF_FLOOR, hi: 8, sign: +1, gain: key === "po2" ? 0.03 : 0.06, value: 1.0, set: apply }));
  }
}
// pCO2 <- spontaneous ventilatory drive (Breathing.minute_volume_ref multiplier).
// ↓drive ↑pCO2 -> sign -1. This is the lever that actually shifts the *regulated*
// CO2 operating point: the chemoreflex (mv_ans_factor, Breathing.js:60) defends a
// pCO2 setpoint, so gas-exchange dif_co2 alone is fought back to baseline — only
// changing the drive moves steady-state pCO2. (Assumes spontaneous breathing; for
// a ventilated baseline the bot sets ventilator rate/Vt instead.)
// In a FETUS this lever is inert (Breathing.is_enabled = false). The fetal equivalent is the
// maternal pool's CO2 content: a higher maternal CO2 content means a smaller placental gradient and
// therefore LESS clearance, so fetal pCO2 rises with mat_tco2 (sign +1 — verified empirically with
// `probe_fetus.mjs <scenario> --mattco2`, not asserted from reading).
if (has("pco2") && FETAL_MODE) {
  const P = model.models.Placenta;
  controllers.push(mkc({ key: "pco2", lever: "Placenta.mat_tco2", lo: 14, hi: 30, sign: +1, gain: 0.15, value: P.mat_tco2, set: (v) => { P.mat_tco2 = v; } }));
} else if (has("pco2") && model.models.Breathing) {
  const B = model.models.Breathing;
  const baseMv = B.minute_volume_ref;
  const apply = (mult) => { B.minute_volume_ref = baseMv * mult; };
  controllers.push(mkc({ key: "pco2", lever: "spontaneous minute volume x", lo: 0.2, hi: 2.5, sign: -1, gain: 0.03, value: 1.0, set: apply }));
  // the lever is the spontaneous drive: on a patient that is not breathing it moves nothing
  if (!B.is_enabled || B.breathing_enabled === false) notes.push("pco2 was targeted but spontaneous breathing is off in this baseline, so its lever (ventilatory drive) cannot move it");
}
// RR <- the tidal-volume/rate split of spontaneous breathing (Breathing.vt_rr_ratio_factor).
// Breathing sets rate = sqrt(target minute volume / (ratio * weight)), so for a given minute volume
// the factor that hits a rate is closed-form: f_new = f * (measured / target)^2. The minute volume
// itself stays with the pCO2 lever; the two interact only through dead space (more, shallower
// breaths ventilate less alveolar space), which the pCO2 controller then makes up for.
if (has("rr")) {
  const B = model.models.Breathing;
  if (FETAL_MODE || !B || !B.is_enabled || B.breathing_enabled === false) {
    console.error(`build_patient: targets.rr needs spontaneous breathing, which is off in baseline "${baseline}".`);
    process.exit(1);
  }
  const c = mkc({ key: "rr", lever: "Breathing.vt_rr_ratio_factor", lo: 0.2, hi: 5, sign: -1, gain: 0, value: B.vt_rr_ratio_factor ?? 1.0, set: (f) => { B.vt_rr_ratio_factor = f; } });
  c.step = function (measured) {
    if (typeof measured !== "number" || !(measured > 0)) return false;
    if (Math.abs(this.target - measured) <= this.tol) return false;
    const f = Math.min(this.hi, Math.max(this.lo, this.value * (measured / this.target) ** 2));
    if (f === this.value) return false; // pinned at a bound: nothing left to move
    this.value = f;
    this.set(f);
    return true;
  };
  controllers.push(c);
}
// BE / pH (metabolic) <- Stewart unmeasured anions uma (↑uma ↓BE/pH -> sign -1)
if (has("be") || has("ph")) {
  const key = has("be") ? "be" : "ph";
  const startUma = model.models.AA?.solutes?.uma ?? 0;
  const apply = (v) => {
    if (model.models.Blood) model.models.Blood.set_solute("uma", Math.max(0, v));
    restoreMaternalPool(); // set_solute reaches PL_MAT; the mother is not the patient
  };
  controllers.push(mkc({ key, lever: "unmeasured anions (uma)", lo: 0, hi: 40, sign: -1, gain: key === "be" ? 0.8 : 18, value: startUma, set: apply }));
}

// ---------------------------------------------------------------------------
// 4. calibration loop
// ---------------------------------------------------------------------------
const profile = selectProfile({ weight: model.weight, gestational_age: model.gestational_age, profile: spec.profile, fetal: FETAL_MODE });
// postnatal age (days) for the normal ranges: the term neonate's PAP falls steeply over the first days
const specAge = Number.isFinite(spec.postnatal_age_days) && spec.postnatal_age_days >= 0 ? spec.postnatal_age_days : null;
if (specAge != null && !has("age")) model.age = specAge / 365; // metadata (years); no model reads it
const ageDays = specAge ?? (has("age") ? targets.age * 365 : typeof model.age === "number" ? model.age * 365 : null);
const ranges = rangesFor(profile, { ageDays });
trace(`\ncalibrating "${spec.name || baseline}" (baseline ${baseline}, profile ${profile}) — ${controllers.length} target(s)`);

// run the shared secant calibration (settle → measure → nudge → warm → repeat),
// then an equilibrium bake (final) — eng.calc is the model stepper, measureVitals
// the windowed reader. Returns the final measured vitals + per-target residuals.
const measureAll = () => {
  const v = measureVitals(model, eng.send, { window: WINDOW });
  v.pp = v.sys - v.dia; // pulse pressure, the second half of the sys/dia pair
  return v;
};
let result;
if (controllers.length) {
  result = runCalibration(controllers, {
    measureAll,
    step: (s) => eng.calc(s),
    settle: SETTLE,
    warm: WARM,
    maxIters: MAX_ITERS,
    final: FINAL,
    log: (line) => trace(`  ${line}`),
  });
} else {
  // only structural targets (or none): nothing to iterate, but the patient still has to reach
  // steady state before it is measured and saved. runCalibration returns early without
  // measuring when it has no controllers, so settle and bake here
  eng.calc(SETTLE + FINAL);
  result = { iters: 0, converged: true, residuals: [], measured: measureAll() };
  notes.push("no iterated targets: the patient was built from its structural values and settled, nothing was calibrated");
}
// a lever resting exactly on the floor can sit a rounding error below it, so require a real change
if (oxygenShunt && oxygenShunt.S.ips_res < 0.99 * oxygenShunt.ips0) {
  notes.push(`oxygenation: lung oxygen uptake reached its lower limit, so the intrapulmonary shunt was opened (more blood bypasses the ventilated lung) to reach the saturation; Shunts.ips_res ${round(oxygenShunt.ips0, 0)} -> ${round(oxygenShunt.S.ips_res, 0)}`);
}
const vf = result.measured;
// read the solutes back now: serializeState (below) nests compartments back under their owners,
// so model.models.AA is gone by the time the report is assembled
const soluteReadback = Object.fromEntries(
  soluteTargets.map((k) => [k, { set: targets[k], value: round(model.models.AA?.solutes?.[SOLUTE_KEY[k]], 3) }]),
);
// a lever combination can push the circulation past the integrator's stability limit; such a
// patient must never be emitted, however plausible some of its numbers look
const unstable = ["sys", "dia", "map", "lvo"].filter((k) => typeof vf[k] !== "number" || !isFinite(vf[k]));
if (!unstable.length && (vf.dia < 0 || vf.sys > 250 || vf.lvo > 10)) unstable.push("pressures");
if (unstable.length) {
  console.error(`build_patient: the calibrated patient is numerically unstable (sys ${round(vf.sys)}, dia ${round(vf.dia)}, CO ${round(vf.lvo)} L/min); not emitted. Relax the blood-pressure targets.`);
  process.exit(1);
}
const it = result.iters;

// ---------------------------------------------------------------------------
// 5. residual report (stderr)
// ---------------------------------------------------------------------------
trace(`\n=== ${spec.name || baseline} — final vitals (profile ${profile}) ===`);
const REPORT = ["hr", "sys", "dia", "map", ...(has("pp") ? ["pp"] : []), "rr", "cvp", "pap_s", "pap_m", "ef", "spo2_pre", "spo2_post", "etco2", "po2", "pco2", "ph", "be", "hco3"];
for (const k of REPORT) {
  const tk = k === "spo2_pre" ? "spo2" : k;
  const tgt = targets[tk];
  const flag = flagOf(ranges, k, vf[k]);
  trace(`  ${k.padEnd(10)} ${String(round(vf[k])).padStart(8)}${tgt != null ? `  (target ${tgt}, Δ ${round(vf[k] - tgt)})` : ""}  [${flag}]`);
}
const allWithin = result.converged;
trace(`  calibration ${allWithin ? "CONVERGED" : "INCOMPLETE"} after ${it} iter — ${result.residuals.filter((r) => !r.within).map((r) => r.key).join(", ") || (result.residuals.length ? "all targets met" : "no iterated targets")}`);

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

// machine-readable report (the same facts as the stderr report above, plus the levers)
const atBound = (c) => Math.abs(c.value - c.lo) <= 1e-9 * Math.max(1, Math.abs(c.lo)) || Math.abs(c.value - c.hi) <= 1e-9 * Math.max(1, Math.abs(c.hi));
const build_report = {
  version: 1,
  baseline,
  profile,
  // the postnatal age the normal-range flags assumed (null = day 1)
  postnatal_age_days: ageDays == null ? null : round(ageDays, 2),
  fetal: FETAL_MODE,
  converged: result.converged,
  iters: it,
  max_iters: MAX_ITERS,
  // one row per calibrated target
  targets: controllers.map((c) => {
    const value = vf[c.readKey];
    return {
      key: c.key,
      target: c.target,
      value: round(value, 3),
      delta: typeof value === "number" ? round(value - c.target, 3) : null,
      tolerance: c.tol,
      within: typeof value === "number" && Math.abs(c.target - value) <= c.tol,
      lever: c.lever ?? null,
      lever_value: round(c.value, 4),
      lever_bounds: [c.lo, c.hi],
      // a lever sitting on its bound could not go further: the target is out of this lever's reach
      lever_at_bound: atBound(c),
    };
  }),
  // every measured vital with its normal-range flag ("ok" | "LOW" | "HIGH" | "" when not ranged)
  measured: Object.fromEntries(
    Object.entries(vf)
      .filter(([, v]) => typeof v === "number" && isFinite(v))
      // 5 significant digits, not fixed decimals: q_da (ductal flow) is in L/s, ~0.002
      .map(([k, v]) => [k, { value: Number(v.toPrecision(5)), flag: flagOf(ranges, k, v) }]),
  ),
  structural: Object.fromEntries(
    ["weight", "gestational_age", "height", "age", "hb", "hb_gdl", "temp", "pda", "pda_mm", "fo_mm", "fio2", ...Object.keys(SOLUTE_KEY)].filter(has).map((k) => [k, targets[k]]),
  ),
  // each solute that was set, with the arterial (AA) value after calibration: kidney filtration,
  // and lactate production in a hypoxic patient, can move them
  solutes: soluteReadback,
  // targets the builder computed from others: pp = sys - dia, and map from sys/dia when absent
  derived_targets: derivedTargets,
  ignored_targets: ignoredTargets,
  superseded_targets: supersededTargets,
  notes,
};

const out = {
  ...baseJson,
  name,
  description,
  user: spec.user || "explain-bot",
  // the baseline's own provenance ("hand-authored", ...) does not describe a fitted patient
  provenance: "calibrator-fitted",
  provenance_note: `Built by scripts/build_patient.mjs from baseline "${baseline}"; see build_report.`,
  build_report,
  model_definition: model,
};
const json = JSON.stringify(out, null, PRETTY ? 1 : 0);
JSON.parse(json); // fail loudly before emitting if anything is non-serializable
process.stdout.write(json + "\n");
