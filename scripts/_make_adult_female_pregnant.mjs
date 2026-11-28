// Generate adult_female_pregnant_<ga>wk (24, 30 or 36): the calibrated non-pregnant adult_female at 24, 30 or 36 weeks of a healthy singleton
// pregnancy, lying left lateral (no aortocaval compression), with the fetus represented as an O2 sink in the placenta.
// Reference values: docs/PregnancyReference.md and scripts/reference/adult_female_pregnant_36wk.json; check with
//   node scripts/probe_term_reference.mjs adult_female_pregnant_36wk --ref scripts/reference/adult_female_pregnant_36wk.json [--file OUT]
//
//   node scripts/_make_adult_female_pregnant.mjs [--ga 24|30|36] [--settle 300] [--final 600] [--write | --out FILE] [--levers none|all|a,b,...]
//
// User decisions 2026-11-27: a separate scenario derived from the released adult_female (as the 1/12/24 h babies derive
// from the 72 h baby), 36 weeks, left lateral, fetus = O2 sink (no fetal circulation); targets = the non-pregnant reference
// x within-study longitudinal changes (docs/PregnancyReference.md).
//
// Order (as scripts/_make_adult_female.mjs): the pregnancy topology (intervillous space PL_IVS and its resistors, the
// MaternalPlacenta model) and the pregnancy switches are applied to the definition before the build; the maternal levers
// (step 4, one at a time) act on the live model; then every controller is re-anchored (scripts/_reanchor.mjs; the
// baroreflex folded last, the brain references captured last), the scaling layer of the ModelScaler groups is baked (the
// uterine vessels and PL_IVS are deliberately not in a group: Uterus and MaternalPlacenta keep their pregnancy factors in
// that layer and rewrite them every step) and the state is saved at a sinus-node firing.
import fs from "node:fs";
import { createEngine } from "./_harness.mjs";
import { serializeState } from "./_serialize_state.mjs";
import * as RA from "./_reanchor.mjs";

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const SETTLE = Number(opt("--settle", 300));
const FINAL = Number(opt("--final", 600));
const PRE_FOLD = Number(opt("--pre-fold", 300));
const WRITE = argv.includes("--write");
const OUT = opt("--out", null);
const SOURCE = "adult_female";
// Per gestational age (docs/PregnancyReference.md; scripts/reference/_build_adult_female_pregnant_reference.py). 36 wk is the
// released set; 30 wk (user 2026-11-27) the same studies at ~28-32 wk, several rows interpolated. The pregnant uterus and the
// intervillous volume at 30 wk are scaled with the uterine flow (~x0.8; grade C, no direct data).
const PROFILES = {
  // 24 wk (user 2026-11-28): mid-pregnancy BP / SVR nadir (de Haas 2022, MAP -4); CO and HR as the Mulder 2021 within-series step
  // from the calibrated 30-wk values; renal plasma flow at Dunlop's plateau; uterus (x11) and intervillous volume scaled with
  // the uterine flow (~x0.63 of 36 wk; grade C)
  24: { weight: 65.9, ut_grow: 11, ivs: 0.095, bv: 2.26 * (1 + 0.40 * 0.29 / 0.42) + 1.51 + 0.125, hb: 12.1, ut: 440, pl: 375, utvo2: 7.4,
    rbf: 850 * 1.6, gfr: 105 * 1.25, vo2: 192 * 1.18, raw: 0.6, crs: 86, frc: 2.3 * 0.95, map: 78, hr: 74, co: 5.4 * 1.31 * 1.27 / 1.29, alb: 38.3 },
  36: { weight: 71.0, ut_grow: 18, ivs: 0.15, bv: 3.768 * 1.37, hb: 12.2, ut: 700, pl: 600, utvo2: 22,
    rbf: 850 * 1.35, gfr: 105 * 1.28, vo2: 192 * 1.26, raw: 0.5, crs: 81, frc: 2.3 * 0.825 },
  30: { weight: 68.4, ut_grow: 14, ivs: 0.12, bv: 2.26 * 1.40 + 1.51 + 0.237, hb: 12.0, ut: 570, pl: 485, utvo2: 14,
    rbf: 850 * 1.45, gfr: 105 * 1.27, vo2: 192 * 1.22, raw: 0.55, crs: 84, frc: 2.3 * 0.89 },
};
const GA = Number(opt("--ga", 36)); // weeks
const PF = PROFILES[GA];
if (!PF) { process.stderr.write(`usage: _make_adult_female_pregnant.mjs --ga <${Object.keys(PROFILES).join("|")}> ...\n`); process.exit(1); }
const NAME = `adult_female_pregnant_${GA}wk`;
const say = (...a) => process.stderr.write(a.join(" ") + "\n");

const WEIGHT = PF.weight; // kg: 60 + IOM 2009 normal-BMI gain, 0.42 kg/week (user decision)
const UT_GROW = Number(opt("--ut-grow", PF.ut_grow)); // uterine mass ~55 g -> ~1 kg at 36 wk
const UT_VEN_R = Number(opt("--ut-ven-r", 0.1)); // uterine venule resistance, so the inflow carries the bed's pressure drop (waveform); grid 2026-11-27: x1 PI 4.4, x0.1 0.94, x0.03 0.87
const RA_ISF_SEED = 35; // s: Interstitium re-seeds its balance after seed_delay (30 s)
const DISC_SCALE = Number(opt("--disc-scale", 0.6)); // uterus / placenta diagram discs
const IVS_VOL = Number(opt("--ivs-vol", PF.ivs)); // L, intervillous blood (~150 mL at 36 wk, textbook C)
const DESCRIPTION = `healthy woman (26 y, 1.65 m, 60 kg before pregnancy) at ${GA} weeks of a singleton pregnancy, ${WEIGHT} kg: awake, ` +
  "left lateral (no aortocaval compression), at rest, room air; the fetus is an O2 sink in the placenta";

