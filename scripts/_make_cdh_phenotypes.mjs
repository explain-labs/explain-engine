// Build a family of congenital diaphragmatic hernia (CDH) neonate scenarios from the calibrated
// term_neonate baseline. CDH is a developmental disease with three coupled lesions — pulmonary
// hypoplasia (ipsilateral worst, contralateral involved via mediastinal shift), pulmonary hypertension
// (PPHN), and cardiac (especially LV) dysfunction — but the modern literature stresses that CDH-PH is
// NOT one physiology: it splits into hemodynamic phenotypes that demand different management. We model
// three left-sided CDH variants (left-sided ≈ 85% of cases), all intubated & ventilated:
//
//   cdh_severe          pre-capillary / PVR-dominant: suprasystemic PVR, dominant R->L ductal + FO shunt,
//                       differential cyanosis, FiO2 1.0 — the "classic severe" CDH.
//   cdh_moderate        milder hypoplasia, ~systemic PVR: mild/bidirectional shunt, oxygenates better,
//                       weanable — the contrast case.
//   cdh_lv_dysfunction  post-capillary / LV-dominant: LV hypoplasia + high LVEDP -> pulmonary venous
//                       hypertension; L->R (or near-zero) atrial shunt with R->L ductal RV-offload — the
//                       phenotype where pulmonary vasodilators (iNO) can WORSEN things by flooding a
//                       stiff LV.
//
// Refs (PubMed): Chaudhari Front Pediatr 2024 10.3389/fped.2024.1356157, Bhombal & Patel Semin Fetal
// Neonatal Med 2022 10.1016/j.siny.2022.101383, Holden Semin Pediatr Surg 2024
// 10.1016/j.sempedsurg.2024.151437, Chandrasekharan review 2017 10.1186/s40748-017-0045-1.
//
// Lever groups (see term_neonate baseline; same set as the deleted _make_term_neonate_cdh.mjs):
//   A lungs  Respiration.components ALL/ALR u_vol+el_base (hypoplasia, left worst) + GASEX_LL/RL dif
//   B PVR    Circulation.components PAAL/LL_ART/LL_CAP / PAAR/RL_ART/RL_CAP r_for/r_back (the pulmonary
//            BloodVessel adopts its same-named resistor, so the compartment r_for IS the PVR lever) +
//            left-bed u_vol scaling
//   C shunts Pda.diameter_relative, Shunts.diameter_fo, Shunts.ips_res
//   D LV     Heart.cont_factor_left / relax_factor_left / pc_el_factor + Heart.components.LV u_vol/el_min
//   E vent   replicate Ventilator.switch_ventilator(true) in static JSON (see applyVentilator)
//
// Un-warmed output; warm each to its operating point with:
//   node scripts/reseed_cdh_phenotypes.mjs <key|--all> --write
// then calibrate with scripts/probe_vitals.mjs --profile neonate, probe_pda.mjs and probe_cdh.mjs.
//
// Usage:
//   node scripts/_make_cdh_phenotypes.mjs <key>     (one phenotype)
//   node scripts/_make_cdh_phenotypes.mjs --all      (all)

import fs from "node:fs";

