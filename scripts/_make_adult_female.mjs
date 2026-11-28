// Generate adult_female (a healthy non-pregnant woman: 26 y, 60 kg, 1.65 m, awake, supine, at rest, room air) from
// term_neonate_72h. Reference values: docs/AdultFemaleReference.md and scripts/reference/adult_female.json; check with
//   node scripts/probe_term_reference.mjs adult_female --ref scripts/reference/adult_female.json [--file OUT]
//
//   node scripts/_make_adult_female.mjs [--settle 300] [--final 600] [--write | --out FILE] [--levers none|all|a,b,...]
//
// USER DECISION 2026-11-27 (step 3): the adult is the 72 h baby scaled by reference-implied ratios per family,
// not the deleted old adult_female file (5e0c5c1^: blood volume 80.5 mL/kg, and its heart chambers, pericardium
// and arterial stiffness use the pre-EDPVR formulation). The old file is a cross-check only.
//
// Order: the SIZE lever is applied to the model definition before the build (a 17x jump on a running model is
// a needless transient); the other levers (step 5, one at a time) act on the live model. The model settles, every
// controller is re-anchored to the new resting state (scripts/_reanchor.mjs, the inventory of
// scripts/_make_term_transition.mjs plus the Brain and Kidney anchors), the scaling layer is baked, and the live
// state is serialized at a sinus-node firing.
import fs from "node:fs";
import { createEngine } from "./_harness.mjs";
import { serializeState } from "./_serialize_state.mjs";
import * as RA from "./_reanchor.mjs";

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const SETTLE = Number(opt("--settle", 300)); // s after the levers, before re-anchoring
const FINAL = Number(opt("--final", 600)); // s after re-anchoring, before saving
const PRE_FOLD = Number(opt("--pre-fold", 300)); // s of trimming after the hormone / kidney re-anchoring, before the baroreflex fold
const WRITE = argv.includes("--write");
const OUT = opt("--out", null);
const SOURCE = "term_neonate_72h";
const NAME = "adult_female";
const say = (...a) => process.stderr.write(a.join(" ") + "\n");

const SUBJECT = { weight: 60.0, height: 1.65, age: 26.0, gestational_age: 40.0 };
const DESCRIPTION = "healthy non-pregnant woman, 26 years, 60 kg, 1.65 m (BSA 1.65 m2): awake, supine, at rest, post-absorptive, room air";

// --- size: reference-implied ratios, adult / 72 h baby ------------------------------------------------------
// Baby values are term_neonate_72h as read by probe_term_reference.mjs (2026-11-27); adult targets from
// scripts/reference/adult_female.json. Elastance ~ pressure ratio / volume ratio; resistance ~ pressure-drop
// ratio / flow ratio; a non-linear term (el_k mmHg/L2, r_k mmHg s2/L2) divides by the square.
const BABY = { bv: 0.3008, co: 0.727, map: 55.8, cvp: 2.38, pap_m: 23.7, pvr: 28.0, svr: 75.2, lv_edv: 9.31, rv_edv: 11.4, la: 5.9,
  hw: 23.0, cor: 25.9, cbf: 0.1059, gfr: 4.42, frc: 0.106, cl: 4.43, ccw: 14.7, vd: 7.8, rrs: 53.9, hr: 117 };
const ADULT = { bv: 62.8 * 60 / 1000, co: 5.4, map: 82, cvp: 4, pap_m: 12.8, pvr: 0.86, svr: 14.4, lv_edv: 127, rv_edv: 129, la: 8.0,
  hw: 7.799 + 0.004296 * 60000, cor: 60, cbf: 0.717, gfr: 105, frc: 1.8, cl: 1 / (1 / 90 - 1 / 200), ccw: 200, vd: 132, rrs: 3.2, hr: 65 };
const R_ = (k) => ADULT[k] / BABY[k];
const QF = R_("co"); // flow
const PF = { // pressure ratio per region
  art: R_("map"), mid: (R_("map") + R_("cvp")) / 2, ven: R_("cvp"), pa: R_("pap_m"), pv: R_("la"),
  lv_sys: R_("map"), rv_sys: 22 / 39, // RV systolic: adult ~22 (PAP 15-30) vs baby 39
};
const VS = { blood: R_("bv"), lv: R_("lv_edv"), rv: R_("rv_edv"), atria: R_("bv"), heart_wt: R_("hw") };
const RF = { sys: R_("svr"), pulm: R_("pvr"), valve: 1 / QF, cor: R_("map") / R_("cor") };
const LF = { vol: R_("frc"), lung_el: 1 / R_("cl"), chest_el: 1 / R_("ccw"), ds: R_("vd"), raw: R_("rrs"), dif: SUBJECT.weight / 3.545 };
const T_F = BABY.hr / ADULT.hr; // cycle length ratio (inertance ~ pressure x time / flow)

function flatten(models) { const o = {}; const w = (x) => { for (const [k, v] of Object.entries(x)) { o[k] = v; if (v?.components) w(v.components); } }; w(models); return o; }

