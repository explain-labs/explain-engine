// One-off transform: term_neonate.json -> term_neonate_cdh.json (severe left-sided CDH scenario).
// Re-runnable. Applies the topology + calibration; steady-state re-seeding is done afterwards by
// reseed_term_neonate_cdh.mjs (which warms the model and bakes the equilibrium gas/volume seeds).
//
//   node scripts/_make_term_neonate_cdh.mjs
//
// Congenital diaphragmatic hernia is a developmental lung disease: herniation of viscera into the
// (left) hemithorax produces pulmonary hypoplasia (ipsilateral worst, contralateral involved via
// mediastinal shift), persistent pulmonary hypertension of the newborn (PPHN) from a reduced +
// remodeled pulmonary vascular bed, right-to-left shunting through the patent ductus arteriosus and
// foramen ovale, and left-heart hypoplasia / dysfunction. Refs: mhnpjournal 10.1186/s40748-017-0045-1,
// PMC10999638 (PH phenotypes in CDH).
//
// Calibration was found with scripts/probe_vitals.mjs --profile neonate (plus a flows/sats probe).
// Operating point (severe but stabilized on the ventilator, FiO2 1.0):
//   HR 146, MAP 51, PAP mean 52 (≈Ao via wide-open duct = suprasystemic PVR), CI ~1.4,
//   ABG pH 7.29 / PCO2 47 / PO2 38 (permissive hypercapnia), pre-ductal SpO2 79% / post-ductal 66%
//   (differential cyanosis), R->L ductal shunt ~232 mL/min, asymmetric pulmonary flow (L 97 < R 191 mL/min).
import fs from "node:fs";

const src = new URL("../public/model_definitions/term_neonate.json", import.meta.url);
const dst = new URL("../public/model_definitions/term_neonate_cdh.json", import.meta.url);
const j = JSON.parse(fs.readFileSync(src, "utf8"));

// --- top-level metadata ---
j.name = "term_neonate_cdh";
j.user = "timothy";
j.description =
  "term 3.545 kg neonate with severe left-sided congenital diaphragmatic hernia: asymmetric pulmonary " +
  "hypoplasia (left>right), PPHN, right-to-left PDA/FO shunting, LV hypoplasia/dysfunction; intubated and ventilated";

const md = j.model_definition;
md.name = "term_neonate_cdh";
md.description = j.description;
const M = md.models;
const circ = M.Circulation.components;
const resp = M.Respiration.components;
const heart = M.Heart.components;
const log = [];

// A. Lung hypoplasia — asymmetric, left worse (Respiration.components) -------
// Reduce alveolar unstressed volume (fewer/smaller alveoli) and raise el_base (stiffer lung); cut the
// alveolar-capillary diffusion constants (reduced gas-exchange surface). Left lung is hypoplastic,
// right lung involved via mediastinal shift.
resp.ALL.u_vol = 0.010; resp.ALL.el_base = 450;   // left lung gas: severe hypoplasia, stiff
resp.ALR.u_vol = 0.026; resp.ALR.el_base = 260;   // right lung gas: contralateral involvement
resp.GASEX_LL.dif_o2 = 0.0005; resp.GASEX_LL.dif_co2 = 0.003;   // ~50% reduced left
resp.GASEX_RL.dif_o2 = 0.0008; resp.GASEX_RL.dif_co2 = 0.0045;  // ~25% reduced right
log.push(`Hypoplasia: ALL u_vol/el ${resp.ALL.u_vol}/${resp.ALL.el_base}, ALR ${resp.ALR.u_vol}/${resp.ALR.el_base}; GASEX_LL/RL dif_o2 ${resp.GASEX_LL.dif_o2}/${resp.GASEX_RL.dif_o2}`);

