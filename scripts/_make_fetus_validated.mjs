// Generator: term_neonate.json -> a literature-validated fetus in utero, one lever profile per gestation
// (scripts/_fetal_profiles.mjs):
//   30: fetus_30wk - fetus at 30+0 weeks (1.5 kg), not in labour (docs/Fetus30wkReference.md)
//
//   node scripts/_make_fetus_validated.mjs --profile <ga> [--seconds 300] [--name <scenario>] [--set LEVER=value ...]
//
// Validated against docs/Fetus<ga>wkReference.md and scripts/reference/fetus_<ga>wk.json
// (probe: scripts/probe_term_reference.mjs <name> --ref scripts/reference/fetus_<ga>wk.json).
//
// Why from term_neonate and not from the archived term_fetus: term_neonate is the literature-validated
// baseline (72 h), and the preterm series is built from it too, so a fetus and a neonate of the same
// gestation share the same size and maturity levers. The fetal transform below is the one
// scripts/_make_term_fetus.mjs applies to the definition JSON, re-done here on the live model (the
// archived generator is left as it is). The traps it guards against are in docs/fetal_circulation.md.
//
// Pipeline (all re-runnable):
//   1. live-build term_neonate, scale it to the profile's weight, apply the size/maturity levers
//   2. the fetal transform: placenta running, cord patent, duct and foramen wide open, intrapulmonary
//      shunts closed, high PVR, inert lungs, no breathing, HbF, split right atrium, amniotic environment
//   3. write model_definitions/<name>.json (un-warmed), with the fetal diagram of the archived fetus_30wk
//   4. scripts/reseed_preterm.mjs --file <name> - warm to rest, set the preterm renal reference, warm, bake
//   5. re-assert the fetal invariants on the baked file (the probes exit 0 on bad physiology)
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createEngine } from "./_harness.mjs";
import { serializeState } from "./_serialize_state.mjs";
import { setDiagramTitle } from "./_titles.mjs";
import { scaleHormoneReferences, describeHormoneReferences } from "./_reference.mjs";
import { PROFILES } from "./_fetal_profiles.mjs";

const argv = process.argv.slice(2);
const SECONDS = (() => { const i = argv.indexOf("--seconds"); return i >= 0 ? Number(argv[i + 1]) : 300; })();
const PROFILE = (() => { const i = argv.indexOf("--profile"); return i >= 0 ? argv[i + 1] : null; })();
const P = PROFILES[PROFILE];
if (!P) { console.error(`--profile is required: ${Object.keys(PROFILES).join(" | ")}`); process.exit(1); }
const NAME = (() => { const i = argv.indexOf("--name"); return i >= 0 ? argv[i + 1] : P.name; })();
const L = { ...P.L };
for (let i = 0; i < argv.length; i++) {
  if (argv[i] !== "--set") continue;
  const [k, v] = argv[i + 1].split("=");
  if (!(k in L)) { console.error(`unknown lever ${k}; levers: ${Object.keys(L).join(", ")}`); process.exit(1); }
  L[k] = Number(v);
}

// the fetal invariants (docs/fetal_circulation.md): each one silently destroys the fetal circulation while
// the model still builds and prints a plausible panel
function fetalInvariantViolations(M) {
  const bad = [];
  if (M.Placenta.placenta_running !== true) bad.push("Placenta.placenta_running is not true");
  if (M.Placenta.umb_clamped !== false) bad.push("Placenta.umb_clamped is not false");
  if (!(M.Shunts.ips_res >= 1e7)) bad.push(`Shunts.ips_res ${M.Shunts.ips_res}: intrapulmonary shunts open`);
  if (M.Pda.diameter_relative !== 1.0) bad.push(`Pda.diameter_relative ${M.Pda.diameter_relative}: the fetal duct must be wide open`);
  if (M.Breathing.is_enabled !== false || M.Breathing.breathing_enabled !== false) bad.push("Breathing is enabled");
  for (const n of ["GASEX_LL", "GASEX_RL"]) if (M[n] && (M[n].dif_o2 !== 0 || M[n].dif_co2 !== 0)) bad.push(`${n} exchanges gas: the fetal lung must be inert`);
  if (M.RAIVCI_RASVC && M.RAIVCI_RASVC.no_flow !== true) bad.push("RAIVCI_RASVC is open: the fetal right atrium must stay split");
  return bad;
}

