// Build the Bischoff et al. 2021 (Echocardiography 38:1524-1533) virtual patients from the calibrated
// term_neonate baseline. The paper is a cohort of 45 preterm infants (<30 wk, <21 days) categorised by
// PDA shunt pattern; Table 1/2 give per-column demographics, ABG and echo cardiac outputs. We build one
// scenario per Table-1 column. THIS pass implements the "cohort" (n=45) average; the three shunt-pattern
// subgroups (ltr / bidir / nopda) are stubbed for a later pass.
//
//   node scripts/_make_bischoff.mjs cohort
//
// The cohort patient: ~25.5 wk, 720 g, 1 day old, SPONTANEOUSLY BREATHING ON CPAP (the user's choice;
// the cohort itself is mostly HFJV but 13% are on CPAP/non-invasive). Targets (Table 1 & 2, cohort col):
//   HR 159 bpm; LVO 187 / RVO 151 ml/kg/min (LVO/RVO 1.16 -> net left-to-right ductal steal);
//   MAP_airway 7 cmH2O; FiO2 26%; pH 7.34; pCO2 44; OI 4.13 (=> PaO2 ~44 on FiO2 0.26/MAP 7);
//   BE -1.2; PDA ~1.3 mm; atrial communication present (97.8%).
//
// Approach mirrors _make_preterm.mjs (LIVE engine build so the ModelScaler weight/resistance groups can
// write their persistent *_scaling_ps layers), plus a non-invasive CPAP layer that _make_preterm lacks.
//
// CPAP modelling note (engine limitations -> how non-invasive CPAP is represented here):
//   1. The Ventilator "CPAP" device mode does NOT work for a spontaneously breathing extreme-preterm. It
//      connects via the ET tube and BLOCKS the upper airway (MOUTH_DS), but the spontaneous Breathing
//      controller measures tidal volume from MOUTH_DS.flow (Breathing.calc_model). With MOUTH_DS sealed it
//      reads zero, ramps rmp_gain to its ceiling and the baby under-ventilates through the compliant
//      circuit (verified: pCO2 ~85). So the Ventilator device stays OFF and the patient breathes
//      spontaneously through the open MOUTH_DS (Breathing controller intact).
//   2. A literal CPAP distending pressure at the airway can't be baked either: per-compartment pressure
//      offsets (pres_ext/pres_cc/pres_mus) reset every step, and the global Gas model overwrites every gas
//      compartment's pres_atm back to 760 at each build (Gas.init_model) — raising it globally would just
//      shift the whole system uniformly (no CPAP gradient).
//   So CPAP is represented as: (a) inspired FiO2 at the MOUTH airway reservoir (the dominant oxygenation
//   effect), and (b) the +cpap cmH2O MAP folded into the RECRUITED-LUNG calibration (ips_res / RDS u_vol /
//   el_base tuned so the arterial blood gas matches a baby ON CPAP at this FiO2). The ABG — the net
//   physiological result of CPAP+FiO2 on this infant — is the calibration target and is matched.
//   - Pda.diameter_relative for the duct (term_neonate Pda has diameter_ao_max=diameter_pa_max=3, so
//     d_pa = diameter_relative * 3), Shunts.diameter_fo>0 for the atrial communication.
//
// Un-warmed output; warm to the operating point afterwards with:
//   node scripts/reseed_preterm.mjs --file bischoff_cohort --seconds 300 --write
// then calibrate with: node scripts/probe_vitals.mjs bischoff_cohort --profile preterm_26 --verbose
//                 and: node scripts/probe_pda.mjs bischoff_cohort --beats 6
import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);
import { calc_gas_composition } from "../explain/component_models/GasComposition.js";

