// One-off transform: term_neonate.json -> preterm_<ga>wk.json (spontaneously-breathing preterm neonate).
// Re-runnable. Applies allometric size scaling + a gestation-appropriate RDS lung phenotype; steady-state
// re-seeding is done afterwards by reseed_preterm.mjs (which warms the model and bakes the equilibrium
// gas/volume seeds).
//
//   node scripts/_make_preterm.mjs 28      (also 32, 34)
//
// Prematurity here is modelled as SIZE + LUNGS only (cardiac immaturity / PDA / elevated PVR are
// deliberately deferred to a later pass). Two levers:
//   1. Allometric volume scaling to the preterm body weight via ModelScaler.scale_to_weight (the
//      "weight_scale" group). Volumes scale linearly with weight; VO2 is per-kg * model.weight so it
//      auto-scales; blood/lung volumes shrink with the smaller body.
//   2. Respiratory distress syndrome (RDS): surfactant deficiency -> stiffer alveoli (higher el_base),
//      low functional residual capacity (lower u_vol), and reduced alveolar-capillary diffusion
//      (immature/reduced gas-exchange surface). Severity grades with gestational age (28 worst).
// The patient breathes spontaneously (Ventilator off); the user adds CPAP/ventilation themselves.
//
// Targets (regulated operating point, probe_vitals --profile preterm_NN): preterm runs faster (HR/RR
// higher) at a lower MAP (~ GA in mmHg) with RDS oxygenation (lower PO2/SpO2, mild resp acidosis).
import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const ga = Number(process.argv[2]);
// per-GA table — starting points; final numbers found by iterating reseed_preterm.mjs + probe_vitals.mjs.
// rds_el / rds_uvol multiply the (already weight-scaled) alveolar el_base / u_vol; gasex multiplies the
// alveolar-capillary diffusion constants; vt_rr multiplies vt_rr_ratio (smaller => rapid-shallow).
// br_map = baroreflex MAP setpoint (Ans.BR_MAP.set_value) the ANS defends — must match the preterm's
// lower normal MAP (~ GA in mmHg) or it drives reflex tachycardia. ips_res = intrapulmonary shunt
// resistance (Shunts.ips_res, baseline 5000); lower => more atelectasis venous admixture => RDS hypoxemia.
// ven_uvol = multiplier on the large systemic veins' (VLB/VUB) unstressed volume; uniform weight scaling
// preserves the stressed fraction but leaves CVP near zero, so trim u_vol to restore venous filling/preload.
// cont/relax = immature-myocardium contractility (Heart.cont_factor_* <1, weaker systole) and diastolic
// compliance (Heart.relax_factor_* >1, stiffer/slower relaxation), both ventricles, graded by GA.
// pda = ductus arteriosus diameter_relative [0..1]: preterm PDA shunts left-to-right (PVR<SVR), grading
// from a large haemodynamically-significant duct at 28 wk to a small one at 34 wk.
// svr = systemic vascular resistance multiplier. scale_to_weight scales VOLUMES only (el/res allometry is
// commented out), so the very small babies (<=26 wk, <0.25x term volume) run hypotensive and the
// baroreflex cannot recover MAP; raise SVR (inverse-with-weight) to restore the operating pressure.
// pvr = pulmonary vascular resistance multiplier (scaleModel("pulmonary_resistances")). Preterm lungs sit
// in incomplete transition with hypoxic pulmonary vasoconstriction (RDS), so PVR is elevated and PAP runs
// higher; graded younger=higher. Kept sub-systemic so the PDA stays predominantly left-to-right.
const PRETERM = {
  24: { weight: 0.64, height: 0.310, rds_el: 4.0, rds_uvol: 0.36, gasex: 0.32, hr_ref: 151, vt_rr: 0.72, br_map: 24, ips_res: 1900, ven_uvol: 0.78, cont: 0.90, relax: 1.15, pda: 0.40, svr: 1.85, pvr: 3.0 },
  26: { weight: 0.85, height: 0.330, rds_el: 3.5, rds_uvol: 0.42, gasex: 0.38, hr_ref: 153, vt_rr: 0.76, br_map: 26, ips_res: 1600, ven_uvol: 0.80, cont: 0.90, relax: 1.12, pda: 0.42, svr: 1.35, pvr: 1.9 },
  28: { weight: 1.0, height: 0.355, rds_el: 3.0, rds_uvol: 0.50, gasex: 0.45, hr_ref: 152, vt_rr: 0.80, br_map: 28, ips_res: 1900, ven_uvol: 0.82, cont: 0.90, relax: 1.10, pda: 0.45, svr: 1.0, pvr: 1.75 },
  30: { weight: 1.35, height: 0.385, rds_el: 2.5, rds_uvol: 0.58, gasex: 0.55, hr_ref: 151, vt_rr: 0.85, br_map: 31, ips_res: 2200, ven_uvol: 0.84, cont: 0.91, relax: 1.08, pda: 0.36, svr: 1.0, pvr: 1.65 },
  32: { weight: 1.7, height: 0.420, rds_el: 2.0, rds_uvol: 0.65, gasex: 0.65, hr_ref: 150, vt_rr: 0.90, br_map: 35, ips_res: 2500, ven_uvol: 0.85, cont: 0.92, relax: 1.07, pda: 0.28, svr: 1.0, pvr: 1.6 },
  34: { weight: 2.2, height: 0.450, rds_el: 1.4, rds_uvol: 0.80, gasex: 0.80, hr_ref: 148, vt_rr: 0.95, br_map: 41, ips_res: 3400, ven_uvol: 0.88, cont: 0.96, relax: 1.03, pda: 0.22, svr: 1.0, pvr: 1.4 },
  36: { weight: 2.7, height: 0.480, rds_el: 1.2, rds_uvol: 0.88, gasex: 0.90, hr_ref: 145, vt_rr: 0.97, br_map: 45, ips_res: 4200, ven_uvol: 0.93, cont: 0.98, relax: 1.02, pda: 0.15, svr: 1.0, pvr: 1.3 },
};
const cfg = PRETERM[ga];
if (!cfg) { console.error(`unknown GA "${process.argv[2]}"; use 24, 26, 28, 30, 32, 34 or 36`); process.exit(1); }

