// Generator: term_neonate.json -> a literature-validated preterm scenario at 72 h, one lever profile per
// gestation (scripts/_preterm_profiles.mjs):
//   28: preterm_28wk - born at 28 weeks (1.0 kg), nasal CPAP 6, FiO2 0.25 (docs/Preterm28wkReference.md)
//   25: preterm_25wk - born at 25 weeks (0.7 kg), nasal CPAP 7, FiO2 0.30 after one LISA dose
//       (docs/Preterm25wkReference.md)
//   30: preterm_30wk - born at 30 weeks (1.5 kg), nasal CPAP 5 in room air, no surfactant
//       (docs/Preterm30wkReference.md)
//   bischoff_no_pda: the Bischoff 2021 no-PDA group (25.5 wk, 0.764 kg) at 72 h, room air, duct closed
//       (docs/BischoffNoPdaReference.md)
//   bischoff_ltr_pda: the Bischoff 2021 left-to-right PDA group (25.8 wk, 0.72 kg) at 72 h, FiO2 0.26, PDA ~2.1 mm
//       (docs/BischoffLtrPdaReference.md)
// Each is stable on nasal CPAP, with a small restrictive left-to-right PDA (none for bischoff_no_pda), a small PFO, untransfused
// (delayed cord clamping), enteral feeds + PN, caffeine, in a humidified incubator.
//
//   node scripts/_make_preterm_validated.mjs --profile <ga|bischoff_no_pda|bischoff_ltr_pda> [--seconds 300] [--name <scenario>] [--set LEVER=value ...]
//
// The reference sets it is validated against: docs/Preterm<ga>wkReference.md and
// scripts/reference/preterm_<ga>wk.json (probe: scripts/probe_term_reference.mjs --ref ...).
//
// Pipeline (all re-runnable):
//   1. live-build today's validated term_neonate, scale it to the profile's weight and apply its levers
//   2. write model_definitions/<name>.json (un-warmed)
//   3. scripts/_add_surfactant.mjs  - dynamic RDS recruitment model (neutral at baseline)
//   4. scripts/reseed_preterm.mjs   - warm to rest, set the preterm renal reference (< 34 wk), warm, bake
//   5. scripts/_add_apnea.mjs       - apnea controller (shipped OFF) + hypoxic-bradycardia chemoreflex,
//                                     anchored to the baked AA.po2 so it is neutral at rest
//
// Every lever is a named constant in the profile. Values marked "reference" come straight from the
// reference set; values marked "starting point" are to be validated against it, not tuned here.
//
// Not done here, on purpose:
//   - minute_volume_ref is NOT multiplied by the weight factor. It is per kg (Breathing.js multiplies
//     by model.weight), so _make_preterm.mjs scaled it twice and the chemoreflex had to make up a
//     ~3.4x shortfall (EF_MV ~3.4).
//   - CPAP is not a device. The Ventilator CPAP mode seals MOUTH_DS and breaks the spontaneous
//     Breathing controller (see _make_bischoff.mjs), and a static airway pressure cannot be baked. CPAP
//     is represented as the inspired FiO2 at MOUTH plus a recruited-lung state.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createEngine } from "./_harness.mjs";
import { serializeState } from "./_serialize_state.mjs";
import { setDiagramTitle } from "./_titles.mjs";
import { scaleHormoneReferences, describeHormoneReferences } from "./_reference.mjs";
import { PROFILES } from "./_preterm_profiles.mjs";

const argv = process.argv.slice(2);
const SECONDS = (() => { const i = argv.indexOf("--seconds"); return i >= 0 ? Number(argv[i + 1]) : 300; })();

// Levers. "--set NAME=value" overrides one for a prototype run (with --name, so the scenario file is
// not overwritten).
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
const { UMA_DELTA, GLUCOSE, REABS_WATER, REABS_NACL, MAINT_RATE, COR_R, BR_WINDOW, FO_DIAM, BRAIN_R, CBF_SET, RESP_Q, RMP_RECAL, DS_UVOL, WEIGHT, HEIGHT, GA, AGE, HR_REF, BR_MAP, SVR, PVR, CONT, RELAX, HEART_EL_MAX, HEART_EL_MIN, ART_EL, VEN_UVOL, PDA_REL, RDS_EL, RDS_UVOL, THORAX_EL, GASEX,
  IPS_RES, SURFACTANT, FIO2, MV_REF, RR, IE, VO2_METABOLISM, HB_MMOL, P50, ENV_TEMP, REL_HUMIDITY, GFR_FACTOR, AIRWAY_R, INT_R, LS_R, UB_R, BRAIN_AR_GAIN, BRAIN_CTL_GAIN } = L;
