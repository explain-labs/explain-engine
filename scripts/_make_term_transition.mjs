// Generate a transitional term neonate (term_neonate_<age>h) from the 72 h term_neonate_72h.
//
//   node scripts/_make_term_transition.mjs --age 1 [--seconds 300] [--write]
//   prototyping: [--set '<json profile overrides>'] [--out <file>] (writes the dry run there)
//
// The baby is the same healthy 3.545 kg term neonate after a vaginal birth with delayed cord clamping
// (~1 min), breathing room air, nursed skin-to-skin / dressed at room temperature. The reference values
// per age are docs/TermTransitionReference.md and scripts/reference/term_neonate_<age>h.json.
//
// Each scenario is a SNAPSHOT of its age: after the levers are applied the controllers are re-anchored
// to the new resting state, so the scenario holds it when loaded instead of drifting toward 72 h:
//   - baroreflex: the resting ANS effector activity is folded into the base values it acts on and
//     BR_MAP.set_value moves to the resting arch pressure (as scripts/_fix_baro_setpoint.mjs);
//   - chemoreflex: CR_PCO2 / CR_PO2 / CR_PH set-points = the resting arterial gases;
//   - Hormones: volume_setpoint / perfusion_setpoint = the resting blood volume / renal pressure;
//   - HeartFunction: wall-stress set-points re-learned at rest (as scripts/_relearn_heartfunction.mjs);
//   - Thermoregulation: the loss trim re-seeds neutral in the new environment.
// Then the scaling layer is baked into the base values (incorporate) and the live state is serialized
// at a sinus-node firing (as scripts/reseed_term_neonate.mjs).
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createEngine } from "./_harness.mjs";
import { serializeState } from "./_serialize_state.mjs";
import { setDiagramTitle } from "./_titles.mjs";
import { measureVitals } from "./_probe.mjs";

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? Number(argv[i + 1]) : d; };
const AGE = opt("--age", NaN);
const SECONDS = opt("--seconds", 300);
const WRITE = argv.includes("--write");
const sopt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const SET = JSON.parse(sopt("--set") ?? "{}");
const OUT = sopt("--out");
const out = (...a) => process.stderr.write(a.join(" ") + "\n");