const eng = await createEngine();
const { enableImplicitAorta } = await import("../helpers/Calibrator.js");
const src = new URL("../model_definitions/term_neonate.json", import.meta.url);
const dst = new URL(`../model_definitions/${NAME}.json`, import.meta.url);
const j = JSON.parse(fs.readFileSync(src, "utf8"));
const model = eng.build(j.model_definition); // freezes _baseline_weight = 3.545 (the scaling denominator)
const M = model.models;
const TERM_W = model._baseline_weight;
const log = [];

// 1. size and maturity: volumes scale with weight; resistances and elastances are set by the levers
eng.scale("weight_scale", L.WEIGHT);
const volFactor = L.WEIGHT / TERM_W;
log.push(`size: ${TERM_W} -> ${L.WEIGHT} kg (volumes x${volFactor.toFixed(4)})`);
// the placenta is outside every scaler group (docs/fetal_circulation.md, trap 1): scale it by hand
for (const n of ["PL_UMB_ART", "PL_FETAL_ART", "PL_FETAL_CAP", "PL_FETAL_VEN", "PL_UMB_VEN"]) { M[n].vol *= L.PL_VOL; M[n].u_vol *= L.PL_VOL; }
M.PL_MAT.vol *= L.MAT_VOL; M.PL_MAT.u_vol *= L.MAT_VOL;
log.push(`placenta volume: fetal PL_* x${L.PL_VOL}, maternal PL_MAT x${L.MAT_VOL}`);
if (L.SVR !== 1.0) eng.scale("systemic_resistances", L.SVR);
// fetal PVR: raw r on the pulmonary BloodVessels (they own their inlet resistors), then the scaling layer on top
for (const n of ["PAAL", "PAAR", "LL_ART", "RL_ART", "LL_CAP", "RL_CAP"]) { M[n].r_for *= L.FETAL_PVR; M[n].r_back *= L.FETAL_PVR; }
if (L.PVR !== 1.0) eng.scale("pulmonary_resistances", L.PVR);
log.push(`resistances: systemic x${L.SVR}; pulmonary raw x${L.FETAL_PVR} then x${L.PVR}`);
if (L.HEART_EL_MAX !== 1.0) eng.scale("heart_el_max", L.HEART_EL_MAX);
if (L.HEART_EL_MIN !== 1.0) eng.scale("heart_el_min", L.HEART_EL_MIN);
if (L.ART_EL !== 1.0) {
  enableImplicitAorta(model); // as _make_preterm_validated: the large arteries can be stiffened (docs/Resistor.md)
  for (const n of ["AA", "AAR", "AD", "RLB", "RUB", "INT_ART", "KID_ART", "LS_ART", "BR_ART"]) if (M[n]) M[n].el_base_factor_scaling_ps = L.ART_EL;
}
log.push(`stiffness: heart el_max x${L.HEART_EL_MAX}, el_min x${L.HEART_EL_MIN}; arteries x${L.ART_EL}`);