const VT_RR = MV_REF / (RR * RR); // RR = sqrt(MV_REF / vt_rr_ratio): minute_volume_ref is per kg (28 wk: 7.80e-5)
const CR = P.CR; // chemoreceptor set-points = the reference resting gases

const eng = await createEngine();
// imported after createEngine, which registers the extensionless-import hook the engine modules need
const { calc_gas_composition } = await import("../component_models/GasComposition.js");
const { enableImplicitAorta } = await import("../helpers/Calibrator.js");
const src = new URL("../model_definitions/term_neonate.json", import.meta.url);
const dst = new URL(`../model_definitions/${NAME}.json`, import.meta.url);
const j = JSON.parse(fs.readFileSync(src, "utf8"));
const model = eng.build(j.model_definition); // freezes _baseline_weight = 3.545 (the scaling denominator)
const M = model.models;
const TERM_W = model._baseline_weight;
const log = [];

// 1. size: volumes scale with weight (ModelScaler.scale_to_weight sets model.weight)
eng.scale("weight_scale", WEIGHT);
const volFactor = WEIGHT / TERM_W;
log.push(`size: ${TERM_W} -> ${WEIGHT} kg (volumes x${volFactor.toFixed(4)})`);
if (SVR !== 1.0) eng.scale("systemic_resistances", SVR);
if (PVR !== 1.0) eng.scale("pulmonary_resistances", PVR);
log.push(`resistances: systemic x${SVR}, pulmonary x${PVR}`);
if (HEART_EL_MAX !== 1.0) eng.scale("heart_el_max", HEART_EL_MAX);
if (HEART_EL_MIN !== 1.0) eng.scale("heart_el_min", HEART_EL_MIN);
if (ART_EL !== 1.0) {
  // implicit flow on the resistors joining the near-merged aortic compartments, so the large arteries
  // can be stiffened (docs/Resistor.md); the same artery list and layer as scripts/build_patient.mjs
  enableImplicitAorta(model);
  for (const n of ["AA", "AAR", "AD", "RLB", "RUB", "INT_ART", "KID_ART", "LS_ART", "BR_ART"]) if (M[n]) M[n].el_base_factor_scaling_ps = ART_EL;
}
log.push(`stiffness: heart el_max x${HEART_EL_MAX}, el_min x${HEART_EL_MIN}; arteries x${ART_EL}`);

// 2. lungs: RDS phenotype, recruited by CPAP
for (const n of ["ALL", "ALR"]) { M[n].el_base *= RDS_EL; M[n].u_vol *= RDS_UVOL; }
for (const n of ["GASEX_LL", "GASEX_RL"]) { M[n].dif_o2 *= GASEX; M[n].dif_co2 *= GASEX; }
M.Shunts.ips_res = IPS_RES;
M.THORAX.el_base *= THORAX_EL;
if (AIRWAY_R !== 1.0) for (const n of ["MOUTH_DS", "DS_ALL", "DS_ALR"]) { M[n].r_for *= AIRWAY_R; M[n].r_back *= AIRWAY_R; }
log.push(`lungs: el_base x${RDS_EL}, u_vol x${RDS_UVOL}, diffusion x${GASEX}, ips_res ${IPS_RES}; chest wall el_base x${THORAX_EL}; airways r x${AIRWAY_R}`);

// 3. breathing: spontaneous, per-kg reference minute volume, rapid-shallow pattern
const B = M.Breathing;
B.breathing_enabled = true;
B.minute_volume_ref = MV_REF;
B.vt_rr_ratio = VT_RR;
B.ie_ratio = IE;
if (RMP_RECAL) { B.rmp_calibrated = false; B.rmp_gain = 0.0; B.load_factor = 1.0; }
M.DS.u_vol *= DS_UVOL;
for (const [n, v] of Object.entries(CR)) M[n].set_value = v;
log.push(`breathing: minute_volume_ref ${MV_REF} L/kg/min, vt_rr_ratio ${VT_RR.toExponential(3)}, ie_ratio ${IE}; effort gain ${RMP_RECAL ? "recalibrated" : "term"}; dead space u_vol x${DS_UVOL}; CR set-points ${JSON.stringify(CR)}`);

// 4. CPAP: FiO2 at the airway reservoir; the device stays off and MOUTH_DS open
calc_gas_composition(M.MOUTH, FIO2, M.MOUTH.temp || 37, M.MOUTH.humidity || 1.0);
if (M.Gas) M.Gas.fio2 = FIO2;
if (M.Ventilator) { M.Ventilator.is_enabled = false; M.Ventilator.ettube_diameter = 2.5; }
log.push(`CPAP: FiO2 ${FIO2} at MOUTH, Ventilator off (ET tube 2.5 mm if used)`);

