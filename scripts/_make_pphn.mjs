// Build a dedicated persistent-pulmonary-hypertension-of-the-newborn (PPHN) virtual patient from the
// calibrated term_neonate baseline. Unlike the CDH family (which couples PPHN to pulmonary hypoplasia and
// LV dysfunction) and unlike the pda_*_rtl Doppler-pattern demos (which shape a single ductal waveform),
// this scenario models the *canonical idiopathic / vascular PPHN physiology*: a structurally NORMAL heart
// and near-normal lung mechanics, with a maladapted, remodelled pulmonary vascular bed that keeps
// pulmonary vascular resistance suprasystemic after birth. The high PVR drives extrapulmonary
// right-to-left shunting at BOTH the ductus arteriosus and the foramen ovale, producing labile hypoxemia
// and differential cyanosis (pre- > post-ductal SpO2) despite a high inspired oxygen fraction.
//
// This is the "range of patients" PPHN entry for the thesis validation chapter (Ch 7.5). It is deliberately
// distinct from cdh_severe: SYMMETRIC (diffuse) PVR rather than asymmetric hypoplasia-driven PVR, NO lung
// hypoplasia (lungs left at baseline volumes/elastance), and NO left-heart lesion.
//
// Physiology & diagnostic criteria (per PubMed):
//   - Singh & Lakshminrusimha, Clin Perinatol 2021;48(3):595-618  doi:10.1016/j.clp.2021.05.009
//       "high pulmonary vascular resistance with extrapulmonary right-to-left shunts causing hypoxemia"
//   - Sharma, Berkelhamer & Lakshminrusimha, Matern Health Neonatol Perinatol 2015;1:14
//       doi:10.1186/s40748-015-0015-4 — echo criteria: right-to-left/bidirectional shunt at the ductus
//       OR foramen ovale, AND absence of structural heart disease (the two features this scenario encodes).
//   - Sankaran & Lakshminrusimha, Semin Fetal Neonatal Med 2022;27(4):101381
//       doi:10.1016/j.siny.2022.101381 — etiology/pathogenesis (failed transitional PVR fall).
//   - Fuloria & Aschner, Semin Fetal Neonatal Med 2017;22(4):220-226 doi:10.1016/j.siny.2017.03.004.
//
// Approximate operating-point targets for a severe term (~3.5 kg) idiopathic PPHN on conventional
// ventilation at FiO2 1.0 (validate with the probes; PAP-HIGH and SpO2/PaO2-LOW flags vs the neonate
// normal-range table are EXPECTED — this is a disease state, not a "normal" patient):
//   HR ~150-165 /min,  MAP ~45-55 mmHg,  PAP mean >= MAP (suprasystemic),  PA systolic ~60-75 mmHg,
//   SpO2 pre ~85-92 % / post ~72-85 % (differential >= 5-10 %),  PaO2 (pre-ductal) ~35-50 mmHg,
//   pH ~7.25-7.35, PaCO2 ~40-50 mmHg, BE mildly negative.
//
// Lever groups (same substrate as _make_cdh_phenotypes.mjs, minus the hypoplasia/LV groups):
//   B PVR    Circulation.components PAAL/LL_ART/LL_CAP + PAAR/RL_ART/RL_CAP r_for/r_back, SYMMETRIC
//            (the pulmonary BloodVessel adopts its same-named resistor, so the compartment r_for IS PVR).
//   C shunts Pda.diameter_relative (R->L ductal), Shunts.diameter_fo (R->L atrial), Shunts.ips_res
//            (a modest intrapulmonary-shunt / V-Q-mismatch component, milder than CDH).
//   E vent   replicate Ventilator.switch_ventilator(true) in static JSON (see applyVentilator).
//   (No group A lungs hypoplasia, no group D LV lesion — heart & lung structure are normal.)
//
// Un-warmed output; warm to the operating point with:
//   node scripts/reseed_preterm.mjs --file pphn --write
// then validate with:
//   node scripts/probe_vitals.mjs pphn --profile neonate
//   node scripts/probe_cdh.mjs pphn          (generic shunt/atrial-pressure + suprasystemic read-out)
//   node scripts/probe_pda.mjs pphn          (cardiac-phase-resolved ductal Doppler)
//
// Usage:  node scripts/_make_pphn.mjs [--write]   (writes public/model_definitions/pphn.json)

