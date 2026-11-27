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

// --- levers on the live model (step 5, added one at a time) ------------------------------------------------
const HB = Number(opt("--hb", 13.5)); // g/dL
const VO2_TOTAL = Number(opt("--vo2", 3.2)); // mL/kg/min, whole body
const RQ = Number(opt("--rq", 0.82));
const MAP_TARGET = Number(opt("--map", 82));
const HR_TARGET = Number(opt("--hr", 65));
const VEN_U = Number(opt("--ven-u", 0.95)); // grid 2026-11-27 (with rvdia): 1.0/0.95/0.9/0.85
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
      M.Metabolism.vo2 = VO2_TOTAL - mob;
      M.Metabolism.resp_q = RQ;
      this.why = `whole-body VO2 ${VO2_TOTAL} mL/kg/min = Metabolism ${M.Metabolism.vo2.toFixed(3)} + Mob ${mob.toFixed(3)}, resp_q ${RQ}`;
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
  preload: {
    why: `systemic venous + venular unstressed volume x${VEN_U}`,
    apply(M) {
      const C = M.Circulation;
      for (const n of [...C.systemic_veins, ...C.systemic_venules]) M[n].u_vol *= VEN_U;
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
const DEFAULT = ["blood", "metabolism", "map", "hr", "svr", "artery", "preload", "rvdia", "shunt", "beds", "kidney", "chemistry", "vent", "glucose", "thermo"]; // "frc" is opt-in: u_vol x0.8 moved FRC only 38.0 -> 35.4 (target 30, grade C)
const active = pick === "none" ? [] : pick === "all" ? DEFAULT : pick.split(",");
for (const k of active) if (!LEVERS[k]) { say(`unknown lever ${k}; known: ${Object.keys(LEVERS).join(", ") || "(none yet)"}`); process.exit(1); }

// --- build --------------------------------------------------------------------------------------
const dir = new URL("../model_definitions/", import.meta.url);
const j = JSON.parse(fs.readFileSync(new URL(`${SOURCE}.json`, dir), "utf8"));
const sz = applySize(j.model_definition);
applyDrives(j.model_definition);
say(`size: ${sz.n} components scaled; non-heart blood renormalised x${sz.fix.toFixed(3)}; ratios Q ${QF.toFixed(2)}, ` +
  `R sys ${RF.sys.toFixed(3)} pulm ${RF.pulm.toFixed(4)}, V blood ${VS.blood.toFixed(2)} LV ${VS.lv.toFixed(2)} RV ${VS.rv.toFixed(2)}; drives ${JSON.stringify(DRIVES)}`);
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
reanchorKidney(); dbg("after kidney");
RA.reseedLactateThermo(ctx);
RA.reseedInterstitium(ctx);
for (let t = 0; t < PRE_FOLD; t += 60) { eng.calc(60); settleLevers.forEach((k) => LEVERS[k].apply(M, model)); }
reanchorMaintenance(); // after the kidney re-anchoring has settled (urine fell from ~2.5 to ~1 mL/kg/h once the myogenic set-point moved)
dbg("before baro");
RA.reanchorBaroreflex(ctx);
eng.calc(60);
dbg("after baro");
RA.reanchorChemoreflex(ctx);
reanchorBrain();
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

// Brain anchors at the adult resting state: the CO2 / O2-content references, baseline CPP and blood volume (ICP reference).
// Captured at the very end, once the ventilation trim has settled: captured earlier, a PaCO2 excursion between trims
// (41.5 vs 37.5 at rest) left the brain sensing "hypocapnia" (co2_factor 0.84, CBF 10.2 instead of 12).
function reanchorBrain() {
  const B = M.Brain;
  const a = RA.avgOver(ctx, 20, () => ({ pco2: M[B.co2_model]?.pco2, to2: M[B.o2_model]?.to2, cpp: B.cpp, cbv: B.cerebral_blood_volume }));
  const before = [B.co2_ref, B.o2_ref, B.cpp_setpoint, B.cbv0].map((x) => x?.toFixed?.(3));
  Object.assign(B, { co2_ref: a.pco2, o2_ref: a.to2, cpp_setpoint: a.cpp, cbv0: a.cbv, co2_factor: 1.0, o2_factor: 1.0 });
  log.push(`Brain co2_ref/o2_ref/cpp_setpoint/cbv0 ${before.join("/")} -> ${[a.pco2, a.to2, a.cpp, a.cbv].map((x) => x.toFixed(3)).join("/")}`);
}

// Kidney anchors: the myogenic set-point at the sensed renal perfusion pressure, the TGF set-point at the resting signal
function reanchorKidney() {
  const K = M.Kidneys;
  const a = RA.avgOver(ctx, 20, () => ({ p: K.sensed_pressure, tgf: K.tgf_signal }));
  const b = [K.myogenic_p_set, K.tgf_setpoint].map((x) => x?.toFixed?.(2));
  K.myogenic_p_set = a.p; K.tgf_setpoint = a.tgf;
  log.push(`Kidneys myogenic_p_set/tgf_setpoint ${b.join("/")} -> ${a.p.toFixed(2)}/${a.tgf.toFixed(2)}`);
}

// maintenance intake (Fluids) = the resting urine output, so the blood volume holds (as the 72 h baby: 1.35 vs urine ~1.4)
function reanchorMaintenance() {
  const F = M.Fluids, K = M.Kidneys;
  const u = RA.avgOver(ctx, 120, () => ({ urine: K.urine_flow })).urine * 60 / model.weight; // mL/min -> mL/kg/h
  log.push(`Fluids.maintenance_rate ${F.maintenance_rate.toFixed(3)} -> ${u.toFixed(3)} mL/kg/h (resting urine)`);
  F.maintenance_rate = u;
  // composition = the resting urine composition (plasma x (1 - fr_solute) / (1 - fr_water)), so every filtered solute's
  // intake matches its excretion (the baby's maintenance fluid is its urine composition too)
  const fl = F.fluids[F.maintenance_fluid] ?? (F.fluids[F.maintenance_fluid] = {});
  const frw = K.reabsorption_fraction, before = JSON.stringify(fl);
  for (const s of K.filterable_solutes) fl[s] = +(M.AA.solutes[s] * (1 - K._solute_reabs(s)) / (1 - frw)).toFixed(3);
  log.push(`Fluids.fluids.${F.maintenance_fluid} ${before} -> ${JSON.stringify(fl)}`);
}