// 2. the fetal transform
const PL = M.Placenta;
PL.placenta_running = true;
PL.umb_clamped = false;
PL.umb_art_res = L.UMB_ART_RES; PL.umb_ven_res = L.UMB_VEN_RES; PL.plf_res = L.PLF_RES;
PL.dif_o2 = L.DIF_O2; PL.dif_co2 = L.DIF_CO2;
PL.mat_to2 = L.MAT_TO2; PL.mat_tco2 = L.MAT_TCO2;
log.push(`placenta: running, cord patent; umb_art ${L.UMB_ART_RES}, plf ${L.PLF_RES}, umb_ven ${L.UMB_VEN_RES}; dif o2/co2 ${L.DIF_O2}/${L.DIF_CO2}; maternal to2/tco2 ${L.MAT_TO2}/${L.MAT_TCO2}`);
// duct: diameter_relative is the [0..1] patency fraction (1 = wide open); the size is diameter_*_max
M.Pda.diameter_relative = 1.0;
M.Pda.diameter_ao_max = L.DA_DIAM; M.Pda.diameter_pa_max = L.DA_DIAM; M.Pda.length = L.DA_LEN;
M.Shunts.diameter_fo = L.FO_DIAM; M.Shunts.atrial_septal_width = L.FO_SEPTUM;
M.Shunts.fo_svc_fraction = L.FO_SVC_FRACTION; // preferential streaming: IVC blood crosses the foramen, SVC blood goes to the RV
M.Shunts.ips_res = 1e8; // fetal lung flow is all capillary
log.push(`shunts: duct ${L.DA_DIAM} mm x ${L.DA_LEN} mm wide open; foramen ${L.FO_DIAM} mm (septum ${L.FO_SEPTUM} mm, SVC share ${L.FO_SVC_FRACTION}); intrapulmonary shunts closed`);
// inert, fluid-filled lungs: no breathing, no alveolar exchange (zero the constants: is_enabled does not stick)
M.Breathing.is_enabled = false; M.Breathing.breathing_enabled = false;
for (const n of ["GASEX_LL", "GASEX_RL"]) { M[n].dif_o2 = 0; M[n].dif_co2 = 0; }
if (M.Ventilator) M.Ventilator.is_enabled = false;
// split right atrium: preferential streaming (ductus venosus/IVC blood -> foramen, SVC blood -> RV)
Object.assign(M.RAIVCI_RASVC, { no_flow: true, no_back_flow: true, r_for: 55, r_back: 55 });
log.push("lungs inert (Breathing off, GASEX dif 0, Ventilator off); right atrium split (RAIVCI_RASVC closed)");

// 3. heart, baroreflex, beds
M.Heart.heart_rate_ref = L.HR_REF;
const termBrMap = M.BR_MAP.set_value;
M.BR_MAP.set_value = L.BR_MAP;
if (L.BR_WINDOW) { const k = L.BR_MAP / termBrMap; M.BR_MAP.min_value *= k; M.BR_MAP.max_value *= k; }
log.push(`heart: heart_rate_ref ${L.HR_REF}; BR_MAP ${termBrMap} -> ${L.BR_MAP} (window ${M.BR_MAP.min_value.toFixed(1)}-${M.BR_MAP.max_value.toFixed(1)})`);
log.push(describeHormoneReferences(scaleHormoneReferences(model, { volumeFactor: volFactor, mapRef: L.BR_MAP, mapRefBaseline: termBrMap })));
M.Heart.cont_factor_left = L.CONT_LEFT; M.Heart.cont_factor_right = L.CONT_RIGHT;
M.Heart.relax_factor_left = L.RELAX; M.Heart.relax_factor_right = L.RELAX;
M.RV.u_vol = M.LV.u_vol * L.RV_UVOL_RATIO;
if (L.RV_EL_MIN !== 1.0) M.RV.el_min *= L.RV_EL_MIN; // raw RV diastolic elastance; the scaling layer stays shared
for (const n of ["VLB", "VUB"]) if (M[n]) M[n].u_vol *= L.VEN_UVOL;
for (const n of ["BR_ART", "BR_CAP", "BR_VEN"]) { M[n].r_for *= L.BRAIN_R; M[n].r_back *= L.BRAIN_R; }
if (L.INT_R !== 1.0) for (const n of ["INT_ART", "INT_CAP", "INT_VEN"]) { M[n].r_for *= L.INT_R; M[n].r_back *= L.INT_R; }
if (L.LS_R !== 1.0) for (const n of ["LS_ART", "LS_CAP", "LS_VEN"]) { M[n].r_for *= L.LS_R; M[n].r_back *= L.LS_R; }
if (L.UB_R !== 1.0) { M.RUB.r_for *= L.UB_R; M.RUB.r_back *= L.UB_R; }
M.AA_COR.r_for *= L.COR_R; M.AA_COR.r_back *= L.COR_R;
M.Brain.cbf_setpoint = L.CBF_SET; M.Brain.cpp_setpoint = 0.0; M.Brain.cbv0 = 0.0; // rest anchors re-seed after the warm-up
M.Brain.autoreg_control_gain = L.BRAIN_CTL_GAIN;
log.push(`myocardium cont L/R ${L.CONT_LEFT}/${L.CONT_RIGHT}, relax ${L.RELAX}; RV el_min x${L.RV_EL_MIN}, u_vol ${L.RV_UVOL_RATIO} x LV; VLB/VUB u_vol x${L.VEN_UVOL}`);
log.push(`beds: brain r x${L.BRAIN_R} (cbf_setpoint ${L.CBF_SET} L/min), upper body x${L.UB_R}, gut x${L.INT_R}/${L.LS_R}, coronary x${L.COR_R}`);