// Lever profiles per postnatal age (h). Factors are relative to the 72 h term_neonate_72h.
const PROFILES = {
  1: {
    description: "healthy term neonate (3.545 kg) 1 h after a vaginal birth with delayed cord clamping (~1 min): " +
      "large bidirectional duct, near-systemic pulmonary pressure, high output, haematocrit 55 %, mild metabolic acidosis; room air, skin-to-skin",
    // duct: 4.6 mm at the pulmonary end (Kang 2016, 2 h); aortic end 5.5 mm
    PDA_AO_MAX: 5.5, PDA_PA_MAX: 5.0, PDA_REL: 0.92,
    // pulmonary vascular resistance (with the intrapulmonary shunt resistance, Shunts.ips_res, scaled
    // alike so the shunt fraction stays): with a 4.6 mm duct the pulmonary pressure follows the aorta,
    // so a small rise is enough for the bidirectional flow seen at 2 h
    PVR: 1.2,
    // transitional ductal Doppler (Kang 2016: bidirectional at 2 h; classically right-to-left in early
    // systole, left-to-right in late systole and diastole): the LV activation lags the RV's by 35 ms so
    // the pulmonary valve opens first (Heart.rv_delay < 0), and stiffer main/branch pulmonary arteries
    // give the sharper systolic PA pressure peak of a small, high-resistance pulmonary tree
    RV_DELAY: -0.035, PA_EL: 2.5,
    // high output after birth (catecholamine surge; Agata 1991/1994 LVO 327-365): low SVR, higher
    // contractility and rate
    SVR: 0.5, HEART_EL_MAX: 1.6, HR_REF: 1.07,
    // ...but the organ beds keep their 72 h resistance: the high output runs through the duct (L->R
    // ~77, Drayton 1987 62) and its diastolic steal lowers brain and gut flow while renal flow is
    // unchanged (Agata 1994); the brain settles pressure-passive and takes that flow as its set-point
    SVR_BEDS: { brain: 1, gut: 1, liver: 1, kidney: 1 }, BRAIN_REANCHOR: true,
    // immature glomerular filtration: Kf x0.8 -> GFR ~20 mL/min/1.73m2 (Smeets 2022, day 1: 19.6) and urine
    // ~0.9 mL/kg/h (low before the postnatal diuresis, Hogg 1977). The renal autoregulation keeps its
    // 1 h (dilated) tone: re-anchoring it to the 72 h afferent tone (KIDNEY_REANCHOR) collapses GFR to
    // ~8 and renal flow to 23 at the slightly lower 1 h renal pressure, so it stays off
    KF: 0.8,
    // blood: ~80 mL/kg at Hct 55 % (delayed clamping, after the first plasma shift)
    BLOOD_VOLUME: 80 / 85, HCT: 0.55,
    // gases and metabolites: lactate 2.2 (GLOW), BE ~-5 and pCO2 ~36 (textbook, C), glucose 3.3 (GLOW)
    LACT: 2.2, UMA_DELTA: 2.1, MV_REF: 1.11, GLUCOSE: 3.3,
    // residual lung liquid: a smaller, proportionally stiffer aerated lung (alveolar u_vol and el_base of
    // ALL/ALR) -> FRC ~-10 % (Lee 1999: vaginal FRC 23.1 at 4-6 h vs 24.9 at 24 h), Crs ~-8 % (Lødrup
    // Carlsen 1993: Crs lower on day 0; direction only), specific compliance about constant
    LUNG_U_VOL: 0.85, LUNG_EL: 1.11,
    // reflex set-points at the targets while the levers settle (re-anchored to the result afterwards); the
    // baroreflex senses the time-averaged arch pressure: a clinical MAP (dia + PP/3) of 47.2 (Taiwo 2022,
    // at birth) is a time-averaged ~53.5 with this waveform
    BR_MAP_INIT: 53.5, CR_PCO2_INIT: 36, CR_PH_INIT: 7.33,
    // dressed / skin-to-skin at room temperature
    ENV_TEMP: 24.0, REL_HUMIDITY: 0.5,
  },
  12: {
    description: "healthy term neonate (3.545 kg) 12 h after a vaginal birth with delayed cord clamping (~1 min): " +
      "closing left-to-right duct, pulmonary pressure falling, output still high, haematocrit 57 %; room air, dressed",
    // duct: 2.47 mm at the pulmonary end (Kang 2016, 12 h), left-to-right only in 88 %. It constricts from
    // the pulmonary end, so that end is a sharp, irregular narrowing rather than a smooth nozzle:
    // discharge coefficient 0.3 (0.9 passes ~52 mL/kg/min L->R at 2.47 mm; 0.3 with PVR x1.5 gives ~31, in
    // the 5-40 estimate, with a 2.0 m/s left-to-right jet)
    PDA_AO_MAX: 5.5, PDA_PA_MAX: 5.0, PDA_REL: 0.494, PDA_CD: 0.3,
    // pulmonary pressure falling (Kang 2016: mean 41, systolic 52.5); a narrower duct passes less of the
    // aortic pressure, so PVR stays above the 72 h value (x1.6 with the open 0.9 duct left a late-diastolic
    // R->L flow, 13 %; with the tighter duct x1.5 holds PAP at 41)
    PVR: 1.5,
    // no transitional Doppler timing: the flow is left-to-right throughout the cycle
    RV_DELAY: 0, PA_EL: 1,
    // output past the surge but still high (Agata: ~290 at 12 h vs 245-272 at 24 h); BP 69.8/40.4 (50.2)
    // (Taiwo 2022); HR 121 (Tveiten 2021)
    SVR: 0.65, HEART_EL_MAX: 1.5, HR_REF: 1.025,
    // the upper/lower-body beds (skin, muscle) keep part of their tone: fully dilated they took the high
    // output with little O2 extraction (venous 84 %)
    SVR_BEDS: { brain: 1, gut: 1, liver: 1, kidney: 1, upper_body: 0.8, lower_body: 0.8 }, BRAIN_REANCHOR: true,
    // first-day non-shivering thermogenesis (brown fat in the neck, interscapular and axillary fat: the
    // upper body), 0.3 W/kg ~ +0.9 mL O2/kg/min: venous extraction about as at 72 h (Wolfsberger 2023:
    // peripheral extraction constant over the first 24 h)
    NST_W_PER_KG: 0.3,
    // GFR still ~20 on day 1 (Smeets 2022)
    KF: 0.8,
    // blood: Hct 57 % with the red cell mass of the 1 h baby (44 mL/kg) -> ~77 mL/kg
    BLOOD_VOLUME: 77 / 85, HCT: 0.57,
    // gases and metabolites (textbook, C): pH 7.36, pCO2 35, BE ~-4; lactate 2.0, glucose 3.2 (GLOW)
    // ventilation: pCO2 ~38 (12 h range 30-40); at 35 the higher CO2 output needed ~295 mL/kg/min
    LACT: 2.0, UMA_DELTA: 1.6, MV_REF: 1.08, GLUCOSE: 3.2,
    // lung liquid mostly cleared: FRC ~24 (Lee 1999, between 4-6 h and 24 h)
    LUNG_U_VOL: 0.92, LUNG_EL: 1.05,
    // the baroreflex senses the time-averaged arch pressure: a clinical MAP (dia + PP/3) of 50 is a
    // time-averaged ~56 with this waveform (form factor ~0.5)
    BR_MAP_INIT: 56, CR_PCO2_INIT: 38, CR_PH_INIT: 7.34,
    ENV_TEMP: 24.0, REL_HUMIDITY: 0.5,
  },
  24: {
    description: "healthy term neonate (3.545 kg) 24 h after a vaginal birth with delayed cord clamping (~1 min): " +
      "small closing left-to-right duct, pulmonary pressure halfway down, output still above the 72 h level, haematocrit 57 %; room air, dressed",
    // duct: 1.89 mm at the pulmonary end (Kang 2016, 24 h; closed in 38 %), left-to-right; the pulmonary
    // end constricted a little further than at 12 h (Cd 0.3 gave 26.6 mL/kg/min, 0.25 gives 23)
    PDA_AO_MAX: 5.5, PDA_PA_MAX: 5.0, PDA_REL: 0.378, PDA_CD: 0.25,
    // pulmonary pressure halfway between 12 h and 72 h (Kang 2016: mean 34, systolic 43.8)
    PVR: 1.3,
    RV_DELAY: 0, PA_EL: 1,
    // output 258 (Agata 1991/1994: 245 +/- 56, 272 +/- 48), BP 71.3/41.2 (51.2) (Taiwo 2022), HR 121
    SVR: 0.75, HEART_EL_MAX: 1.35, HR_REF: 1.025,
    // body beds partly toned and first-day brown fat, as at 12 h
    SVR_BEDS: { brain: 1, gut: 1, liver: 1, kidney: 1, upper_body: 0.8, lower_body: 0.8 }, BRAIN_REANCHOR: true,
    NST_W_PER_KG: 0.3,
    // GFR still the day-1 value (Smeets 2022)
    KF: 0.8,
    // blood as at 12 h: Hct 57 %, ~77 mL/kg
    BLOOD_VOLUME: 77 / 85, HCT: 0.57,
    // gases and metabolites (textbook, C): pH 7.37, pCO2 35, BE ~-3.5; lactate 1.8 (GLOW, interpolated),
    // glucose 3.3 (GLOW plateau)
    // ventilation: pCO2 ~39 (24 h range 30-41)
    LACT: 1.8, UMA_DELTA: 0.9, MV_REF: 1.09, GLUCOSE: 3.3,
    // the last lung liquid: FRC 24.9 at 24 h (Lee 1999)
    LUNG_U_VOL: 0.96, LUNG_EL: 1.02,
    // the baroreflex senses the time-averaged arch pressure: a clinical MAP of 51.2 is a time-averaged ~57
    BR_MAP_INIT: 57, CR_PCO2_INIT: 38, CR_PH_INIT: 7.35,
    ENV_TEMP: 24.0, REL_HUMIDITY: 0.5,
  },
};
const P = PROFILES[AGE] && { ...PROFILES[AGE], ...SET };
if (!P) { out(`usage: _make_term_transition.mjs --age <${Object.keys(PROFILES).join("|")}> [--seconds S] [--write]`); process.exit(1); }
const NAME = `term_neonate_${AGE}h`;
const SVR_BED_VESSELS = {
  brain: ["BR_ART", "BR_CAP", "BR_VEN"], gut: ["INT_ART", "INT_CAP", "INT_VEN"], liver: ["LS_ART", "LS_CAP", "LS_VEN"],
  kidney: ["KID_ART", "KID_CAP", "KID_VEN"], upper_body: ["RUB", "VUB"], lower_body: ["RLB", "VLB"],
};