function flatten(models) { const o = {}; const w = (x) => { for (const [k, v] of Object.entries(x)) { o[k] = v; if (v?.components) w(v.components); } }; w(models); return o; }

// --- pregnancy topology and switches (definition stage) ---------------------------------------------------------------
// MaternalPlacenta (docs/MaternalPlacenta.md) needs the intervillous space PL_IVS fed from UT_ART (UT_ART_PL_IVS, the
// spiral arteries) and draining into UT_VEN (PL_IVS_UT_VEN), in parallel with the myometrial capillaries UT_CAP. PL_IVS is
// a clone of UT_CAP (same kind of compartment), sized to the intervillous blood volume; its resistors clone UT_CAP's.
// The volume comes out of VLB here, so the skeleton keeps the blood volume (the expansion of pregnancy is a lever).
// MaternalPlacenta scales its O2 use with the spiral-artery dilation (term factor / current resistance factor: ~8 % of the
// term value at 36 wk, ~3.5 % at 30 wk), so mp_vo2 must be far above its nominal per-kg value; the trim starts from the value
// that gives the target (minus the myometrial ~0.7 mL/min) at that dilation. Started at 0.3, the trim (capped at 25 % per
// step) ran out of steps: 9 mL/min instead of 14 at 30 wk, 20.8 instead of 22 at 36.
const MP_FRAC = Math.min(Math.max((GA - 4) / 36, 0), 1), MP_PERF = 0.01 / (1 + MP_FRAC * (0.01 - 1));
const MP_VO2_0 = Number(opt("--mp-vo2", ((PF.utvo2 - 0.7) / (PF.weight * MP_PERF)).toFixed(3)));
function applyPregnancy(def) {
  const o = flatten(def.models), C = o.Circulation;
  const ren = (x, from, to) => JSON.parse(JSON.stringify(x).split(from).join(to));
  // the pregnant uterus: ~55 g -> ~1 kg at term (textbook C), so its vascular bed grows ~x18 at the same pressures
  // (volumes x18, elastances /18). The non-pregnant 5 mL bed (UT_ART well under 1 mL) can't carry ~700 mL/min at the
  // engine's time step: the first trim drove it numerically unstable.
  for (const n of ["UT_ART", "UT_CAP", "UT_VEN"]) {
    const v = C.components[n];
    v.vol *= UT_GROW; v.u_vol *= UT_GROW; v.el_base /= UT_GROW; if (v.el_k) v.el_k /= UT_GROW * UT_GROW;
  }
  // the uterine artery of pregnancy has a low-impedance, little-pulsatile inflow (PI ~0.7 at 36 wk, Gomez 2008): the inflow
  // resistance carries most of the pressure drop (aorta ~80 -> intervillous ~10 mmHg) and the intervillous lake behind it
  // damps the pulse, so the flow pulsatility ~ pulse pressure / mean drop ~0.6. The cloned bed put most of its resistance
  // in the venule (the trimmed inlet carried a few mmHg: PI ~4); the venule's resistance is lowered so the inflow trim
  // takes it. (Stiffening the grown arteriole x10-x100 left the PI at ~3.3: the compliance was not the cause.)
  C.components.UT_VEN.r_for *= UT_VEN_R; C.components.UT_VEN.r_back *= UT_VEN_R;
  const cap = C.components.UT_CAP;
  const ivs = ren(cap, "UT_CAP", "PL_IVS");
  Object.assign(ivs, { description: "intervillous space (maternal placenta)", inputs: ["UT_ART"] });
  const f = IVS_VOL / cap.vol;
  for (const p of ["vol", "u_vol"]) ivs[p] *= f;
  ivs.el_base /= f; if (ivs.el_k) ivs.el_k /= f * f;
  C.components.PL_IVS = ivs;
  if (!C.systemic_capillaries.includes("PL_IVS")) C.systemic_capillaries.push("PL_IVS");
  const rin = ren(def.models.UT_ART_UT_CAP, "UT_CAP", "PL_IVS"); rin.description = "spiral arteries (input connector for PL_IVS)";
  const rout = ren(def.models.UT_CAP_UT_VEN, "UT_CAP", "PL_IVS"); rout.description = "intervillous drainage into UT_VEN";
  def.models[rin.name] = rin; def.models[rout.name] = rout;
  // a BloodVessel drives the resistors of the inputs it lists (<input>_<vessel>) with its own resistance: list PL_IVS on
  // UT_VEN, or the drainage keeps the fixed resistance it was cloned with and the intervillous space can barely drain
  if (!C.components.UT_VEN.inputs.includes("PL_IVS")) C.components.UT_VEN.inputs.push("PL_IVS");
  // likewise the uterine drain UT_VEN_VLB belongs to VLB ("owned by VLB", docs/Uterus.md), but adult_female's uterus was
  // added without listing UT_VEN on VLB, so the drain kept the fixed resistance it was cloned with (harmless at 45 mL/min,
  // where the bed trim absorbed it; at 700 mL/min the venule pooled ~250 mL behind it)
  if (!C.components.VLB.inputs.includes("UT_VEN")) C.components.VLB.inputs.push("UT_VEN");
  const added = ivs.vol + ["UT_ART", "UT_CAP", "UT_VEN"].reduce((t, n) => t + C.components[n].vol * (1 - 1 / UT_GROW), 0);
  const vlb = o.VLB, k = (vlb.vol - added) / vlb.vol; vlb.vol *= k; vlb.u_vol *= k;
  def.models.MaternalPlacenta = {
    name: "MaternalPlacenta", description: "maternal placenta: intervillous perfusion and the placental + fetal O2 sink",
    is_enabled: true, model_type: "MaternalPlacenta", pl_ivs_name: "PL_IVS", spiral_res_name: "UT_ART_PL_IVS",
    drain_res_name: "PL_IVS_UT_VEN", ut_art_name: "UT_ART", ut_in_res_name: "AD_UT_ART", uterus_name: "Uterus",
    mp_running: true, preg_ga_threshold: 4, preg_ga_term: 40, spiral_res_term_factor: 0.01, met_active: true,
    mp_vo2: MP_VO2_0, vo2_factor: 1, vo2_factor_ps: 1, resp_q: 0.8, contraction_pres_gain: 0.6,
  };
  Object.assign(o.Uterus, { pregnant: true, preg_ga: GA, description: `uterine organ: pregnant, ${GA} weeks` });
  if (!o.Monitor.flow_targets.some((t) => t.name === "pl_flow")) o.Monitor.flow_targets.push({ name: "pl_flow", model: "UT_ART_PL_IVS.flow" });
  Object.assign(def, { weight: WEIGHT, _baseline_weight: WEIGHT });
  return { ivs: ivs.vol, ut: ["UT_ART", "UT_CAP", "UT_VEN"].reduce((t, n) => t + C.components[n].vol, 0) };
}