// B. PPHN — raised PVR + reduced left vascular bed (Circulation.components) --
// The pulmonary BloodVessel compartments OWN their inlet resistor (BloodVessel adopts the same-named
// top-level Resistor and overwrites r_for from r_for_eff each step), so the PVR lever is the
// compartment r_for/r_back. Left side ~4.7x baseline, right ~2.7x; also drop left bed volume.
const pvr = { PAAL: 7000, LL_ART: 7000, LL_CAP: 1500, PAAR: 4000, RL_ART: 4000, RL_CAP: 1000 };
for (const [n, rf] of Object.entries(pvr)) { circ[n].r_for = rf; circ[n].r_back = rf; }
for (const n of ["PAAL", "LL_ART", "LL_CAP"]) circ[n].u_vol = Number((circ[n].u_vol * 0.6).toPrecision(9));
log.push(`PPHN: r_for L(PAAL/LL_ART/LL_CAP)=${pvr.PAAL}/${pvr.LL_ART}/${pvr.LL_CAP} R=${pvr.PAAR}/${pvr.RL_ART}/${pvr.RL_CAP}; left bed u_vol x0.6`);

// C. Right-to-left shunting — open fetal channels ---------------------------
M.Pda.diameter_relative = 1.0;   // wide-open ductus arteriosus (R->L when PVR suprasystemic)
M.Shunts.diameter_fo = 4;        // patent foramen ovale
M.Shunts.ips_res = 2000;         // increased intrapulmonary shunt (V/Q mismatch → venous admixture)
log.push(`Shunts: Pda.diameter_relative=${M.Pda.diameter_relative}, diameter_fo=${M.Shunts.diameter_fo}, ips_res=${M.Shunts.ips_res}`);

// D. LV hypoplasia / dysfunction (Heart) ------------------------------------
M.Heart.cont_factor_left = 0.8;    // reduced LV contractility
M.Heart.relax_factor_left = 1.2;   // impaired LV relaxation (↑LVEDP → pulmonary venous hypertension)
M.Heart.pc_el_factor = 1.2;        // mediastinal compression / pericardial constraint
heart.LV.u_vol = 0.0005; heart.LV.el_min = 1500;   // small, stiff hypoplastic LV
log.push(`LV: cont_left=${M.Heart.cont_factor_left} relax_left=${M.Heart.relax_factor_left} pc_el=${M.Heart.pc_el_factor}; LV u_vol/el_min ${heart.LV.u_vol}/${heart.LV.el_min}`);

// E. Intubated / ventilated — sedated/paralyzed on mandatory pressure control -
// FiO2 1.0, gentle ventilation (low PIP, permissive hypercapnia). Enabling the device is not enough:
// the engine only connects the ET tube to the patient inside Ventilator.switch_ventilator(true), which
// opens the ETT resistor, enables the circuit parts, and blocks the spontaneous airway (MOUTH_DS). We
// replicate that switched-on state in the JSON so the lungs are actually ventilated at load.
M.Breathing.breathing_enabled = false;
const V = M.Ventilator;
Object.assign(V, { is_enabled: true, fio2: 1.0, pip_cmh2o: 16, pip_cmh2o_max: 16,
  peep_cmh2o: 5, vent_rate: 26, vent_mode: "PC", synchronized: false });
for (const part of ["VENT_GASIN", "VENT_GASCIRCUIT", "VENT_GASOUT", "VENT_INSP_VALVE", "VENT_ETTUBE", "VENT_EXP_VALVE"]) {
  V.components[part].is_enabled = true;
  if ("no_flow" in V.components[part]) V.components[part].no_flow = false;
}
resp.MOUTH.components.MOUTH_DS.no_flow = true;   // spontaneous upper airway closed (intubated)
log.push(`Ventilator: ON FiO2=${V.fio2} PIP=${V.pip_cmh2o} PEEP=${V.peep_cmh2o} rate=${V.vent_rate} PC; ETT connected, MOUTH_DS blocked, Breathing off`);

fs.writeFileSync(dst, JSON.stringify(j, null, 1) + "\n");
console.log("wrote", dst.pathname);
console.log(log.join("\n"));