const eng = await createEngine();
const src = new URL("../model_definitions/term_neonate_72h.json", import.meta.url);
const dst = new URL(`../model_definitions/${NAME}.json`, import.meta.url);
const j = JSON.parse(fs.readFileSync(src, "utf8"));
const baselineWeight = j.model_definition._baseline_weight;
const model = eng.build(j.model_definition);
const M = model.models;
const log = [];

// 1. duct and pulmonary circulation
M.Pda.diameter_ao_max = P.PDA_AO_MAX; M.Pda.diameter_pa_max = P.PDA_PA_MAX; M.Pda.diameter_relative = P.PDA_REL;
// optional: the constricting duct's length (mm) and pulmonary-end discharge coefficient
if (P.PDA_LEN) M.Pda.length = P.PDA_LEN;
if (P.PDA_CD) M.Pda.discharge_coeff = P.PDA_CD;
eng.scale("pulmonary_resistances", P.PVR);
M.Shunts.ips_res *= P.PVR;
// optional: stiffer main/branch pulmonary arteries (sharper systolic PA pressure peak) and an RV
// activation lag (Heart.rv_delay), the two levers of the systolic right-to-left ductal jet
if (P.PA_EL) for (const n of ["PA", "PAAL", "PAAR"]) M[n].el_base *= P.PA_EL;
if (P.RV_DELAY) M.Heart.rv_delay = P.RV_DELAY;
log.push(`duct ${(P.PDA_REL * P.PDA_PA_MAX).toFixed(2)} mm (PA end) / ${(P.PDA_REL * P.PDA_AO_MAX).toFixed(2)} mm (Ao end); PVR x${P.PVR} (ips_res alike)` +
  (P.PA_EL ? `; PA el_base x${P.PA_EL}` : "") + (P.RV_DELAY ? `; rv_delay ${P.RV_DELAY * 1000} ms` : ""));