let liveModel = null;
globalThis.self = globalThis;
globalThis.postMessage = (m) => { if (m && m.type === "state") liveModel = m.payload; };
const _log = console.log; console.log = () => {};
await import("../explain/ModelEngine.js");
const send = (t, msg, p) => self.onmessage({ data: { type: t, message: msg, payload: p } });

const src = new URL("../public/model_definitions/term_neonate.json", import.meta.url);
const dst = new URL(`../public/model_definitions/preterm_${ga}wk.json`, import.meta.url);
const j = JSON.parse(fs.readFileSync(src, "utf8"));

// build the term baseline (build freezes model._baseline_weight = model.weight = 3.545, the allometric
// denominator scale_to_weight needs), then scale to the preterm weight.
send("POST", "build", j.model_definition);
send("GET", "state", []);
const model = liveModel;
const TERM_W = model._baseline_weight;
const log = [];

// A. allometric volume scaling to the preterm weight (volumes only; scale_to_weight takes absolute kg
// and sets model.weight = cfg.weight). el/res are not auto-scaled — RDS + HR below cover the lungs/rate.
send("POST", "scale", { group: "weight_scale", factor: cfg.weight });
const volFactor = cfg.weight / TERM_W;
log.push(`size: weight ${TERM_W} -> ${cfg.weight} kg (vol x${volFactor.toFixed(3)}); VO2 auto-scales (per-kg * weight)`);

// allometric SVR bump for the smallest babies (volumes scale but resistances don't). Writes the
// persistent r_factor_scaling_ps layer on the systemic resistors; it serializes and is applied every
// step, so no incorporate() is needed (and engine incorporate() assumes a lung.el_base config we lack).
if (cfg.svr !== 1.0) {
  send("POST", "scale", { group: "systemic_resistances", factor: cfg.svr });
  log.push(`SVR: systemic resistances x${cfg.svr} (restore operating MAP at <0.25x term volume)`);
}
// elevated PVR of the incompletely-transitioned / hypoxic-vasoconstricted preterm lung -> raises PAP.
// Same persistent r_factor_scaling_ps mechanism (no incorporate); applied before the PDA so the duct
// equilibrates against the higher pulmonary pressure.
if (cfg.pvr !== 1.0) {
  send("POST", "scale", { group: "pulmonary_resistances", factor: cfg.pvr });
  log.push(`PVR: pulmonary resistances x${cfg.pvr} (transitional + hypoxic vasoconstriction -> raise PAP)`);
}