// per-phenotype lever table (starting points; final numbers found by iterating reseed + probe). Field
// meanings match the _make_preterm.mjs table; bischoff-specific additions are the CPAP block (cpap /
// insp_flow / fio2), the foramen-ovale opening (fo_diam / fo_lr) and the strong-ion difference (uma, the
// Stewart base-excess lever). pda is diameter_relative [0..1]; with the term Pda's 3 mm max ends,
// d_pa = pda * 3, so pda 0.43 ~= 1.3 mm (the cohort mean PDA size).
const BISCHOFF = {
  // Table-1 cohort (n=45) average — spontaneously breathing on CPAP. ABG is BETTER than a generic
  // unsupported 25-weeker (CPAP 7 / FiO2 26, RSS only ~1.9), so RDS is milder and ips_res higher (less
  // venous admixture) than the _make_preterm 24/26 wk rows. Net mild L->R duct (LVO/RVO ~1.16).
  cohort: {
    weight: 0.72, height: 0.318, ga: 25,
    rds_el: 3.0, rds_uvol: 0.42, gasex: 0.40, ips_res: 2100,
    hr_ref: 159, vt_rr: 0.90, mv_boost: 1.75, br_map: 27, ven_uvol: 0.80,
    el_max: 0.50, relax: 1.13, svr: 3.0, pvr: 2.2,
    pda: 0.33, fo_diam: 1.5, fo_lr: 10, uma: 3.0,
    cpap: 7, fio2: 0.26,
    desc:
      "Bischoff 2021 (Echocardiography 38:1524) Table-1 COHORT (n=45) average: ~25 wk / 720 g preterm " +
      "neonate, day 1, spontaneously breathing on nasal CPAP (MAP 7 cmH2O, FiO2 0.26). Allometric size " +
      "scaling + RDS lungs; patent ductus arteriosus with a net left-to-right shunt (LVO/RVO ~1.16) and a " +
      "patent foramen ovale (atrial communication). Calibrated to the cohort heart-rate, cardiac-output " +
      "(LVO 187 / RVO 151 ml/kg/min) and arterial blood-gas (pH 7.34, pCO2 ~44, BE -1.2, OI ~4) targets. " +
      "CPAP is represented by the inspired FiO2 plus a recruited-lung state (the engine's Ventilator CPAP " +
      "device cannot drive a spontaneously breathing extreme preterm).",
  },
  // ---- stubbed for a later pass (Table-1 subgroup columns) -----------------------------------------
  //   ltr    Group 1: hemodynamically significant left-to-right PDA (LVO 250 / RVO 161, LVO/RVO 1.44)
  //   bidir  Group 2: bidirectional duct, >=10% time R->L (LVO 140 / RVO 120, LVO/RVO 1.19)
  //   nopda  Group 3: no / insignificant duct (LVO 170 / RVO 170, LVO/RVO ~0.98)
};

const key = process.argv[2];
const cfg = BISCHOFF[key];
if (!cfg) { console.error(`usage: node scripts/_make_bischoff.mjs <key>\nkeys: ${Object.keys(BISCHOFF).join(", ")} (subgroups not yet implemented)`); process.exit(1); }

let liveModel = null;
globalThis.self = globalThis;
globalThis.postMessage = (m) => { if (m && m.type === "state") liveModel = m.payload; };
const _log = console.log; console.log = () => {};
await import("../explain/ModelEngine.js");
const send = (t, msg, p) => self.onmessage({ data: { type: t, message: msg, payload: p } });

const src = new URL("../public/model_definitions/term_neonate.json", import.meta.url);
const dst = new URL(`../public/model_definitions/bischoff_${key}.json`, import.meta.url);
const j = JSON.parse(fs.readFileSync(src, "utf8"));

// build the term baseline (freezes model._baseline_weight = 3.545, the allometric denominator), then scale.
send("POST", "build", j.model_definition);
send("GET", "state", []);
const model = liveModel;
const TERM_W = model._baseline_weight;
const log = [];

// A. allometric volume scaling to the preterm weight (volumes only; ModelScaler sets model.weight).
send("POST", "scale", { group: "weight_scale", factor: cfg.weight });
const volFactor = cfg.weight / TERM_W;
log.push(`size: weight ${TERM_W} -> ${cfg.weight} kg (vol x${volFactor.toFixed(3)})`);

// allometric SVR bump for the small body (volumes scale but resistances don't) — restore operating MAP.
if (cfg.svr !== 1.0) { send("POST", "scale", { group: "systemic_resistances", factor: cfg.svr }); log.push(`SVR: systemic resistances x${cfg.svr}`); }
// elevated PVR of the incompletely-transitioned / hypoxic preterm lung; applied before the PDA so the
// duct equilibrates against the higher pulmonary pressure. Kept sub-systemic so the duct stays L->R.
if (cfg.pvr !== 1.0) { send("POST", "scale", { group: "pulmonary_resistances", factor: cfg.pvr }); log.push(`PVR: pulmonary resistances x${cfg.pvr}`); }

// B. RDS lung phenotype: stiff (el_base up), low FRC (u_vol down), reduced diffusion, atelectasis shunt.
for (const n of ["ALL", "ALR"]) { const c = model.models[n]; c.el_base *= cfg.rds_el; c.u_vol *= cfg.rds_uvol; }
for (const n of ["GASEX_LL", "GASEX_RL"]) { const c = model.models[n]; c.dif_o2 *= cfg.gasex; c.dif_co2 *= cfg.gasex; }
model.models.Shunts.ips_res = cfg.ips_res;
log.push(`RDS: ALL/ALR el_base x${cfg.rds_el} u_vol x${cfg.rds_uvol}; GASEX dif x${cfg.gasex}; ips_res ${cfg.ips_res}`);