import fs from "node:fs";

const cfg = {
  // suprasystemic, DIFFUSE (symmetric) pulmonary vascular resistance — PPHN is not asymmetric like CDH
  pvr: { PAAL: 6000, LL_ART: 6000, LL_CAP: 1300, PAAR: 6000, RL_ART: 6000, RL_CAP: 1300 },
  // open fetal channels, both shunting right-to-left; a smaller atrial (FO) shunt keeps pre-ductal
  // saturation up while the ductal R->L drives a clear pre-/post-ductal differential; modest
  // intrapulmonary shunt (higher ips_res => less admixture) for a realistic V-Q-mismatch component
  shunts: { pda: 1.0, fo: 2.5, ips_res: 6000 },
  vent: { fio2: 1.0, pip: 14, peep: 5, rate: 30 },
  desc:
    "term 3.5 kg neonate with severe idiopathic persistent pulmonary hypertension of the newborn (PPHN): " +
    "a structurally normal heart and near-normal lung parenchyma with a maladapted, remodelled pulmonary " +
    "vascular bed that keeps pulmonary vascular resistance diffusely suprasystemic after birth. The high " +
    "resistance drives extrapulmonary right-to-left shunting at both the ductus arteriosus and the foramen " +
    "ovale, producing labile hypoxemia and differential cyanosis (pre- > post-ductal oxygen saturation) " +
    "despite ventilation on FiO2 1.0; intubated and ventilated",
};

// Replicate Ventilator.switch_ventilator(true) in the static definition: enabling the device is not
// enough — the engine only connects the ET tube to the patient inside switch_ventilator, which opens the
// ETT/valve resistors, enables the circuit parts and blocks the spontaneous upper airway (MOUTH_DS).
// (Identical to _make_cdh_phenotypes.mjs applyVentilator.)
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

const WRITE = process.argv.includes("--write");
const srcPath = new URL("../public/model_definitions/term_neonate.json", import.meta.url);
const j = JSON.parse(fs.readFileSync(srcPath, "utf8"));

j.name = "pphn";
j.user = "timothy";
j.description = cfg.desc;

const md = j.model_definition;
md.name = "pphn";
md.description = cfg.desc;
const M = md.models;
const circ = M.Circulation.components;
const log = [];

// B. PPHN — raised PVR (compartment r_for/r_back), symmetric across both lungs ------------------------
for (const [n, rf] of Object.entries(cfg.pvr)) { circ[n].r_for = rf; circ[n].r_back = rf; }
log.push(`B PVR (symmetric): PAAL/LL_ART/LL_CAP=${cfg.pvr.PAAL}/${cfg.pvr.LL_ART}/${cfg.pvr.LL_CAP}  PAAR/RL_ART/RL_CAP=${cfg.pvr.PAAR}/${cfg.pvr.RL_ART}/${cfg.pvr.RL_CAP}`);

// C. Extrapulmonary right-to-left shunting — open fetal channels -------------------------------------
M.Pda.diameter_relative = cfg.shunts.pda;
M.Shunts.diameter_fo = cfg.shunts.fo;
M.Shunts.ips_res = cfg.shunts.ips_res;
log.push(`C shunts: Pda.diameter_relative=${cfg.shunts.pda}, diameter_fo=${cfg.shunts.fo}, ips_res=${cfg.shunts.ips_res}`);

// E. Intubated / ventilated --------------------------------------------------------------------------
applyVentilator(M, cfg.vent);
log.push(`E vent: ON FiO2=${cfg.vent.fio2} PIP=${cfg.vent.pip} PEEP=${cfg.vent.peep} rate=${cfg.vent.rate} PC; ETT connected, MOUTH_DS blocked, Breathing off`);

const dst = new URL("../public/model_definitions/pphn.json", import.meta.url);
const out = JSON.stringify(j, null, 1) + "\n";
if (WRITE) { fs.writeFileSync(dst, out); console.log(`wrote pphn.json\n  ${log.join("\n  ")}`); }
else { const tmp = "/tmp/pphn.json"; fs.writeFileSync(tmp, out); console.log(`dry run -> ${tmp} (pass --write to commit)\n  ${log.join("\n  ")}`); }
