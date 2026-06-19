// One-off transform: term_neonate.json -> term_fetus.json (fetal-circulation scenario).
// Re-runnable. Applies the topology + calibration; steady-state re-seeding is done afterwards by
// reseed_term_fetus.mjs (which warms the model and bakes the equilibrium gas/volume seeds).
//
//   node scripts/_make_term_fetus.mjs
//
// Calibration was found with scripts/probe_fetus.mjs (see that file's flags). Operating point:
//   HR 145, MAP 51, PA≈Ao, CVO ~341 mL/kg/min, RV:LV 51:49,
//   placental flow 42% / pulmonary 13% / DA 38% (PA->Ao) / FO 36% (R->L),
//   O2 gradient UV 80% > IVC 64% > AA 62% > AD 57%, umbilical-artery gas pH 7.27 / PCO2 50 / BE -5.
import fs from "node:fs";

const src = new URL("../public/model_definitions/term_neonate.json", import.meta.url);
const dst = new URL("../public/model_definitions/term_fetus.json", import.meta.url);
const j = JSON.parse(fs.readFileSync(src, "utf8"));

// --- top-level metadata ---
j.name = "term_fetus";
j.user = "timothy";
j.description =
  "term fetus in utero (3.545 kg, 40 wk) — fetal circulation: placental gas exchange, wide-open ductus arteriosus and foramen ovale, high pulmonary vascular resistance, inert (fluid-filled) lungs";

const md = j.model_definition;
const M = md.models;
const log = [];

// A. Placenta is the gas-exchange organ --------------------------------------
// Resistances tuned for ~42% of combined output through the umbilical circuit; the gas-exchanger
// fully equilibrates fetal capillary blood to the (fixed) maternal pool, so mat_to2/mat_tco2 set the
// achievable umbilical-vein gas (maternal PCO2 ~30 → pregnancy-like; mat_to2 6.85 → UV SaO2 ~80%).
const PL = M.Placenta;
PL.placenta_running = true;
PL.umb_clamped = false;
PL.umb_art_res = 680;   // umbilical artery resistance (mmHg*s/L)
PL.umb_ven_res = 100;   // umbilical vein resistance (unchanged)
PL.plf_res = 1500;      // fetal-placenta resistance
PL.dif_o2 = 0.03;       // placental O2 diffusion
PL.dif_co2 = 0.04;      // placental CO2 diffusion
PL.mat_to2 = 7.4;       // maternal pool O2 content (with fetal HbF → UV SaO2 ~88%, brain SaO2 ~65%)
PL.mat_tco2 = 21;       // maternal pool CO2 content (→ maternal/UV PCO2 ~30)
log.push(`Placenta: running, plf_res=${PL.plf_res} umb_art_res=${PL.umb_art_res} dif_o2=${PL.dif_o2} dif_co2=${PL.dif_co2} mat_to2=${PL.mat_to2} mat_tco2=${PL.mat_tco2}`);

// B. Ductus arteriosus wide open ---------------------------------------------
M.Pda.diameter_relative = 1.0;
log.push(`Pda: diameter_relative=${M.Pda.diameter_relative}`);

// C. Foramen ovale open; intrapulmonary shunts closed ------------------------
M.Shunts.diameter_fo = 6.0;     // mm; VSD stays 0
M.Shunts.ips_res = 1e8;         // close the intrapulmonary shunts (IPSL/IPSR) — fetal lung flow is all
                                // capillary; otherwise IPS adds a parallel low-R path inflating pulm flow
log.push(`Shunts: diameter_fo=${M.Shunts.diameter_fo} fo_lr_factor=${M.Shunts.fo_lr_factor} ips_res=${M.Shunts.ips_res} (IPS closed)`);

// D. High pulmonary vascular resistance (fluid-filled fetal lungs) ------------
// The pulmonary BloodVessel compartments OWN their inlet resistor (BloodVessel adopts the same-named
// top-level Resistor and overwrites its r_for from r_for_eff each step), so the PVR lever is the
// compartment r_for/r_back — NOT the top-level resistor. x21 (with IPS closed) → pulmonary flow ~8% of CVO.
const PVR_FACTOR = 21.0;
const pulmComps = ["PAAL", "PAAR", "LL_ART", "RL_ART", "LL_CAP", "RL_CAP"];
const circ = M.Circulation.components;
for (const n of pulmComps) {
  const m = circ[n] || M[n];
  m.r_for *= PVR_FACTOR;
  m.r_back *= PVR_FACTOR;
}
log.push(`PVR: x${PVR_FACTOR} on ${pulmComps.join(",")} (BloodVessel r_for/r_back)`);

// E. Inert lungs: no spontaneous breathing, no alveolar gas exchange ---------
// The fetal lung is fluid-filled and does not exchange gas. Disabling the GASEX BloodDiffusor's
// is_enabled does NOT stick (the build re-enables BloodDiffusors), so make the lung inert robustly by
// zeroing the diffusion constants — effective diffusion = dif * factor = 0 regardless of is_enabled.
M.Breathing.is_enabled = false;
M.Breathing.breathing_enabled = false;
const resp = M.Respiration.components;
for (const n of ["GASEX_LL", "GASEX_RL"]) {
  const m = resp[n] || M[n];
  if (m) { m.dif_o2 = 0; m.dif_co2 = 0; }
}
log.push(`Lungs inert: Breathing off, GASEX_LL/RL dif_o2=dif_co2=0 (fluid-filled lung)`);

// F. Fetal haemoglobin (HbF) — left-shifted O2 dissociation curve -------------
// The blood-gas solver reads a per-compartment P50_0 (O2-Hb affinity baseline). Set the fetal body to
// HbF (P50 18.8) so SaO2 is high at the correct LOW fetal pO2; keep the maternal placental pool (PL_MAT)
// at the unchanged affinity so the placental gas-exchange target is not perturbed.
M.Blood.P50_0 = 18.8;
M.Placenta.components.PL_MAT.P50_0 = 20.0;
log.push(`HbF: Blood.P50_0=${M.Blood.P50_0} (fetal); PL_MAT.P50_0=${M.Placenta.components.PL_MAT.P50_0} (maternal pool)`);

// H. heart_rate_ref left at 145 (gives HR ~145); ANS active.
// I. AD_PL_UMB_ART stays disabled — umbilical inflow is PL_UMB_ART's own input resistor from AD.
log.push(`AD_PL_UMB_ART is_enabled=${M.AD_PL_UMB_ART.is_enabled} (kept disabled; inflow via PL_UMB_ART.inputs)`);

fs.writeFileSync(dst, JSON.stringify(j, null, 1) + "\n");
console.log("wrote", dst.pathname);
console.log(log.join("\n"));
