// One-off: coronary inflow resistance (AA_COR) per scenario from a resting myocardial O2 extraction.
//
//   node scripts/_fix_coronary_extraction.mjs [scenario ...] [--write]
//
// Why (re-validation item (h)): AA_COR gave every scenario about the same coronary flow per kg body
// weight (10.5-11.4 mL/kg/min, ~5 % of LV output), so the resting myocardial O2 extraction ranged from
// 30 % (term_neonate_72h, 164 mL/min/100 g, ~2x human neonatal estimates: Aburawi 2012 LAD flow 8.2 mL/min,
// doi:10.1016/j.echo.2011.11.019) to 70 % (fetus_term). Coronary flow is matched to myocardial O2 demand,
// so the resistance is set to give a common resting extraction (agreed with the model's author): 55 %
// postnatal (between newborn lambs, ~50 %, and adults, ~70 %) and 50 % in the fetus (fetal lamb
// myocardial flows 170-260 mL/min/100 g, Smolich 1996 doi:10.1152/ajpheart.1996.270.2.H741, Dalshaug
// 2002 doi:10.1152/ajpheart.00686.2001). Myocardial VO2 (Mob) is unchanged, so the flow follows it:
// extraction = MVO2 / (Q·CaO2), and R is scaled by target/extraction until it matches.
// Only r_for/r_back of AA_COR change; the definitions are edited in place.
import fs from "node:fs";
import { createEngine } from "./_harness.mjs";

const WRITE = process.argv.includes("--write");
const ALL = ["term_neonate_72h"]; // the other scenarios were removed on 2026-10-25
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const names = args.length ? args : ALL;
const target = (n) => (n.startsWith("fetus") ? 0.5 : 0.55);
const out = (...a) => process.stderr.write(a.join(" ") + "\n");
const eng = await createEngine();
const path = (n) => new URL(`../model_definitions/${n}.json`, import.meta.url);

// mean coronary flow (L/s), extraction, minimum COR volume and O2 deficit after 60 s
function measure(def, r) {
  const M = eng.build(structuredClone(def)).models;
  if (r) { M.AA_COR.r_for = r; M.AA_COR.r_back = r; }
  eng.calc(60);
  const a = { q: 0, ca: 0, cv: 0, map: 0, def: 0 };
  let vmin = Infinity;
  const n = 2000;
  for (let i = 0; i < n; i++) {
    eng.calc(0.005);
    a.q += M.AA_COR.flow; a.ca += M.AA.to2; a.cv += M.COR.to2; a.map += M.AA.pres; a.def += M.Mob.o2_deficit;
    vmin = Math.min(vmin, M.COR.vol);
  }
  for (const k in a) a[k] /= n;
  return { ...a, ext: 1 - a.cv / a.ca, vmin, hw: M.Mob.hw };
}

// replace r_for / r_back of AA_COR, as text
function setR(text, r) {
  const start = text.indexOf('"AA_COR": {', text.indexOf('"Mob": {'));
  if (start < 0) throw new Error("AA_COR not found");
  const end = text.indexOf('"comp_from"', start);
  let block = text.slice(start, end);
  for (const key of ["r_for", "r_back"]) {
    const re = new RegExp(`"${key}": [-0-9.eE+]+`);
    if (!re.test(block)) throw new Error(`AA_COR.${key} not found`);
    block = block.replace(re, `"${key}": ${r}`);
  }
  return text.slice(0, start) + block + text.slice(end);
}

for (const name of names) {
  const text = fs.readFileSync(path(name), "utf8");
  const def = JSON.parse(text).model_definition;
  const r0 = def.models.Mob.components.AA_COR.r_for, e = target(name);
  const ref = measure(def);
  let r = r0, res = ref;
  for (let it = 0; it < 8 && Math.abs(res.ext / e - 1) > 0.005; it++) {
    r *= e / res.ext; // extraction ~ 1/Q ~ R at an unchanged MVO2
    res = measure(def, r);
  }
  r = +r.toPrecision(6);
  const ml = (q) => (q * 60000).toFixed(1);
  out(`${name}: AA_COR R ${r0} -> ${r} | flow ${ml(ref.q)} -> ${ml(res.q)} mL/min (${(res.q * 6e6 / res.hw).toFixed(0)}/100 g), ` +
    `extraction ${(ref.ext * 100).toFixed(1)} -> ${(res.ext * 100).toFixed(1)} % (target ${(e * 100).toFixed(0)}), MAP ${ref.map.toFixed(1)} -> ${res.map.toFixed(1)}, ` +
    `COR vol min ${(res.vmin * 1e3).toFixed(2)} mL, O2 deficit ${res.def.toExponential(1)}`);
  if (res.vmin <= 0 || res.def > 0) throw new Error(`${name}: coronary bed emptied or O2 deficit at rest`);
  const patched = setR(text, r);
  const c = JSON.parse(patched).model_definition.models.Mob.components.AA_COR;
  if (c.r_for !== r || c.r_back !== r) throw new Error(`${name}: edit check failed`);
  if (WRITE) fs.writeFileSync(path(name), patched);
}
out(WRITE ? "written" : "dry run (pass --write to save)");