// 5. heart, baroreflex, slow volume/pressure controller, preload
M.Heart.heart_rate_ref = HR_REF;
const termBrMap = M.BR_MAP.set_value;
M.BR_MAP.set_value = BR_MAP;
if (BR_WINDOW) { const k = BR_MAP / termBrMap; M.BR_MAP.min_value *= k; M.BR_MAP.max_value *= k; }
log.push(`heart: heart_rate_ref ${HR_REF}; BR_MAP ${termBrMap} -> ${BR_MAP} (window ${M.BR_MAP.min_value.toFixed(1)}-${M.BR_MAP.max_value.toFixed(1)})`);
log.push(describeHormoneReferences(scaleHormoneReferences(model, { volumeFactor: volFactor, mapRef: BR_MAP, mapRefBaseline: termBrMap })));
for (const n of ["VLB", "VUB"]) if (M[n]) M[n].u_vol *= VEN_UVOL;
M.Heart.cont_factor_left = CONT; M.Heart.cont_factor_right = CONT;
M.Heart.relax_factor_left = RELAX; M.Heart.relax_factor_right = RELAX;
M.Pda.diameter_relative = PDA_REL;
if (L.PDA_LEN != null) M.Pda.length = L.PDA_LEN; // ductal length, mm (optional lever; profiles without it keep term's)
if (L.PDA_CD != null) M.Pda.discharge_coeff = L.PDA_CD; // orifice discharge coefficient at the pulmonary end (optional lever)
M.Shunts.diameter_fo = FO_DIAM;
for (const n of ["BR_ART", "BR_CAP", "BR_VEN"]) { M[n].r_for *= BRAIN_R; M[n].r_back *= BRAIN_R; }
// splanchnic beds (templated identical in term_neonate, so SMA and coeliac flows read alike)
if (INT_R !== 1.0) for (const n of ["INT_ART", "INT_CAP", "INT_VEN"]) { M[n].r_for *= INT_R; M[n].r_back *= INT_R; }
if (LS_R !== 1.0) for (const n of ["LS_ART", "LS_CAP", "LS_VEN"]) { M[n].r_for *= LS_R; M[n].r_back *= LS_R; }
if (UB_R !== 1.0) { M.RUB.r_for *= UB_R; M.RUB.r_back *= UB_R; } // upper body outside the brain
M.AA_COR.r_for *= COR_R; M.AA_COR.r_back *= COR_R;
if (CBF_SET > 0) {
  // the autoregulation target is absolute (term: 0.10592 L/min); the rest anchors re-seed after the warm-up
  M.Brain.cbf_setpoint = CBF_SET; M.Brain.cpp_setpoint = 0.0; M.Brain.cbv0 = 0.0;
}
M.Brain.autoregulation_gain = BRAIN_AR_GAIN;
M.Brain.autoreg_control_gain = BRAIN_CTL_GAIN;
log.push(`FO ${FO_DIAM} mm; coronary r x${COR_R}; brain bed r x${BRAIN_R}, gut r x${INT_R}/${LS_R}, upper body r x${UB_R}, cbf_setpoint ${M.Brain.cbf_setpoint} L/min, autoregulation gain ${BRAIN_AR_GAIN}, control gain ${BRAIN_CTL_GAIN}`);
log.push(`preload: VLB/VUB u_vol x${VEN_UVOL}; myocardium cont ${CONT}, relax ${RELAX}; PDA ${(PDA_REL * M.Pda.diameter_pa_max).toFixed(2)} mm; FO ${M.Shunts.diameter_fo} mm`);

