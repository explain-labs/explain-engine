// Re-seed the Tetralogy of Fallot scenario(s) to calibrated steady state (mirrors reseed_cps.mjs). All
// calibration lives in the scenario JSON (written by scripts/_make_tof.mjs); this warms the model to
// steady state and serializes it back into model_definition the way the app's save-state does
// (Model._processModelState, shared as scripts/_serialize_state.mjs) — baking the equilibrium gas/volume
// seeds and clearing startup transients so the file loads at its operating point.
//
//   node scripts/reseed_tof.mjs <key|--all> [--seconds 300] [--write]

import fs from "node:fs";
import { createEngine } from "./_harness.mjs";
import { serializeState } from "./_serialize_state.mjs";

const KEYS = ["tof_pink", "tof", "tof_severe", "tof_pa"];
const argv = process.argv.slice(2);
const secIdx = argv.indexOf("--seconds");
const SECONDS = secIdx >= 0 ? Number(argv[secIdx + 1]) : 300;
const positional = argv.filter((a, i) => !a.startsWith("-") && (secIdx < 0 || i !== secIdx + 1));
const keys = argv.includes("--all") ? KEYS : positional;
if (keys.length === 0 || keys.some((k) => !KEYS.includes(k))) {
  console.error(`usage: node scripts/reseed_tof.mjs <key|--all> [--seconds N] [--write]\nkeys: ${KEYS.join(", ")}`);
  process.exit(1);
}
const WRITE = argv.includes("--write");

const eng = await createEngine();

for (const key of keys) {
  const file = new URL(`../model_definitions/${key}.json`, import.meta.url);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));

  const model = eng.build(json.model_definition);
  if (!model || !model.models) {
    console.error(`build failed for ${key}.`);
    process.exit(1);
  }
  eng.calc(SECONDS); // warm to steady state; calibration is baked into the JSON

  json.model_definition = serializeState(model);
  const out = JSON.stringify(json, null, 1) + "\n";
  JSON.parse(out);
  eng.log(`reseed ${key}: ${Object.keys(model.models).length} top-level models, warmup ${SECONDS}s, ${out.length} bytes`);
  if (WRITE) { fs.writeFileSync(file, out); eng.log("  WROTE", file.pathname); }
  else { const tmp = `/tmp/${key}_reseed.json`; fs.writeFileSync(tmp, out); eng.log(`  dry run -> ${tmp} (pass --write to commit)`); }
}
