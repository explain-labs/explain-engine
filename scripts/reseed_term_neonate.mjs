// Re-seed term_neonate.json to its calibrated steady state (same approach as reseed_adult_female.mjs).
//
// Applies the neonatal calibration deltas, warms up to steady state, then serializes the live model
// back into model_definition the way the app's save-state does (Model._processModelState).
//
//   node scripts/reseed_term_neonate.mjs [--seconds 200] [--write]

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const argv = process.argv.slice(2);
const SECONDS = (() => { const i = argv.indexOf("--seconds"); return i >= 0 ? Number(argv[i + 1]) : 200; })();
const WRITE = argv.includes("--write");

let liveModel = null;
globalThis.self = globalThis;
globalThis.postMessage = (m) => { if (m && m.type === "state") liveModel = m.payload; };
const _log = console.log; console.log = () => {};
await import("../explain/ModelEngine.js");
const send = (t, msg, p) => self.onmessage({ data: { type: t, message: msg, payload: p } });

const file = new URL("../public/model_definitions/term_neonate.json", import.meta.url);
const json = JSON.parse(fs.readFileSync(file, "utf8"));

send("POST", "build", json.model_definition);
send("GET", "state", []);
const model = liveModel;

// --- neonatal calibration deltas (baked into base values; factors stay 1.0) ---
const Blood = model.models.Blood;
Blood.set_solute("hemoglobin", 10.0); // term-newborn polycythemia (≈16 g/dL), was 8
Blood.set_solute("uma", 6.0);         // newborn-like mild metabolic acidosis (HCO3 ~22, BE ~-3), was 3.8
if (model.models.Heart) model.models.Heart.heart_rate_ref = 145;                 // resting HR ~130, was ref 125
for (const n of ["VLB", "VUB"]) { const m = model.models[n]; if (m) m.u_vol *= 0.95; }       // preload → CO ~195 mL/kg/min
for (const n of ["GASEX_LL", "GASEX_RL"]) { const m = model.models[n]; if (m) m.dif_co2 *= 6; } // CO2 diffusion (was =dif_o2) → etCO2 35-40

// --- warm up to steady state ---
send("POST", "calc", SECONDS);

// --- replicate Model._processModelState ---
delete model["DataCollector"];
delete model["TaskScheduler"];
delete model["ModelScaler"];
delete model["_baseline_weight"];
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
else { fs.writeFileSync("/tmp/term_neonate_reseed.json", out); console.log("dry run -> /tmp/term_neonate_reseed.json (pass --write to commit)"); }