// 2. output: systemic resistance, contractility, rate
eng.scale("systemic_resistances", P.SVR);
// per-bed overrides of the systemic factor (absolute, like the scaler layer): the beds keep or raise
// their 72 h resistance while the rest of the circulation dilates
for (const [bed, f] of Object.entries(P.SVR_BEDS ?? {})) for (const n of SVR_BED_VESSELS[bed]) M[n].r_factor_scaling_ps = f;
eng.scale("heart_el_max", P.HEART_EL_MAX);
M.Heart.heart_rate_ref *= P.HR_REF;
log.push(`SVR x${P.SVR}${P.SVR_BEDS ? ` (beds ${JSON.stringify(P.SVR_BEDS)})` : ""}, heart el_max x${P.HEART_EL_MAX}, heart_rate_ref x${P.HR_REF} (${M.Heart.heart_rate_ref.toFixed(1)})`);

// 3. blood volume and haematocrit (Hb with each compartment's O2 content, same saturation)
eng.scale("blood_volume", P.BLOOD_VOLUME);
const patientBlood = Object.entries(M).filter(([n, m]) => m.solutes && m !== M.Blood && !/^(PL_|UT|MP|URINE$)/.test(n)).map(([, m]) => m);
const hbNew = P.HCT * 33.0 * 0.6206; // Blood: hct = Hb / 0.6206 / 33
const hbOld = M.Blood.solutes.hemoglobin;
M.Blood.set_solute("hemoglobin", hbNew);
for (const m of patientBlood) if (typeof m.to2 === "number") m.to2 *= hbNew / hbOld;
// the resistances are calibrated at the loaded blood (Blood.init_model takes viscosity_ref from the Hb
// on load), so take the reference at the new Hb now: otherwise the levers settle and the controllers
// re-anchor at ~21 % higher resistance than the saved scenario has when it is loaded
M.Blood.calibrate_viscosity_ref();
log.push(`blood volume x${P.BLOOD_VOLUME.toFixed(4)}; Hb ${hbOld} -> ${hbNew.toFixed(3)} mmol/L (Hct ${P.HCT})`);

