// Generator: term_neonate.json -> preterm_28wk.json, a preterm neonate born at 28 weeks (1.0 kg)
// at 72 h, stable on nasal CPAP 6 cmH2O with FiO2 0.25, a small restrictive left-to-right PDA, a
// small PFO, untransfused (delayed cord clamping), trophic feeds + PN, caffeine, in an incubator.
//
//   node scripts/_make_preterm_28wk.mjs [--seconds 300] [--name <scenario>] [--set LEVER=value ...]
//
// The reference set it is validated against: docs/Preterm28wkReference.md and
// scripts/reference/preterm_28wk.json (probe: scripts/probe_term_reference.mjs --ref ...).
//
// Pipeline (all re-runnable):
//   1. live-build today's validated term_neonate, scale it to 1.0 kg and apply the levers below
//   2. write model_definitions/preterm_28wk.json (un-warmed)
//   3. scripts/_add_surfactant.mjs  - dynamic RDS recruitment model (neutral at baseline)
//   4. scripts/reseed_preterm.mjs   - warm to rest, set the preterm renal reference (< 34 wk), warm, bake
//   5. scripts/_add_apnea.mjs       - apnea controller (shipped OFF) + hypoxic-bradycardia chemoreflex,
//                                     anchored to the baked AA.po2 so it is neutral at rest
//
// Every lever is a named constant. Values marked "reference" come straight from the reference set;
// values marked "starting point" come from the _make_preterm.mjs 28 wk row or _make_bischoff.mjs and are
// to be validated against the reference (step 6), not tuned here.
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

const argv = process.argv.slice(2);
const SECONDS = (() => { const i = argv.indexOf("--seconds"); return i >= 0 ? Number(argv[i + 1]) : 300; })();
const NAME = (() => { const i = argv.indexOf("--name"); return i >= 0 ? argv[i + 1] : "preterm_28wk"; })();

