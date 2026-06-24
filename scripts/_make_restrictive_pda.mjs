// Build preterm_28wk_restrictive_pda.json from the calibrated preterm_28wk baseline.
//
// Models a *restrictive (closing)* ductus arteriosus — the phenotype on public/flow_patterns/
// restrictive_pda_flow.png (CW Doppler: continuous high-velocity left->right flow, low pulsatility).
// Two deltas vs preterm_28wk:
//   1. Pda.diameter_relative 0.45 -> RESTRICTIVE_DR (small, near-closed duct: tiny shunt volume, but
//      the full systemic->pulmonary gradient is now dropped across the duct -> high-velocity jet).
//   2. pulmonary_resistances x PVR_SCALE: PVR falls toward term-normal, which is the physiological
//      setting for ductal restriction (the transitional/hypoxic pulmonary vasoconstriction has
//      resolved). This drops PA pressure, widening the trans-ductal gradient so velocity_doppler
//      reaches a believable restrictive ~2.6-2.7 m/s instead of being capped at ~2.0 m/s by the
//      preterm's elevated PVR. (Velocity is gradient-limited: the 1 kg/28wk heart caps systemic
//      systolic ~38 mmHg, so the image's 3.5 m/s / 49 mmHg is supraphysiological here.)
//
// Un-warmed output (like _make_preterm.mjs); warm to steady state with:
//   node scripts/reseed_preterm.mjs --file preterm_28wk_restrictive_pda --write
//
//   node scripts/_make_restrictive_pda.mjs

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const RESTRICTIVE_DR = 0.13;   // restrictive/closing duct lumen (relative diameter)
const PVR_SCALE = 0.2;         // pulmonary resistance x0.2 on top of the baked preterm 1.75x -> low/resolved PVR
const BR_MAP_SETPOINT = 42;    // baroreflex MAP setpoint (34wk-appropriate); lifts systemic side so the jet
                               // reaches ~2.9 m/s — PVR alone plateaus at ~2.7 once PA floors out ~5/2 mmHg

let liveModel = null;
globalThis.self = globalThis;
globalThis.postMessage = (m) => { if (m && m.type === "state") liveModel = m.payload; };
const _log = console.log; console.log = () => {};
await import("../explain/ModelEngine.js");
const send = (t, msg, p) => self.onmessage({ data: { type: t, message: msg, payload: p } });

const src = new URL("../public/model_definitions/preterm_28wk.json", import.meta.url);
const dst = new URL("../public/model_definitions/preterm_28wk_restrictive_pda.json", import.meta.url);
const j = JSON.parse(fs.readFileSync(src, "utf8"));

send("POST", "build", j.model_definition);
send("GET", "state", []);
const model = liveModel;
const log = [];

// 1. restrictive duct
model.models.Pda.diameter_relative = RESTRICTIVE_DR;
log.push(`PDA: diameter_relative 0.45 -> ${RESTRICTIVE_DR} (restrictive/closing duct)`);

// 2. lower PVR (persistent r_factor_scaling_ps, compounds on the baked 1.75x preterm PVR)
send("POST", "scale", { group: "pulmonary_resistances", factor: PVR_SCALE });
log.push(`PVR: pulmonary resistances x${PVR_SCALE} (resolved -> low PA -> wider trans-ductal gradient)`);

// 3. lift the baroreflex MAP setpoint (PVR alone caps the jet ~2.7 m/s once PA floors; raising the
// systemic side carries velocity to ~2.9 m/s and lifts the otherwise deep-low preterm ABP)
model.models.BR_MAP.set_value = BR_MAP_SETPOINT;
log.push(`BR_MAP: baroreflex MAP setpoint -> ${BR_MAP_SETPOINT} (lifts systemic side; jet ~2.9 m/s)`);

// --- top-level metadata ---
j.name = "preterm_28wk_restrictive_pda";
j.user = "timothy";
j.description =
  "preterm 1 kg neonate, 28 weeks gestation with a RESTRICTIVE (closing) patent ductus arteriosus: " +
  "small near-closed duct with continuous high-velocity left-to-right shunt and low pulsatility " +
  "(Doppler restrictive pattern), on a background of resolving RDS with normalized pulmonary vascular " +
  "resistance; spontaneously breathing, no respiratory support";
model.name = j.name;
model.description = j.description;

// --- serialize like Model._processModelState (un-warmed; reseed_preterm.mjs warms to steady state) ---
delete model["DataCollector"]; delete model["TaskScheduler"]; delete model["ModelScaler"];
delete model["_baseline_weight"]; delete model["diagram_definition"]; delete model["animation_definition"];
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
j.model_definition = model;
const out = JSON.stringify(j, null, 1) + "\n";
JSON.parse(out);
fs.writeFileSync(dst, out);
console.log("wrote", dst.pathname);
console.log(log.join("\n"));
