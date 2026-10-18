// One-off recalibration: term_neonate cerebral blood flow and brain O2 use to the neonatal MRI term
// median, keeping the brain's O2 extraction; the flow the brain gives back goes to the upper body.
//
//   node scripts/_fix_term_brain_mri.mjs [--seconds 300] [--write]
//
// Why (docs/TermNeonateReference.md, step 6.1 of the term_neonate validation): the scenario gave the
// brain 143.6 mL/min (40.5 mL/kg/min, 20 % of LVO) and 42 % of the Metabolism VO2 — a Holliday-type
// split (adult CMRO2 per gram x neonatal brain mass). Neonatal PC-MRA puts term CBF at a median of
// 106 mL/min (Kooi 2019, n=172 term; ~28.5 mL/kg/min), and MRI CMRO2 is lower still (Liu 2014).
// Brain extraction (~35 %, cerebral venous sat ~62-64 %) already matched Liu's measurement, so flow
// and O2 use come down together:
//   1. the whole cerebral bed (BR_ART, BR_CAP, BR_VEN) gets x1.3994 resistance. Each vessel's r_for
//      feeds its input connector (AA_BR_ART, BR_ART_BR_CAP, BR_CAP_BR_VEN); scaling only BR_ART
//      raised the autoregulation effector's share of the bed and made it oscillate. BR_VEN_VUB is
//      VUB's connector (shared with RUB_VUB) and is left alone.
//   2. RUB gets x0.7581, so SVC flow stays ~81 mL/kg/min (Groves 2011 MRI: 83).
//   3. Metabolism: BR_CAP fvo2 0.42417 -> 0.31311 (scaled with CBF, extraction unchanged); the other
//      beds x(1-0.31311)/(1-0.42417), so the fractions still sum to 1 and total VO2 is unchanged.
//   4. Brain rest anchors (cbf_setpoint, cpp_setpoint, cbv0) set to the new rest, solved headless
//      with the Brain controller off (scratch prototype, 2026-10-18).
// Then the model warms for --seconds and is serialized the way the app's save-state does, keeping
// _baseline_weight.
import fs from "node:fs";
import { createEngine } from "./_harness.mjs";
import { serializeState } from "./_serialize_state.mjs";

const argv = process.argv.slice(2);
const SECONDS = (() => { const i = argv.indexOf("--seconds"); return i >= 0 ? Number(argv[i + 1]) : 300; })();
const WRITE = argv.includes("--write");

const K_BRAIN = 1.3994, K_RUB = 0.7581, FVO2_BRAIN = 0.31311;
const ANCHORS = { cbf_setpoint: 0.10592, cpp_setpoint: 53.83, cbv0: 3.784 };

const file = new URL("../model_definitions/term_neonate.json", import.meta.url);
const json = JSON.parse(fs.readFileSync(file, "utf8"));
const eng = await createEngine();
const model = eng.build(json.model_definition);
const M = model.models;
const out = (...a) => process.stderr.write(a.join(" ") + "\n");

for (const n of ["BR_ART", "BR_CAP", "BR_VEN"]) { M[n].r_for *= K_BRAIN; M[n].r_back *= K_BRAIN; }
M.RUB.r_for *= K_RUB; M.RUB.r_back *= K_RUB;
const mam = M.Metabolism.metabolic_active_models;
const s = (1 - FVO2_BRAIN) / (1 - mam.BR_CAP);
for (const k of Object.keys(mam)) mam[k] = k === "BR_CAP" ? FVO2_BRAIN : +(mam[k] * s).toFixed(5);
Object.assign(M.Brain, ANCHORS);
out(`fvo2 ${JSON.stringify(mam)} (sum ${Object.values(mam).reduce((a, b) => a + b, 0).toFixed(5)})`);

eng.calc(SECONDS);
const B = M.Brain;
out(`after ${SECONDS}s: CBF ${(B.cbf * 1000).toFixed(1)} mL/min (setpoint ${(B.cbf_setpoint * 1000).toFixed(1)}), autoreg ${B.autoreg_factor.toFixed(3)}, ` +
  `EF_HR ${M.EF_HR.effector.toFixed(3)}, EF_SVR ${M.EF_SVR.effector.toFixed(3)}, kidney afferent ${M.Kidneys.afferent_factor.toFixed(3)}, angiotensin ${M.Hormones.angiotensin.toFixed(3)}`);

const baselineWeight = json.model_definition._baseline_weight;
json.model_definition = serializeState(model);
if (baselineWeight !== undefined) json.model_definition._baseline_weight = baselineWeight;
const text = JSON.stringify(json, null, 2);
JSON.parse(text);
if (WRITE) fs.writeFileSync(file, text);
out(WRITE ? "term_neonate.json written" : "dry run (pass --write to save)");
