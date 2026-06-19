// Re-seed adult_female.json to its calibrated steady state.
//
// Builds the engine from the current definition, applies the hemodynamic calibration deltas
// (venous unstressed volume + right-heart diastolic stiffness — baked into the base values so
// all factors stay neutral), warms up to steady state, then serializes the live model back into
// model_definition exactly the way the app's save-state does (Model._processModelState):
// strip transient helpers, drop ncc counters and _-prefixed locals, re-nest each component under
// its parent. The result starts AT steady state on load, so there is no minutes-long startup
// transient and the calibration is locked in.
//
//   node scripts/reseed_adult_female.mjs [--seconds 400] [--write]
// Without --write it only prints what it would do (dry run).

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const argv = process.argv.slice(2);
const SECONDS = (() => { const i = argv.indexOf("--seconds"); return i >= 0 ? Number(argv[i + 1]) : 400; })();
const WRITE = argv.includes("--write");

let liveModel = null;
globalThis.self = globalThis;
globalThis.postMessage = (m) => { if (m && m.type === "state") liveModel = m.payload; };
const _log = console.log; console.log = () => {};
await import("../explain/ModelEngine.js");
const send = (t, msg, p) => self.onmessage({ data: { type: t, message: msg, payload: p } });

const file = new URL("../public/model_definitions/adult_female.json", import.meta.url);
const json = JSON.parse(fs.readFileSync(file, "utf8"));

send("POST", "build", json.model_definition);
send("GET", "state", []);
const model = liveModel;

// --- calibration deltas (baked into base values; factors remain 1.0) ---
for (const n of ["VLB", "VUB"]) { const m = model.models[n]; if (m) m.u_vol *= 0.96; }      // raise venous filling
for (const n of ["RV", "RAIVCI"]) { const m = model.models[n]; if (m) m.el_min *= 1.4; }     // right-heart diastolic stiffness → CVP

// --- warm up to steady state ---
send("POST", "calc", SECONDS);

// --- replicate Model._processModelState (main-thread save path) ---
delete model["DataCollector"];
delete model["TaskScheduler"];
delete model["ModelScaler"];
delete model["_baseline_weight"]; // not present in the original definition; re-frozen at build anyway
// diagram_definition / animation_definition get copied onto the live model at build but belong at
// the top level of the scenario file; strip them so they are not baked into model_definition as a
// stale duplicate (Model.load prefers a nested copy over the top-level one — see _processModelState)
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
model.model_time_total = 0; // fresh start

console.log = _log;
json.model_definition = model;
const out = JSON.stringify(json, null, 1) + "\n";
// sanity: must round-trip
JSON.parse(out);
const topModels = Object.keys(model.models).length;
console.log(`reseed: ${topModels} top-level models, warmup ${SECONDS}s, output ${out.length} bytes`);
if (WRITE) {
  fs.writeFileSync(file, out);
  console.log("WROTE", file.pathname);
} else {
  fs.writeFileSync("/tmp/adult_female_reseed.json", out);
  console.log("dry run -> /tmp/adult_female_reseed.json (pass --write to commit)");
}