// 4. lactate, unmeasured anions, glucose
M.Lactate.lact_baseline = P.LACT;
for (const m of [M.Blood, ...patientBlood]) {
  if (typeof m.solutes.lact === "number") m.solutes.lact = P.LACT;
  if (typeof m.solutes.uma === "number") m.solutes.uma += P.UMA_DELTA;
  if (typeof m.solutes.glucose === "number") m.solutes.glucose = P.GLUCOSE;
}
const G = M.Glucose;
G.isf_glucose *= P.GLUCOSE / G.glucose_setpoint;
G.glucose_setpoint = P.GLUCOSE; G.glucose_default = P.GLUCOSE;
log.push(`lactate ${P.LACT}, uma +${P.UMA_DELTA}, glucose ${P.GLUCOSE}`);

// 5. breathing; the reflex set-points start at the targets so they do not fight the levers while the
// model settles (all are re-anchored to the settled state below)
M.Breathing.minute_volume_ref *= P.MV_REF;
// optional: breathing pattern, a lower Vt/RR ratio gives faster and smaller breaths at the same ventilation
if (P.VT_RR) M.Breathing.vt_rr_ratio *= P.VT_RR;
M.CR_PCO2.set_value = P.CR_PCO2_INIT; M.CR_PH.set_value = P.CR_PH_INIT; M.BR_MAP.set_value = P.BR_MAP_INIT;
log.push(`minute_volume_ref x${P.MV_REF}${P.VT_RR ? `, vt_rr_ratio x${P.VT_RR}` : ""}`);
for (const n of ["ALL", "ALR"]) { M[n].u_vol *= P.LUNG_U_VOL; M[n].el_base *= P.LUNG_EL; }
log.push(`lung liquid: alveolar u_vol x${P.LUNG_U_VOL}, el_base x${P.LUNG_EL}`);

// 6. thermal environment: the loss trim re-seeds neutral there
M.Thermoregulation.env_temp = P.ENV_TEMP;
M.Thermoregulation.rel_humidity = P.REL_HUMIDITY;
M.Thermoregulation.loss_trim_seeded = false;
log.push(`environment ${P.ENV_TEMP} degC / ${P.REL_HUMIDITY * 100} %`);

