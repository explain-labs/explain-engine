// One-off: systemic venous compliance from the newborn volume-loading data.
//
//   node scripts/_fix_venous_compliance.mjs --factor K [scenario ...] [--write]
//
// Why (haemorrhage/fluid review, 2026-10-29): the term baby's total vascular compliance was 2.1
// mL/mmHg/kg (instant ±5 % blood-volume steps), against 3.0-3.5 in near-term fetal sheep (Brace & Gold
// 1984, doi:10.1152/ajpregu.1984.247.5.R800), and Merrill 1995's volume expansion (conscious lambs 3-7 d,
// 42 mL/kg colloid over 60 min: right atrial pressure +5.6 ± 0.5 mmHg, doi:10.1152/ajpheart.1995.268.3.H1343)
// raised the model's CVP twice as much. The systemic veins hold 70 % of the vessel compliance, so their
// elastance is scaled by K (< 1 = more compliant) at an unchanged resting pressure and volume: el_base × K,
// and the unstressed volume lowered so the stressed volume V − U grows by 1/K. Resting CVP, MAP and the
// volume distribution stay; only the response to a volume change differs. The brain's venules (BR_VEN)
// are left alone (they set the intracranial waterfall).
import fs from "node:fs";

export const VENOUS = ["IVCI", "SVC", "VLB", "VUB", "INT_VEN", "KID_VEN", "LS_VEN"];

// scale the systemic venous compliance of a model definition in place by 1/k
export function scale_venous(def, k) {
  const comps = def.models.Circulation.components;
  for (const n of VENOUS) {
    const v = comps[n];
    if (!v) continue;
    const stressed = v.vol - v.u_vol;
    v.el_base *= k;
    v.u_vol = v.vol - stressed / k;
  }
  return def;
}

const main = import.meta.url === `file://${process.argv[1]}`;
if (main) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf("--factor");
  const k = i >= 0 ? Number(argv[i + 1]) : NaN;
  if (!(k > 0)) {
    process.stderr.write("usage: _fix_venous_compliance.mjs --factor K [scenario ...] [--write]\n");
    process.exit(1);
  }
  const WRITE = argv.includes("--write");
  const names = argv.filter((a, j) => !a.startsWith("--") && argv[j - 1] !== "--factor");
  for (const n of names.length ? names : ["term_neonate_72h"]) {
    const path = new URL(`../model_definitions/${n}.json`, import.meta.url);
    const raw = fs.readFileSync(path, "utf8");
    const json = JSON.parse(raw);
    const comps = json.model_definition.models.Circulation.components;
    const before = VENOUS.map((v) => [v, comps[v]?.el_base, comps[v]?.u_vol]);
    scale_venous(json.model_definition, k);
    for (const [v, el, u] of before) {
      if (el === undefined) continue;
      process.stderr.write(`${n} ${v}: el_base ${el.toFixed(1)} -> ${comps[v].el_base.toFixed(1)}, u_vol ${(u * 1000).toFixed(3)} -> ${(comps[v].u_vol * 1000).toFixed(3)} mL\n`);
    }
    if (WRITE) fs.writeFileSync(path, JSON.stringify(json, null, 2) + (raw.endsWith("\n") ? "\n" : ""));
  }
  if (!WRITE) process.stderr.write("(dry run; --write to save)\n");
}
