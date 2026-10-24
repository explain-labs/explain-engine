// Re-seed preterm_<ga>wk.json to its calibrated steady state (same approach as reseed_term_neonate.mjs).
//
// All preterm calibration (size scaling + RDS) already lives in the scenario JSON (written by
// scripts/_make_preterm.mjs), so this script just warms the model to steady state and serializes it back
// into model_definition the way the app's save-state does (Model._processModelState) — baking the
// equilibrium gas/volume seeds and clearing startup transients so the file loads at its operating point.
//
//   node scripts/archive/reseed_preterm.mjs 28 [--seconds 250] [--write]      (also 32, 34)
//
// Below 34 wk it also sets the healthy renal reference of the gestation (scripts/_renal_reference.mjs,
// scripts/_renal_bed.mjs): Bowman, oncotic and kf, a renal bed solved for the renal blood flow and
// glomerular pressure targets, and the kidney controllers seeded at that resting state.
//
// Variant scenarios that aren't named preterm_<ga>wk.json (e.g. preterm_28wk_restrictive_pda) can be
// reseeded by passing the scenario name explicitly:
//   node scripts/archive/reseed_preterm.mjs --file preterm_28wk_restrictive_pda [--seconds 250] [--write]
//
// --gfr-factor <x> multiplies the renal reference's GFR target (default 1; see _renal_reference.mjs).

import fs from "node:fs";
import { register } from "node:module";
import { renalReference, describeRenalReference, TERM_RENAL } from "../_renal_reference.mjs";
import { solveRenalBed } from "../_renal_bed.mjs";
register("../resolve-extensionless.mjs", import.meta.url);

const argv = process.argv.slice(2);
const fileIdx = argv.indexOf("--file");
const scenario = fileIdx >= 0 ? argv[fileIdx + 1] : null;
const ga = Number(argv.find((a) => !a.startsWith("-")));
if (!scenario && ![24, 26, 28, 30, 32, 34, 36].includes(ga)) { console.error(`unknown GA "${argv[0]}"; use 24, 26, 28, 30, 32, 34 or 36, or pass --file <scenario>`); process.exit(1); }
const name = scenario || `preterm_${ga}wk`;
const SECONDS = (() => { const i = argv.indexOf("--seconds"); return i >= 0 ? Number(argv[i + 1]) : 250; })();
const WRITE = argv.includes("--write");
const GFR_FACTOR = (() => { const i = argv.indexOf("--gfr-factor"); return i >= 0 ? Number(argv[i + 1]) : 1; })();

let liveModel = null;
globalThis.self = globalThis;
globalThis.postMessage = (m) => { if (m && m.type === "state") liveModel = m.payload; };
const _log = console.log; console.log = () => {};
await import("../../ModelEngine.js");
const send = (t, msg, p) => self.onmessage({ data: { type: t, message: msg, payload: p } });

const eng = {
  build: (def) => { send("POST", "build", def); send("GET", "state", []); return liveModel; },
  calc: (s) => send("POST", "calc", s),
};

const file = new URL(`../../model_definitions/archive/${name}.json`, import.meta.url);
const json = JSON.parse(fs.readFileSync(file, "utf8"));

const model = eng.build(json.model_definition);

// preterm calibration is fully baked into the JSON; no extra deltas here — just warm to steady state.
eng.calc(SECONDS);

// healthy renal reference of this gestation and size (< 34 wk): set the renal bed and seed the kidney's
// controllers at rest (scripts/_renal_bed.mjs), then warm again so the file loads at that state
const brMap = model.models.BR_MAP.set_value;
const renalRef = renalReference({ ga: model.gestational_age, weight: model.weight, height: model.height, brMap, gfrFactor: GFR_FACTOR });
const renalLog = describeRenalReference(renalRef);
if (renalRef) {
  solveRenalBed(eng, model, renalRef, { brMap, termBrMap: TERM_RENAL.brMap });
  eng.calc(SECONDS);
}

// --- replicate Model._processModelState ---
delete model["DataCollector"];
delete model["TaskScheduler"];
delete model["ModelScaler"];
delete model["_baseline_weight"];
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
console.log(`reseed ${name}: ${Object.keys(model.models).length} top-level models, warmup ${SECONDS}s, output ${out.length} bytes`);
console.log(renalLog);
if (WRITE) { fs.writeFileSync(file, out); console.log("WROTE", file.pathname); }
else { fs.writeFileSync(`/tmp/${name}_reseed.json`, out); console.log(`dry run -> /tmp/${name}_reseed.json (pass --write to commit)`); }