// Levers. "--set NAME=value" overrides one for a prototype run (with --name, so the scenario file is
// not overwritten).
const L = {
  // --- patient (reference) ---
  WEIGHT: 1.0,          // kg
  HEIGHT: 0.355,        // m (_make_preterm 28 wk row)
  GA: 28,               // weeks
  AGE: 3 / 365,         // years (scenario age is in years): 72 h

  // --- circulation ---
  HR_REF: 155,          // reference: HR 155 (Deshpande 2023, Bischoff 2021)
  BR_WINDOW: 1,         // 6.4: scale the baroreceptor window (BR_MAP min/max, term 25/100) with the set-point (x39/57.8 ->
                        //      16.9-67.5); the lopsided term window weighted the diastolic dip ~4x and read "low" at MAP 42
  BR_MAP: 39,           // reference: the MAP the baroreflex defends = Elsayed 2023 day-3 invasive median
  SVR: 2.0,             // 6.2/6.4/final: systemic resistances x -> MAP ~40 with the baroreflex neutral (term 1.0)
  PVR: 3.0,             // 6.2/6.4: pulmonary resistances x -> PAP ~31/25 (term 1.0); reference ratio 0.55
  CONT: 1.0,            // 6.2: Heart.cont_factor_* (was 0.90): preterm EF is normal (Groves 2011, no GA effect)
  RELAX: 1.10,          // starting point: immature diastolic function, Heart.relax_factor_*
  HEART_EL_MAX: 3.4,    // 6.2/6.4: heart chambers el_max x (el_max_factor_scaling_ps): weight scaling shrinks the chambers
                        //      but keeps term stiffness -> EF 69 %, ESV 0.72 mL/kg (was x1: EF 30 %)
  HEART_EL_MIN: 3.5,    // 6.2/6.4: heart chambers el_min x (el_min_factor_scaling_ps) -> EDV 2.3 mL/kg (at x2.4 the heart over-filled)
  ART_EL: 5.0,          // 6.2: artery el_base x (el_base_factor_scaling_ps, implicit aorta) -> pulse pressure ~22
                        //      (Elsayed 2023 54/29). The PWV rule of build_patient (x1.88) leaves PP ~10
  VEN_UVOL: 0.77,       // final: VLB/VUB unstressed volume x (_make_preterm 0.82) -> CVP ~2 (more stressed venous volume)
  PDA_REL: 1.0 / 3.0,   // reference: ductal diameter 1.0 mm (Pda.diameter_pa_max = 3 mm)
  FO_DIAM: 0.75,        // 6.4: Shunts.diameter_fo, mm (term 1.5) -> PFO shunt ~4 mL/kg/min L->R
  COR_R: 2.4,           // 6.4: coronary inflow (AA_COR) r x -> 12.7 mL/kg/min (term 11.7; was 27.6, a term-size bed)
  BRAIN_R: 1.2,         // 6.4: cerebral bed (BR_ART, BR_CAP, BR_VEN) r x, so autoregulation rests near 1 at CBF 28
  CBF_SET: 0.028,       // 6.4: Brain.cbf_setpoint, L/min absolute (28 mL/kg/min; term 0.10592 kept the bed fully dilated);
                        //      the CPP/CBV rest anchors re-seed after the warm-up

  // --- lungs and breathing ---
  RDS_EL: 5.55,         // 6.1: alveolar el_base x -> lung compliance 0.8 mL/cmH2O/kg (was 9.067, the unsupported severe-RDS row)
  RDS_UVOL: 0.80,       // 6.1: alveolar u_vol x -> FRC 22 mL/kg, the lung recruited by CPAP 6 (da Silva 1994)
  THORAX_EL: 2.94,      // 6.1: chest-wall (THORAX) el_base x -> 5 mL/cmH2O/kg (Gerhardt 1980); weight scaling leaves it at the term absolute value
  GASEX: 0.45,          // alveolar-capillary diffusion x (kept in 6.1: absolute, so already generous for 1 kg)
  IPS_RES: 10500,       // 6.1/final: intrapulmonary shunt resistance -> SpO2 93 % at FiO2 0.25 (mild residual shunt; was 1900)
  SURFACTANT: 0.25,     // starting point: surfactant maturity (_add_surfactant 28 wk); post-surfactant may sit higher
  FIO2: 0.25,           // reference: state definition
  MV_REF: 0.300,        // reference: minute volume 300 mL/kg/min (L/kg/min, per kg)
  RR: 62,               // reference: respiratory rate
  IE: 0.38,             // reference: Ti/Ttot
  RMP_RECAL: 1,         // 6.3: 1 = discard term_neonate's frozen muscle-effort gain (rmp_calibrated) so Breathing
                        //      recalibrates on these ~5x stiffer lungs; with the term gain Vt stayed at 3.4 of 6.3 mL/kg
  DS_UVOL: 1.36,        // 6.3: anatomic dead space (DS u_vol) x -> 3.0 mL/kg (was 2.2); nCPAP does not wash out the
                        //      nasopharynx (Liew 2020; Numa & Newth 1996)

  // --- metabolism, blood, environment ---
  REABS_WATER: 0.9175,  // 6.5: Kidneys.reabsorption_fraction (water; term 0.98) -> urine 3 mL/kg/h at GFR ~0.54
                        //      mL/min/kg, the diuretic phase of the immature tubule (Lorenz 1995)
  REABS_NACL: 0.95,     // 6.5: Kidneys.reabsorption_fractions na and cl (term 0.99 / 0.988) -> FENa 5 % (Lorenz 1995)
  MAINT_RATE: 3.0,      // 6.5: Fluids.maintenance_rate, mL/kg/h (term 1.352) = the resting urine; the maintenance fluid's
                        //   composition is set to the urine these fractions make (plasma x (1-f_s)/(1-f_water); lactate
                        //   excluded, as in term_neonate)
  UMA_DELTA: 2.85,      // 6.6: added to uma (unmeasured anions, Stewart) in every patient blood compartment ->
                        //      BE -2.65 -> -5.5, pH 7.27 (Bonsante 2017: early PN, <=29 wk days 2-7)
  GLUCOSE: 6.5,         // 6.6: mmol/L, blood glucose and the Glucose set-point (term 4.0); calm value on PN (Liu 2026).
                        //      Production = use (5.4 mg/kg/min: liver + PN), independent of concentration
  RESP_Q: 0.95,         // 6.3: Metabolism.resp_q (term 0.8) -> RQ on glucose-rich PN (Bauer 2003, Forsyth 1992)
  VO2_METABOLISM: 5.19, // reference total 6.0 minus term's Mob (myocardium) ~0.81 (starting point split)
  HB_MMOL: 14.5 / 1.611, // reference: Hb 14.5 g/dL -> 9.0 mmol/L
  P50: 18.5,            // reference: De Halleux 2002, untransfused <= 27 wk, standard conditions
  ENV_TEMP: 35.0,       // reference: incubator air (degC)
  REL_HUMIDITY: 0.70,   // reference: incubator humidity
};
for (let i = 0; i < argv.length; i++) {
  if (argv[i] !== "--set") continue;
  const [k, v] = argv[i + 1].split("=");
  if (!(k in L)) { console.error(`unknown lever ${k}; levers: ${Object.keys(L).join(", ")}`); process.exit(1); }
  L[k] = Number(v);
}
const { UMA_DELTA, GLUCOSE, REABS_WATER, REABS_NACL, MAINT_RATE, COR_R, BR_WINDOW, FO_DIAM, BRAIN_R, CBF_SET, RESP_Q, RMP_RECAL, DS_UVOL, WEIGHT, HEIGHT, GA, AGE, HR_REF, BR_MAP, SVR, PVR, CONT, RELAX, HEART_EL_MAX, HEART_EL_MIN, ART_EL, VEN_UVOL, PDA_REL, RDS_EL, RDS_UVOL, THORAX_EL, GASEX,
  IPS_RES, SURFACTANT, FIO2, MV_REF, RR, IE, VO2_METABOLISM, HB_MMOL, P50, ENV_TEMP, REL_HUMIDITY } = L;
