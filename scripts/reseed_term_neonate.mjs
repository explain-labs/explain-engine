// Re-bake term_neonate_72h.json at its steady state: build it, let it settle, and serialize the live model
// back into model_definition the way the app's save-state does (Model._processModelState, via
// _serialize_state.mjs). No parameter changes: only the state (volumes, pressures, contents, controller
// states such as Brain.autoreg_factor, the renal autoregulation factors, the ANS firing rates, the hormone
// activities, Thermoregulation.loss_trim) moves to where the model settles, so a loaded scenario starts
// without a drift in its first minutes.
//
//   node scripts/reseed_term_neonate.mjs [--seconds 600] [--write]
//
// The slowest controller states settle within ~10 min (Brain autoregulation, renal afferent/TGF factors;
// the renal myogenic factor keeps a small sustained oscillation), hence the 600 s default.
// Until 2026-10-25 this script also applied the original neonatal calibration deltas (heart_rate_ref 145,
// uma 6, venous u_vol x0.95, dif_co2 x6) before warming up; later calibrations changed or build on those
// values, so re-applying them would undo or compound them. They were removed.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createEngine } from "./_harness.mjs";
import { serializeState } from "./_serialize_state.mjs";

const argv = process.argv.slice(2);
const SECONDS = (() => { const i = argv.indexOf("--seconds"); return i >= 0 ? Number(argv[i + 1]) : 600; })();
const WRITE = argv.includes("--write");
const out = (...a) => process.stderr.write(a.join(" ") + "\n");

const file = new URL("../model_definitions/term_neonate_72h.json", import.meta.url);
const json = JSON.parse(fs.readFileSync(file, "utf8"));
const eng = await createEngine();
const model = eng.build(json.model_definition);
eng.calc(SECONDS);
// save at a sinus-node firing: a loaded heart fires on its first step (Heart._sa_node_timer is not
// saved), so the stored volumes then belong to the phase the cycle restarts in
const H = model.models.Heart;
for (let i = 0; i < 400; i++) {
  const before = H._sa_node_timer;
  eng.calc(model.modeling_stepsize);
  if (H._sa_node_timer < before) break;
}

const baselineWeight = json.model_definition._baseline_weight;
json.model_definition = serializeState(model);
// serializeState drops _baseline_weight (as the app's save does); the file carries it, so keep it
if (baselineWeight !== undefined) json.model_definition._baseline_weight = baselineWeight;
// the file is 2-space JSON without a trailing newline
const text = JSON.stringify(json, null, 2);
JSON.parse(text);
out(`reseed: ${Object.keys(json.model_definition.models).length} top-level models, settled ${SECONDS} s, ${text.length} bytes`);
if (WRITE) {
  fs.writeFileSync(file, text);
  out(`written ${file.pathname}`);
} else {
  const dry = path.join(os.tmpdir(), "term_neonate_reseed.json");
  fs.writeFileSync(dry, text);
  out(`dry run -> ${dry} (pass --write to save)`);
}
