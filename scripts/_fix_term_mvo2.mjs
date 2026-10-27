// One-off recalibration: term_neonate_72h myocardial O2 use raised to 14 mL/100 g/min, the coronary
// inflow resistance re-fitted so the resting extraction stays 55 %, breathing re-anchored.
//
//   node scripts/_fix_term_mvo2.mjs [--seconds 300] [--write]
//
// Why (docs/TermNeonateReference.md, 2026-10-27): the coronary flow was 18.5 mL/min (80 mL/100 g/min,
// 2.6 % of LV output) at a myocardial VO2 of 10.7 mL/100 g/min, adult-like per gram. Healthy 1-week-old
// controls have an LAD flow of 8.2 +/- 3.0 mL/min (Aburawi 2012), i.e. ~18-23 mL/min for the whole
// heart, and LAD flow per gram of LV is highest in young infants (Yasuoka 2002); newborn lambs use
// 18.9 mL/100 g/min with LV flows of 199-248 mL/100 g/min (Smolich 1996). Coronary flow follows demand,
// so the myocardial O2 use is raised and the flow follows at the same extraction (55 %, re-validation
// item (h), scripts/_fix_coronary_extraction.mjs):
//   1. Mob.bm_vo2_per_g x1.668 (basal 5.0 -> 8.3 mL/100 g/min; the stroke-work part, 5.7, and the
//      mechanical efficiency 0.35, as in lambs, are unchanged): MVO2 10.7 -> 14.0 mL/100 g/min;
//   2. AA_COR r_for/r_back scaled until the extraction is 55 % again (flow ~26 mL/min, 3.6 % of LVO);
//   3. Breathing.minute_volume_ref and the chemoreceptor set-points re-anchored (as in
//      _fix_term_venous_vo2.mjs); the heat-loss trim re-seeded.
// Saved at a sinus-node firing, the way the app's save-state does, keeping _baseline_weight.
import fs from "node:fs";
import { createEngine } from "./_harness.mjs";
import { serializeState } from "./_serialize_state.mjs";

const argv = process.argv.slice(2);
const SECONDS = (() => { const i = argv.indexOf("--seconds"); return i >= 0 ? Number(argv[i + 1]) : 300; })();
const WRITE = argv.includes("--write");
const BASAL_FACTOR = 1.668;
const EXTRACTION = 0.55;

const file = new URL("../model_definitions/term_neonate_72h.json", import.meta.url);
const json = JSON.parse(fs.readFileSync(file, "utf8"));
const out = (...a) => process.stderr.write(a.join(" ") + "\n");
const ML = 60 * 22.414; // mmol/s -> mL/min

// 1./2. the basal O2 use, then the inflow resistance for the target extraction (measured on fresh builds)
const bm0 = json.model_definition.models.Mob.bm_vo2_per_g, r0 = json.model_definition.models.Mob.components.AA_COR.r_for;
const bm = +(bm0 * BASAL_FACTOR).toPrecision(5);
const eng = await createEngine();
const measure = (r) => {
  const M = eng.build(structuredClone(json.model_definition)).models;
  M.Mob.bm_vo2_per_g = bm; M.AA_COR.r_for = r; M.AA_COR.r_back = r;
  eng.calc(60);
  const a = { q: 0, ca: 0, cv: 0, mvo2: 0, def: 0 }; const n = 2000;
  for (let i = 0; i < n; i++) { eng.calc(0.005); a.q += M.AA_COR.flow / n; a.ca += M.AA.to2 / n; a.cv += M.COR.to2 / n; a.mvo2 += M.Mob.mob_vo2 / n; a.def += M.Mob.o2_deficit / n; }
  return { ...a, ext: 1 - a.cv / a.ca, hw: M.Mob.hw };
};
let r = r0, res = measure(r);
for (let it = 0; it < 8 && Math.abs(res.ext / EXTRACTION - 1) > 0.005; it++) { r *= EXTRACTION / res.ext; res = measure(r); }
r = +r.toPrecision(6);
if (res.def > 0) throw new Error("O2 deficit in the coronary bed at rest");
out(`Mob.bm_vo2_per_g ${bm0} -> ${bm}; AA_COR R ${r0} -> ${r}: coronary ${(res.q * 60000).toFixed(1)} mL/min ` +
  `(${(res.q * 6e6 / res.hw).toFixed(0)} mL/100 g/min), MVO2 ${(res.mvo2 * ML).toFixed(2)} mL/min (${(res.mvo2 * ML / res.hw * 100).toFixed(1)}/100 g), extraction ${(res.ext * 100).toFixed(1)} %`);

// 3. the scenario with both, breathing re-anchored, heat-loss trim re-seeded
const model = eng.build(json.model_definition);
const M = model.models, W = model.weight;
M.Mob.bm_vo2_per_g = bm; M.AA_COR.r_for = r; M.AA_COR.r_back = r;
M.Thermoregulation.loss_trim_seeded = false;
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
const z = avg(30, () => ({ ef: M.EF_MV.effector, pco2: M.AA.pco2, mv: M.Breathing.minute_volume, svo2: M.Monitor.svo2, core: M.Thermoregulation.core_temp, cor: M.AA_COR.flow }));
out(`rest: coronary ${(z.cor * 60000).toFixed(1)} mL/min, PaCO2 ${z.pco2.toFixed(2)}, MV ${(z.mv * 1000 / W).toFixed(0)} mL/kg/min, SvO2 ${z.svo2.toFixed(1)}, EF_MV ${z.ef.toFixed(3)}, core ${z.core.toFixed(2)}`);

// save at a sinus-node firing (as reseed_term_neonate.mjs)
const H = M.Heart;
for (let i = 0; i < 400; i++) { const b = H._sa_node_timer; eng.calc(model.modeling_stepsize); if (H._sa_node_timer < b) break; }
const baselineWeight = json.model_definition._baseline_weight;
json.model_definition = serializeState(model);
if (baselineWeight !== undefined) json.model_definition._baseline_weight = baselineWeight;
const text = JSON.stringify(json, null, 2);
const chk = JSON.parse(text).model_definition.models.Mob;
if (chk.bm_vo2_per_g !== bm || chk.components.AA_COR.r_for !== r) throw new Error("serialized Mob values do not match");
if (WRITE) fs.writeFileSync(file, text);
out(WRITE ? "term_neonate_72h.json written" : "dry run (pass --write to save)");
