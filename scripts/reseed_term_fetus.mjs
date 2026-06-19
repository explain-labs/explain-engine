// Re-seed term_fetus.json to its calibrated steady state (same approach as reseed_term_neonate.mjs).
//
// All fetal calibration already lives in the scenario JSON (written by scripts/_make_term_fetus.mjs),
// so this script just warms the model to steady state and serializes it back into model_definition the
// way the app's save-state does (Model._processModelState) — baking the equilibrium gas/volume seeds
// and clearing startup transients so the file loads at its operating point.
//
//   node scripts/reseed_term_fetus.mjs [--seconds 250] [--write]

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const argv = process.argv.slice(2);
const SECONDS = (() => { const i = argv.indexOf("--seconds"); return i >= 0 ? Number(argv[i + 1]) : 250; })();
const WRITE = argv.includes("--write");

let liveModel = null;
globalThis.self = globalThis;
globalThis.postMessage = (m) => { if (m && m.type === "state") liveModel = m.payload; };
const _log = console.log; console.log = () => {};
await import("../explain/ModelEngine.js");
const send = (t, msg, p) => self.onmessage({ data: { type: t, message: msg, payload: p } });

const file = new URL("../public/model_definitions/term_fetus.json", import.meta.url);
const json = JSON.parse(fs.readFileSync(file, "utf8"));

send("POST", "build", json.model_definition);
send("GET", "state", []);
const model = liveModel;

// Fetal calibration is fully baked into the JSON; no extra deltas here — just warm to steady state.
send("POST", "calc", SECONDS);

// --- replicate Model._processModelState ---
delete model["DataCollector"];
delete model["TaskScheduler"];
delete model["ModelScaler"];
delete model["_baseline_weight"];
// diagram_definition / animation_definition belong at the top level of the scenario file, not baked
// into model_definition (Model.load prefers a nested copy over the top-level one) — strip them.
delete model["diagram_definition"];
delete model["animation_definition"];
for (const key in model) if (key.startsWith("ncc")) delete model[key];
Object.values(model.models).forEach((m) => {
  for (const key in m) {
    if (key.startsWith("_")) delete m[key];
    if (key === "components" && Object.keys(m[key]).length > 0) {
      Object.keys(m[key]).forEach((cn) => { m.components[cn] = model.models[cn]; delete model.models[cn]; });
    }
  }
});
model.model_time_total = 0;

console.log = _log;
json.model_definition = model;
const out = JSON.stringify(json, null, 1) + "\n";
JSON.parse(out);
console.log(`reseed: ${Object.keys(model.models).length} top-level models, warmup ${SECONDS}s, output ${out.length} bytes`);
if (WRITE) { fs.writeFileSync(file, out); console.log("WROTE", file.pathname); }
else { fs.writeFileSync("/tmp/term_fetus_reseed.json", out); console.log("dry run -> /tmp/term_fetus_reseed.json (pass --write to commit)"); }
