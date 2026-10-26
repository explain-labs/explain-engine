// One-off recalibration: term_neonate_72h resting heart rate 120 bpm with ventricular contractility so
// stroke volume and ejection fraction match neonatal CMR, at unchanged cardiac output.
//
//   node scripts/_fix_term_hr_contractility.mjs [--seconds 300] [--write]
//
// Why (docs/TermNeonateReference.md, step 6.3 of the term_neonate_72h validation): HR was 131 against
// ~117-121 in calm term infants on day 3 (Satoh 2016, He 2011, Agata 1994), and while the filled
// volumes matched CMR (LV EDV 2.52 vs 2.5, RV 3.15 vs 3.1 mL/kg; Jhaveri 2023) the ventricles emptied
// too little (ESV 1.01 vs 0.9 and 1.65 vs 1.5), so SV (1.51 vs 1.6) and EF (59.9 vs 63.2, 47.8 vs
// 52.5) were low. Lowering HR alone is largely compensated by Frank-Starling (more diastolic filling),
// but leaves EF low; contractility closes the gap:
//   1. Heart.heart_rate_ref 131.15 -> 120.3333 (solved for a measured resting HR of 120.0).
//   2. LV el_max x1.15, RV el_max x1.3 (each ventricle onto its own CMR ESV/EF).
//   3. Rest anchors re-set after warming: the slightly higher myocardial O2 use (Mob, more stroke
//      work) raises CO2 production, so the chemoreflex correction is folded into
//      Breathing.minute_volume_ref and the chemoreceptor set-points move to the rest gases (as in
//      0e8ce60); HeartFunction re-learns its resting wall-stress references (highest stress over its
//      60 s warm-up, as the scenario originally learned them).
// The model then settles and is serialized the way the app's save-state does, keeping
// _baseline_weight.
import fs from "node:fs";
import { createEngine } from "./_harness.mjs";
import { serializeState } from "./_serialize_state.mjs";

const argv = process.argv.slice(2);
const SECONDS = (() => { const i = argv.indexOf("--seconds"); return i >= 0 ? Number(argv[i + 1]) : 300; })();
const WRITE = argv.includes("--write");

const HR_REF = 120.3333, K_LV = 1.15, K_RV = 1.3;

const file = new URL("../model_definitions/term_neonate_72h.json", import.meta.url);
const json = JSON.parse(fs.readFileSync(file, "utf8"));
const eng = await createEngine();
const model = eng.build(json.model_definition);
const M = model.models;
const out = (...a) => process.stderr.write(a.join(" ") + "\n");

M.Heart.heart_rate_ref = HR_REF;
M.LV.el_max *= K_LV;
M.RV.el_max *= K_RV;
eng.calc(SECONDS);

// --- re-anchor the breathing chemoreflex to the new rest ---
const avg = { pco2: 0, po2: 0, ph: 0 };
const N = 200;
for (let i = 0; i < N; i++) { eng.calc(0.1); avg.pco2 += M.AA.pco2; avg.po2 += M.AA.po2; avg.ph += M.AA.ph; }
for (const k in avg) avg[k] /= N;
const efmv = M.EF_MV.effector;
M.Breathing.minute_volume_ref *= efmv;
M.EF_MV.effector = 1.0;
M.Breathing.mv_ans_factor = 1.0;
M.CR_PCO2.set_value = +avg.pco2.toFixed(2);
M.CR_PO2.set_value = +avg.po2.toFixed(2);
M.CR_PH.set_value = +avg.ph.toFixed(3);
out(`chemoreflex: EF_MV ${efmv.toFixed(4)} folded -> minute_volume_ref ${M.Breathing.minute_volume_ref.toFixed(6)}; set-points ${M.CR_PCO2.set_value} / ${M.CR_PO2.set_value} / ${M.CR_PH.set_value}`);

// --- HeartFunction re-learns its resting wall-stress references ---
const HF = M.HeartFunction;
for (const k of ["sigma_es_ref_lv", "sigma_ed_ref_lv", "sigma_es_ref_rv", "sigma_ed_ref_rv"]) { HF[k] = 0.0; HF._learn[k] = true; }
HF._warmup_elapsed = 0.0;
eng.calc(SECONDS);
out(`HeartFunction refs LV es/ed ${HF.sigma_es_ref_lv.toFixed(1)}/${HF.sigma_ed_ref_lv.toFixed(1)}, RV ${HF.sigma_es_ref_rv.toFixed(1)}/${HF.sigma_ed_ref_rv.toFixed(1)}`);
out(`after re-anchoring: HR ${M.Monitor.heart_rate.toFixed(1)}, EF_MV ${M.EF_MV.effector.toFixed(4)}, EF_HR ${M.EF_HR.effector.toFixed(4)}, EF_SVR ${M.EF_SVR.effector.toFixed(4)}, ` +
  `kidney ${M.Kidneys.afferent_factor.toFixed(4)}, brain ${M.Brain.autoreg_factor.toFixed(4)}, HF load ${HF.el_max_load_factor_lv.toFixed(3)}/${HF.el_max_load_factor_rv.toFixed(3)}`);

const baselineWeight = json.model_definition._baseline_weight;
json.model_definition = serializeState(model);
if (baselineWeight !== undefined) json.model_definition._baseline_weight = baselineWeight;
const text = JSON.stringify(json, null, 2);
JSON.parse(text);
if (WRITE) fs.writeFileSync(file, text);
out(WRITE ? "term_neonate_72h.json written" : "dry run (pass --write to save)");