// 7. settle, then re-anchor the controllers to this resting state (the brain settles pressure-passive
// and takes the flow the transitional circulation gives it as its new set-point, last, after the other
// re-anchors have moved the pressures)
if (P.BRAIN_REANCHOR) M.Brain.autoregulation_enabled = false;
// the kidney settles at its 72 h resting afferent tone (autoregulation off), then the myogenic and TGF
// set-points are re-anchored so the limbs give that same tone at the 1 h pressure and filtration
const K = M.Kidneys;
const kid72 = { aff: K.afferent_factor, myo: K.myogenic_factor, tgf: K.tgf_factor };
if (P.KF) K.kf *= P.KF;
if (P.KIDNEY_REANCHOR) { K.autoregulation_enabled = false; M[K.aff_resistor_name].r_factor_ps = kid72.aff; }
eng.calc(SECONDS);
// optional: first-day non-shivering thermogenesis. The loss trim has seeded neutral by now; add the
// brown-fat heat to the loss and raise the set-point by heat / bat_gain, so brown fat makes up the
// difference and the core stays where it was. Its O2 cost is taken at Metabolism.bat_site (upper body)
if (P.NST_W_PER_KG) {
  const T = M.Thermoregulation, q = P.NST_W_PER_KG * model.weight;
  T.loss_trim += q;
  T.setpoint_temp = +(T.setpoint_temp + q / T.bat_gain).toFixed(4);
  log.push(`brown fat ${P.NST_W_PER_KG} W/kg (${q.toFixed(2)} W): loss_trim +${q.toFixed(2)} W, set-point ${T.setpoint_temp} degC`);
  eng.calc(SECONDS);
}
reanchorBaroreflex();
reanchorChemoreflex();
reanchorHormones();
eng.calc(SECONDS);
relearnHeartFunction();
eng.calc(SECONDS);
if (P.BRAIN_REANCHOR) reanchorBrain();
if (P.KIDNEY_REANCHOR) reanchorKidney();
if (P.BRAIN_REANCHOR || P.KIDNEY_REANCHOR) eng.calc(60);

// 8. scenario metadata, bake the scaling layer, serialize at a sinus-node firing
model.age = AGE / (24 * 365);
model.name = NAME;
model.description = P.description;
eng.scale("incorporate", 1);
const H = M.Heart;
for (let i = 0; i < 400; i++) {
  const before = H._sa_node_timer;
  eng.calc(model.modeling_stepsize);
  if (H._sa_node_timer < before) break;
}
j.name = NAME;
j.description = P.description;
j.provenance = "generated";
j.provenance_note = `generated from term_neonate_72h by scripts/_make_term_transition.mjs --age ${AGE}; reference docs/TermTransitionReference.md`;
setDiagramTitle(j, NAME);
const da = j.diagram_definition?.components?.DA;
if (da?.layout) { da.label = "PDA"; da.layout.label = { ...da.layout.label, visible: true, at: 0.72, pos_x: 0, pos_y: -10, size: 11 }; }
j.model_definition = serializeState(model);
if (baselineWeight !== undefined) j.model_definition._baseline_weight = baselineWeight;
const text = JSON.stringify(j, null, 2);
JSON.parse(text);

out(`${NAME}:\n  ${log.join("\n  ")}`);
const v = measureVitals(eng.build(JSON.parse(text).model_definition) && eng.model, eng.send, { window: 1 });
eng.calc(120);
const r = measureVitals(eng.model, eng.send, { window: 20 });
const W = eng.model.weight;
out(`  reloaded +120 s: HR ${r.hr.toFixed(0)}, ${r.sys.toFixed(0)}/${r.dia.toFixed(0)} (${r.map.toFixed(1)}), PAP ${r.pap_m.toFixed(1)}, ` +
  `LVO ${(r.lvo * 1000 / W).toFixed(0)}, RVO ${(r.rvo * 1000 / W).toFixed(0)} mL/kg/min, duct ${(r.q_da * 60000 / W).toFixed(0)}, FO ${(r.q_fo * 60000 / W).toFixed(1)} mL/kg/min, ` +
  `SpO2 ${r.spo2_pre.toFixed(1)}/${r.spo2_post.toFixed(1)}, pH ${r.ph.toFixed(3)}, pCO2 ${r.pco2.toFixed(1)}, BE ${r.be.toFixed(2)}, temp ${r.temp.toFixed(2)}`);
void v;
if (OUT) { fs.writeFileSync(OUT, text); out(`  prototype written ${OUT}`); }
else if (WRITE) {
  fs.writeFileSync(dst, text);
  const idx = new URL("../model_definitions/index.json", import.meta.url);
  const list = JSON.parse(fs.readFileSync(idx, "utf8"));
  if (!list.includes(NAME)) { list.push(NAME); fs.writeFileSync(idx, JSON.stringify(list, null, 2) + "\n"); }
  out(`  written ${fileURLToPath(dst)}`);
} else out("  dry run (pass --write to save)");

