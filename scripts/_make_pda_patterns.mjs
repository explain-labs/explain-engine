// Build the PDA Doppler-pattern demonstration scenarios from the calibrated term_neonate baseline.
//
// Reproduces the trans-ductal Doppler shunt patterns in public/flow_patterns/PDA_flow_patterns.png
// (continuous patterns) and public/pda/BidirectionalPDA.pdf (the two bidirectional panels) using the
// single-resistor quadratic-stenosis Pda model (ΔP = R·Q + B·Q²):
//
//   pda_pht_bidirectional            (A)  restrictive bidirectional (PHT): tight short duct holds a
//                                         large systolic PA-Ao gradient -> high-velocity systolic R->L
//                                         (~2 m/s, suprasystemic PA) + lower-velocity diastolic L->R
//   pda_bidirectional_unrestrictive  (A2) unrestrictive bidirectional: wide duct equalizes pressures,
//                                         LOW velocities, systolic R->L (~0.5 m/s) + diastolic L->R
//   pda_pulsatile_hspda              (B)  pulsatile, unrestrictive haemodynamically significant duct
//   pda_restrictive_growing          (C)  "growing"  — restrictive continuous L->R, milder velocity
//   pda_restrictive_closing          (D)  "closing"  — restrictive continuous L->R, higher velocity
//
// Levers (all supported by the current model): Pda.diameter_relative / length / discharge_coeff for
// duct geometry + orifice, pulmonary_resistances scaling for the mean systemic->pulmonary gradient
// (sets shunt DIRECTION / bidirectionality), and an optional Heart.cont_factor_right (cont_right) that
// widens the PA pulse (tall systolic spike, low diastolic floor) so the bidirectional panels can cross
// PA above Ao in systole (R->L) while Ao stays above PA in diastole (L->R). term_neonate already has
// adequate systemic pressure (AA ~72/47, PA ~28/17), so no baroreflex-setpoint lift is needed.
// Validate against the cardiac-phase-resolved output of scripts/probe_pda.mjs.
//
// Un-warmed output (like _make_restrictive_pda.mjs); warm to steady state with:
//   node scripts/reseed_preterm.mjs --file pda_<key> --write
//
// Usage:
//   node scripts/_make_pda_patterns.mjs <key>          (one pattern)
//   node scripts/_make_pda_patterns.mjs --all          (all patterns)

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

// ---- per-pattern lever table (starting points; tune against probe_pda.mjs) ----
const PATTERNS = {
  pda_pht_bidirectional: {
    panel: "A",
    diameter_relative: 0.2, length: 2.0, discharge_coeff: 0.5, pvr_scale: 2.35, cont_right: 2.78,
    desc: "term neonate with a restrictive bidirectional patent ductus arteriosus in pulmonary " +
      "hypertension: a tight short duct holds a large systolic PA-Ao gradient, producing a " +
      "high-velocity systolic RIGHT-TO-LEFT jet (~2 m/s, suprasystemic PA) with a lower-velocity " +
      "diastolic LEFT-TO-RIGHT component on Doppler",
  },
  pda_bidirectional_unrestrictive: {
    panel: "A2",
    diameter_relative: 0.6, length: 14, discharge_coeff: 0.9, pvr_scale: 2.2, cont_right: 1.52,
    desc: "term neonate with an unrestrictive bidirectional patent ductus arteriosus: a wide duct " +
      "rapidly equalizes aortic and pulmonary pressures, so velocities stay LOW and the small " +
      "residual gradient flips with the cardiac cycle — systolic RIGHT-TO-LEFT (~0.5 m/s) and " +
      "diastolic LEFT-TO-RIGHT (~0.6-0.75 m/s) on Doppler",
  },
  pda_pulsatile_hspda: {
    panel: "B",
    diameter_relative: 0.9, length: 14, discharge_coeff: 1.0, pvr_scale: 1.8,
    desc: "term neonate with an unrestrictive, haemodynamically significant patent ductus arteriosus: " +
      "wide low-velocity duct with a large left-to-right shunt and a PULSATILE Doppler pattern (tall " +
      "systolic peaks, low end-diastolic velocity, wide pulse pressure)",
  },
  pda_restrictive_growing: {
    panel: "C",
    diameter_relative: 0.15, length: 2.5, discharge_coeff: 0.6, pvr_scale: 1.0,
    desc: "term neonate with a restricting patent ductus arteriosus ('growing'/transitional pattern): " +
      "narrowing duct with continuous left-to-right flow and low pulsatility at moderate velocity",
  },
  pda_restrictive_closing: {
    panel: "D",
    diameter_relative: 0.13, length: 1.5, discharge_coeff: 0.5, pvr_scale: 0.5,
    desc: "term neonate with a closing (constricting) patent ductus arteriosus: small near-closed duct " +
      "with continuous high-velocity left-to-right flow and low pulsatility (restrictive Doppler pattern)",
  },
};