// ---- per-phenotype lever table (starting points; tune against the probes) -------------------------
const PHENO = {
  cdh_severe: {
    // ipsilateral (left) lung severely hypoplastic + stiff; right involved via mediastinal shift
    lungs: { ALL: [0.010, 450], ALR: [0.026, 260], GASEX_LL: [0.0005, 0.003], GASEX_RL: [0.0008, 0.0045] },
    // suprasystemic PVR, left bed worst; reduced left vascular bed volume
    pvr: { PAAL: 7000, LL_ART: 7000, LL_CAP: 1500, PAAR: 4000, RL_ART: 4000, RL_CAP: 1000 },
    leftBedVolFactor: 0.6,
    shunts: { pda: 1.0, fo: 4, ips_res: 2000 },
    lv: { cont_left: 0.8, relax_left: 1.2, pc_el: 1.2, u_vol: 0.0005, el_min: 1500 },
    vent: { fio2: 1.0, pip: 16, peep: 5, rate: 26 },
    desc: "term 3.5 kg neonate with severe left-sided congenital diaphragmatic hernia, pre-capillary " +
      "(PVR-dominant) phenotype: marked asymmetric pulmonary hypoplasia (left>right), suprasystemic " +
      "pulmonary vascular resistance with dominant right-to-left ductal and atrial shunting and " +
      "differential cyanosis; intubated and ventilated on FiO2 1.0",
  },
  cdh_moderate: {
    // milder hypoplasia, better gas-exchange surface
    lungs: { ALL: [0.018, 300], ALR: [0.032, 220], GASEX_LL: [0.0008, 0.0045], GASEX_RL: [0.0009, 0.005] },
    // PVR elevated toward ~systemic, not suprasystemic
    pvr: { PAAL: 4000, LL_ART: 4000, LL_CAP: 900, PAAR: 2500, RL_ART: 2500, RL_CAP: 700 },
    leftBedVolFactor: 0.8,
    shunts: { pda: 0.6, fo: 3, ips_res: 3000 },
    lv: { cont_left: 0.95, relax_left: 1.05, pc_el: 1.05, u_vol: 0.000733, el_min: 1137 }, // ~baseline LV
    vent: { fio2: 0.5, pip: 14, peep: 5, rate: 26 },
    desc: "term 3.5 kg neonate with moderate left-sided congenital diaphragmatic hernia: milder " +
      "asymmetric pulmonary hypoplasia, pulmonary vascular resistance elevated toward systemic with a " +
      "small bidirectional ductal shunt; oxygenates on moderate FiO2 and is potentially weanable — the " +
      "contrast case to the severe phenotype; intubated and ventilated",
  },
  cdh_lv_dysfunction: {
    // moderate lungs / PVR — the defining lesion is the LEFT HEART, not the pulmonary bed
    lungs: { ALL: [0.014, 360], ALR: [0.030, 240], GASEX_LL: [0.0007, 0.004], GASEX_RL: [0.0009, 0.005] },
    pvr: { PAAL: 4500, LL_ART: 4500, LL_CAP: 1000, PAAR: 3000, RL_ART: 3000, RL_CAP: 800 },
    leftBedVolFactor: 0.7,
    shunts: { pda: 1.0, fo: 4, ips_res: 2500 }, // R->L ductal offloads the RV; atrial shunt emerges L->R
    // LV-DOMINANT but sustainable: the defining lesion is DIASTOLIC dysfunction (stiff, poorly-relaxing
    // small ventricle -> high LVEDP -> high LA -> pulmonary venous hypertension), with only mild systolic
    // depression so forward output stays survivable (not cardiogenic shock).
    lv: { cont_left: 0.82, relax_left: 1.45, pc_el: 1.2, u_vol: 0.0005, el_min: 1800 },
    vent: { fio2: 0.7, pip: 16, peep: 5, rate: 26 },
    desc: "term 3.5 kg neonate with left-sided congenital diaphragmatic hernia, post-capillary " +
      "(LV-dominant) phenotype: left ventricular hypoplasia and dysfunction with elevated end-diastolic " +
      "pressure drive pulmonary venous hypertension; the atrial shunt runs left-to-right (high left " +
      "atrial pressure) while the ductus shunts right-to-left to offload the right ventricle — the " +
      "phenotype where pulmonary vasodilators may worsen pulmonary oedema; intubated and ventilated",
  },
};

const argv = process.argv.slice(2);
const keys = argv.includes("--all") ? Object.keys(PHENO) : argv.filter((a) => !a.startsWith("-"));
if (keys.length === 0 || keys.some((k) => !PHENO[k])) {
  console.error(`usage: node scripts/_make_cdh_phenotypes.mjs <key|--all>\nkeys: ${Object.keys(PHENO).join(", ")}`);
  process.exit(1);
}

const srcPath = new URL("../public/model_definitions/term_neonate.json", import.meta.url);

// Replicate Ventilator.switch_ventilator(true) in the static definition: enabling the device is not
// enough — the engine only connects the ET tube to the patient inside switch_ventilator, which opens the
// ETT/valve resistors, enables the circuit parts and blocks the spontaneous upper airway (MOUTH_DS).
function applyVentilator(M, vent) {
  M.Breathing.breathing_enabled = false;
  const V = M.Ventilator;
  Object.assign(V, {
    is_enabled: true, fio2: vent.fio2, pip_cmh2o: vent.pip, pip_cmh2o_max: vent.pip,
    peep_cmh2o: vent.peep, vent_rate: vent.rate, vent_mode: "PC", synchronized: false,
  });
  for (const part of ["VENT_GASIN", "VENT_GASCIRCUIT", "VENT_GASOUT", "VENT_INSP_VALVE", "VENT_ETTUBE", "VENT_EXP_VALVE"]) {
    V.components[part].is_enabled = true;
    if ("no_flow" in V.components[part]) V.components[part].no_flow = false;
  }
  M.Respiration.components.MOUTH.components.MOUTH_DS.no_flow = true; // spontaneous upper airway closed
}