// 6. metabolism, blood, environment
M.Metabolism.vo2 = VO2_METABOLISM;
M.Metabolism.resp_q = RESP_Q;
// acid-base and glucose: set in Blood's reference solutes and every patient blood compartment
// (placenta, uterus, maternal and the bladder are left alone), before the maintenance fluid is derived
const patientBlood = Object.entries(M).filter(([n, m]) => m.solutes && m !== M.Blood && !/^(PL_|UT|MP|URINE$)/.test(n)).map(([, m]) => m);
if (UMA_DELTA !== 0) { M.Blood.solutes.uma += UMA_DELTA; for (const m of patientBlood) if (typeof m.solutes.uma === "number") m.solutes.uma += UMA_DELTA; }
if (GLUCOSE > 0) {
  M.Blood.solutes.glucose = GLUCOSE;
  for (const m of patientBlood) if (typeof m.solutes.glucose === "number") m.solutes.glucose = GLUCOSE;
  M.Glucose.glucose_setpoint = GLUCOSE; M.Glucose.glucose_default = GLUCOSE;
}
log.push(`acid-base/glucose: uma +${UMA_DELTA} (Blood uma ${M.Blood.solutes.uma.toFixed(3)}), glucose ${M.Blood.solutes.glucose}`);
// immature tubule: lower water and NaCl reabsorption (diuretic phase), intake matched to the urine
const K = M.Kidneys;
K.reabsorption_fraction = REABS_WATER;
if (REABS_NACL !== 0.99) { K.reabsorption_fractions.na = REABS_NACL; K.reabsorption_fractions.cl = REABS_NACL; }
if (MAINT_RATE > 0) {
  M.Fluids.maintenance_rate = MAINT_RATE;
  const urine = {};
  for (const [sol, f] of Object.entries(K.reabsorption_fractions)) {
    const c = M.Blood.solutes?.[sol];
    if (typeof c === "number" && sol !== "lact") urine[sol] = +(c * (1 - f) / (1 - REABS_WATER)).toFixed(3);
  }
  M.Fluids.fluids[M.Fluids.maintenance_fluid] = urine;
}
log.push(`kidney: water reabsorption ${REABS_WATER}, Na/Cl ${K.reabsorption_fractions.na}/${K.reabsorption_fractions.cl}; maintenance ${M.Fluids.maintenance_rate} mL/kg/h ${JSON.stringify(M.Fluids.fluids[M.Fluids.maintenance_fluid])}`);
// Hb: rescale each patient compartment's O2 content with it (same saturation). Setting Hb alone leaves
// term's to2 (~9.6 mmol/L at Hb 10); below Hb ~8.5 mmol/L that exceeds the blood's O2 capacity even at
// pO2 1000 mmHg, the pO2 solver finds no root, pO2 freezes and the lungs keep loading O2 (runaway).
const hbOld = M.Blood.solutes.hemoglobin;
M.Blood.set_solute("hemoglobin", HB_MMOL);
for (const m of patientBlood) if (typeof m.to2 === "number") m.to2 *= HB_MMOL / hbOld;
M.Blood.set_P50(P50);
M.Thermoregulation.env_temp = ENV_TEMP;
M.Thermoregulation.rel_humidity = REL_HUMIDITY;
log.push(`metabolism: vo2 ${VO2_METABOLISM}, resp_q ${RESP_Q}; Hb ${HB_MMOL.toFixed(2)} mmol/L; P50 ${P50}; incubator ${ENV_TEMP} degC / ${REL_HUMIDITY * 100} %`);

model.weight = WEIGHT;
model.height = HEIGHT;
model.gestational_age = GA;
model.age = AGE;

const desc = P.description;
j.name = NAME;
setDiagramTitle(j, NAME);
// profile-specific diagram settings (e.g. the oxygen colour window, to2_hi), as the author set them in the app
if (P.diagram && j.diagram_definition?.settings) Object.assign(j.diagram_definition.settings, P.diagram);
// label the two shunts in the diagram (explain-ui DiagramRenderer: layout.label.visible is opt-in); they keep
// the normal connector colour and width
// at = label position along the path from dbcFrom (DA: AAR -> PA, FO: LA -> RA); the two paths cross mid-diagram
const SHUNT_LABEL = { DA: { label: "PDA", at: 0.72 }, FO: { label: "PFO", at: 0.75 } };
for (const [key, st] of Object.entries(SHUNT_LABEL)) {
  if (key === "DA" && PDA_REL === 0) continue; // closed duct: no label
  const c = j.diagram_definition?.components?.[key];
  if (!c?.layout) continue;
  c.label = st.label;
  c.layout.label = { ...c.layout.label, visible: true, at: st.at, pos_x: 0, pos_y: -10, size: 11 };
}
j.user = "timothy";
j.description = desc;
j.provenance = "hand-authored";
j.provenance_note = `generated from term_neonate by scripts/_make_preterm_validated.mjs --profile ${PROFILE}; reference set ${P.refDoc}`;
model.name = NAME;
model.description = desc;

j.model_definition = serializeState(model);
const text = JSON.stringify(j, null, 1) + "\n";
JSON.parse(text);
fs.writeFileSync(dst, text);
process.stderr.write(`wrote ${fileURLToPath(dst)}\n${log.join("\n")}\n`);

// 3-5: the shared patchers and the warm/bake step
const run = (script, ...args) => {
  const outText = execFileSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), ...args], { encoding: "utf8" });
  process.stderr.write(outText);
};
run("./_add_surfactant.mjs", `${NAME}=${SURFACTANT}`);
run("./reseed_preterm.mjs", "--file", NAME, "--seconds", String(SECONDS), "--write", ...(GFR_FACTOR !== 1 ? ["--gfr-factor", String(GFR_FACTOR)] : []));
run("./_add_apnea.mjs", NAME);
