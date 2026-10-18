// One-off recalibration: term_neonate resting lactate 1.0 -> 1.5 mmol/L at an unchanged acid-base state.
//
//   node scripts/_fix_term_lactate.mjs [--seconds 120] [--write | --out path.json]
//
// Why (docs/TermNeonateReference.md, step 6.6 of the term_neonate validation): healthy term infants
// after 48 h have a plasma lactate of 1.4 (0.8-3.3) mmol/L (GLOW 2021) and a capillary whole-blood
// lactate of 2.6 +/- 0.7 (1.4-4.1) at 48 +/- 12 h (Cousineau 2005); 1.5 lies inside both.
//   1. Lactate.lact_baseline 1.0 -> 1.5 (the value clearance relaxes every compartment back to).
//   2. Every patient blood compartment (and Blood's reference solutes): lact +0.5, uma -0.5. Lactate is
//      a strong anion in the Stewart solver (sid = ... - lact) and uma enters the same charge balance
//      with the same sign, so the swap leaves pH, HCO3 and BE exactly as they were. Placental, uterine
//      and maternal compartments are left alone.
// The model then settles and is serialized the way the app's save-state does, keeping _baseline_weight.
import fs from "node:fs";
import { createEngine } from "./_harness.mjs";
import { serializeState } from "./_serialize_state.mjs";

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const SECONDS = Number(arg("--seconds", 120));
const WRITE = argv.includes("--write");
const OUT = arg("--out", null);
const LACT = 1.5;

const file = new URL("../model_definitions/term_neonate.json", import.meta.url);
const json = JSON.parse(fs.readFileSync(file, "utf8"));
const eng = await createEngine();
const model = eng.build(json.model_definition);
const M = model.models;
const out = (...a) => process.stderr.write(a.join(" ") + "\n");

const delta = LACT - M.Lactate.lact_baseline;
M.Lactate.lact_baseline = LACT;
M.Blood.solutes.lact += delta;
M.Blood.solutes.uma -= delta;
let n = 0;
for (const [name, m] of Object.entries(M)) {
  if (!m.solutes || m === M.Blood || /^(PL_|UT|MP)/.test(name)) continue;
  if (typeof m.solutes.lact === "number" && typeof m.solutes.uma === "number") { m.solutes.lact += delta; m.solutes.uma -= delta; n++; }
}
out(`lact +${delta}, uma -${delta} in ${n} compartments; Blood uma ${M.Blood.solutes.uma.toFixed(4)}`);

eng.calc(SECONDS);
out(`after ${SECONDS}s: lactate ${M.Lactate.arterial_lactate.toFixed(3)}, pH ${M.AA.ph.toFixed(4)}, HCO3 ${M.AA.hco3.toFixed(2)}, BE ${M.AA.be.toFixed(2)}, EF_MV ${M.EF_MV.effector.toFixed(4)}`);

const baselineWeight = json.model_definition._baseline_weight;
json.model_definition = serializeState(model);
if (baselineWeight !== undefined) json.model_definition._baseline_weight = baselineWeight;
const text = JSON.stringify(json, null, 2);
JSON.parse(text);
if (WRITE) fs.writeFileSync(file, text);
if (OUT) fs.writeFileSync(OUT, text);
out(WRITE ? "term_neonate.json written" : OUT ? `written to ${OUT}` : "dry run (pass --write or --out to save)");
