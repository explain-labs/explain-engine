// One-off: postnatal right-ventricle unstressed volume at the fetal ratio, with the RV refitted.
//
//   node scripts/_fix_rv_unstressed.mjs [scenario ...] [--write]
//
// Why (re-validation item (c)): the postnatal scenarios gave the RV a u_vol 5.46x the LV's (term 4.0 vs
// 0.73 mL). u_vol is also the volume intercept of the end-systolic relation, so the RV end-systolic
// elastance came out at about the LV's (term 28 vs 30 mmHg/mL), where real RVs have roughly a third to a
// half of it, and the RV hardly felt its afterload (pulmonary arterioles x2: RV stroke volume -3 %).
// The fetal scenarios already use 1.64x. Here the postnatal RV gets the same ratio, and el_max and el_k
// are refitted so the resting RV end-systolic and end-diastolic volumes, and with them the resting state,
// stay as they were: el_max scales the end-systolic pressure (Ees·(ESV - u_vol)), el_k the end-diastolic
// one (el_k·(EDV - u_vol)²). Only u_vol, el_max and el_k of RV change; the fetal scenarios are untouched.
import fs from "node:fs";
import { createEngine } from "./_harness.mjs";

const WRITE = process.argv.includes("--write");
const RATIO = 1.64;
const POSTNATAL = ["term_neonate"]; // the preterm scenarios were removed on 2026-10-25
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const names = args.length ? args : POSTNATAL;
const out = (...a) => process.stderr.write(a.join(" ") + "\n");
const eng = await createEngine();
const path = (n) => new URL(`../model_definitions/${n}.json`, import.meta.url);

// mean RV end-diastolic and end-systolic volume (L) after 60 s
function measure(def, rv) {
  const M = eng.build(structuredClone(def)).models;
  if (rv) Object.assign(M.RV, rv);
  eng.calc(60);
  const a = { edv: 0, esv: 0, map: 0, pap: 0 };
  const n = 1000;
  for (let i = 0; i < n; i++) { eng.calc(0.01); a.edv += M.Heart.rv_edv; a.esv += M.Heart.rv_esv; a.map += M.AA.pres; a.pap += M.PA.pres; }
  for (const k in a) a[k] /= n;
  return a;
}

// replace one numeric key of the RV chamber (inside Heart's components), as text
function setRV(text, key, value) {
  const start = text.indexOf('"RV": {', text.indexOf('"components"', text.indexOf('"Heart": {')));
  if (start < 0) throw new Error("RV not found");
  let depth = 0, end = start;
  for (let i = text.indexOf("{", start); i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) { end = i; break; }
  }
  const re = new RegExp(`\n(\\s*)"${key}": [-0-9.eE+]+`);
  const block = text.slice(start, end);
  if (!re.test(block)) throw new Error(`RV.${key} not found`);
  return text.slice(0, start) + block.replace(re, `\n$1"${key}": ${value}`) + text.slice(end);
}

for (const name of names) {
  const text = fs.readFileSync(path(name), "utf8");
  const def = JSON.parse(text).model_definition;
  const hc = def.models.Heart.components;
  const ref = measure(def);
  const u = hc.LV.u_vol * RATIO;
  // closed-form start: same end-systolic and end-diastolic pressures at the resting volumes
  const rv = {
    u_vol: u,
    el_max: hc.RV.el_max * (ref.esv - hc.RV.u_vol) / (ref.esv - u),
    el_k: hc.RV.el_k * ((ref.edv - hc.RV.u_vol) / (ref.edv - u)) ** 2,
  };
  let res = null;
  for (let it = 0; it < 6; it++) {
    res = measure(def, rv);
    const ee = res.esv / ref.esv - 1, ed = res.edv / ref.edv - 1;
    if (Math.abs(ee) < 0.003 && Math.abs(ed) < 0.003) break;
    rv.el_max *= (res.esv - u) / (ref.esv - u); // ESV too large -> too little elastance
    rv.el_k *= (res.edv - u) / (ref.edv - u); // EDV too large -> too soft (damped: pressure ~ S²)
  }
  for (const k in rv) rv[k] = +rv[k].toPrecision(6);
  out(`${name}: RV u_vol ${(hc.RV.u_vol * 1e3).toFixed(3)} -> ${(u * 1e3).toFixed(3)} mL, el_max ${hc.RV.el_max.toFixed(0)} -> ${rv.el_max} ` +
    `(Ees ${(rv.el_max / 1e3).toFixed(1)} vs LV ${(hc.LV.el_max / 1e3).toFixed(1)} mmHg/mL), el_k ${hc.RV.el_k.toExponential(3)} -> ${rv.el_k.toExponential(3)} | ` +
    `EDV ${(ref.edv * 1e3).toFixed(3)} -> ${(res.edv * 1e3).toFixed(3)}, ESV ${(ref.esv * 1e3).toFixed(3)} -> ${(res.esv * 1e3).toFixed(3)} mL, ` +
    `MAP ${ref.map.toFixed(1)} -> ${res.map.toFixed(1)}, PAP ${ref.pap.toFixed(1)} -> ${res.pap.toFixed(1)}`);
  let patched = text;
  for (const k of ["u_vol", "el_max", "el_k"]) patched = setRV(patched, k, rv[k]);
  const c = JSON.parse(patched).model_definition.models.Heart.components.RV;
  if (c.u_vol !== rv.u_vol || c.el_max !== rv.el_max || c.el_k !== rv.el_k) throw new Error(`${name}: edit check failed`);
  if (WRITE) fs.writeFileSync(path(name), patched);
}
out(WRITE ? "written" : "dry run (pass --write to save)");