// --- maternal levers on the live model (step 4, added one at a time) ----------------------------------------------------
const BLOOD = { bv: PF.bv, hb: PF.hb, albumin: PF.alb ?? 37.2, na: 136 }; // L, g/dL, g/L, mmol/L (docs/PregnancyReference.md)
const HB_GDL_PER_MMOL = 1.611;
const UTPL = { ut: Number(opt("--ut-flow", PF.ut)), pl: Number(opt("--pl-flow", PF.pl)), vo2: Number(opt("--utpl-vo2", PF.utvo2)) }; // mL/min, mL O2/min
const MAP_TARGET = Number(opt("--map", PF.map ?? 82)), HR_TARGET = Number(opt("--hr", PF.hr ?? 78));
const SV_TARGET = ((PF.co ?? 5.4 * 1.31) * 1000) / HR_TARGET; // mL: CO 7.07 L/min (Meah 2016 x1.31) / HR 78
const KID = { rbf: Math.round(PF.rbf), gfr: Math.round(PF.gfr) }; // mL/min (docs/PregnancyReference.md)
const PCO2_TARGET = Number(opt("--pco2", 32)), RR_TARGET = Number(opt("--rr", 15));
const LUNG = { raw: PF.raw, ccw_el: 200 / (1 / (1 / PF.crs - 1 / 164)), frc: PF.frc }; // x, x (~1.25 at 36 wk), L
const META = { vo2: Math.round(PF.vo2), glu: 4.7, temp: 36.8 }; // mL/min, mmol/L, degC
const CVP_TARGET = Number(opt("--cvp", 4.5)); // mmHg, unchanged in pregnancy (Clark 1989); the non-pregnant model ran at 4.6
const BLOOD_TYPES = new Set(["BloodVessel", "BloodCapacitance", "BloodTimeVaryingElastance", "HeartChamber"]);
const maternalBlood = (M) => Object.entries(M).reduce((a, [n, m]) => a + (BLOOD_TYPES.has(m.model_type) && m.is_enabled !== false && !/^(ECLS|PL_(?!IVS$)|MP|URINE$)/.test(n) ? m.vol : 0), 0);
const LEVERS = {
  // 1. blood of pregnancy: blood volume x1.37 (plasma x1.456, de Haas 2017; red cells +349 mL with iron, Taylor & Lind 1979)
  //    through the ModelScaler blood-volume group (vol and u_vol of its 31 compartments; the uterine bed and PL_IVS are
  //    outside it and are counted as they are), haemoglobin 12.2 g/dL with each compartment's O2 content at the same
  //    saturation, albumin 37.2 g/L (Murphy 2002 x0.866: plasma oncotic pressure falls ~x0.86 through the albumin law,
  //    as Clark 1989) and Na 136 (Davison 1981, osmolality -10). The viscosity reference is NOT re-calibrated: the lower
  //    haematocrit lowers blood viscosity and with it vascular resistance, part of the fall in SVR of pregnancy.
  blood: {
    why: `blood volume ${BLOOD.bv.toFixed(2)} L, Hb ${BLOOD.hb} g/dL, albumin ${BLOOD.albumin} g/L, Na ${BLOOD.na}`,
    apply(M, model) {
      const grp = new Set(model.scaler_config.blood.volume);
      const inGrp = Object.entries(M).reduce((a, [n, m]) => a + (grp.has(n) && typeof m.vol === "number" ? m.vol : 0), 0);
      const total = maternalBlood(M), f = (BLOOD.bv - (total - inGrp)) / inGrp;
      eng.scale("blood_volume", f);
      const hbOld = M.Blood.solutes.hemoglobin, hbNew = BLOOD.hb / HB_GDL_PER_MMOL;
      M.Blood.set_solute("hemoglobin", hbNew);
      for (const [n, m] of Object.entries(M)) if (m?.solutes && m !== M.Blood && typeof m.to2 === "number" && !/^(PL_(?!IVS$)|MP|URINE$|ECLS)/.test(n)) m.to2 *= hbNew / hbOld;
      M.Blood.set_solute("albumin", BLOOD.albumin);
      M.Blood.set_solute("na", BLOOD.na);
      const I = M.Interstitium; if (I?.isf_solutes) { I.isf_solutes.na = BLOOD.na; I.isf_solutes.albumin = I.isf_albumin_ratio * BLOOD.albumin; }
      this.why = `blood volume ${(total * 1000).toFixed(0)} -> ${(maternalBlood(M) * 1000).toFixed(0)} mL (group x${f.toFixed(3)}), Hb ${BLOOD.hb} g/dL, albumin ${BLOOD.albumin} g/L, Na ${BLOOD.na}`;
    },
  },
  // 3. uteroplacental circulation at 36 weeks: total uterine flow ~700 mL/min (user decision; Flo 2010 673 near term,
  //    Metcalfe 492, Konje 970), of which ~600 through the intervillous space (textbook 80-90 %); the engine's linear
  //    pregnancy ramp gives only ~205 / ~70. Trimmed while settling on the base resistances (Uterus and MaternalPlacenta
  //    keep rewriting their pregnancy factors on top): UT_ART sets the total (the inflow resistor follows it; trimming UT_VEN with it gave a
  //    pulsatile, high-PI inflow), PL_IVS the
  //    placental share. The O2 sink, uterus + placenta + fetus ~22 mL/min (fetus 2.8 kg x 6.6 mL/kg/min + placenta ~5;
  //    Metcalfe 24.5 at term), is trimmed on MaternalPlacenta.mp_vo2 (the myometrial Uterus.ut_vo2 stays). The extra
  //    uterine flow is new cardiac output, not taken from the lower body.
  placenta: {
    why: `uterine flow ${UTPL.ut} / placental ${UTPL.pl} mL/min, uteroplacental VO2 ${UTPL.vo2} mL/min`,
    settle: true,
    apply(M) {
      const a = RA.avgOver(ctx, 10, () => ({ ut: M.AD_UT_ART.flow * 60000, pl: M.UT_ART_PL_IVS.flow * 60000, vo2: (M.Uterus.ut_vo2_ml || 0) + (M.MaternalPlacenta.mp_vo2_ml || 0) }));
      const clamp = (f) => Math.min(Math.max(f, 0.8), 1.25); // at most 25 % per trim, so the controller can't overshoot
      const tr = (n, f) => { f = clamp(f); M[n].r_for *= f; M[n].r_back *= f; };
      if (a.ut > 0) tr("UT_ART", Math.pow(a.ut / UTPL.ut, 0.7)); // the inflow carries the bed's resistance, so the intervillous lake damps the pulse (low uterine PI)
      if (a.pl > 0) tr("PL_IVS", Math.pow(a.pl / UTPL.pl, 0.7));
      if (a.vo2 > 0) M.MaternalPlacenta.mp_vo2 *= clamp(Math.pow(UTPL.vo2 / a.vo2, 0.8));
      this.why = `uterine ${a.ut.toFixed(0)} -> ${UTPL.ut}, placental ${a.pl.toFixed(0)} -> ${UTPL.pl} mL/min; uteroplacental VO2 ${a.vo2.toFixed(1)} -> ${UTPL.vo2} (mp_vo2 ${M.MaternalPlacenta.mp_vo2.toFixed(3)})`;
    },
  },
  // 4-6. circulation of pregnancy (option B): heart rate 78 (+13, Mahendru 2014), true mean MAP 82 (unchanged), and the
  //    systemic resistance trimmed to hold it, so cardiac output (target 7.07 L/min, Meah 2016) follows from the
  //    heart rate, the larger blood volume and the lower SVR. As in adult_female: the baroreflex is held at the MAP
  //    target (+ the arch - aorta gap) while settling and folded last.
  map: {
    why: `baroreflex set-point at true mean MAP ${MAP_TARGET} while settling`,
    settle: true,
    apply(M) {
      const a = RA.avgOver(ctx, 5, () => ({ aar: M.AAR.pres, aa: M.AA.pres }));
      M.BR_MAP.set_value = MAP_TARGET + (a.aar - a.aa);
    },
  },
  hr: {
    why: `heart rate held at ${HR_TARGET} while settling (Heart.heart_rate_ref trimmed)`,
    settle: true,
    apply(M) {
      const hr = M.Monitor.heart_rate;
      if (hr > 0) M.Heart.heart_rate_ref *= Math.pow(HR_TARGET / hr, 0.8);
      this.why = `heart rate held at ${HR_TARGET} (heart_rate_ref ${M.Heart.heart_rate_ref.toFixed(2)})`;
    },
  },
  svr: {
    why: `systemic resistance trimmed to true mean MAP ${MAP_TARGET}`,
    settle: true,
    apply(M, model) {
      const a = RA.avgOver(ctx, 5, () => ({ map: M.AA.pres, cvp: (M.RAIVCI.pres + M.RASVC.pres) / 2, co: M.LV_AA.flow * 60 }));
      const f = Math.min(Math.max(Math.pow((MAP_TARGET - a.cvp) / (a.map - a.cvp), 0.7), 0.8), 1.25);
      for (const n of model.scaler_config.blood_systemic.resistance) M[n].r_factor_scaling_ps *= f;
      this.why = `systemic resistance scaling ${M.AA.r_factor_scaling_ps.toFixed(3)} (MAP ${a.map.toFixed(1)} -> ${MAP_TARGET}, CO ${a.co.toFixed(2)} L/min)`;
    },
  },
  // 7. eccentric remodelling of pregnancy: the ventricles dilate (and hypertrophy) so they fill to a larger end-diastolic
  //    volume at the same filling pressure (CMR LV EDV x1.29, LV mass x1.48 at ~34 wk, Ducas 2014). Without it the
  //    non-pregnant heart filled to only ~119 mL at CVP ~4.5 and stroke volume fell to ~75 mL. The ventricles' diastolic
  //    stiffness (el_k, the EDPVR coefficient; el_min is 0) is trimmed while settling until stroke volume = CO / HR target
  //    (7.07 L/min / 78 = ~91 mL); the SVR trim then lowers SVR. NOT the unstressed volume: in the time-varying elastance
  //    model u_vol is also the end-systolic intercept, so raising it enlarged the ventricle without raising its stroke
  //    volume (prototype 2026-11-27: EDV 217 mL, SV 56 mL, the trim ran away).
  remodel: {
    why: `LV + RV diastolic stiffness trimmed to stroke volume ${SV_TARGET.toFixed(0)} mL`,
    settle: true,
    apply(M) {
      const a = RA.avgOver(ctx, 10, () => ({ q: M.LV_AA.flow, hr: M.Monitor.heart_rate }));
      const sv = (a.q * 60 * 1000) / a.hr; // mL
      const f = Math.min(Math.max(Math.pow(sv / SV_TARGET, 2.0), 0.7), 1.25); // SV low -> softer
      for (const n of ["LV", "RV"]) M[n].el_k *= f;
      this._f = (this._f ?? 1) * f;
      this.why = `LV + RV diastolic stiffness (el_k) x${this._f.toFixed(3)} (stroke volume ${sv.toFixed(1)} -> ${SV_TARGET.toFixed(0)} mL)`;
    },
  },
  // 8. kidney of pregnancy: renal blood flow ~x1.35 (effective renal plasma flow, Dunlop 1981; ~1150 mL/min) and GFR x1.28
  //    (inulin, Saxena 2012; ~134 mL/min absolute, not indexed). Trimmed while settling: the kidney bed's resistance (its
  //    three vessels) for the flow, Kidneys.kf for the GFR; the myogenic and TGF set-points and the maintenance intake are
  //    re-anchored at the new resting state as always. The lower oncotic pressure (blood lever) already raised GFR.
  kidney: {
    why: `renal blood flow ${KID.rbf} mL/min, GFR ${KID.gfr} mL/min`,
    settle: true,
    final: true, // also through the final settle: renal flow drifted ~1 mL/kg/min below target after the re-anchoring
    apply(M) {
      const K = M.Kidneys;
      const a = RA.avgOver(ctx, 20, () => ({ rbf: M.AD_KID_ART.flow * 60000, gfr: K.gfr }));
      const clamp = (f) => Math.min(Math.max(f, 0.8), 1.25);
      const fr = clamp(Math.pow(a.rbf / KID.rbf, 0.8));
      for (const n of ["KID_ART", "KID_CAP", "KID_VEN"]) { M[n].r_for *= fr; M[n].r_back *= fr; }
      K.kf *= clamp(Math.pow(KID.gfr / a.gfr, 0.8));
      this.why = `renal blood flow ${a.rbf.toFixed(0)} -> ${KID.rbf}, GFR ${a.gfr.toFixed(0)} -> ${KID.gfr} mL/min (kf ${K.kf.toExponential(3)})`;
    },
  },
  // 9. hyperventilation of pregnancy (progesterone): PaCO2 ~32 (user decision; reviews' third-trimester plateau) at an
  //    unchanged rate (Spatling 1992: VE x1.34, Vt x1.27, RR unchanged). As in adult_female: the chemoreflex is held at the
  //    target while settling and the ventilation reference trimmed with it (alveolar ventilation ~ 1 / PaCO2); the
  //    rate/depth split re-solved for RR 15. The higher CO2 sensitivity of pregnancy (Jensen 2005, x1.6) is not modelled
  //    (the chemoreflex gain is not calibrated in adult_female either).
  vent: {
    why: `PaCO2 ${PCO2_TARGET} at RR ${RR_TARGET} (CR_PCO2 held, minute_volume_ref + vt_rr_ratio trimmed)`,
    settle: true,
    apply(M) {
      const Br = M.Breathing;
      M.CR_PCO2.set_value = PCO2_TARGET;
      const a = RA.avgOver(ctx, 20, () => ({ pco2: M.AA.pco2 }));
      if (a.pco2 > 0) Br.minute_volume_ref *= Math.min(Math.max(Math.pow(a.pco2 / PCO2_TARGET, 0.8), 0.8), 1.25);
      Br.vt_rr_ratio = Br.minute_volume_ref / (RR_TARGET * RR_TARGET);
      this.why = `PaCO2 ${a.pco2.toFixed(1)} -> ${PCO2_TARGET}: minute_volume_ref ${(Br.minute_volume_ref * 1000).toFixed(1)} mL/kg/min (RR ${RR_TARGET})`;
    },
  },
  // 10. lung mechanics at 36 weeks: total pulmonary resistance x0.5 (Gee 1967; airway smooth-muscle relaxation), lung
  //     compliance unchanged and the chest wall stiffer (respiratory compliance ~x0.9, grade C: Crs 90 -> ~81 with the lung
  //     at ~164 mL/cmH2O gives a chest wall of ~160 vs 200), FRC ~x0.825 (Craig & Toole 1975; the gravid uterus lifts the
  //     diaphragm) trimmed on the thorax's unstressed volume while settling.
  lungs: {
    why: `airway resistance x${LUNG.raw}, chest-wall elastance x${LUNG.ccw_el}, FRC trimmed to ${(LUNG.frc * 1000).toFixed(0)} mL`,
    settle: true,
    apply(M) {
      if (!this._done) {
        for (const n of ["MOUTH_DS", "DS_ALL", "DS_ALR"]) { M[n].r_for *= LUNG.raw; M[n].r_back *= LUNG.raw; }
        M.THORAX.el_base *= LUNG.ccw_el;
        this._done = true;
      }
      // FRC = the end-expiratory (minimum) gas volume of the lungs and dead space over a few breaths, as the probe reads it
      let frc = Infinity;
      RA.avgOver(ctx, 12, () => { const g = M.ALL.vol + M.ALR.vol + M.DS.vol; if (g < frc) frc = g; return {}; });
      M.THORAX.u_vol -= 0.7 * (frc - LUNG.frc);
      this.why = `airway resistance x${LUNG.raw}, chest-wall elastance x${LUNG.ccw_el}; FRC ${(frc * 1000).toFixed(0)} -> ${(LUNG.frc * 1000).toFixed(0)} mL (thorax u_vol ${(M.THORAX.u_vol * 1000).toFixed(0)} mL)`;
    },
  },
  // 11. metabolism at 36 weeks: whole-body VO2 242 mL/min (calorimetric BMR x1.26, Butte 2004) INCLUDING the heart (Mob)
  //     and the uteroplacental sink (Uterus + MaternalPlacenta), so Metabolism takes the rest (as adult_female);
  //     fasting glucose 4.7 (Mills 1998, -0.2); core temperature 36.8 (Hartgill 2011, falls slightly; set-point).
  metabolism: {
    why: `whole-body VO2 ${META.vo2} mL/min incl. heart + uteroplacental, glucose ${META.glu}, temperature ${META.temp}`,
    settle: true,
    apply(M, model) {
      if (!this._done) {
        Object.assign(M.Glucose, { glucose_setpoint: META.glu });
        M.Blood.set_solute("glucose", META.glu);
        M.Thermoregulation.setpoint_temp = META.temp;
        M.Thermoregulation.loss_trim_seeded = false; M.Thermoregulation._warmup_counter = 0.0;
        this._done = true;
      }
      const W = model.weight, mob = (M.Mob.mob_vo2 * 60 * 22.4) / W;
      const utpl = ((M.Uterus.ut_vo2_ml || 0) + (M.MaternalPlacenta.mp_vo2_ml || 0)) / W;
      M.Metabolism.vo2 = META.vo2 / W - mob - utpl;
      this.why = `VO2 ${META.vo2} mL/min = Metabolism ${(M.Metabolism.vo2 * W).toFixed(0)} + heart ${(mob * W).toFixed(0)} + uteroplacental ${(utpl * W).toFixed(1)}; glucose ${META.glu}, temperature ${META.temp}`;
    },
  },
  // 2. venous capacitance of pregnancy: the 37 % larger blood volume sits at an unchanged CVP (Clark 1989) because the veins
  //    become more capacious (progesterone / NO venodilation, higher venous distensibility). The blood-volume scaling kept
  //    the non-pregnant venous stiffness (CVP 4.6 -> 9.5), so the unstressed volume of the systemic veins and venules (not
  //    the uterine venule, which Uterus scales for pregnancy) is trimmed while settling until the CVP is back at target.
  venous: {
    why: `systemic venous + venular unstressed volume trimmed to CVP ${CVP_TARGET}`,
    settle: true,
    apply(M) {
      const C = M.Circulation, names = [...C.systemic_veins, ...C.systemic_venules].filter((n) => n !== "UT_VEN");
      const a = RA.avgOver(ctx, 10, () => ({ cvp: (M.RAIVCI.pres + M.RASVC.pres) / 2 }));
      const stressed = names.reduce((s, n) => s + (M[n].vol - M[n].u_vol), 0);
      const comp = names.reduce((s, n) => s + 1 / (M[n].el_eff || M[n].el_base), 0); // L/mmHg, the veins in parallel
      const dV = 0.7 * (a.cvp - CVP_TARGET) * comp; // L moved from stressed into unstressed volume
      const u = names.reduce((s, n) => s + M[n].u_vol, 0), f = (u + dV) / u;
      for (const n of names) M[n].u_vol *= f;
      this._f = (this._f ?? 1) * f;
      this.why = `venous unstressed volume x${this._f.toFixed(3)} (CVP ${a.cvp.toFixed(2)} -> ${CVP_TARGET}; stressed ${(stressed * 1000).toFixed(0)} mL)`;
    },
  },
};
const pick = opt("--levers", "all");
const DEFAULT = ["blood", "venous", "placenta", "map", "hr", "svr", "remodel", "kidney", "vent", "lungs", "metabolism"];
const active = pick === "none" ? [] : pick === "all" ? DEFAULT : pick.split(",");
for (const k of active) if (!LEVERS[k]) { say(`unknown lever ${k}; known: ${Object.keys(LEVERS).join(", ") || "(none yet)"}`); process.exit(1); }