const VT_RR = MV_REF / (RR * RR); // RR = sqrt(MV / (vt_rr_ratio x W)) at W = 1 kg -> 7.80e-5
// chemoreceptor set-points = the reference resting gases, so the chemoreflex is neutral at the target
const CR = { CR_PCO2: 46, CR_PO2: 50, CR_PH: 7.26 };

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
log.push(`lungs: el_base x${RDS_EL}, u_vol x${RDS_UVOL}, diffusion x${GASEX}, ips_res ${IPS_RES}; chest wall el_base x${THORAX_EL}`);

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
M.Shunts.diameter_fo = FO_DIAM;
for (const n of ["BR_ART", "BR_CAP", "BR_VEN"]) { M[n].r_for *= BRAIN_R; M[n].r_back *= BRAIN_R; }
M.AA_COR.r_for *= COR_R; M.AA_COR.r_back *= COR_R;
if (CBF_SET > 0) {
  // the autoregulation target is absolute (term: 0.10592 L/min); the rest anchors re-seed after the warm-up
  M.Brain.cbf_setpoint = CBF_SET; M.Brain.cpp_setpoint = 0.0; M.Brain.cbv0 = 0.0;
}
log.push(`FO ${FO_DIAM} mm; coronary r x${COR_R}; brain bed r x${BRAIN_R}, cbf_setpoint ${M.Brain.cbf_setpoint} L/min`);
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
M.Blood.set_solute("hemoglobin", HB_MMOL);
M.Blood.set_P50(P50);
M.Thermoregulation.env_temp = ENV_TEMP;
M.Thermoregulation.rel_humidity = REL_HUMIDITY;
log.push(`metabolism: vo2 ${VO2_METABOLISM}, resp_q ${RESP_Q}; Hb ${HB_MMOL.toFixed(2)} mmol/L; P50 ${P50}; incubator ${ENV_TEMP} degC / ${REL_HUMIDITY * 100} %`);

model.weight = WEIGHT;
model.height = HEIGHT;
model.gestational_age = GA;
model.age = AGE;

const desc =
  "Preterm neonate born at 28 weeks (1.0 kg) at 72 h: stable on nasal CPAP 6 cmH2O with FiO2 0.25 after " +
  "surfactant (mild RDS), a small restrictive left-to-right PDA (~1 mm) and a small PFO, untransfused " +
  "(delayed cord clamping), trophic feeds + parenteral nutrition, caffeine, humidified incubator. CPAP is " +
  "represented by the inspired FiO2 plus a recruited-lung state. Validated against " +
  "docs/Preterm28wkReference.md.";
j.name = NAME;
setDiagramTitle(j, NAME);
// make the two shunts stand out in the diagram: own colour + visible short label (explain-ui
// DiagramRenderer: layout.path.accent and layout.label.visible are opt-in)
// at = label position along the path from dbcFrom (DA: AAR -> PA, FO: LA -> RA); the two paths cross mid-diagram
const SHUNT_STYLE = { DA: { label: "PDA", color: "#f5a623", at: 0.72 }, FO: { label: "PFO", color: "#43c463", at: 0.75 } };
for (const [key, st] of Object.entries(SHUNT_STYLE)) {
  const c = j.diagram_definition?.components?.[key];
  if (!c?.layout) continue;
  c.label = st.label;
  c.layout.path.accent = st.color;
  c.layout.path.width = 5;
  c.layout.label = { ...c.layout.label, visible: true, at: st.at, pos_x: 0, pos_y: -10, size: 11, color: st.color };
}
j.user = "timothy";
j.description = desc;
j.provenance = "hand-authored";
j.provenance_note = "generated from term_neonate by scripts/_make_preterm_28wk.mjs; reference set docs/Preterm28wkReference.md";
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
run("./reseed_preterm.mjs", "--file", NAME, "--seconds", String(SECONDS), "--write");
run("./_add_apnea.mjs", NAME);