// --- re-anchoring -------------------------------------------------------------------------------

function avgOver(sec, fn) {
  const n = Math.round(sec / 0.02);
  const acc = {};
  for (let i = 0; i < n; i++) {
    eng.calc(0.02);
    for (const [k, x] of Object.entries(fn())) acc[k] = (acc[k] ?? 0) + x / n;
  }
  return acc;
}

// fold the resting ANS effector activity into the bases it acts on, neutralise the reflex state and
// move BR_MAP.set_value until the mean firing rate is 0.5 (the formulas of _fix_baro_setpoint.mjs)
function reanchorBaroreflex() {
  const EF = ["EF_HR", "EF_SVR", "EF_HEART"];
  const rest = avgOver(20, () => Object.fromEntries([["aar", M.AAR.pres], ...EF.map((k) => [k, M[k].effector])]));
  const mult = [];
  mult.push([M.Heart, "heart_rate_ref", 1 + (rest.EF_HR - 1) * M.Heart.ans_sens]);
  for (const c of Object.values(M)) {
    if (c.model_type === "HeartChamber" && c.ans_sens) {
      const a = c.ans_activity;
      mult.push([c, "el_max", 1 + (a - 1) * c.ans_sens]);
      for (const p of ["el_min", "el_k"]) if (c[p] > 0) mult.push([c, p, 1 - (a - 1) * c.ans_sens]);
    }
    if (c.model_type === "BloodVessel" && (c.ans_sens || c.u_vol_ans_sens)) {
      const f = 1 + (c.ans_activity - 1) * (c.ans_sens ?? 0);
      if (Math.abs(f - 1) > 1e-9) { for (const p of ["r_for", "r_back", "r_k"]) mult.push([c, p, f]); mult.push([c, "el_base", Math.pow(f, c.alpha)]); }
      const fu = 1 - (c.ans_activity - 1) * (c.u_vol_ans_sens ?? 0);
      if (Math.abs(fu - 1) > 1e-9) mult.push([c, "u_vol", fu]);
    }
  }
  for (const [c, p, f] of mult) c[p] *= f;
  M.Heart.ans_activity = 1; M.Heart.ans_activity_hr = 1;
  M.Circulation.ans_activity = 1; M.Circulation.prev_ans_activity = 1;
  for (const k of EF) { M[k].effector = 1; M[k].firing_rate = 0.5; }
  for (const c of Object.values(M)) if ((c.model_type === "BloodVessel" || c.model_type === "HeartChamber") && c.ans_sens) c.ans_activity = 1;
  M.BR_MAP.firing_rate = 0.5;
  const before = M.BR_MAP.set_value;
  M.BR_MAP.set_value = rest.aar;
  for (let it = 0; it < 6; it++) {
    eng.calc(60);
    const a = avgOver(20, () => ({ fr: M.BR_MAP.firing_rate }));
    const d = a.fr - 0.5;
    if (Math.abs(d) < 0.002) break;
    M.BR_MAP.set_value += d / (0.5 / (M.BR_MAP.max_value - M.BR_MAP.set_value));
  }
  M.BR_MAP.set_value = +M.BR_MAP.set_value.toFixed(2);
  log.push(`baroreflex: folded ${EF.map((k) => `${k} ${rest[k].toFixed(3)}`).join(", ")}; BR_MAP set ${before} -> ${M.BR_MAP.set_value}`);
}