// --- build ----------------------------------------------------------------------------------------------------------
const dir = new URL("../model_definitions/", import.meta.url);
const j = JSON.parse(fs.readFileSync(new URL(`${SOURCE}.json`, dir), "utf8"));
const pg = applyPregnancy(j.model_definition);
say(`pregnancy: ${GA} wk, weight ${WEIGHT} kg, uterine bed ${(pg.ut * 1000).toFixed(0)} mL (x${UT_GROW}), intervillous space ${(pg.ivs * 1000).toFixed(0)} mL (both from VLB), MaternalPlacenta added`);
const eng = await createEngine();
globalThis.__bc = await import("../component_models/BloodComposition.js");
const model = eng.build(j.model_definition);
if (!model?.models) { say("build failed"); process.exit(1); }
const M = model.models;
const log = [];
const ctx = { eng, M, model, log };
const snap = (tag) => {
  const a = RA.avgOver(ctx, 3, () => ({ map: M.AA.pres, cvp: (M.RAIVCI.pres + M.RASVC.pres) / 2, co: M.LV_AA.flow * 60, ut: M.AD_UT_ART.flow * 60000, pl: M.UT_ART_PL_IVS.flow * 60000, pco2: M.AA.pco2 ?? NaN }));
  say(`[${tag}] t=${model.model_time_total.toFixed(0)} s HR ${M.Monitor.heart_rate.toFixed(1)} MAP ${a.map.toFixed(1)} CVP ${a.cvp.toFixed(1)} CO ${a.co.toFixed(2)} ` +
    `UT ${a.ut.toFixed(0)} PL ${a.pl.toFixed(0)} mL/min SpO2 ${M.Monitor.sao2_pre.toFixed(1)} pCO2 ${a.pco2.toFixed(1)} RR ${M.Breathing.resp_rate.toFixed(1)}`);
};
for (let t = 0; t < 60; t += 20) { eng.calc(17); snap("load"); }

