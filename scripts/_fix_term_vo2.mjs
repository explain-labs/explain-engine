// One-off recalibration: term_neonate whole-body VO2 to 7.0 mL/kg/min at 72 h, measured as lung O2
// uptake (Metabolism + the myocardium's Mob share), with breathing re-anchored so the chemoreflex
// stays neutral.
//
//   node scripts/_fix_term_vo2.mjs [--seconds 300] [--write]
//
// Why (docs/TermNeonateReference.md, step 6.2 of the term_neonate validation): the scenario took up
// 8.1 mL/kg/min — Metabolism.vo2 7.288 (the old whole-body value, minus nothing) plus Mob's ~0.8 for
// the heart on top. First-week term infants measure 6.26 +/- 1.51 at thermoneutral rest (phototherapy
// study, ADC F&N 2001), and resting energy expenditure of 45-50 kcal/kg/d is ~6.5-7.2 mL O2/kg/min;
// the scenario's calm, mixed sleep/awake state sits a little above quiet rest, hence 7.0.
//   1. Metabolism.vo2 7.288 -> 6.1396 (Mob, computed from cardiac work, is left alone).
//   2. Breathing.minute_volume_ref 0.234437 -> 0.202886: CO2 production falls with VO2, so the
//      ventilation that holds PaCO2 at the set-point falls too; the chemoreflex correction is folded
//      into the reference so EF_MV stays 1.0 (as in 0e8ce60).
//   3. Chemoreceptor set-points re-anchored to the new rest: CR_PCO2 39.67, CR_PO2 75.7, CR_PH 7.364.
// Values solved headless (scratch prototype, 2026-10-18). Thermoregulation re-seeds its heat-loss trim
// at every load, so the lower metabolic heat does not cool the patient. The model then warms for
// --seconds and is serialized the way the app's save-state does, keeping _baseline_weight.
import fs from "node:fs";
import { createEngine } from "./_harness.mjs";
import { serializeState } from "./_serialize_state.mjs";

const argv = process.argv.slice(2);
const SECONDS = (() => { const i = argv.indexOf("--seconds"); return i >= 0 ? Number(argv[i + 1]) : 300; })();
const WRITE = argv.includes("--write");

const VO2 = 6.1396, MV_REF = 0.202886;
const CR = { CR_PCO2: 39.67, CR_PO2: 75.7, CR_PH: 7.364 };

const file = new URL("../model_definitions/term_neonate.json", import.meta.url);
const json = JSON.parse(fs.readFileSync(file, "utf8"));
const eng = await createEngine();
const model = eng.build(json.model_definition);
const M = model.models;
const out = (...a) => process.stderr.write(a.join(" ") + "\n");

M.Metabolism.vo2 = VO2;
M.Breathing.minute_volume_ref = MV_REF;
for (const [n, v] of Object.entries(CR)) M[n].set_value = v;

eng.calc(SECONDS);
out(`after ${SECONDS}s: PaCO2 ${M.AA.pco2.toFixed(2)}, PaO2 ${M.AA.po2.toFixed(1)}, MV ${(M.Breathing.minute_volume * 1000 / model.weight).toFixed(0)} mL/kg/min, ` +
  `SvO2 ${M.Monitor.svo2.toFixed(1)}, EF_MV ${M.EF_MV.effector.toFixed(3)}, EF_HR ${M.EF_HR.effector.toFixed(3)}, core ${M.Thermoregulation.core_temp.toFixed(2)}`);

const baselineWeight = json.model_definition._baseline_weight;
json.model_definition = serializeState(model);
if (baselineWeight !== undefined) json.model_definition._baseline_weight = baselineWeight;
const text = JSON.stringify(json, null, 2);
JSON.parse(text);
if (WRITE) fs.writeFileSync(file, text);
out(WRITE ? "term_neonate.json written" : "dry run (pass --write to save)");