const argv = process.argv.slice(2);
const keys = argv.includes("--all") ? Object.keys(PATTERNS) : argv.filter((a) => !a.startsWith("-"));
if (keys.length === 0 || keys.some((k) => !PATTERNS[k])) {
  console.error(`usage: node scripts/_make_pda_patterns.mjs <key|--all>\nkeys: ${Object.keys(PATTERNS).join(", ")}`);
  process.exit(1);
}

let liveModel = null;
globalThis.self = globalThis;
globalThis.postMessage = (m) => { if (m && m.type === "state") liveModel = m.payload; };
const _log = console.log; console.log = () => {};
await import("../explain/ModelEngine.js");
const send = (t, msg, p) => self.onmessage({ data: { type: t, message: msg, payload: p } });

const srcPath = new URL("../public/model_definitions/term_neonate.json", import.meta.url);

for (const key of keys) {
  const cfg = PATTERNS[key];
  const j = JSON.parse(fs.readFileSync(srcPath, "utf8"));

  liveModel = null;
  send("POST", "build", j.model_definition);
  send("GET", "state", []);
  const model = liveModel;
  const log = [];

  // --- duct geometry / orifice ---
  const pda = model.models.Pda;
  pda.diameter_relative = cfg.diameter_relative;
  pda.length = cfg.length;
  pda.discharge_coeff = cfg.discharge_coeff;
  delete pda.jet_exponent; // stale key from the pre-quadratic model, if present
  log.push(`PDA: diameter_relative=${cfg.diameter_relative}, length=${cfg.length} mm, discharge_coeff=${cfg.discharge_coeff}`);

  // --- pulmonary vascular resistance (gradient / shunt-direction lever) ---
  if (cfg.pvr_scale !== 1.0) {
    send("POST", "scale", { group: "pulmonary_resistances", factor: cfg.pvr_scale });
    log.push(`PVR: pulmonary_resistances x${cfg.pvr_scale}`);
  }

  // --- RV contractility (widens PA pulse: tall systolic spike, low diastolic floor) ---
  // Lets the systolic PA-Ao gradient grow (systolic R->L jet) while PA diastolic stays below
  // aortic diastolic (diastolic L->R) — the waveform crossing that makes the duct bidirectional.
  if (cfg.cont_right && cfg.cont_right !== 1.0) {
    model.models.Heart.cont_factor_right = cfg.cont_right;
    log.push(`RV contractility: cont_factor_right=${cfg.cont_right}`);
  }

  // --- top-level metadata ---
  j.name = key;
  j.user = "timothy";
  j.description = cfg.desc;
  model.name = j.name;
  model.description = j.description;

  // --- serialize like Model._processModelState (un-warmed; reseed warms to steady state) ---
  delete model["DataCollector"]; delete model["TaskScheduler"]; delete model["ModelScaler"];
  delete model["_baseline_weight"]; delete model["diagram_definition"]; delete model["animation_definition"];
  for (const k in model) if (k.startsWith("ncc")) delete model[k];
  Object.values(model.models).forEach((m) => {
    for (const k in m) {
      if (k.startsWith("_")) delete m[k];
      if (k === "components" && Object.keys(m[k]).length > 0) {
        Object.keys(m[k]).forEach((cn) => { m.components[cn] = model.models[cn]; delete model.models[cn]; });
      }
    }
  });
  model.model_time_total = 0;

  j.model_definition = model;
  const out = JSON.stringify(j, null, 1) + "\n";
  JSON.parse(out);
  const dst = new URL(`../public/model_definitions/${key}.json`, import.meta.url);
  fs.writeFileSync(dst, out);
  _log(`wrote ${key}.json  (panel ${cfg.panel})\n  ${log.join("\n  ")}`);
}

console.log = _log;
