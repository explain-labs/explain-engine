// One-off recalibration: term_neonate_72h breathing pattern — inspiratory time fraction 0.40 and a resting
// rate of 40/min at an unchanged PaCO2.
//
//   node scripts/_fix_term_breathing_pattern.mjs [--seconds 240] [--write | --out path.json]
//
// Why (docs/TermNeonateReference.md, step 6.5 of the term_neonate_72h validation): minute ventilation
// matched (207 vs 215 +/- 52 mL/kg/min) but the breath shape did not. Healthy term infants breathe in
// for 0.65 +/- 0.14 s of a 1.63 s cycle (Ti/Ttot 0.40; Schmalisch 2005, flow-through, day 7) and the
// scenario for 0.30 (Breathing.ie_ratio is Ti/Ttot), which gave a peaked inspiratory flow (0.91 vs
// 0.83 +/- 0.20 L/min/kg). After the VO2 change the rate had drifted to 37.5/min (Schmalisch 39.2,
// Hannover day 2 44); the calm, mixed state sits at 40.
//   1. Breathing.ie_ratio 0.30 -> 0.40.
//   2. Breathing.vt_rr_ratio solved for RR 40 at the resting target minute volume (Mecklenburgh split:
//      RR = sqrt(MV / (ratio x weight))).
//   3. The chemoreflex correction (a longer inspiration ventilates a little more efficiently, a faster
//      shallower breath a little less) is folded into minute_volume_ref and the chemoreceptor
//      set-points move to the rest gases, so EF_MV stays 1.0 (as in 0e8ce60).
// The model then settles and is serialized the way the app's save-state does, keeping _baseline_weight.
import fs from "node:fs";
import { createEngine } from "./_harness.mjs";
import { serializeState } from "./_serialize_state.mjs";

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const SECONDS = Number(arg("--seconds", 240));
const WRITE = argv.includes("--write");
const OUT = arg("--out", null);
const IE = 0.40, RR_TARGET = 40.0;

const file = new URL("../model_definitions/term_neonate_72h.json", import.meta.url);
const json = JSON.parse(fs.readFileSync(file, "utf8"));
const eng = await createEngine();
const model = eng.build(json.model_definition);
const M = model.models, B = M.Breathing, W = model.weight;
const out = (...a) => process.stderr.write(a.join(" ") + "\n");

B.ie_ratio = IE;
for (let it = 0; it < 3; it++) {
  // rate/depth split for RR 40 at the current resting drive, then settle and fold the chemoreflex in
  B.vt_rr_ratio = B.target_minute_volume / W / (RR_TARGET * RR_TARGET) / (B.vt_rr_ratio_factor * B.vt_rr_ratio_scaling_factor);
  eng.calc(SECONDS);
  const avg = { pco2: 0, po2: 0, ph: 0 };
  const N = 200;
  for (let i = 0; i < N; i++) { eng.calc(0.1); avg.pco2 += M.AA.pco2; avg.po2 += M.AA.po2; avg.ph += M.AA.ph; }
  for (const k in avg) avg[k] /= N;
  const efmv = M.EF_MV.effector;
  B.minute_volume_ref *= efmv;
  M.EF_MV.effector = 1.0;
  B.mv_ans_factor = 1.0;
  M.CR_PCO2.set_value = +avg.pco2.toFixed(2);
  M.CR_PO2.set_value = +avg.po2.toFixed(2);
  M.CR_PH.set_value = +avg.ph.toFixed(3);
  out(`it ${it}: vt_rr_ratio ${B.vt_rr_ratio.toExponential(5)}, RR ${M.Monitor.resp_rate.toFixed(2)}, EF_MV ${efmv.toFixed(4)} folded -> minute_volume_ref ${B.minute_volume_ref.toFixed(6)}, ` +
    `set-points ${M.CR_PCO2.set_value} / ${M.CR_PO2.set_value} / ${M.CR_PH.set_value}`);
  if (Math.abs(efmv - 1) < 0.002 && Math.abs(M.Monitor.resp_rate - RR_TARGET) < 0.3) break;
}
eng.calc(SECONDS);
out(`final: RR ${M.Monitor.resp_rate.toFixed(1)}, Vt ${(B.exp_tidal_volume * 1000 / W).toFixed(2)} mL/kg, MV ${(B.minute_volume * 1000 / W).toFixed(0)} mL/kg/min, ` +
  `PaCO2 ${M.AA.pco2.toFixed(2)}, EF_MV ${M.EF_MV.effector.toFixed(4)}, EF_HR ${M.EF_HR.effector.toFixed(4)}`);

const baselineWeight = json.model_definition._baseline_weight;
json.model_definition = serializeState(model);
if (baselineWeight !== undefined) json.model_definition._baseline_weight = baselineWeight;
const text = JSON.stringify(json, null, 2);
JSON.parse(text);
if (WRITE) fs.writeFileSync(file, text);
if (OUT) fs.writeFileSync(OUT, text);
out(WRITE ? "term_neonate_72h.json written" : OUT ? `written to ${OUT}` : "dry run (pass --write or --out to save)");