// cerebral autoregulation re-anchored to the settled (pressure-passive) brain flow, neutral factor
function reanchorBrain() {
  const B = M.Brain;
  const a = avgOver(20, () => ({ cbf: B.cbf, cpp: B.cpp, cbv: B.cerebral_blood_volume }));
  const before = B.cbf_setpoint;
  B.cbf_setpoint = +a.cbf.toPrecision(6); B.cpp_setpoint = +a.cpp.toFixed(2); B.cbv0 = +a.cbv.toPrecision(6);
  B._ar_int = 1.0; B.autoreg_factor = 1.0; B.autoregulation_enabled = true;
  log.push(`Brain cbf set-point ${before} -> ${B.cbf_setpoint} L/min (${(B.cbf_setpoint * 1000 / model.weight).toFixed(1)} mL/kg/min), cpp ${B.cpp_setpoint}`);
}

// renal autoregulation re-anchored: myogenic p_set and TGF set-point such that the limbs give their
// 72 h resting factors at the settled 1 h renal pressure and distal NaCl delivery
function reanchorKidney() {
  M[K.aff_resistor_name].r_factor_ps = kid72.aff;
  const a = avgOver(20, () => ({ p: M[K.myogenic_input_model][K.myogenic_input_prop], sig: K.gfr * (M[K.kid_cap_name].solutes?.na ?? 1), gfr: K.gfr }));
  const before = [K.myogenic_p_set, K.tgf_setpoint];
  K.myogenic_p_set = +(a.p - (kid72.myo - 1) / K.myogenic_gain_up).toFixed(3);
  K.tgf_setpoint = +(a.sig / (1 + (kid72.tgf - 1) / K.tgf_gain)).toFixed(2);
  K.myogenic_factor = kid72.myo; K.tgf_factor = kid72.tgf; K.afferent_factor = kid72.aff;
  K.autoregulation_enabled = true;
  log.push(`Kidneys myogenic p_set/TGF set-point ${before.join("/")} -> ${K.myogenic_p_set}/${K.tgf_setpoint} (afferent ${kid72.aff.toFixed(3)}, GFR ${a.gfr.toFixed(2)} mL/min)`);
}

// chemoreceptor set-points = the resting arterial gases (the reflex is then neutral at rest)
function reanchorChemoreflex() {
  const g = avgOver(30, () => ({ pco2: M.AA.pco2, po2: M.AA.po2, ph: M.AA.ph }));
  const before = [M.CR_PCO2.set_value, M.CR_PO2.set_value, M.CR_PH.set_value];
  M.CR_PCO2.set_value = +g.pco2.toFixed(2); M.CR_PO2.set_value = +g.po2.toFixed(2); M.CR_PH.set_value = +g.ph.toFixed(3);
  log.push(`chemoreflex set-points pCO2/pO2/pH ${before.join("/")} -> ${M.CR_PCO2.set_value}/${M.CR_PO2.set_value}/${M.CR_PH.set_value}`);
}

// Hormones references = the resting blood volume and renal perfusion pressure
function reanchorHormones() {
  const Hm = M.Hormones;
  const a = avgOver(20, () => ({ tbv: M.Circulation.total_blood_volume, kid: M.KID_ART.pres }));
  const before = [Hm.volume_setpoint, Hm.perfusion_setpoint];
  Hm.volume_setpoint = +a.tbv.toPrecision(6); Hm.perfusion_setpoint = +a.kid.toFixed(2);
  log.push(`Hormones volume/perfusion set-points ${before[0]}/${before[1]} -> ${Hm.volume_setpoint}/${Hm.perfusion_setpoint}`);
}

// HeartFunction wall-stress set-points learned at rest
function relearnHeartFunction() {
  const HF = M.HeartFunction;
  const KEYS = ["sigma_es_ref_lv", "sigma_ed_ref_lv", "sigma_es_ref_rv", "sigma_ed_ref_rv"];
  const before = KEYS.map((k) => HF[k].toFixed(1));
  for (const k of KEYS) { HF[k] = 0.0; HF._learn[k] = true; }
  HF._warmup_elapsed = 0.0;
  eng.calc(HF.setpoint_warmup + 5.0);
  for (const k of KEYS) { HF[k] = +HF[k].toFixed(4); HF._learn[k] = false; }
  log.push(`HeartFunction set-points ${before.join("/")} -> ${KEYS.map((k) => HF[k]).join("/")}`);
}
