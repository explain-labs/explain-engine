// Re-learn HeartFunction's resting wall-stress setpoints for one or more scenarios.
//
// HeartFunction keeps a setpoint given (> 0) in the definition and only learns the others, during
// the first setpoint_warmup seconds. Scenarios derived from term_neonate inherited its setpoints,
// which are far above a preterm or fetal heart's resting stress, so the load response never
// triggered there. This tool loads each scenario, lets it settle, clears the four setpoints, lets
// HeartFunction learn them at rest (same procedure as _fix_term_hr_contractility.mjs) and, with
// --write, patches ONLY those four numbers in the JSON (the rest of the file is left byte-identical).
//
//   node scripts/_relearn_heartfunction.mjs <scenario> [...] [--settle 30] [--write]
import fs from "node:fs";
import { createEngine } from "./_harness.mjs";

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? Number(argv[i + 1]) : d; };
const WRITE = argv.includes("--write");
const SETTLE = opt("--settle", 30);
const valued = new Set(["--settle"]);
const names = argv.filter((a, i) => !a.startsWith("--") && !valued.has(argv[i - 1]));
const KEYS = ["sigma_es_ref_lv", "sigma_ed_ref_lv", "sigma_es_ref_rv", "sigma_ed_ref_rv"];
const out = (...a) => process.stderr.write(a.join(" ") + "\n");

const eng = await createEngine();
for (const name of names) {
  const file = new URL(`../model_definitions/${name}.json`, import.meta.url);
  const src = fs.readFileSync(file, "utf8");
  const json = JSON.parse(src);
  const model = eng.build(json.model_definition);
  const HF = model.models.HeartFunction;
  if (!HF) { out(`${name}: no HeartFunction`); continue; }
  const before = KEYS.map((k) => HF[k]);

  eng.calc(SETTLE); // let the loaded state settle
  for (const k of KEYS) { HF[k] = 0.0; HF._learn[k] = true; }
  HF._warmup_elapsed = 0.0;
  eng.calc(HF.setpoint_warmup + 5.0); // learn, then a few seconds past the window
  const after = KEYS.map((k) => +HF[k].toFixed(4));
  out(`${name}: LV es/ed ${before[0].toFixed(1)}/${before[1].toFixed(1)} -> ${after[0]}/${after[1]}, ` +
    `RV es/ed ${before[2].toFixed(1)}/${before[3].toFixed(1)} -> ${after[2]}/${after[3]}, ` +
    `load factors ${HF.el_max_load_factor_lv.toFixed(3)}/${HF.el_max_load_factor_rv.toFixed(3)}`);

  if (!WRITE) continue;
  // patch the four keys inside the HeartFunction definition only
  const start = src.search(/"HeartFunction": \{\s*\n/);
  if (start < 0) { out(`${name}: HeartFunction block not found, not written`); continue; }
  let depth = 0, end = start;
  for (let i = src.indexOf("{", start); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  let block = src.slice(start, end);
  KEYS.forEach((k, i) => {
    const re = new RegExp(`("${k}": )-?[0-9.eE+-]+`);
    if (!re.test(block)) throw new Error(`${name}: ${k} not found`);
    block = block.replace(re, `$1${after[i]}`);
  });
  const patched = src.slice(0, start) + block + src.slice(end);
  // compare with a fresh parse of the file: the engine shares nested objects with the definition it
  // was given, so `json` itself has been modified by the run
  const check = JSON.parse(patched);
  const expected = JSON.parse(src);
  KEYS.forEach((k, i) => { expected.model_definition.models.HeartFunction[k] = after[i]; });
  if (JSON.stringify(check) !== JSON.stringify(expected)) throw new Error(`${name}: patch changed more than the setpoints`);
  fs.writeFileSync(file, patched);
  out(`${name}: written`);
}