// C. spontaneous breathing, gestation-appropriate ventilatory control (stays ON for CPAP).
const B = model.models.Breathing;
B.breathing_enabled = true;
B.minute_volume_ref *= volFactor * (cfg.mv_boost ?? 1.0); // bulk alveolar ventilation lever (sets pCO2)
B.vt_rr_ratio *= cfg.vt_rr;                                // vt-vs-rr split (deeper/slower as it rises)
log.push(`Breathing: spontaneous, minute_volume_ref x${(volFactor * (cfg.mv_boost ?? 1.0)).toFixed(3)} (vol x${volFactor.toFixed(3)} * boost ${cfg.mv_boost ?? 1.0}), vt_rr_ratio x${cfg.vt_rr}`);

// D. HR setpoint + baroreflex operating point (preterm runs faster at a lower defended MAP).
model.models.Heart.heart_rate_ref = cfg.hr_ref;
model.models.BR_MAP.set_value = cfg.br_map;
log.push(`Heart: heart_rate_ref -> ${cfg.hr_ref}; Ans BR_MAP set_value -> ${cfg.br_map}`);

// E. venous preload (restore CVP after uniform volume scaling) + Stewart strong-ion difference (BE lever).
for (const n of ["VLB", "VUB"]) { const c = model.models[n]; if (c) c.u_vol *= cfg.ven_uvol; }
if (model.models.Blood?.set_solute) model.models.Blood.set_solute("uma", cfg.uma);
log.push(`Preload: VLB/VUB u_vol x${cfg.ven_uvol}; Blood uma -> ${cfg.uma}`);

// F. cardiac immaturity + patent ductus arteriosus (net L->R) + patent foramen ovale (atrial comm).
// Contractility is driven DIRECTLY on the ventricles' el_max_factor_ps (the predictable systolic lever,
// = what probe_vitals --contract sets) rather than Heart.cont_factor (a shallow serialized-delta path);
// cont_factor is left at 1.0 so it doesn't perturb el_max_factor_ps. relax_factor (diastolic, immature
// myocardium) uses the same delta path the preterm scenarios use (prev_* is serialized, so it's stable).
const H = model.models.Heart;
H.cont_factor_left = 1.0; H.cont_factor_right = 1.0;
H.relax_factor_left = cfg.relax; H.relax_factor_right = cfg.relax;
model.models.LV.el_max_factor_ps = cfg.el_max;      // systolic contractility (sets cardiac output)
model.models.RV.el_max_factor_ps = cfg.el_max;
model.models.Pda.diameter_relative = cfg.pda;       // d_pa = pda * diameter_pa_max(=3); sets L->R shunt
model.models.Shunts.diameter_fo = cfg.fo_diam;      // patent foramen ovale (atrial communication)
model.models.Shunts.fo_lr_factor = cfg.fo_lr;
log.push(`Cardiac: el_max ${cfg.el_max} (LV/RV), relax ${cfg.relax}; PDA diameter_relative ${cfg.pda} (~${(cfg.pda * model.models.Pda.diameter_pa_max).toFixed(2)} mm, L->R); FO diameter ${cfg.fo_diam} mm`);

// G. Non-invasive CPAP (see header note): set the inspired FiO2 at the MOUTH airway reservoir; the CPAP
// distending pressure is folded into the recruited-lung calibration (it cannot be baked literally). MOUTH
// is fixed_composition, so the baked O2 fraction is held; Gas.fio2 is kept consistent for any re-bootstrap.
// Ventilator device stays OFF and MOUTH_DS stays open so the spontaneous Breathing controller works.
const MOUTH = model.models.MOUTH;
calc_gas_composition(MOUTH, cfg.fio2, MOUTH.temp || 37, MOUTH.humidity || 1.0); // inspired FiO2 at the airway
if (model.models.Gas) model.models.Gas.fio2 = cfg.fio2;
if (model.models.Ventilator) model.models.Ventilator.is_enabled = false;
log.push(`CPAP (non-invasive): inspired FiO2 ${cfg.fio2} at MOUTH; ${cfg.cpap} cmH2O MAP folded into lung calibration; spontaneous breathing, Ventilator off`);

model.weight = cfg.weight;
model.height = cfg.height;
model.gestational_age = cfg.ga;
model.age = 0;

// --- top-level metadata ---
j.name = `bischoff_${key}`;
j.user = "timothy";
j.description = cfg.desc;
model.name = `bischoff_${key}`;
model.description = cfg.desc;

// --- serialize like Model._processModelState (un-warmed; reseed warms to steady state) ---
delete model["DataCollector"]; delete model["TaskScheduler"]; delete model["ModelScaler"];
delete model["_baseline_weight"]; delete model["diagram_definition"]; delete model["animation_definition"];
for (const k in model) if (k.startsWith("ncc")) delete model[k];
Object.values(model.models).forEach((m) => {
  for (const k in m) {
    if (k.startsWith("_")) delete m[k];
    if (k === "components" && Object.keys(m[k]).length > 0) {
      Object.keys(m[k]).forEach((cn) => { m.components[cn] = model.models[cn]; delete model.models[cn]; });
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
