// One-off: inertance on the atrioventricular valves of every scenario.
//
//   node scripts/_fix_av_inertance.mjs [--write]
//
// Why (re-validation item (b), step 2b): with purely resistive AV valves the ventricle filled in an
// early surge (term mitral E 1.58 m/s against ~0.6) that lowering the valve resistance only made
// larger, because nothing limited how fast the blood could accelerate. The blood column through the
// atrium and the inflow tract has inertance L = rho·length/area. Term: a 10 mm mitral and a 12 mm
// tricuspid orifice and 1.5 cm of inflow give 1.52 and 1.06 mmHg·s²/L; twice that (the column
// extends into the atrium) gave the best E and A at term (prototype, with the exponential
// relaxation of Heart.relax_frac). Smaller hearts are scaled as geometrically similar ones:
// diameter ~ weight^(1/3), so L ~ weight^(-1/3). The three Bischoff scenarios (removed 2026-10-25) shared preterm_25wk's
// valves, as for the outflow valves. The tricuspid connection is two parallel halves
// (RAIVCI_RV, RASVC_RV), each carrying 2·L so the pair has L. Only the inertance key is added.
import fs from "node:fs";

const WRITE = process.argv.includes("--write");
const out = (...a) => process.stderr.write(a.join(" ") + "\n");
const LM_TERM = 3.04, LT_TERM = 2.12, W_TERM = 3.545;
const WEIGHT = { term_neonate: 3.545 }; // the other scenarios (0.7-3.545 kg) were removed on 2026-10-25
const path = (n) => new URL(`../model_definitions/${n}.json`, import.meta.url);

// add (or replace) "inertance" in one Heart component, after its r_k line, as text
function setInertance(text, name, L) {
  const start = text.indexOf(`"${name}": {`, text.indexOf('"components"', text.indexOf('"Heart": {')));
  if (start < 0) throw new Error(`${name} not found`);
  const end = text.indexOf('"comp_from"', start);
  let block = text.slice(start, end);
  if (/"inertance": /.test(block)) block = block.replace(/"inertance": [-0-9.e]+/, `"inertance": ${L}`);
  else {
    const m = block.match(/\n(\s*)"r_k": [-0-9.e]+,/);
    if (!m) throw new Error(`${name}.r_k not found`);
    block = block.replace(m[0], `${m[0]}\n${m[1]}"inertance": ${L},`);
  }
  return text.slice(0, start) + block + text.slice(end);
}

for (const [name, w] of Object.entries(WEIGHT)) {
  const s = Math.cbrt(W_TERM / w);
  const lm = +(LM_TERM * s).toFixed(3), lt = +(2 * LT_TERM * s).toFixed(3);
  let text = fs.readFileSync(path(name), "utf8");
  text = setInertance(text, "LA_LV", lm);
  text = setInertance(text, "RAIVCI_RV", lt);
  text = setInertance(text, "RASVC_RV", lt);
  const c = JSON.parse(text).model_definition.models.Heart.components;
  if (c.LA_LV.inertance !== lm || c.RAIVCI_RV.inertance !== lt || c.RASVC_RV.inertance !== lt) throw new Error(`${name}: check failed`);
  if (WRITE) fs.writeFileSync(path(name), text);
  out(`${name}: mitral L ${lm}, tricuspid halves L ${lt} each (pair ${(lt / 2).toFixed(3)}) mmHg·s²/L`);
}
out(WRITE ? "written" : "dry run (pass --write to save)");