// 4. metabolism, blood, kidney, environment
M.Metabolism.vo2 = L.VO2_METABOLISM;
M.Metabolism.resp_q = L.RESP_Q;
// the brain's share of the organ VO2 (Metabolism distributes vo2 over the capillary beds by these fractions)
const fr = M.Metabolism.metabolic_active_models, brOld = fr.BR_CAP;
if (L.BRAIN_VO2_FRAC !== brOld) {
  for (const n of Object.keys(fr)) fr[n] = n === "BR_CAP" ? L.BRAIN_VO2_FRAC : fr[n] * (1 - L.BRAIN_VO2_FRAC) / (1 - brOld);
}
// fetal blood = every blood compartment except the maternal pool, the uterus and the bladder
const fetalBlood = Object.entries(M).filter(([n, m]) => m.solutes && m !== M.Blood && !/^(PL_MAT$|UT|MP|URINE$)/.test(n)).map(([, m]) => m);
if (L.UMA_DELTA !== 0) { M.Blood.solutes.uma += L.UMA_DELTA; for (const m of fetalBlood) if (typeof m.solutes.uma === "number") m.solutes.uma += L.UMA_DELTA; }
M.Blood.solutes.glucose = L.GLUCOSE;
for (const m of fetalBlood) if (typeof m.solutes.glucose === "number") m.solutes.glucose = L.GLUCOSE;
M.Glucose.glucose_setpoint = L.GLUCOSE; M.Glucose.glucose_default = L.GLUCOSE;
const K = M.Kidneys;
K.reabsorption_fraction = L.REABS_WATER;
K.reabsorption_fractions.na = L.REABS_NACL; K.reabsorption_fractions.cl = L.REABS_NACL;
M.Fluids.maintenance_rate = L.MAINT_RATE;
const urine = {};
for (const [sol, f] of Object.entries(K.reabsorption_fractions)) {
  const c = M.Blood.solutes?.[sol];
  if (typeof c === "number" && sol !== "lact") urine[sol] = +(c * (1 - f) / (1 - L.REABS_WATER)).toFixed(3);
}
M.Fluids.fluids[M.Fluids.maintenance_fluid] = urine;
// Hb and HbF: Blood.set_solute/set_P50 reach every blood compartment INCLUDING the maternal pool, whose O2
// content is pinned by Placenta.mat_to2, so restore its haemoglobin and affinity (_make_fetus.mjs section E).
// Rescale each fetal compartment's O2 content with Hb (same saturation; see _make_preterm_validated.mjs).
const matHb = M.PL_MAT.solutes.hemoglobin, matP50 = M.PL_MAT.P50_0;
const hbOld = M.Blood.solutes.hemoglobin;
M.Blood.set_solute("hemoglobin", L.HB_MMOL);
for (const m of fetalBlood) if (typeof m.to2 === "number") m.to2 *= L.HB_MMOL / hbOld;
M.Blood.set_P50(L.P50);
M.PL_MAT.solutes.hemoglobin = matHb; M.PL_MAT.P50_0 = matP50;
log.push(`blood: Hb ${L.HB_MMOL.toFixed(2)} mmol/L, P50 ${L.P50} (maternal pool kept at Hb ${matHb}, P50 ${matP50}); glucose ${L.GLUCOSE}; uma +${L.UMA_DELTA}`);
log.push(`metabolism: vo2 ${L.VO2_METABOLISM}, resp_q ${L.RESP_Q}, brain share ${L.BRAIN_VO2_FRAC}; kidney: water ${L.REABS_WATER}, NaCl ${L.REABS_NACL}, intake ${L.MAINT_RATE} mL/kg/h`);
// amniotic environment: no evaporation, no respiratory loss, no brown fat; the fluid and the umbilical
// circulation carry the heat away, so the core rests just above the amniotic temperature
const T = M.Thermoregulation;
T.env_temp = L.ENV_TEMP; T.rel_humidity = 1.0; T.respiratory_heat_loss = false;
T.h_convective = L.H_FLUID; T.setpoint_temp = L.SETPOINT_TEMP; T.bat_gain = 0.0;
log.push(`environment: amniotic ${L.ENV_TEMP} degC, h ${L.H_FLUID} W/m2/K, set-point ${L.SETPOINT_TEMP}, no brown fat`);

