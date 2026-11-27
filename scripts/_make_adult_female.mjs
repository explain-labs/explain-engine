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
};
const pick = opt("--levers", "all");
const DEFAULT = ["blood"];
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
const model = eng.build(j.model_definition);
if (!model?.models) { say(`build failed`); process.exit(1); }
const M = model.models;
const log = [];
const ctx = { eng, M, model, log };
const snap = (tag) => { // 3 s means (pressures, flows), so the line is not one point of the cycle
  const a = RA.avgOver(ctx, 3, () => ({ map: M.AAR.pres, cvp: (M.RAIVCI.pres + M.RASVC.pres) / 2, pa: M.PA.pres, co: M.LV_AA.flow * 60, pco2: M.AA.pco2 ?? NaN }));
  say(`[${tag}] t=${model.model_time_total.toFixed(0)} s HR ${M.Monitor.heart_rate.toFixed(1)} MAP ${a.map.toFixed(1)} CVP ${a.cvp.toFixed(1)} ` +
    `PA ${a.pa.toFixed(1)} CO ${a.co.toFixed(2)} L/min SpO2 ${M.Monitor.sao2_pre.toFixed(1)} RR ${M.Breathing.resp_rate.toFixed(1)} ` +
    `Vt ${(M.Breathing.exp_tidal_volume * 1000).toFixed(0)} mL pCO2 ${a.pco2.toFixed(1)}`);
};
for (let t = 0; t < 60; t += 20) { eng.calc(17); snap("load"); }

for (const k of active) { LEVERS[k].apply(M, model); say(`lever ${k}: ${LEVERS[k].why}`); }
RA.reseedInterstitium(ctx);
const settleLevers = active.filter((k) => LEVERS[k].settle);
for (let t = 0; t < SETTLE; t += 60) { eng.calc(Math.min(60, SETTLE - t)); settleLevers.forEach((k) => LEVERS[k].apply(M, model)); snap("settle"); }

// --- re-anchor ----------------------------------------------------------------------------------
RA.reanchorBaroreflex(ctx);
eng.calc(60);
RA.reanchorChemoreflex(ctx);
RA.reanchorHormonesGlucose(ctx);
reanchorBrainKidney();
RA.reseedLactateThermo(ctx);
RA.reseedInterstitium(ctx);
RA.relearnHeartFunction(ctx);
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

// Brain and Kidney anchors at the adult resting state: the brain's CO2 / O2-content references, baseline CPP and
// blood volume (ICP reference); the kidney's myogenic set-point at the sensed renal perfusion pressure
function reanchorBrainKidney() {
  const B = M.Brain, K = M.Kidneys;
  const a = RA.avgOver(ctx, 20, () => ({ pco2: M[B.co2_model]?.pco2, to2: M[B.o2_model]?.to2, cpp: B.cpp, cbv: B.cerebral_blood_volume, p: K.sensed_pressure }));
  const before = [B.co2_ref, B.o2_ref, B.cpp_setpoint, B.cbv0, K.myogenic_p_set].map((x) => x?.toFixed?.(3));
  Object.assign(B, { co2_ref: a.pco2, o2_ref: a.to2, cpp_setpoint: a.cpp, cbv0: a.cbv });
  K.myogenic_p_set = a.p;
  log.push(`Brain co2_ref/o2_ref/cpp_setpoint/cbv0, Kidneys.myogenic_p_set ${before.join("/")} -> ${[a.pco2, a.to2, a.cpp, a.cbv, a.p].map((x) => x.toFixed(3)).join("/")}`);
}
