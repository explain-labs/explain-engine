// One-off recalibration: term_neonate_72h gets a small patent foramen ovale (1.5 mm) at 72 h.
//
//   node scripts/_fix_term_fo.mjs [--seconds 240] [--write | --out path.json]
//
// Why (docs/TermNeonateReference.md, step 6.7 of the term_neonate_72h validation): the FO was closed
// (diameter_fo 0 -> no_flow), but a PFO with low-velocity left-to-right flow is the rule in the first
// days (none closed by day 3 in He 2011; ~70 % of newborns in a large cohort, 95 % closed by 6 months).
// Both neonatal CMR studies measured RV output slightly above LV output with the duct closed (Jhaveri
// 181 vs 177, Groves 199 vs 196 mL/kg/min), the few mL/kg/min a small L->R PFO carries; in the model
// that is ~1-1.5 mm. An open PFO also lets the scenario shunt right-to-left at atrial level when
// right-sided pressures rise (PPHN, high PEEP), without the user having to open it first.
//   1. Shunts.diameter_fo 0 -> 1.5 mm (fo_lr_factor stays 1: an echo diameter already contains the flap).
//   2. Rest anchors re-set after warming: the chemoreflex correction folded into minute_volume_ref and
//      the chemoreceptor set-points moved to the rest gases (as in 0e8ce60); HeartFunction re-learns its
//      resting wall-stress references, because the RV now carries the shunt volume and its learned
//      end-diastolic reference (a resting maximum) must not sit below the new rest.
// The model then settles and is serialized the way the app's save-state does, keeping _baseline_weight.
import fs from "node:fs";
import { createEngine } from "./_harness.mjs";
import { serializeState } from "./_serialize_state.mjs";

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const SECONDS = Number(arg("--seconds", 240));
const WRITE = argv.includes("--write");
const OUT = arg("--out", null);
const FO_MM = 1.5;

const file = new URL("../model_definitions/term_neonate_72h.json", import.meta.url);
const json = JSON.parse(fs.readFileSync(file, "utf8"));
const eng = await createEngine();
const model = eng.build(json.model_definition);
const M = model.models, W = model.weight;
const out = (...a) => process.stderr.write(a.join(" ") + "\n");

M.Shunts.diameter_fo = FO_MM;
eng.calc(SECONDS);

// chemoreflex
const avg = { pco2: 0, po2: 0, ph: 0, fo: 0 };
const N = 200;
for (let i = 0; i < N; i++) { eng.calc(0.1); avg.pco2 += M.AA.pco2; avg.po2 += M.AA.po2; avg.ph += M.AA.ph; avg.fo += M.Shunts.flow_fo; }
for (const k in avg) avg[k] /= N;
const efmv = M.EF_MV.effector;
M.Breathing.minute_volume_ref *= efmv;
M.EF_MV.effector = 1.0;
M.Breathing.mv_ans_factor = 1.0;
M.CR_PCO2.set_value = +avg.pco2.toFixed(2);
M.CR_PO2.set_value = +avg.po2.toFixed(2);
M.CR_PH.set_value = +avg.ph.toFixed(3);
out(`FO ${FO_MM} mm: net flow ${(avg.fo * 60000 / W).toFixed(1)} mL/kg/min; EF_MV ${efmv.toFixed(4)} folded -> minute_volume_ref ${M.Breathing.minute_volume_ref.toFixed(6)}; ` +
  `set-points ${M.CR_PCO2.set_value} / ${M.CR_PO2.set_value} / ${M.CR_PH.set_value}`);

// HeartFunction re-learns its resting wall-stress references
const HF = M.HeartFunction;
for (const k of ["sigma_es_ref_lv", "sigma_ed_ref_lv", "sigma_es_ref_rv", "sigma_ed_ref_rv"]) { HF[k] = 0.0; HF._learn[k] = true; }
HF._warmup_elapsed = 0.0;
eng.calc(SECONDS);
out(`HeartFunction refs LV es/ed ${HF.sigma_es_ref_lv.toFixed(1)}/${HF.sigma_ed_ref_lv.toFixed(1)}, RV ${HF.sigma_es_ref_rv.toFixed(1)}/${HF.sigma_ed_ref_rv.toFixed(1)}`);
out(`after re-anchoring: HR ${M.Monitor.heart_rate.toFixed(1)}, EF_MV ${M.EF_MV.effector.toFixed(4)}, EF_HR ${M.EF_HR.effector.toFixed(4)}, EF_SVR ${M.EF_SVR.effector.toFixed(4)}, ` +
  `kidney ${M.Kidneys.afferent_factor.toFixed(4)}, brain ${M.Brain.autoreg_factor.toFixed(4)}`);

const baselineWeight = json.model_definition._baseline_weight;
json.model_definition = serializeState(model);
if (baselineWeight !== undefined) json.model_definition._baseline_weight = baselineWeight;
const text = JSON.stringify(json, null, 2);
JSON.parse(text);
if (WRITE) fs.writeFileSync(file, text);
if (OUT) fs.writeFileSync(OUT, text);
out(WRITE ? "term_neonate_72h.json written" : OUT ? `written to ${OUT}` : "dry run (pass --write or --out to save)");