const bad = fetalInvariantViolations(M);
if (bad.length) { console.error("fetal invariants violated:\n  " + bad.join("\n  ")); process.exit(1); }

model.weight = L.WEIGHT;
model.height = L.HEIGHT;
model.gestational_age = L.GA;
model.age = L.AGE;

// the fetal diagram (placenta, umbilical vessels, open duct/foramen) from the archived fetus
const fetalDiagram = JSON.parse(fs.readFileSync(new URL("../model_definitions/archive/fetus_30wk.json", import.meta.url), "utf8"));
j.diagram_definition = fetalDiagram.diagram_definition;
if (fetalDiagram.animation_definition) j.animation_definition = fetalDiagram.animation_definition;
j.name = NAME;
setDiagramTitle(j, NAME);
j.user = "timothy";
j.description = P.description;
j.provenance = "hand-authored";
j.provenance_note = `generated from term_neonate by scripts/_make_fetus_validated.mjs --profile ${PROFILE}; reference set ${P.refDoc}`;
model.name = NAME;
model.description = P.description;

j.model_definition = serializeState(model);
const text = JSON.stringify(j, null, 1) + "\n";
JSON.parse(text);
fs.writeFileSync(dst, text);
process.stderr.write(`wrote ${fileURLToPath(dst)}\n${log.join("\n")}\n`);

// 4. warm, renal reference, bake
const run = (script, ...args) => {
  process.stderr.write(execFileSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), ...args], { encoding: "utf8" }));
};
run("./reseed_preterm.mjs", "--file", NAME, "--seconds", String(SECONDS), "--write", ...(L.GFR_FACTOR !== 1 ? ["--gfr-factor", String(L.GFR_FACTOR)] : []));

// 5. the baked file must still be a fetus
const baked = JSON.parse(fs.readFileSync(dst, "utf8"));
const check = await createEngine();
const bm = check.build(baked.model_definition);
const after = fetalInvariantViolations(bm.models);
if (after.length) { console.error("fetal invariants violated after the bake:\n  " + after.join("\n  ")); process.exit(1); }
process.stderr.write("fetal invariants hold after the bake\n");
