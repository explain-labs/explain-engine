// Re-seed the d-TGA scenario(s) to calibrated steady state (mirrors reseed_cdh_phenotypes.mjs). All
// calibration lives in the scenario JSON (written by scripts/_make_hlhs.mjs); this warms the model to
// steady state and serializes it back into model_definition the way the app's save-state does
// (Model._processModelState) — baking the equilibrium gas/volume seeds and clearing startup transients so
// the file loads at its operating point. A parallel circulation takes longer to equilibrate its mixing,
// so the default warmup is generous.
//
//   node scripts/reseed_hlhs.mjs <key|--all> [--seconds 300] [--write]

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const KEYS = ["hlhs", "hlhs_restrictive"];
const argv = process.argv.slice(2);
const secIdx = argv.indexOf("--seconds");
const SECONDS = secIdx >= 0 ? Number(argv[secIdx + 1]) : 300;
const positional = argv.filter((a, i) => !a.startsWith("-") && i !== secIdx + 1);
const keys = argv.includes("--all") ? KEYS : positional;
if (keys.length === 0 || keys.some((k) => !KEYS.includes(k))) {
  console.error(`usage: node scripts/reseed_hlhs.mjs <key|--all> [--seconds N] [--write]\nkeys: ${KEYS.join(", ")}`);
  process.exit(1);
}
const WRITE = argv.includes("--write");

let liveModel = null;
globalThis.self = globalThis;
globalThis.postMessage = (m) => { if (m && m.type === "state") liveModel = m.payload; };
const _log = console.log; console.log = () => {};
await import("../explain/ModelEngine.js");
const send = (t, msg, p) => self.onmessage({ data: { type: t, message: msg, payload: p } });

for (const key of keys) {
  const file = new URL(`../public/model_definitions/${key}.json`, import.meta.url);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));

  liveModel = null;
  send("POST", "build", json.model_definition);
  send("GET", "state", []);
  const model = liveModel;

  send("POST", "calc", SECONDS); // warm to steady state; calibration is baked into the JSON

  // --- replicate Model._processModelState ---
  delete model["DataCollector"]; delete model["TaskScheduler"]; delete model["ModelScaler"];
  delete model["_baseline_weight"]; delete model["diagram_definition"]; delete model["animation_definition"];
  for (const k in model) if (k.startsWith("ncc")) delete model[k];
  Object.values(model.models).forEach((m) => {
    for (const k in m) {
      if (k.startsWith("_")) delete m[k];
      if (k === "components" && Object.keys(m[k]).length > 0) {
        Object.keys(m[k]).forEach((cn) => { m.components[cn] = model.models[cn]; delete model.models[cn]; });
      }
    }
  });
  model.model_time_total = 0;

  json.model_definition = model;
  const out = JSON.stringify(json, null, 1) + "\n";
  JSON.parse(out);
  _log(`reseed ${key}: ${Object.keys(model.models).length} top-level models, warmup ${SECONDS}s, ${out.length} bytes`);
  if (WRITE) { fs.writeFileSync(file, out); _log("  WROTE", file.pathname); }
  else { const tmp = `/tmp/${key}_reseed.json`; fs.writeFileSync(tmp, out); _log(`  dry run -> ${tmp} (pass --write to commit)`); }
}
console.log = _log;
