// Size-scale the pericardial wall stiffness.
//
// _fix_pericardium.mjs calibrated term_neonate_72h's pericardium: reserve u_vol = 1.15 x the maximal heart
// volume, and el_k such that the recoil is +10 mmHg at 10 mL beyond the reserve (10 mL = 28 % of the
// 35.2 mL term reserve). The other scenarios kept that el_k (1e5 mmHg/L^2) with a reserve scaled to their
// own heart, so a small pericardium was relatively far more compliant: an effusion of 50 % of the reserve
// lowered LVO 10 % at term but 1 % at 25 weeks. Here el_k = el_k_term * (u_vol_term / u_vol)^2: the same
// pressure for the same fractional stretch beyond the reserve. The pericardium is slack at rest, so the
// resting state does not change. Patches only PERICARDIUM.el_k (the rest of the file is left
// byte-identical).
//
//   node scripts/_scale_pericardium.mjs <scenario> [...] [--write]
import fs from "node:fs";

const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const names = argv.filter((a) => !a.startsWith("--"));
const out = (...a) => process.stderr.write(a.join(" ") + "\n");

const term = JSON.parse(fs.readFileSync(new URL("../model_definitions/term_neonate_72h.json", import.meta.url), "utf8"));
const T = term.model_definition.models.Heart.components.PERICARDIUM;

for (const name of names) {
  const file = new URL(`../model_definitions/${name}.json`, import.meta.url);
  const src = fs.readFileSync(file, "utf8");
  const json = JSON.parse(src);
  const pc = json.model_definition.models.Heart.components.PERICARDIUM;
  const el_k = +(T.el_k * (T.u_vol / pc.u_vol) ** 2).toPrecision(6);
  out(`${name}: reserve ${(pc.u_vol * 1e3).toFixed(1)} mL, el_k ${pc.el_k} -> ${el_k}`);
  if (!WRITE || el_k === pc.el_k) continue;
  // the PERICARDIUM model block (after model_definition; the diagram has a component of that name too)
  const start = src.indexOf('"PERICARDIUM": {', src.indexOf('"model_definition"'));
  let depth = 0, end = start;
  for (let i = src.indexOf("{", start); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  const block = src.slice(start, end);
  if (!/"model_type": "Container"/.test(block)) throw new Error(`${name}: PERICARDIUM model block not found`);
  const patched = src.slice(0, start) + block.replace(/("el_k": )-?[0-9.eE+-]+/, `$1${el_k}`) + src.slice(end);
  const expected = JSON.parse(src);
  expected.model_definition.models.Heart.components.PERICARDIUM.el_k = el_k;
  if (JSON.stringify(JSON.parse(patched)) !== JSON.stringify(expected)) throw new Error(`${name}: patch changed more than el_k`);
  fs.writeFileSync(file, patched);
  out(`${name}: written`);
}