for (const key of keys) {
  const cfg = PHENO[key];
  const j = JSON.parse(fs.readFileSync(srcPath, "utf8"));

  j.name = key;
  j.user = "timothy";
  j.description = cfg.desc;

  const md = j.model_definition;
  md.name = key;
  md.description = cfg.desc;
  const M = md.models;
  const circ = M.Circulation.components;
  const resp = M.Respiration.components;
  const heart = M.Heart.components;
  const log = [];

  // A. Lung hypoplasia (asymmetric, left worst) ------------------------------------------------------
  for (const [comp, [u_vol, el_base]] of Object.entries(cfg.lungs)) {
    if (comp.startsWith("GASEX")) { resp[comp].dif_o2 = u_vol; resp[comp].dif_co2 = el_base; }
    else { resp[comp].u_vol = u_vol; resp[comp].el_base = el_base; }
  }
  log.push(`A lungs: ALL ${cfg.lungs.ALL}, ALR ${cfg.lungs.ALR}; GASEX_LL dif ${cfg.lungs.GASEX_LL}, GASEX_RL ${cfg.lungs.GASEX_RL}`);

  // B. PPHN — raised PVR (compartment r_for/r_back) + reduced left vascular bed -----------------------
  for (const [n, rf] of Object.entries(cfg.pvr)) { circ[n].r_for = rf; circ[n].r_back = rf; }
  for (const n of ["PAAL", "LL_ART", "LL_CAP"]) circ[n].u_vol = Number((circ[n].u_vol * cfg.leftBedVolFactor).toPrecision(9));
  log.push(`B PVR: L(PAAL/LL_ART/LL_CAP)=${cfg.pvr.PAAL}/${cfg.pvr.LL_ART}/${cfg.pvr.LL_CAP} R=${cfg.pvr.PAAR}/${cfg.pvr.RL_ART}/${cfg.pvr.RL_CAP}; left bed u_vol x${cfg.leftBedVolFactor}`);

  // C. Right-to-left shunting — open fetal channels --------------------------------------------------
  M.Pda.diameter_relative = cfg.shunts.pda;
  M.Shunts.diameter_fo = cfg.shunts.fo;
  M.Shunts.ips_res = cfg.shunts.ips_res;
  log.push(`C shunts: Pda.diameter_relative=${cfg.shunts.pda}, diameter_fo=${cfg.shunts.fo}, ips_res=${cfg.shunts.ips_res}`);

  // D. LV hypoplasia / dysfunction -------------------------------------------------------------------
  M.Heart.cont_factor_left = cfg.lv.cont_left;
  M.Heart.relax_factor_left = cfg.lv.relax_left;
  M.Heart.pc_el_factor = cfg.lv.pc_el;
  heart.LV.u_vol = cfg.lv.u_vol;
  heart.LV.el_min = cfg.lv.el_min;
  log.push(`D LV: cont_left=${cfg.lv.cont_left} relax_left=${cfg.lv.relax_left} pc_el=${cfg.lv.pc_el}; LV u_vol/el_min ${cfg.lv.u_vol}/${cfg.lv.el_min}`);

  // E. Intubated / ventilated ------------------------------------------------------------------------
  applyVentilator(M, cfg.vent);
  log.push(`E vent: ON FiO2=${cfg.vent.fio2} PIP=${cfg.vent.pip} PEEP=${cfg.vent.peep} rate=${cfg.vent.rate} PC; ETT connected, MOUTH_DS blocked, Breathing off`);

  const dst = new URL(`../public/model_definitions/${key}.json`, import.meta.url);
  fs.writeFileSync(dst, JSON.stringify(j, null, 1) + "\n");
  console.log(`wrote ${key}.json\n  ${log.join("\n  ")}`);
}