function applySize(def) {
  const o = flatten(def.models);
  const C = o.Circulation, Rs = o.Respiration;
  const fam = (k) => new Set(C[k]);
  const sysArt = new Set([...fam("systemic_arteries"), ...fam("systemic_arterioles")]);
  const sysMid = new Set([...fam("systemic_capillaries"), ...fam("systemic_venules")]);
  const sysVen = new Set([...fam("systemic_veins"), "IVCI_RAIVCI", "SVC_RASVC"]);
  const pulArt = new Set([...fam("pulmonary_arteries"), ...fam("pulmonary_arterioles"), ...fam("pulmonary_capillaries")]);
  const pulVen = new Set([...fam("pulmonary_venules"), ...fam("pulmonary_veins"), "PV_LA"]);
  const pulAll = new Set([...pulArt, ...pulVen]);
  const did = {};
  const mul = (n, p, f) => { const m = o[n]; if (typeof m?.[p] !== "number") return; m[p] *= f; did[n] = true; };
  const vessel = (n, pf, rf, vs) => {
    for (const p of ["vol", "u_vol"]) mul(n, p, vs);
    mul(n, "el_base", pf / vs); mul(n, "el_k", pf / (vs * vs));
    for (const p of ["r_for", "r_back"]) mul(n, p, rf); mul(n, "r_k", rf / QF);
  };
  // circulation vessels
  for (const n of Object.keys(C.components)) {
    if (sysArt.has(n)) vessel(n, PF.art, RF.sys, VS.blood);
    else if (sysMid.has(n)) vessel(n, PF.mid, RF.sys, VS.blood);
    else if (sysVen.has(n)) vessel(n, PF.ven, RF.sys, VS.blood);
    else if (pulArt.has(n)) vessel(n, PF.pa, RF.pulm, VS.blood);
    else if (pulVen.has(n)) vessel(n, PF.pv, RF.pulm, VS.blood);
    else say(`size: circulation component ${n} has no family (left unscaled)`);
  }
  // heart chambers: systolic el_max by the chamber's systolic pressure, diastolic el_min / el_k by its filling pressure
  const chamber = (n, vs, pfSys, pfDia) => {
    for (const p of ["vol", "u_vol"]) mul(n, p, vs);
    mul(n, "el_max", pfSys / vs); mul(n, "el_min", pfDia / vs); mul(n, "el_k", pfDia / (vs * vs));
  };
  chamber("LV", VS.lv, PF.lv_sys, PF.pv);
  chamber("RV", VS.rv, PF.rv_sys, PF.ven);
  chamber("LA", VS.atria, PF.pv, PF.pv);
  for (const n of ["RAIVCI", "RASVC"]) chamber(n, VS.atria, PF.ven, PF.ven);
  // coronary bed with the heart weight; its resistors by coronary pressure / flow
  for (const p of ["vol", "u_vol"]) mul("COR", p, VS.heart_wt);
  for (const p of ["el_min", "el_max"]) mul("COR", p, PF.art / VS.heart_wt); mul("COR", "el_k", PF.art / VS.heart_wt ** 2);
  for (const n of ["AA_COR", "COR_RAIVCI", "COR_RASVC"]) for (const p of ["r_for", "r_back"]) mul(n, p, RF.cor);
  // valves keep their gradients at the adult flow; the AV-valve inertance by pressure x cycle time / flow
  for (const [n, m] of Object.entries(o)) if (m.model_type === "HeartValve") {
    for (const p of ["r_for", "r_back"]) mul(n, p, RF.valve); mul(n, "r_k", RF.valve / QF);
    mul(n, "inertance", PF.mid * T_F / QF);
  }
  for (const p of ["r_for", "r_back"]) mul("RAIVCI_RASVC", p, RF.valve);
  // pericardium: same pressure at the scaled heart volume
  for (const p of ["vol", "u_vol"]) mul("PERICARDIUM", p, VS.atria); mul("PERICARDIUM", "el_k", 1 / VS.atria ** 2); mul("PERICARDIUM", "el_base", 1 / VS.atria);
  // top-level connectors between circulation compartments (organ-bed inputs are overwritten from the downstream
  // vessel at run time; the rest follow the family of the compartment they feed)
  for (const [n, m] of Object.entries(def.models)) {
    if (m.model_type !== "Resistor" || /^(PL_|AD_PL|ECLS|VENT)/.test(n)) continue;
    const f = pulAll.has(m.comp_to) || pulAll.has(m.comp_from) ? RF.pulm : RF.sys;
    for (const p of ["r_for", "r_back"]) mul(n, p, f); mul(n, "r_k", f / QF);
  }
  // intrapulmonary shunts with PVR (keeps the shunt fraction); the foramen ovale closed in the adult
  o.Shunts.ips_res *= RF.pulm; for (const n of ["IPSL", "IPSR"]) for (const p of ["r_for", "r_back"]) mul(n, p, RF.pulm);
  o.Shunts.diameter_fo = 0.0;
  // renormalise the non-heart blood volume to the adult total (Nadler 62.8 mL/kg)
  const BLOOD = new Set(["BloodVessel", "BloodCapacitance", "BloodTimeVaryingElastance", "HeartChamber"]);
  const isBlood = (n, m) => BLOOD.has(m.model_type) && m.is_enabled !== false && !/^(ECLS|PL_|UT|MP|URINE$)/.test(n);
  let heart = 0, rest = 0;
  for (const [n, m] of Object.entries(o)) if (isBlood(n, m)) { if (m.model_type === "HeartChamber" || n === "COR") heart += m.vol; else rest += m.vol; }
  const fix = (ADULT.bv - heart) / rest;
  for (const [n, m] of Object.entries(o)) if (isBlood(n, m) && !(m.model_type === "HeartChamber" || n === "COR")) { m.vol *= fix; m.u_vol *= fix; m.el_base /= fix; if (m.el_k) m.el_k /= fix * fix; }
  // gas side
  for (const n of ["ALL", "ALR"]) { mul(n, "vol", LF.vol); mul(n, "u_vol", LF.vol); mul(n, "el_base", LF.lung_el); }
  for (const p of ["vol", "u_vol"]) mul("DS", p, LF.ds); mul("DS", "el_base", 1 / LF.ds);
  for (const p of ["vol", "u_vol"]) mul("THORAX", p, LF.vol); mul("THORAX", "el_base", LF.chest_el);
  for (const n of ["MOUTH_DS", "DS_ALL", "DS_ALR"]) for (const p of ["r_for", "r_back"]) mul(n, p, LF.raw);
  for (const n of ["GASEX_LL", "GASEX_RL"]) for (const p of ["dif_o2", "dif_co2"]) mul(n, p, LF.dif);
  // organ controllers with absolute anchors: brain flow at the adult target (its volume / pressure anchors re-seed
  // after the warm-up); kidney filtration with GFR (the TGF set-point re-seeds; myogenic set-point re-anchored)
  Object.assign(o.Brain, { cbf_setpoint: ADULT.cbf, cbv0: 0, cpp_setpoint: 0 });
  o.Kidneys.kf *= R_("gfr"); o.Kidneys.tgf_setpoint = 0; o.Kidneys.myogenic_p_set *= PF.art;
  // the fetal placenta goes (cord long clamped)
  o.Placenta.is_enabled = false;
  Object.assign(def, SUBJECT, { _baseline_weight: SUBJECT.weight });
  return { fix, n: Object.keys(did).length };
}

// --- per-kg drives: the engine scales these by body weight, so the neonatal per-kg values would make a 60 kg
// "giant baby" (15 L/min ventilation, VO2 460 mL/min) and the re-anchoring would bake that in. The adult values are
// the reference decisions of 2026-11-27 (scripts/reference/adult_female.json); they are tuned further in step 5.
const DRIVES = {
  vo2: 3.2, // mL/kg/min (Mifflin + Weir, user decision)
  mv: 0.078, // L/kg/min (Parreira 2010 supine 4.69 L/min)
  rr: 15, // /min (Parreira 2010)
  hr: ADULT.hr, // bpm (user decision: HR 65 x CMR SV)
};
function applyDrives(def) {
  const o = flatten(def.models);
  o.Metabolism.vo2 = DRIVES.vo2;
  o.Breathing.minute_volume_ref = DRIVES.mv;
  o.Breathing.vt_rr_ratio = DRIVES.mv / (DRIVES.rr * DRIVES.rr); // Breathing: RR = sqrt(MV / (vt_rr_ratio x W)), MV in L/min
  o.Heart.heart_rate_ref = DRIVES.hr;
  // the respiratory-muscle gain (effort per litre) was calibrated on the baby's lungs, ~26x stiffer: clear it so
  // Breathing recalibrates on the adult mechanics in the first breaths (Breathing.js, rmp_calibrated)
  Object.assign(o.Breathing, { rmp_gain: 0, rmp_calibrated: false, load_factor: 1 });
}

