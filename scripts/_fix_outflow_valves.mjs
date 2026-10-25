// One-off recalibration: aortic (LV_AA) and pulmonary (RV_PA) valve resistance per scenario, so the
// peak systolic gradient matches the Doppler peak velocity (4·v², mmHg).
//
//   node scripts/_fix_outflow_valves.mjs [--write]
//
// Why (re-validation item (b), step 2a): every valve had r_for 55 in every scenario, from 25 weeks to
// term and in the fetus. After the physiological QT (aa7e0d3) the term peak gradients were aortic 5.2
// and pulmonary 3.5 mmHg against ~3.2 and ~2.6. Targets (agreed with the model's author):
//   term neonate (72 h)        aortic 0.9 m/s (3.24 mmHg), pulmonary 0.8 m/s (2.56 mmHg)
//   preterm 25-30 wk (day 3)   aortic 0.7 m/s (1.96 mmHg), pulmonary 0.6 m/s (1.44 mmHg)
//   fetus, by gestation        25 wk 0.6/0.55, 30 wk 0.75/0.65, term 0.9/0.8 m/s (outflow velocities
//                              rise with gestation; the term values on a 25-week fetus would make its
//                              aortic valve 3.5x stiffer than the same-size preterm's)
// The resistance is anatomy, so it is tuned in the scenarios without a shunt; the three Bischoff
// scenarios (25 wk, 0.68-0.76 kg) take preterm_25wk's values, so same-size preterm hearts share a
// valve, and their gradients follow their own (ductal) flows.
// Only r_for/r_back of the two valves change; the definitions are edited in place.
import fs from "node:fs";
import { createEngine } from "./_harness.mjs";

const WRITE = process.argv.includes("--write");
const out = (...a) => process.stderr.write(a.join(" ") + "\n");
const g = (v) => 4 * v * v;
const TERM = { LV_AA: g(0.9), RV_PA: g(0.8) };
const PRETERM = { LV_AA: g(0.7), RV_PA: g(0.6) };
const TUNE = {
  term_neonate: TERM, preterm_30wk: PRETERM, preterm_28wk: PRETERM, preterm_25wk: PRETERM,
  fetus_25wk: { LV_AA: g(0.6), RV_PA: g(0.55) }, fetus_30wk: { LV_AA: g(0.75), RV_PA: g(0.65) }, fetus_term: TERM,
};
const COPY = {}; // the three Bischoff scenarios took preterm_25wk's values (removed 2026-10-25)

const eng = await createEngine();
const path = (n) => new URL(`../model_definitions/${n}.json`, import.meta.url);

// peak forward gradient (mmHg) across each valve over `seconds`
function peaks(M, seconds = 6) {
  const p = { LV_AA: 0, RV_PA: 0 };
  const dt = M.Heart._model_engine.modeling_stepsize;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    eng.calc(dt);
    for (const v in p) {
      const r = M[v];
      if (r.flow > 1e-6) p[v] = Math.max(p[v], r._comp_from.pres - r._comp_to.pres);
    }
  }
  return p;
}

// replace r_for / r_back of one valve inside the Heart's components, as text
function setValve(text, name, r) {
  const start = text.indexOf(`"${name}": {`, text.indexOf('"components"', text.indexOf('"Heart": {')));
  if (start < 0) throw new Error(`${name} not found`);
  const end = text.indexOf('"comp_from"', start); // past the (empty) components object, before the wiring
  let block = text.slice(start, end);
  for (const key of ["r_for", "r_back"]) {
    const re = new RegExp(`"${key}": [-0-9.e]+`);
    if (!re.test(block)) throw new Error(`${name}.${key} not found`);
    block = block.replace(re, `"${key}": ${r}`);
  }
  return text.slice(0, start) + block + text.slice(end);
}

const result = {};
for (const [name, target] of Object.entries(TUNE)) {
  const text = fs.readFileSync(path(name), "utf8");
  const def = JSON.parse(text).model_definition;
  const r0 = { LV_AA: def.models.Heart.components.LV_AA.r_for, RV_PA: def.models.Heart.components.RV_PA.r_for };
  let r = { ...r0 }, p = null;
  for (let it = 0; it < 6; it++) {
    const d = structuredClone(def);
    for (const v in r) { d.models.Heart.components[v].r_for = r[v]; d.models.Heart.components[v].r_back = r[v]; }
    const M = eng.build(d).models;
    eng.calc(60);
    p = peaks(M);
    out(`  ${name} it ${it}: R aortic ${r.LV_AA.toFixed(2)} pulm ${r.RV_PA.toFixed(2)} -> peak ${p.LV_AA.toFixed(2)}/${target.LV_AA.toFixed(2)}, ${p.RV_PA.toFixed(2)}/${target.RV_PA.toFixed(2)} mmHg`);
    if (Object.keys(r).every((v) => Math.abs(p[v] / target[v] - 1) < 0.02)) break;
    for (const v in r) r[v] *= target[v] / p[v]; // gradient ~ R·Q at nearly unchanged flow
  }
  for (const v in r) r[v] = +r[v].toFixed(2);
  result[name] = r;
  out(`${name}: aortic R ${r0.LV_AA} -> ${r.LV_AA} (peak ${p.LV_AA.toFixed(2)} mmHg), pulmonary R ${r0.RV_PA} -> ${r.RV_PA} (peak ${p.RV_PA.toFixed(2)} mmHg)`);
}
for (const [name, src] of Object.entries(COPY)) { result[name] = result[src]; out(`${name}: takes ${src} (aortic ${result[src].LV_AA}, pulmonary ${result[src].RV_PA})`); }

for (const [name, r] of Object.entries(result)) {
  let text = fs.readFileSync(path(name), "utf8");
  for (const v in r) text = setValve(text, v, r[v]);
  const d = JSON.parse(text).model_definition.models.Heart.components;
  if (d.LV_AA.r_for !== r.LV_AA || d.RV_PA.r_for !== r.RV_PA) throw new Error(`${name}: edit check failed`);
  if (WRITE) fs.writeFileSync(path(name), text);
}
out(WRITE ? "written" : "dry run (pass --write to save)");
