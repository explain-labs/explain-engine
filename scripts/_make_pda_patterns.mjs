// Build the PDA Doppler-pattern demonstration scenarios from the calibrated term_neonate baseline,
// reproducing the panels in public/pda/BidirectionalPDA.pdf, UnrestrictiveLtRPDA.pdf,
// "PDA restrictive vs unrestrictive.pdf" and "Right to Left PDA.pdf" using the single-resistor
// quadratic-stenosis Pda model (ΔP = R·Q + B·Q²):
//
//   pda_bidirectional                (A)  restrictive bidirectional (PHT): tight short duct holds a
//                                         large systolic PA-Ao gradient -> high-velocity systolic R->L
//                                         (~2 m/s, suprasystemic PA) + lower-velocity diastolic L->R
//   pda_bidirectional_unrestrictive  (A2) unrestrictive bidirectional: wide duct equalizes pressures,
//                                         LOW velocities, systolic R->L (~0.5 m/s) + diastolic L->R
//   pda_unrestrictive_ltr            (B)  unrestrictive left-to-right: large duct, CONTINUOUS pulsatile
//                                         L->R, high systolic (~2 m/s) + low diastolic (~0.7 m/s) velocity
//                                         (EDV/PSV ~0.35), rapid diastolic pressure equalization
//   pda_restrictive_ltr              (B2) restrictive left-to-right: narrow short duct holds a large
//                                         non-equalizing gradient -> CONTINUOUS high-velocity 'sawtooth'
//                                         L->R (~3.5 m/s, ~49 mmHg), low pulsatility (high sys AND dia)
//   pda_restrictive_rtl              (C)  restrictive RIGHT-TO-LEFT (PPHN): suprasystemic PA + narrow
//                                         short duct -> high-velocity systolic R->L jet (~3.4 m/s, PA
//                                         ~46 mmHg above Ao) tapering in diastole; tiny shunt volume
//   pda_unrestrictive_rtl            (C2) unrestrictive RIGHT-TO-LEFT (PPHN): wide duct equalizes
//                                         suprasystemic PA~Ao -> LOW-velocity R->L (~0.7 m/s) all cycle;
//                                         large shunt -> differential cyanosis (post-ductal desat)
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
  pda_bidirectional: {
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
  pda_unrestrictive_ltr: {
    panel: "B",
    diameter_relative: 0.9, length: 14, discharge_coeff: 0.8, pvr_scale: 1.2, el_pa: 0.5,
    desc: "term neonate with an unrestrictive left-to-right patent ductus arteriosus: a large duct " +
      "transmits both flow and systemic pressure into the pulmonary artery, giving a CONTINUOUS " +
      "pulsatile LEFT-TO-RIGHT shunt — high peak-systolic velocity (~2 m/s) with a low " +
      "end-diastolic velocity (~0.7 m/s, EDV/PSV ~0.35) from rapid diastolic pressure equalization",
  },
  pda_restrictive_ltr: {
    panel: "B2",
    diameter_relative: 0.13, length: 1.5, discharge_coeff: 0.35, pvr_scale: 0.4,
    desc: "term neonate with a restrictive left-to-right patent ductus arteriosus: a narrow, short " +
      "duct imposes intrinsic resistance that keeps a large non-equalizing pressure gradient between " +
      "aorta and pulmonary artery, giving a CONTINUOUS high-velocity 'sawtooth' LEFT-TO-RIGHT jet " +
      "(~3.5 m/s, peak gradient ~49 mmHg) with low pulsatility (high velocity in both systole and " +
      "diastole) on Doppler",
  },
  pda_restrictive_rtl: {
    panel: "C",
    diameter_relative: 0.13, length: 1.5, discharge_coeff: 0.45, pvr_scale: 3.6, cont_right: 5.2,
    desc: "term neonate with a restrictive RIGHT-TO-LEFT patent ductus arteriosus in severe pulmonary " +
      "hypertension (PPHN): suprasystemic pulmonary pressure drives flow from the pulmonary artery to " +
      "the aorta across a narrow, short restrictive duct, giving a high-velocity systolic RIGHT-TO-LEFT " +
      "jet (~3.4 m/s, PA ~46 mmHg above Ao at peak systole) that tapers toward baseline in diastole on " +
      "Doppler (post-ductal desaturation / differential cyanosis)",
  },
  pda_unrestrictive_rtl: {
    panel: "C2",
    diameter_relative: 0.7, length: 14, discharge_coeff: 1.0, pvr_scale: 3.2, el_pa: 0.5,
    desc: "term neonate with an unrestrictive RIGHT-TO-LEFT patent ductus arteriosus in severe " +
      "pulmonary hypertension (PPHN): a wide duct equalizes suprasystemic pulmonary and aortic " +
      "pressures, so flow runs RIGHT-TO-LEFT throughout the cycle at LOW velocity (~0.6-0.8 m/s), " +
      "pulsatile, on Doppler (post-ductal desaturation / differential cyanosis)",
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

  // --- pulmonary-artery compliance (PA el_base) ---
  // A more compliant PA (el_base < 1x) buffers the systolic surge (keeps PA systolic below aortic ->
  // preserves the systolic gradient / peak-systolic velocity) while holding pressure through diastole
  // (raises PA diastolic toward aortic -> low end-diastolic velocity). This is the lever that lets the
  // unrestrictive L->R duct reach a high PSV AND a low EDV/PSV ratio at the same time.
  if (cfg.el_pa && cfg.el_pa !== 1.0) {
    const PA = model.models.PA;
    PA.el_base = PA.el_base * cfg.el_pa;
    log.push(`PA compliance: el_base x${cfg.el_pa}`);
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