// --- uterus (user request 2026-11-27): a non-pregnant uterine bed in the early follicular phase -----------------------
// The Uterus model (docs/Uterus.md) needs UT_ART -> UT_CAP -> UT_VEN fed from AD (AD_UT_ART) and draining into VLB
// (UT_VEN_VLB). The kidney bed has exactly that shape (AD_KID_ART, KID_ART_KID_CAP, KID_CAP_KID_VEN, KID_VEN_VLB), so it
// is cloned and renamed: volumes to the uterine bed blood volume (~5 mL: tissue ~55 g, textbook C), resistances started
// at kidney x (renal / uterine flow); the "uterus" lever then trims the bed to 45 mL/min and takes that flow out of RLB
// (the pelvic organs were part of the lower body). The bed's blood comes out of VLB, so the blood volume holds. Not in
// a ModelScaler group: Uterus writes the vessels' scaling layers (pregnancy), which a scaler group would clobber.
// Interstitium has no filtration site here and Metabolism no share: Uterus consumes its own O2 (lever "metabolism").
const UT_ART_R = Number(opt("--ut-art-r", 0.3)), UT_ART_EL = Number(opt("--ut-art-el", 1.0)); // grid 2026-11-27 (r,el -> PI,RI): 1,1 1.27,0.73; 0.3,1 2.66,0.90; 0.3,0.3 4.07,1.10 (reversal); 0.1,0.2 9.95,1.16
const UT = { flow: 45, vol: 0.005, vo2: 0.41 }; // mL/min (Ziegler 1999 x2), L (bed blood), mL O2/min (0.75 mL/100 g/min x 55 g)
function addUterus(def) {
  const o = flatten(def.models), C = o.Circulation;
  const ren = (x) => JSON.parse(JSON.stringify(x).replace(/KID_/g, "UT_").replace(/of KID"/g, 'of UT"'));
  const kidVol = ["KID_ART", "KID_CAP", "KID_VEN"].reduce((a, n) => a + o[n].vol, 0);
  const fv = UT.vol / kidVol, fr = (14 * 60) / UT.flow; // kidney ~14 mL/kg/min
  for (const n of ["KID_ART", "KID_CAP", "KID_VEN"]) {
    const v = ren(o[n]);
    for (const p of ["vol", "u_vol"]) v[p] *= fv;
    v.el_base /= fv; if (v.el_k) v.el_k /= fv * fv;
    for (const p of ["r_for", "r_back"]) v[p] *= fr;
    C.components[v.name] = v;
  }
  for (const n of ["AD_KID_ART", "KID_ART_KID_CAP", "KID_CAP_KID_VEN", "KID_VEN_VLB"]) {
    const r = ren(o[n]);
    for (const p of ["r_for", "r_back"]) r[p] *= fr;
    def.models[r.name] = r;
  }
  for (const [fam, n] of [["systemic_arterioles", "UT_ART"], ["systemic_capillaries", "UT_CAP"], ["systemic_venules", "UT_VEN"]]) if (!C[fam].includes(n)) C[fam].push(n);
  // the uterine drain UT_VEN_VLB belongs to VLB (docs/Uterus.md): VLB drives the resistors of the inputs it lists, so list UT_VEN
  // (without it the drain kept the fixed resistance it was cloned with; harmless at 45 mL/min, found in the pregnancy work)
  if (!C.components.VLB.inputs.includes("UT_VEN")) C.components.VLB.inputs.push("UT_VEN");
  // waveform: a non-pregnant uterine artery has a high-resistance Doppler spectrum (PI ~3, RI ~0.88, little end-diastolic
  // flow). The inflow resistor follows UT_ART's resistance, so the arteriole's share of the bed resistance is moved into
  // the capillary (total kept) and the arteriole made more compliant: it fills in systole in front of the high resistance.
  const A = C.components.UT_ART, K = C.components.UT_CAP, rTot = A.r_for + K.r_for;
  A.r_for = A.r_back = A.r_for * UT_ART_R; K.r_for = K.r_back = rTot - A.r_for;
  A.el_base *= UT_ART_EL;
  const added = ["UT_ART", "UT_CAP", "UT_VEN"].reduce((a, n) => a + C.components[n].vol, 0);
  const vlb = o.VLB, k = (vlb.vol - added) / vlb.vol; vlb.vol *= k; vlb.u_vol *= k; // same blood volume
  def.models.Uterus = {
    name: "Uterus", description: "uterine organ: non-pregnant, early follicular phase", is_enabled: true, model_type: "Uterus",
    uterus_running: true, ut_art_name: "UT_ART", ut_cap_name: "UT_CAP", ut_ven_name: "UT_VEN", ut_in_res_name: "AD_UT_ART",
    ut_out_res_name: "UT_VEN_VLB", met_active: true, ut_vo2: +(UT.vo2 / SUBJECT.weight).toFixed(5), vo2_factor: 1, vo2_factor_ps: 1,
    resp_q: 0.8, perfusion_factor: 1, pregnant: false, preg_ga: 0, preg_ga_threshold: 4, preg_ga_term: 40,
    preg_res_term_factor: 0.083, preg_cap_res_term_factor: 0.43, preg_vol_term_factor: 3, preg_vo2_term_factor: 2,
    couple_placenta: false, pl_mat_name: "PL_MAT", contractions_running: false, contraction_period: 180,
    contraction_duration: 60, resting_tone: 8, contraction_amplitude: 50, contraction_pres_gain: 0.6, contraction_r_peak: 2,
  };
  if (!o.Monitor.flow_targets.some((t) => t.name === "ut_flow")) o.Monitor.flow_targets.push({ name: "ut_flow", model: "AD_UT_ART.flow" });
  return { vol: added };
}

// --- levers on the live model (step 5, added one at a time) ------------------------------------------------
const HB = Number(opt("--hb", 13.5)); // g/dL
const VO2_TOTAL = Number(opt("--vo2", 3.2)); // mL/kg/min, whole body
const RQ = Number(opt("--rq", 0.82));
// true mean MAP: reference 82 (NHANES) + 5 = 87 (user decision 2026-11-28: "the blood pressure of the adult females is somewhat
// too low"). The generator aims MAP_SETTLE_OFFSET above it (user option B): the slow volume controllers (interstitial
// filtration, kidney autoregulation, hormones, maintenance balance), anchored before the post-fold correction, let the pressure
// settle ~2 mmHg below the generator's target (target 87 -> 85.0 after load). The probe still judges the settled value.
const MAP_GOAL = Number(opt("--map", 87)), MAP_SETTLE_OFFSET = Number(opt("--map-offset", 2));
const MAP_TARGET = MAP_GOAL + MAP_SETTLE_OFFSET;
const HR_TARGET = Number(opt("--hr", 65));
const VEN_U = Number(opt("--ven-u", 0.95));
const SV_TARGET = (5.4 * 1000) / 65; // mL: CO 5.4 L/min at HR 65 (user decision 2026-11-27; CMR SV 83 mL) // grid 2026-11-27 (with rvdia): 1.0/0.95/0.9/0.85
const BED = { kid: Number(opt("--kid-r", 0.95)), int: Number(opt("--int-r", 0.92)), ls: Number(opt("--ls-r", 1.95)), cor_ext: Number(opt("--cor-ext", 0.74)) }; // prototypes 2026-11-27: kid 0.77 -> renal 13.8 (15.9 after the kf lever -> 0.87; 15.5 after the chemistry lever -> 0.95); int 0.92 -> gut 13.3; ls 1.76/1.95 -> 7.5/6.9; cor_ext 0.70/0.74 -> 257/238 mL/min
const KF = Number(opt("--kf", 0.46));
const GFR_TARGET = Number(opt("--gfr", 109)); // mL/min/1.73 m2 (Pottel 2017)
const BSA = 0.024265 * Math.pow(60, 0.5378) * Math.pow(165, 0.3964); // Haycock, as the probe
const CHEM = { na: 140, k: 4.2, albumin: 43, phosphates: 1.1 };
const CL_TARGET = 103;
const PCO2_TARGET = Number(opt("--pco2", 38));
const RR_TARGET = Number(opt("--rr", 15));
const FRC_F = Number(opt("--frc", 1.0));
const THERMO = { env_temp: 23.0, surface_area_k: Math.round((1.66 / Math.pow(60, 2 / 3)) * 1000) / 1000, bat_max_per_kg: 0.2 };
const ISF = { isf_volume_per_kg: 0.15, lymph_flow_rest: 0.035, kf_per_kg: 0.04 };
const GLU = 4.9, GLU_RATE = 0.011, GLU_ISF = 0.15, LACT = 1.0; // grid 2026-11-27: 0.5/0.58/0.66 -> GFR 119/135/151
const REABS = Number(opt("--reabs", 0.990));
const IPS_F = Number(opt("--ips", 3.0)); // grid 2026-11-27: x1 8.5 %, x2.2 4.0 %, x3 3.0 %, x4.3 2.1 % (A-a 17.7/11.6/9.7/8.6)
const RV_DIA = Number(opt("--rv-dia", 0.75)); // grid 2026-11-27: 0.45/0.5/0.6/0.75
const ART_EL = Number(opt("--art-el", 0.6)); // prototype grid 2026-11-27: 1.0 PP 43, 0.6 PP 33 (100/67), 0.4 PP 27
const P50 = Number(opt("--p50", 26.8)); // mmHg
const HB_GDL_PER_MMOL = 1.611; // Hb monomer mmol/L -> g/dL (as probe_term_reference.mjs)
const LEVERS = {
  // 1. adult blood: haemoglobin 13.5 g/dL (WHO 2024 / Braat 2024 lower limit 12.0; lab mean) and the HbA
  //    dissociation curve (Severinghaus P50 26.8). The blood volume stays (Nadler, size seed): the lower Hb is a smaller
  //    red cell mass in the same volume. Each compartment's O2 content moves with Hb (same saturation); the
  //    saturation then follows the new curve. Viscosity reference re-calibrated after the Hb change.
  blood: {
    why: `haemoglobin ${HB} g/dL, P50 ${P50} mmHg (HbA)`,
    apply(M) {
      const hbOld = M.Blood.solutes.hemoglobin, hbNew = HB / HB_GDL_PER_MMOL;
      M.Blood.set_solute("hemoglobin", hbNew);
      for (const [n, m] of Object.entries(M)) if (m?.solutes && m !== M.Blood && typeof m.to2 === "number" && !/^(PL_|UT|MP|URINE$|ECLS)/.test(n)) m.to2 *= hbNew / hbOld;
      M.Blood.set_P50(P50);
      M.Blood.calibrate_viscosity_ref();
    },
  },
  // 2. whole-body O2 consumption 3.2 mL/kg/min (Mifflin + Weir, user decision), INCLUDING the myocardium: the
  //    Mob model adds the heart's own O2 use on top of Metabolism.vo2, so Metabolism takes the rest (as the
  //    72 h baby: total 7.0 with Mob 0.81). Re-applied while settling, since the heart's share follows its work.
  //    Respiratory quotient 0.82 (post-absorptive, textbook C).
  metabolism: {
    why: `whole-body VO2 ${VO2_TOTAL} mL/kg/min incl. the myocardium (Metabolism.vo2 = total - Mob), resp_q ${RQ}`,
    settle: true,
    apply(M, model) {
      const mob = (M.Mob.mob_vo2 * 60 * 22.4) / model.weight; // mmol/s -> mL/kg/min
      const ut = M.Uterus?.is_enabled && M.Uterus.met_active ? M.Uterus.ut_vo2 : 0; // mL/kg/min, Uterus consumes its own
      M.Metabolism.vo2 = VO2_TOTAL - mob - ut;
      M.Metabolism.resp_q = RQ;
      this.why = `whole-body VO2 ${VO2_TOTAL} mL/kg/min = Metabolism ${M.Metabolism.vo2.toFixed(3)} + Mob ${mob.toFixed(3)} + Uterus ${ut.toFixed(4)}, resp_q ${RQ}`;
    },
  },
  // 3. the baroreflex defends the adult blood pressure while the levers settle (then folded and re-anchored as always):
  //    true mean MAP 82 (user decision 2026-11-27, option A: the model's ascending aorta is compared as central pressure;
  //    the NHANES brachial DBP + PP/3 approximates the true mean, which is about equal in aorta and arm). BR_MAP senses the
  //    arch pressure, a time-averaged mean, so the set-point is the target itself. Without it the size seed's set-point
  //    (~66) holds the pressure low and pulls the heart rate down.
  map: {
    why: `baroreflex set-point at true mean MAP ${MAP_TARGET} while settling`,
    settle: true,
    apply(M) {
      // BR_MAP senses the arch (AAR); the target is the ascending-aorta (AA) true mean, so add the arch - aorta gap
      // (~3 mmHg after the aortic compliance lever), otherwise the reflex and the hr / svr trims pull against each other
      const a = RA.avgOver(ctx, 5, () => ({ aar: M.AAR.pres, aa: M.AA.pres }));
      M.BR_MAP.set_value = MAP_TARGET + (a.aar - a.aa);
      this.why = `baroreflex set-point at true mean MAP ${MAP_TARGET} + arch gap ${(a.aar - a.aa).toFixed(2)}`;
    },
  },
  // 4. resting heart rate 65 (user decision: HR 65 x CMR SV 83 mL -> CO ~5.4 L/min). Held while settling by trimming the
  //    reference rate against the measured rate, so the baroreflex fold (done last) bakes in 65.
  hr: {
    why: `heart rate held at ${HR_TARGET} while settling (Heart.heart_rate_ref trimmed)`,
    settle: true,
    apply(M) {
      const hr = M.Monitor.heart_rate;
      if (hr > 0) M.Heart.heart_rate_ref *= Math.pow(HR_TARGET / hr, 0.8);
      this.why = `heart rate held at ${HR_TARGET} (heart_rate_ref ${M.Heart.heart_rate_ref.toFixed(2)})`;
    },
  },
  // 5. systemic vascular resistance: the scaling layer of every systemic vessel (ModelScaler blood_systemic.resistance)
  //    trimmed until the true mean arterial pressure is MAP_TARGET, so the pressure is held structurally rather than by
  //    a reflex that saturates short of it. Organ beds that autoregulate (brain, kidney) take their share back.
  svr: {
    why: `systemic resistance trimmed to true mean MAP ${MAP_TARGET}`,
    settle: true,
    apply(M, model) {
      const a = RA.avgOver(ctx, 5, () => ({ map: M.AA.pres, cvp: (M.RAIVCI.pres + M.RASVC.pres) / 2 }));
      const f = Math.pow((MAP_TARGET - a.cvp) / (a.map - a.cvp), 0.7);
      for (const n of model.scaler_config.blood_systemic.resistance) M[n].r_factor_scaling_ps *= f;
      this.why = `systemic resistance scaling ${M.AA.r_factor_scaling_ps.toFixed(3)} (true mean MAP ${a.map.toFixed(1)} -> ${MAP_TARGET})`;
    },
  },
  // 6. large-artery compliance: a young adult's aorta is more distensible than the size-scaled neonatal one (central
  //    pulse pressure ~32 vs 46 after the size seed). Elastance of the aorta (AA, AAR, AD), linear and non-linear terms.
  artery: {
    why: `aortic elastance (AA, AAR, AD el_base and el_k) x${ART_EL}`,
    apply(M) { for (const n of ["AA", "AAR", "AD"]) { M[n].el_base *= ART_EL; M[n].el_k *= ART_EL; } },
  },
  // 7. preload: after the size seed the ventricles fill ~10 % short of the CMR end-diastolic volumes at a low left
  //    filling pressure (LA ~5 vs wedge ~10). Venous tone: the unstressed volume of the systemic veins and venules is
  //    lowered, moving blood from the unstressed into the stressed pool (same blood volume).
  //    2026-11-28 (user, option B): no longer a fixed factor but a trim to the CMR stroke volume (CO 5.4 L/min / HR 65 =
  //    ~83 mL): with the pressure raised 5 mmHg by the SVR trim, a fixed filling let stroke volume and output fall (~4 %)
  //    and the pressure rose only ~3.5-4 mmHg. Starts at x0.95 (the earlier fixed value), then trimmed while settling.
  preload: {
    why: `systemic venous + venular unstressed volume trimmed to stroke volume ${SV_TARGET.toFixed(1)} mL (start x${VEN_U})`,
    settle: true,
    apply(M) {
      const C = M.Circulation, names = [...C.systemic_veins, ...C.systemic_venules].filter((n) => n !== "UT_VEN");
      if (!this._done) { for (const n of names) M[n].u_vol *= VEN_U; this._done = true; this._f = VEN_U; return; }
      const a = RA.avgOver(ctx, 10, () => ({ q: M.LV_AA.flow, hr: M.Monitor.heart_rate }));
      const sv = (a.q * 60 * 1000) / a.hr; // mL
      const f = Math.min(Math.max(Math.pow(sv / SV_TARGET, 1.0), 0.97), 1.03); // SV low -> less unstressed volume -> more filling
      for (const n of names) M[n].u_vol *= f;
      this._f *= f;
      this.why = `venous unstressed volume x${this._f.toFixed(3)} (stroke volume ${sv.toFixed(1)} -> ${SV_TARGET.toFixed(1)} mL)`;
    },
  },  // 8. right-ventricular diastolic compliance: the size seed scaled RV diastolic stiffness by the CVP ratio (x1.67), but
  //    the baby's RV fills at an end-diastolic pressure of ~9 mmHg and an adult RV at ~4-5, so the RV came out too
  //    stiff (CVP above the wedge pressure once the preload was restored). RV el_min and el_k scaled.
  rvdia: {
    why: `RV diastolic stiffness (el_min, el_k) x${RV_DIA}`,
    apply(M) { M.RV.el_min *= RV_DIA; M.RV.el_k *= RV_DIA; },
  },  // 9. intrapulmonary shunt: the size seed scaled the shunt resistance with PVR, which kept the baby's shunt fraction
  //    (8.5 % of the RV output); a healthy adult's is ~2-3 % (bronchial and Thebesian venous drainage), which gives the
  //    normal alveolar-arterial pO2 difference of ~5-8 mmHg. Shunts.ips_res (and the IPSL/IPSR resistors) scaled.
  shunt: {
    why: `intrapulmonary shunt resistance x${IPS_F}`,
    apply(M) { M.Shunts.ips_res *= IPS_F; for (const n of ["IPSL", "IPSR"]) { M[n].r_for *= IPS_F; M[n].r_back *= IPS_F; } },
  },  // 10. organ beds: the size seed scaled every systemic bed by the same SVR ratio, so each kept the baby's share of output.
  //     Each bed's resistance (all three of its vessels, base values) is set toward its adult flow; the SVR trim then
  //     restores the mean pressure. The brain autoregulates to its own set-point (cbf_setpoint, already adult).
  //     Kidney 14 mL/kg/min (~850 mL/min, PC-MRI vs hippuran); gut (INT) = portal flow minus the spleen's share; liver +
  //     spleen (LS) = hepatic artery + splenic artery (the model's LS venous blood bypasses the liver). Coronary flow
  //     follows Mob's held O2 extraction: adult ~70-75 % (coronary sinus saturation ~25-30 %; Mob.md; 0.55 was the
  //     neonatal calibration).
  beds: {
    why: `kidney R x${BED.kid}, gut R x${BED.int}, liver+spleen R x${BED.ls}, Mob.cor_ext_ref ${BED.cor_ext}`,
    apply(M) {
      const bed = (pre, f) => { for (const n of [`${pre}_ART`, `${pre}_CAP`, `${pre}_VEN`]) { M[n].r_for *= f; M[n].r_back *= f; } };
      bed("KID", BED.kid); bed("INT", BED.int); bed("LS", BED.ls);
      M.Mob.cor_ext_ref = BED.cor_ext;
    },
  },  // 11. glomerular filtration: measured GFR 109 +/- 14 mL/min/1.73 m2 in women 20-30 (Pottel 2017), not the textbook
  //     120-130. The size seed scaled Kidneys.kf by the GFR ratio (~24); with the adult renal flow that overshoots. The
  //     tubuloglomerular-feedback set-point is re-anchored at the resting state with the myogenic one. Water reabsorption
  //     0.990 (urine ~1.5 L/day = ~1 mL/kg/h at GFR ~105 mL/min; textbook C; the baby's 0.98 excretes 2 %), and the
  //     maintenance intake (Fluids) is re-anchored to the resting urine output so the blood volume holds.
  kidney: {
    why: `Kidneys.kf trimmed to GFR ${GFR_TARGET} (start x${KF}), water reabsorption ${REABS}`,
    settle: true,
    apply(M) {
      const K = M.Kidneys;
      if (!this._done) { K.kf *= KF; K.reabsorption_fraction = REABS; this._done = true; return; }
      const gfr = RA.avgOver(ctx, 20, () => ({ g: K.gfr })).g * 1.73 / BSA; // mL/min/1.73 m2, as the probe
      K.kf *= Math.pow(GFR_TARGET / gfr, 0.8);
      this.why = `Kidneys.kf ${K.kf.toExponential(3)} (GFR ${gfr.toFixed(0)} -> ${GFR_TARGET}), water reabsorption ${REABS}`;
    },
  },  // 13. breathing: PaCO2 38 (sea-level textbook target, user decision) at RR 15 (Parreira 2010). The chemoreflex is held at
  //     38 while settling (as the map lever holds the baroreflex) and the ventilation reference is trimmed with it
  //     (alveolar ventilation ~ 1 / PaCO2), so the reflex does not carry the change and is re-anchored at rest; the
  //     rate/depth split (Breathing: RR = sqrt(MV / (vt_rr_ratio x W))) is re-solved for RR 15 at each trim.
  vent: {
    why: `PaCO2 ${PCO2_TARGET} at RR ${RR_TARGET} (CR_PCO2 held, minute_volume_ref + vt_rr_ratio trimmed)`,
    settle: true,
    apply(M, model) {
      const Br = M.Breathing;
      M.CR_PCO2.set_value = PCO2_TARGET;
      const a = RA.avgOver(ctx, 20, () => ({ pco2: M.AA.pco2 }));
      if (a.pco2 > 0) Br.minute_volume_ref *= Math.pow(a.pco2 / PCO2_TARGET, 0.8);
      Br.vt_rr_ratio = Br.minute_volume_ref / (RR_TARGET * RR_TARGET);
      this.why = `PaCO2 ${a.pco2.toFixed(1)} -> ${PCO2_TARGET}: minute_volume_ref ${(Br.minute_volume_ref * 1000).toFixed(1)} mL/kg/min, vt_rr_ratio ${Br.vt_rr_ratio.toExponential(3)} (RR ${RR_TARGET})`;
    },
  },
  // 14. supine FRC ~30 mL/kg (GLI 2021 upright 44 minus the supine fall, grade C): alveolar unstressed volume
  frc: {
    why: `alveolar unstressed volume (ALL, ALR u_vol) x${FRC_F}`,
    apply(M) { for (const n of ["ALL", "ALR"]) M[n].u_vol *= FRC_F; },
  },
  // 15. glucose and lactate: fasting glucose 4.9 mmol/L, arterial lactate 1.0 (Bushfield 2026; the 72 h baby's 1.5 is
  //     neonatal). Glucose turnover at the adult post-absorptive rate, ~2 mg/kg/min = 0.011 mmol/kg/min (textbook C; the
  //     baby's 0.03 is ~5.4 mg/kg/min), production = utilisation so the controller is neutral at rest; the glucose
  //     interstitial pool at the adult ~0.15 L/kg (ECF ~0.20 minus plasma; textbook C).
  glucose: {
    why: `glucose ${GLU} mmol/L, turnover ${GLU_RATE} mmol/kg/min, ISF ${GLU_ISF} L/kg; lactate ${LACT}`,
    apply(M) {
      const G = M.Glucose, L = M.Lactate;
      G.isf_glucose *= GLU / M.AA.solutes.glucose;
      Object.assign(G, { glu_use_rate: GLU_RATE, hgp_rate: GLU_RATE, glucose_setpoint: GLU, isf_volume: GLU_ISF });
      M.Blood.set_solute("glucose", GLU);
      L.lact_baseline = LACT;
      M.Blood.set_solute("lact", LACT);
    },
  },
  // 16. temperature (user decision 2026-11-27, option c): clothed indoors at ~23 degC; body surface 1.66 m2
  //     (surface_area_k x W^(2/3), Meeh; the neonatal 0.097 gives 1.49 m2); non-shivering (brown-fat) capacity at the adult
  //     ~0.2 W/kg (the neonatal 4.5 W/kg would be 270 W). ENGINE GAP: adults defend temperature mainly by shivering, which
  //     Thermoregulation does not model, so in the cold this adult cools faster than a real one (shivering parked as a
  //     separate engine PR). The heat-loss trim (insulation / clothing offset) re-seeds at once and again when re-anchored.
  thermo: {
    why: `ambient ${THERMO.env_temp} degC, surface_area_k ${THERMO.surface_area_k}, bat_max_per_kg ${THERMO.bat_max_per_kg}`,
    apply(M) {
      const T = M.Thermoregulation;
      Object.assign(T, THERMO);
      T.loss_trim_seeded = false; T._warmup_counter = 0.0;
    },
  },
  // 17. interstitium at adult size (textbook C): interstitial volume ~0.15 L/kg (ECF ~0.20 minus plasma ~0.045; the baby's
  //     0.36 is the neonatal ECF excess), resting lymph flow ~3 L/day = 0.035 mL/min/kg (baby 0.1), whole-body capillary
  //     filtration coefficient ~0.04 mL/min/mmHg/kg (adult limb plethysmography ~0.004 mL/min/mmHg/100 mL; the baby's
  //     fitted 0.08 is ~2x), and the compliances scaled with the volume (same fractional change per mmHg). The pool re-seeds
  //     from isf_volume_per_kg, its solutes from the adult plasma, and its resting balance (offsets) re-seeds.
  isf: {
    why: `Interstitium ${JSON.stringify(ISF)}`,
    apply(M) {
      const I = M.Interstitium, f = ISF.isf_volume_per_kg / I.isf_volume_per_kg;
      Object.assign(I, ISF, { compliance_above: I.compliance_above * f, compliance_below: I.compliance_below * f, isf_volume: 0, isf_volume_rest: 0 });
      // the pool's solutes from the adult plasma (the chemistry lever runs first): small solutes at plasma
      // concentration, albumin at isf_albumin_ratio x plasma (it held 0.6 x the baby's 25 g/L)
      for (const k of Object.keys(I.isf_solutes ?? {})) if (typeof M.AA.solutes[k] === "number") I.isf_solutes[k] = M.AA.solutes[k];
      I.isf_solutes.albumin = I.isf_albumin_ratio * M.AA.solutes.albumin;
      this.why = `Interstitium volume ${ISF.isf_volume_per_kg} L/kg, lymph ${ISF.lymph_flow_rest} mL/min/kg, kf ${ISF.kf_per_kg}, compliance x${f.toFixed(3)}`;
    },
  },
  // 18. uterus: the cloned bed trimmed to 45 mL/min, and the lower body (RLB) trimmed so its flow falls by the same amount
  //     (the uterus was part of it); the SVR trim keeps the mean pressure.
  uterus: {
    why: `uterine bed trimmed to ${UT.flow} mL/min, RLB to its flow minus the uterus`,
    settle: true,
    apply(M) {
      const a = RA.avgOver(ctx, 10, () => ({ ut: M.AD_UT_ART.flow * 60000, rlb: M.AD_RLB.flow * 60000 }));
      if (this._rlb === undefined) this._rlb = a.rlb - UT.flow; // first call: the RLB flow before the uterus took its share
      const bed = (pre, f) => { for (const n of [`${pre}_ART`, `${pre}_CAP`, `${pre}_VEN`]) { M[n].r_for *= f; M[n].r_back *= f; } };
      bed("UT", Math.pow(a.ut / UT.flow, 0.8));
      M.RLB.r_for *= Math.pow(a.rlb / this._rlb, 0.8); M.RLB.r_back = M.RLB.r_for;
      this.why = `uterine flow ${a.ut.toFixed(1)} -> ${UT.flow} mL/min, RLB ${a.rlb.toFixed(0)} -> ${this._rlb.toFixed(0)} mL/min`;
    },
  },
  // 12. adult plasma chemistry (lab reference intervals, C): Na 140, K 4.2, albumin 43 g/L, phosphate 1.1 mmol/L; chloride
  //     and the unmeasured anions are trimmed while settling so the base excess sits at ~0 (Cl toward 103, the rest of
  //     the gap in uma). Albumin is the model's weak acid (BloodComposition) and its oncotic pressure: the Kidneys and
  //     Interstitium law oncotic_base x albumin / albumin_ref is re-anchored to adult plasma (25 mmHg at 43 g/L,
  //     textbook C), otherwise 43 g/L would read as 31 mmHg. The maintenance fluid is re-anchored to the resting urine
  //     composition at the end (reanchorMaintenance), so each solute stays in balance.
  chemistry: {
    why: `plasma Na ${CHEM.na}, K ${CHEM.k}, albumin ${CHEM.albumin} g/L, phosphate ${CHEM.phosphates}; oncotic 25 mmHg at 43 g/L; Cl/uma trimmed to BE 0`,
    settle: true,
    apply(M) {
      const B = M.Blood;
      if (!this._done) {
        for (const [k, v] of Object.entries(CHEM)) B.set_solute(k, v);
        for (const n of ["Kidneys", "Interstitium"]) Object.assign(M[n], { oncotic_base: 25.0, albumin_ref: CHEM.albumin });
        this._done = true;
        return;
      }
      const { calc_blood_composition } = globalThis.__bc;
      calc_blood_composition(M.AA);
      const be = M.AA.be, cl = M.AA.solutes.cl;
      // anion to remove r = -0.7 x BE (BE < 0: too many anions). Chloride moves first, toward 103 only; uma takes the rest
      const r = -0.7 * be;
      let dCl = 0;
      if (r > 0 && cl > CL_TARGET) dCl = -Math.min(r, cl - CL_TARGET);
      else if (r < 0 && cl < CL_TARGET) dCl = Math.min(-r, CL_TARGET - cl);
      const dUma = -r - dCl; // total anion change dCl + dUma = -r
      for (const [n, m] of Object.entries(M)) {
        if (!m?.solutes || /^(PL_|UT|MP|URINE$|ECLS)/.test(n) || typeof m.solutes.uma !== "number") continue;
        m.solutes.cl += dCl; m.solutes.uma = Math.max(m.solutes.uma + dUma, 0);
      }
      B.solutes.cl += dCl; B.solutes.uma = Math.max((B.solutes.uma ?? 0) + dUma, 0);
      this.why = `plasma Na ${CHEM.na}, K ${CHEM.k}, albumin ${CHEM.albumin}, phosphate ${CHEM.phosphates}; BE ${be.toFixed(2)} -> Cl ${M.AA.solutes.cl.toFixed(1)}, uma ${M.AA.solutes.uma.toFixed(2)}`;
    },
  },
};
const pick = opt("--levers", "all");
const DEFAULT = ["blood", "metabolism", "map", "hr", "svr", "artery", "preload", "rvdia", "shunt", "beds", "kidney", "chemistry", "vent", "glucose", "thermo", "isf", "uterus"]; // "frc" is opt-in: u_vol x0.8 moved FRC only 38.0 -> 35.4 (target 30, grade C)
const active = pick === "none" ? [] : pick === "all" ? DEFAULT : pick.split(",");
for (const k of active) if (!LEVERS[k]) { say(`unknown lever ${k}; known: ${Object.keys(LEVERS).join(", ") || "(none yet)"}`); process.exit(1); }

// --- build --------------------------------------------------------------------------------------
const dir = new URL("../model_definitions/", import.meta.url);
const j = JSON.parse(fs.readFileSync(new URL(`${SOURCE}.json`, dir), "utf8"));
const sz = applySize(j.model_definition);
applyDrives(j.model_definition);
const ut = addUterus(j.model_definition);
say(`size: ${sz.n} components scaled; non-heart blood renormalised x${sz.fix.toFixed(3)}; ratios Q ${QF.toFixed(2)}, ` +
  `R sys ${RF.sys.toFixed(3)} pulm ${RF.pulm.toFixed(4)}, V blood ${VS.blood.toFixed(2)} LV ${VS.lv.toFixed(2)} RV ${VS.rv.toFixed(2)}; drives ${JSON.stringify(DRIVES)}`);
say(`uterus: bed of ${(ut.vol * 1000).toFixed(1)} mL added (cloned from the kidney bed), taken from VLB`);
const eng = await createEngine();
globalThis.__bc = await import("../component_models/BloodComposition.js");
const model = eng.build(j.model_definition);
if (!model?.models) { say(`build failed`); process.exit(1); }
const M = model.models;
const log = [];
const ctx = { eng, M, model, log };
const snap = (tag) => { // 3 s means (pressures, flows), so the line is not one point of the cycle
  const a = RA.avgOver(ctx, 3, () => ({ map: M.AAR.pres, cvp: (M.RAIVCI.pres + M.RASVC.pres) / 2, pa: M.PA.pres, co: M.LV_AA.flow * 60, pco2: M.AA.pco2 ?? NaN }));
  say(`[${tag}] t=${model.model_time_total.toFixed(0)} s HR ${M.Monitor.heart_rate.toFixed(1)} MAP ${a.map.toFixed(1)} CVP ${a.cvp.toFixed(1)} ` +
    `PA ${a.pa.toFixed(1)} CO ${a.co.toFixed(2)} L/min SpO2 ${M.Monitor.sao2_pre.toFixed(1)} RR ${M.Breathing.resp_rate.toFixed(1)} ` +
    `Vt ${(M.Breathing.exp_tidal_volume * 1000).toFixed(0)} mL pCO2 ${a.pco2.toFixed(1)} clinMAP ${M.Monitor.minmax?.abp_pre_pres_mean?.toFixed(1)} GFR ${M.Kidneys.gfr.toFixed(0)} urine ${(M.Kidneys.urine_flow * 60 / model.weight).toFixed(2)} BE ${M.AA.be?.toFixed?.(2)}` +
    (process.env.ADULT_DEBUG ? ` | hr_ref ${M.Heart.heart_rate_ref.toFixed(1)} ans_hr ${M.Heart.ans_activity_hr.toFixed(3)} ` +
      ["hr_mob_factor", "hr_temp_factor", "hr_chemo_factor", "hr_cat_factor"].map((k) => `${k.slice(3, -7)} ${M.Heart[k].toFixed(3)}`).join(" ") : ""));
};
for (let t = 0; t < 60; t += 20) { eng.calc(17); snap("load"); }

for (const k of active) { LEVERS[k].apply(M, model); say(`lever ${k}: ${LEVERS[k].why}`); }
RA.reseedInterstitium(ctx);
const settleLevers = active.filter((k) => LEVERS[k].settle);
for (let t = 0; t < SETTLE; t += 60) { eng.calc(Math.min(60, SETTLE - t)); settleLevers.forEach((k) => LEVERS[k].apply(M, model)); snap("settle"); }

// --- re-anchor ----------------------------------------------------------------------------------
const dbg = (tag) => { if (process.env.ADULT_DEBUG) { eng.calc(57); snap(tag); } };
// order: the hormone and kidney controllers first (their resting effects return to neutral when re-anchored, which moves
// the pressure), then settle, and the baroreflex is folded LAST, on the pressure they leave; folded first, it answered
// the ~3.5 mmHg rise with a ~10 % lower heart rate (2026-11-27 trace)
RA.reanchorChemoreflex(ctx); dbg("after chemo");
RA.reanchorHormonesGlucose(ctx); dbg("after hormones");
RA.reanchorKidney(ctx); dbg("after kidney");
RA.reseedLactateThermo(ctx);
RA.reseedInterstitium(ctx);
for (let t = 0; t < PRE_FOLD; t += 60) { eng.calc(60); settleLevers.forEach((k) => LEVERS[k].apply(M, model)); }
RA.reanchorMaintenance(ctx); // after the kidney re-anchoring has settled (urine fell from ~2.5 to ~1 mL/kg/h once the myogenic set-point moved)
dbg("before baro");
RA.reanchorBaroreflex(ctx);
eng.calc(60);
dbg("after baro");
RA.postFoldCorrection(ctx, { hr: active.includes("hr") ? HR_TARGET : null, map: active.includes("svr") ? MAP_TARGET : null, slow: true }); // (2026-11-28: MAP had settled 1.2 below target)
RA.reanchorChemoreflex(ctx);
RA.reanchorBrain(ctx);
RA.relearnHeartFunction(ctx); dbg("after HF relearn");
for (const k of settleLevers) say(`lever ${k} (end of settle): ${LEVERS[k].why}`);
for (let t = 0; t < FINAL; t += 120) { eng.calc(Math.min(120, FINAL - t)); snap("final"); }
RA.advanceToSinusFiring(ctx);
eng.scale("incorporate", 1);
log.forEach((l) => say("  " + l));

model.name = NAME;
model.description = DESCRIPTION;
j.name = NAME;
j.description = DESCRIPTION;
j.provenance = "script-generated";
j.provenance_note = `derived from ${SOURCE} by scripts/_make_adult_female.mjs; reference values in docs/AdultFemaleReference.md`;
j.model_definition = serializeState(model);
adultDiagram(j);
adultDisplay(j);
j.model_definition._baseline_weight = SUBJECT.weight;
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

// The diagram (DiagramRenderer) sizes each compartment disc from its absolute volume (r ~ cbrt(vol)) and moves the flow
// markers with the absolute flow, so the baby's layout drawn at adult volumes would overlap (discs ~2.3x wider) and the
// markers would strobe (~7x faster). User decision 2026-11-27 (option a, scenario-side): each compartment's sprite.scale
// = cbrt(baby volume / adult volume) of its own models, so every disc keeps its size in the baby diagram, and the
// marker speed = baby / adult cardiac output. The disc glow brightness still reads the raw radius (UI-side follow-up).
function adultDiagram(j) {
  const flat = (models) => { const o = {}; const w = (x) => { for (const [k, v] of Object.entries(x)) { o[k] = v; if (v?.components) w(v.components); } }; w(models); return o; };
  const baby = flat(JSON.parse(fs.readFileSync(new URL(`${SOURCE}.json`, dir), "utf8")).model_definition.models);
  const adult = flat(j.model_definition.models);
  // the uterus node: the kidney's node and connectors cloned one step further down the organ column (the baby has no
  // uterus, so the size loop below leaves it at its natural size: a 5 mL bed draws about as large as the baby's kidney)
  const DC = j.diagram_definition?.components;
  if (DC?.KID && !DC.UT) {
    const ren = (x) => JSON.parse(JSON.stringify(x).replace(/KID/g, "UT"));
    DC.UT = ren(DC.KID); DC.UT.layout.sprite.pos.y = +(DC.KID.layout.sprite.pos.y + 0.15).toFixed(3);
    DC.AD_UT = ren(DC.AD_KID); DC.UT_VLB = ren(DC.KID_VLB);
  }
  for (const [key, name] of [["diagram_definition", "adult_female_diagram"], ["animation_definition", "adult_female_animation"]]) {
    const D = j[key];
    if (!D?.components) continue;
    let n = 0;
    for (const c of Object.values(D.components)) {
      const sc = c.layout?.sprite?.scale;
      if (c.type !== "Compartment" || !sc || c.layout.sprite.fixed_size) continue;
      const vb = (c.models ?? []).reduce((a, m) => a + (baby[m]?.vol ?? 0), 0), va = (c.models ?? []).reduce((a, m) => a + (adult[m]?.vol ?? 0), 0);
      if (!(vb > 0 && va > 0)) continue;
      const f = Math.cbrt(vb / va);
      sc.x = +(sc.x * f).toFixed(4); sc.y = +(sc.y * f).toFixed(4); n++;
    }
    const s = D.settings ?? (D.settings = {});
    s.speed = +((numberOr(s.speed, 1) * BABY.co) / ADULT.co).toFixed(3);
    s.name = name;
    say(`${key}: ${n} compartment discs rescaled to their baby size, flow-marker speed ${s.speed}`);
  }
}
function numberOr(x, d) { return typeof x === "number" && Number.isFinite(x) ? x : d; }

// Monitor read-outs (configuration.monitors and the dashboards) came from the baby with weight_based (per-kg) units.
// User request 2026-11-27: in the adult they are reported in absolute units, as on an adult monitor: cardiac output and
// minute volume in L/min, regional flows in mL/min, heart / stroke / blood / tidal volumes in mL, diuresis in mL/h.
function adultDisplay(j) {
  const LPM = /^(Monitor\.flows\.(lvo|rvo)|(Breathing|Ventilator|Sle6000)\.minute_volume)$/; // read-outs in L/min
  let n = 0;
  const fix = (p) => {
    if (!p?.weight_based || !Array.isArray(p.props)) return;
    if (p.unit === "ml/kg/min" && p.props.every((x) => LPM.test(x))) Object.assign(p, { unit: "l/min", factor: p.factor / 1000, rounding: 2 });
    else if (p.unit === "ml/kg/min") Object.assign(p, { unit: "ml/min", rounding: 0 });
    else if (p.unit === "ml/kg") Object.assign(p, { unit: "ml", rounding: 0 });
    else if (p.unit === "ml/kg/h") Object.assign(p, { unit: "ml/h", rounding: 0 });
    else return;
    p.weight_based = false; delete p.value; n++;
  };
  const walk = (o) => { if (o && typeof o === "object") { if ("weight_based" in o) fix(o); for (const v of Object.values(o)) walk(v); } };
  walk(j.configuration);
  const left = JSON.stringify(j.configuration).match(/"weight_based":true/g)?.length ?? 0;
  say(`display: ${n} read-outs switched from per-kg to absolute units (${left} still per kg)`);
}