// B. RDS lung phenotype — surfactant-deficient: stiff (el_base up), low FRC (u_vol down), reduced
// alveolar-capillary diffusion. Symmetric across both lungs. Applied on top of the weight scaling.
for (const n of ["ALL", "ALR"]) { const c = model.models[n]; c.el_base *= cfg.rds_el; c.u_vol *= cfg.rds_uvol; }
for (const n of ["GASEX_LL", "GASEX_RL"]) { const c = model.models[n]; c.dif_o2 *= cfg.gasex; c.dif_co2 *= cfg.gasex; }
model.models.Shunts.ips_res = cfg.ips_res;   // atelectasis intrapulmonary shunt -> venous admixture (hypoxemia)
log.push(`RDS: ALL/ALR el_base x${cfg.rds_el} u_vol x${cfg.rds_uvol}; GASEX dif_o2/co2 x${cfg.gasex}; ips_res ${cfg.ips_res}`);

// C. spontaneous breathing, gestation-appropriate ventilatory control. minute_volume_ref scales with
// body size; vt_rr_ratio drops for RDS (rapid-shallow). Ventilator stays OFF (user adds support).
const B = model.models.Breathing;
B.breathing_enabled = true;
B.minute_volume_ref *= volFactor;
B.vt_rr_ratio *= cfg.vt_rr;
if (model.models.Ventilator) model.models.Ventilator.is_enabled = false;
log.push(`Breathing: spontaneous, minute_volume_ref x${volFactor.toFixed(3)}, vt_rr_ratio x${cfg.vt_rr}`);

// D. HR setpoint + baroreflex operating point. Preterm runs faster; the ANS baroreflex must defend the
// preterm's lower normal MAP (~ GA in mmHg) or it perpetually drives reflex tachycardia/vasoconstriction.
model.models.Heart.heart_rate_ref = cfg.hr_ref;
model.models.BR_MAP.set_value = cfg.br_map;   // flattened to model.models at build (nesting is JSON-only)
log.push(`Heart: heart_rate_ref -> ${cfg.hr_ref}; Ans BR_MAP set_value -> ${cfg.br_map}`);

// E. engine-level metadata; re-anchor the allometric baseline to the preterm weight so reset()/scaling
// in-app work from the preterm size (build re-derives _baseline_weight = weight on reload).
for (const n of ["VLB", "VUB"]) { const c = model.models[n]; if (c) c.u_vol *= cfg.ven_uvol; }   // restore venous filling/CVP
log.push(`Preload: VLB/VUB u_vol x${cfg.ven_uvol}`);

// F. cardiac immaturity + patent ductus arteriosus. Immature myocardium: weaker contraction
// (cont_factor) and reduced diastolic compliance (relax_factor >1), both ventricles. PDA opens the
// duct (diameter_relative); with the preterm's PVR < SVR it shunts left-to-right (aorta -> pulmonary).
const H = model.models.Heart;
H.cont_factor_left = cfg.cont; H.cont_factor_right = cfg.cont;
H.relax_factor_left = cfg.relax; H.relax_factor_right = cfg.relax;
model.models.Pda.diameter_relative = cfg.pda;
log.push(`Cardiac: cont_factor ${cfg.cont}, relax_factor ${cfg.relax}; PDA diameter_relative ${cfg.pda} (L->R)`);

model.weight = cfg.weight;
model.height = cfg.height;
model.gestational_age = ga;
model.age = 0;

// --- top-level metadata ---
j.name = `preterm_${ga}wk`;
j.user = "timothy";
j.description =
  `preterm ${cfg.weight} kg neonate, ${ga} weeks gestation: allometric size scaling + ` +
  `${ga <= 26 ? "very severe" : ga <= 28 ? "severe" : ga <= 32 ? "moderate" : "mild"} respiratory distress syndrome ` +
  `(surfactant deficiency: stiff low-FRC lungs, reduced gas exchange); spontaneously breathing, no respiratory support`;
model.name = `preterm_${ga}wk`;
model.description = j.description;

// --- serialize like Model._processModelState (un-warmed; reseed_preterm.mjs warms to steady state) ---
delete model["DataCollector"]; delete model["TaskScheduler"]; delete model["ModelScaler"];
delete model["_baseline_weight"]; delete model["diagram_definition"]; delete model["animation_definition"];
for (const key in model) if (key.startsWith("ncc")) delete model[key];
Object.values(model.models).forEach((m) => {
  for (const key in m) {
    if (key.startsWith("_")) delete m[key];
    if (key === "components" && Object.keys(m[key]).length > 0) {
      Object.keys(m[key]).forEach((cn) => { m.components[cn] = model.models[cn]; delete model.models[cn]; });
    }
  }
});
model.model_time_total = 0;

console.log = _log;
j.model_definition = model;
const out = JSON.stringify(j, null, 1) + "\n";
JSON.parse(out);
fs.writeFileSync(dst, out);
console.log("wrote", dst.pathname);
console.log(log.join("\n"));
