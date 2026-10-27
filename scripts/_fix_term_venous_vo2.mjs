// One-off recalibration: term_neonate_72h oxygen use raised so the venous saturations match the direct
// neonatal measurements, with breathing re-anchored so the chemoreflex stays neutral.
//
//   node scripts/_fix_term_venous_vo2.mjs [--seconds 300] [--write]
//
// Why (docs/TermNeonateReference.md, 2026-10-27): with VO2 7.0 at the lung the mixed venous saturation
// was 82 % and the systemic O2 extraction 0.155. The only direct central venous measurement in stable
// newborns, a fibre-optic catheter in the right atrium (van der Hoeven 1996: ScvO2 73.6 +/- 5.3 %,
// extraction 0.21), and peripheral-muscle NIRS in healthy term babies (Wolfsberger 2023: extraction
// 0.22-0.26) point to more extraction. The cerebral venous saturation already matched (model 67-68 %,
// sagittal sinus 64-73 %), so the brain and the kidney keep their absolute O2 use and the extra goes to
// the beds that extracted too little:
//   1. per-bed O2 use (mL/kg/min) + 0.6 upper body (RUB), + 0.6 lower body (RLB), + 0.15 gut (INT_CAP),
//      + 0.08 liver (LS_CAP): Metabolism.vo2 6.30 -> 7.73, the shares renormalised (lung VO2 ~8.4 with
//      the myocardium's Mob share);
//   2. Breathing.minute_volume_ref: the chemoreflex correction at the new CO2 production is folded into
//      the reference so EF_MV stays 1.0 (as in _fix_term_vo2.mjs);
//   3. chemoreceptor set-points re-anchored to the new resting gases.
// The ventilation rises to ~250 mL/kg/min (measured in quiet sleep: 215), an accepted deviation.
// The heat-loss trim is re-seeded for the higher metabolic heat. Saved at a sinus-node firing, the way the
// app's save-state does, keeping _baseline_weight.
import fs from "node:fs";
import { createEngine } from "./_harness.mjs";
import { serializeState } from "./_serialize_state.mjs";

const argv = process.argv.slice(2);
const SECONDS = (() => { const i = argv.indexOf("--seconds"); return i >= 0 ? Number(argv[i + 1]) : 300; })();
const WRITE = argv.includes("--write");
const EXTRA = { RUB: 0.6, RLB: 0.6, INT_CAP: 0.15, LS_CAP: 0.08 }; // mL O2/kg/min

const file = new URL("../model_definitions/term_neonate_72h.json", import.meta.url);
const json = JSON.parse(fs.readFileSync(file, "utf8"));
const eng = await createEngine();
const model = eng.build(json.model_definition);
const M = model.models;
const W = model.weight;
const out = (...a) => process.stderr.write(a.join(" ") + "\n");

// 1. per-bed O2 use
const Me = M.Metabolism;
const use = Object.fromEntries(Object.entries(Me.metabolic_active_models).map(([k, f]) => [k, f * Me.vo2]));
for (const [k, x] of Object.entries(EXTRA)) use[k] = (use[k] ?? 0) + x;
const vo2 = Object.values(use).reduce((s, x) => s + x, 0);
const before = Me.vo2;
Me.vo2 = +vo2.toFixed(5);
Me.metabolic_active_models = Object.fromEntries(Object.entries(use).map(([k, x]) => [k, +(x / vo2).toFixed(5)]));
out(`Metabolism.vo2 ${before} -> ${Me.vo2}; shares ${JSON.stringify(Me.metabolic_active_models)}`);
// more O2 use is more metabolic heat: re-seed the heat-loss trim (the saved state has it seeded, so a
// load would keep the old trim and the baby would warm)
M.Thermoregulation.loss_trim_seeded = false;

// 2./3. settle, fold the chemoreflex correction into the ventilation reference, re-anchor the set-points
const avg = (sec, fn) => { const n = Math.round(sec / 0.02), a = {}; for (let i = 0; i < n; i++) { eng.calc(0.02); for (const [k, x] of Object.entries(fn())) a[k] = (a[k] ?? 0) + x / n; } return a; };
eng.calc(SECONDS);
for (let it = 0; it < 3; it++) {
  const a = avg(30, () => ({ ef: M.EF_MV.effector, pco2: M.AA.pco2, po2: M.AA.po2, ph: M.AA.ph }));
  M.Breathing.minute_volume_ref *= a.ef;
  M.CR_PCO2.set_value = +a.pco2.toFixed(2); M.CR_PO2.set_value = +a.po2.toFixed(2); M.CR_PH.set_value = +a.ph.toFixed(3);
  out(`  pass ${it + 1}: EF_MV ${a.ef.toFixed(3)} -> minute_volume_ref ${M.Breathing.minute_volume_ref.toFixed(6)}; CR set-points ${M.CR_PCO2.set_value}/${M.CR_PO2.set_value}/${M.CR_PH.set_value}`);
  eng.calc(120);
}
M.Breathing.minute_volume_ref = +M.Breathing.minute_volume_ref.toFixed(6);
const r = avg(30, () => ({ ef: M.EF_MV.effector, pco2: M.AA.pco2, po2: M.AA.po2, mv: M.Breathing.minute_volume, svo2: M.Monitor.svo2, core: M.Thermoregulation.core_temp }));
out(`rest: PaCO2 ${r.pco2.toFixed(2)}, PaO2 ${r.po2.toFixed(1)}, MV ${(r.mv * 1000 / W).toFixed(0)} mL/kg/min, SvO2 ${r.svo2.toFixed(1)}, EF_MV ${r.ef.toFixed(3)}, core ${r.core.toFixed(2)}`);

// save at a sinus-node firing (as reseed_term_neonate.mjs)
const H = M.Heart;
for (let i = 0; i < 400; i++) { const b = H._sa_node_timer; eng.calc(model.modeling_stepsize); if (H._sa_node_timer < b) break; }
const baselineWeight = json.model_definition._baseline_weight;
json.model_definition = serializeState(model);
if (baselineWeight !== undefined) json.model_definition._baseline_weight = baselineWeight;
const text = JSON.stringify(json, null, 2);
JSON.parse(text);
if (WRITE) fs.writeFileSync(file, text);
out(WRITE ? "term_neonate_72h.json written" : "dry run (pass --write to save)");