for (const k of active) { LEVERS[k].apply(M, model); say(`lever ${k}: ${LEVERS[k].why}`); }
RA.reseedInterstitium(ctx);
const settleLevers = active.filter((k) => LEVERS[k].settle);
for (let t = 0; t < SETTLE; t += 60) { eng.calc(Math.min(60, SETTLE - t)); settleLevers.forEach((k) => LEVERS[k].apply(M, model)); snap("settle"); }

// --- re-anchor (as scripts/_make_adult_female.mjs) ---------------------------------------------------------------------
RA.reanchorChemoreflex(ctx);
RA.reanchorHormonesGlucose(ctx);
RA.reanchorKidney(ctx);
RA.reseedLactateThermo(ctx);
RA.reseedInterstitium(ctx);
// the maintenance intake is measured once the kidney re-anchoring has settled and BEFORE the last trimming window, so the
// trims have converged at the moment of the baroreflex fold (measured between the trims and the fold, the 120 s window
// let the pressure drift up and the fold baked in a braking reflex: HR 73 instead of 78)
eng.calc(120);
RA.reanchorMaintenance(ctx);
for (let t = 0; t < PRE_FOLD; t += 60) { eng.calc(60); settleLevers.forEach((k) => LEVERS[k].apply(M, model)); }
RA.reanchorBaroreflex(ctx);
eng.calc(60);
// heart rate and pressure after the fold: the last trims leave a small error at the fold, so the folded reflex can bake in a
// few bpm of braking (HR ~73 instead of 78) and the pressure drifts back up (24 wk: MAP 81.5 instead of 78); with the reflex
// now neutral, the resting rate and the systemic resistance are nudged back to their targets together
if (active.includes("hr") || active.includes("svr")) {
  for (let i = 0; i < 5; i++) {
    const a = RA.avgOver(ctx, 10, () => ({ hr: M.Monitor.heart_rate, map: M.AA.pres, cvp: (M.RAIVCI.pres + M.RASVC.pres) / 2 }));
    const dHr = Math.abs(a.hr - HR_TARGET), dMap = Math.abs(a.map - MAP_TARGET);
    if (dHr < 0.3 && dMap < 0.3) break;
    if (active.includes("hr")) M.Heart.heart_rate_ref *= HR_TARGET / a.hr;
    if (active.includes("svr")) { const f = (MAP_TARGET - a.cvp) / (a.map - a.cvp); for (const n of model.scaler_config.blood_systemic.resistance) M[n].r_factor_scaling_ps *= f; }
    eng.calc(50);
    log.push(`post-fold HR ${a.hr.toFixed(1)} / MAP ${a.map.toFixed(1)} -> heart_rate_ref ${M.Heart.heart_rate_ref.toFixed(2)}, SVR scaling ${M.AA.r_factor_scaling_ps.toFixed(3)}`);
  }
  // the nudges moved the pressure off the folded reflex's set-point, which would pull it back after load (probe: MAP 80.4 at
  // 24 wk, HR 76.7 at 36): re-anchor the baroreflex once more at the corrected state (its effectors are near neutral, so the
  // second fold only re-finds the set-point)
  RA.reanchorBaroreflex(ctx);
  eng.calc(60);
  // the second fold can still catch a little braking (HR 3-4 bpm low): a heart-rate-only nudge with the reflex neutral
  // (small enough that the pressure moves < ~1 mmHg)
  if (active.includes("hr")) {
    for (let i = 0; i < 3; i++) {
      const hr = RA.avgOver(ctx, 10, () => ({ hr: M.Monitor.heart_rate })).hr;
      if (Math.abs(hr - HR_TARGET) < 0.3) break;
      M.Heart.heart_rate_ref *= HR_TARGET / hr;
      eng.calc(50);
      log.push(`post-second-fold HR ${hr.toFixed(1)} -> heart_rate_ref ${M.Heart.heart_rate_ref.toFixed(2)}`);
    }
  }
}
RA.reanchorChemoreflex(ctx);
RA.reanchorBrain(ctx);
RA.relearnHeartFunction(ctx);
for (let t = 0; t < FINAL; t += 120) { eng.calc(Math.min(120, FINAL - t)); active.filter((k) => LEVERS[k].final).forEach((k) => LEVERS[k].apply(M, model)); snap("final"); }
// the kidney trim runs through the final settle, so the urine output moves after the first maintenance re-anchor: set the
// intake (rate and composition) to the final resting urine once more, or the blood volume creeps (+46 mL/h, 2026-11-27)
RA.reanchorMaintenance(ctx);
RA.reseedInterstitium(ctx); // re-seed its balance at the final state too (it did not stop the slow interstitial -> plasma shift, ~20 mL/30 min and slowing: open item)
eng.calc(RA_ISF_SEED);
RA.advanceToSinusFiring(ctx);
eng.scale("incorporate", 1);
log.forEach((l) => say("  " + l));

model.name = NAME;
model.description = DESCRIPTION;
j.name = NAME;
j.description = DESCRIPTION;
j.provenance = "script-generated";
j.provenance_note = `derived from ${SOURCE} by scripts/_make_adult_female_pregnant.mjs; reference values in docs/PregnancyReference.md`;
j.model_definition = serializeState(model);
pregnancyDisplay(j);
j.model_definition._baseline_weight = WEIGHT;
const text = JSON.stringify(j, null, 2);
JSON.parse(text);
if (WRITE) {
  fs.writeFileSync(new URL(`${NAME}.json`, dir), text);
  const idxUrl = new URL("index.json", dir);
  const idx = JSON.parse(fs.readFileSync(idxUrl, "utf8"));
  if (!idx.includes(NAME)) { idx.push(NAME); fs.writeFileSync(idxUrl, JSON.stringify(idx, null, 2) + "\n"); }
  say(`wrote model_definitions/${NAME}.json`);
} else if (OUT) {
  fs.writeFileSync(OUT, text);
  say(`wrote ${OUT}`);
} else say("dry run (pass --write or --out FILE)");

// Diagram and monitor for pregnancy: a placenta node (PL_IVS) beside the uterus node, with the spiral-artery and drainage
// connectors; the uterus and placenta discs drawn at DISC_SCALE of their natural size (the diagram sizes discs by absolute
// volume: the ~260 mL uterine bed and ~170 mL intervillous space would swamp the organ column, but they stay visibly
// enlarged against the non-pregnant uterus); uterine and placental flow read-outs (mL/min) on the circulation panels.
function pregnancyDisplay(j) {
  const DC = j.diagram_definition?.components;
  if (DC?.UT) {
    const ren = (x, map) => { let t = JSON.stringify(x); for (const [a, b] of map) t = t.split(a).join(b); return JSON.parse(t); };
    DC.UT.layout.sprite.scale = { x: DISC_SCALE, y: DISC_SCALE };
    if (!DC.PL) {
      DC.PL = ren(DC.UT, [['"UT_CAP","UT_VEN","UT_ART"', '"PL_IVS"'], ['"label":"UT"', '"label":"PL"']]);
      DC.PL.models = ["PL_IVS"];
      DC.PL.layout.sprite.pos = { ...DC.UT.layout.sprite.pos, x: +(DC.UT.layout.sprite.pos.x + 0.15).toFixed(3) };
      DC.UT_PL = ren(DC.AD_UT, [["AD_UT_ART", "UT_ART_PL_IVS"]]); Object.assign(DC.UT_PL, { dbcFrom: "UT", dbcTo: "PL" });
      DC.PL_UT = ren(DC.UT_VLB, [["UT_VEN_VLB", "PL_IVS_UT_VEN"]]); Object.assign(DC.PL_UT, { dbcFrom: "PL", dbcTo: "UT" });
    }
    j.diagram_definition.settings.name = `${NAME}_diagram`;
  }
  const flows = [
    { label: "fUT", unit: "ml/min", factor: 1000, rounding: 0, props: ["Monitor.flows.ut_flow"], weight_based: false },
    { label: "fPL", unit: "ml/min", factor: 1000, rounding: 0, props: ["Monitor.flows.pl_flow"], weight_based: false },
  ];
  const panels = [j.configuration?.monitors?.circulation, ...(j.configuration?.monitor_dashboards ?? []).map((d) => d.monitors?.circulation)].filter(Boolean);
  for (const panel of panels) for (const f of flows) if (!panel.parameters.some((q) => q.label === f.label)) panel.parameters.push({ ...f });
  say(`display: placenta node + connectors, uterus/placenta discs x${DISC_SCALE}, fUT/fPL read-outs on ${panels.length} circulation panels`);
}
