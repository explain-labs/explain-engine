// Focused verification probe for the HeartFunction model.
//
// Each challenge runs from a FRESH build (challenges interfere if chained), warms
// up to steady state, then applies one load challenge and reports the HeartFunction
// response acutely and after time-compressed remodeling. ANS is frozen so the
// challenge isn't masked by baroreflex compensation.
//
// Usage: node scripts/probe_heartfunction.mjs [--seconds 90]

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? Number(argv[i + 1]) : d; };
const WARMUP = opt("--seconds", 90);
const SCENARIO = argv.find((a) => !a.startsWith("-")) || "term_neonate";

let liveModel = null;
globalThis.self = globalThis;
globalThis.postMessage = (m) => {
  if (!m || !m.type) return;
  if (m.type === "state") liveModel = m.payload;
  if (m.type === "error") console.error("ENGINE ERROR:", m.message, m.payload ?? "");
};
const _log = console.log;
console.log = () => {};
await import("../explain/ModelEngine.js");
console.log = _log;
const send = (t, msg, p) => self.onmessage({ data: { type: t, message: msg, payload: p } });
const def = JSON.parse(fs.readFileSync(new URL(`../public/model_definitions/${SCENARIO}.json`, import.meta.url), "utf8")).model_definition;
const r = (x, n = 3) => Number((x ?? 0).toFixed(n));

// build a fresh model, freeze ANS, compress remodeling so the chronic layer is observable
function freshModel() {
  console.log = () => {};
  send("POST", "build", def);
  send("GET", "state", []);
  console.log = _log;
  const model = liveModel;
  if (model.models.Ans) model.models.Ans.is_enabled = false;
  const HF = model.models.HeartFunction;
  HF.remodel_tc = 120;
  HF.stress_avg_tc = 15;
  HF.setpoint_warmup = WARMUP - 5;
  return model;
}

function panel(model, label) {
  const HF = model.models.HeartFunction, H = model.models.Heart;
  return {
    label,
    lv_ef: r(H.lv_ef, 3), lv_sv_mL: r(H.lv_sv * 1000, 2), lv_edv_mL: r(H.lv_edv * 1000, 2),
    sigma_es_lv: r(HF.wall_stress_es_lv, 1), sigma_ed_lv: r(HF.wall_stress_ed_lv, 1),
    ref_es_lv: r(HF.sigma_es_ref_lv, 1), ref_ed_lv: r(HF.sigma_ed_ref_lv, 1),
    load_factor_lv: r(HF.el_max_load_factor_lv, 3),
    el_max_remodel_lv: r(model.models.LV.el_max_remodel_factor, 3),
    u_vol_remodel_lv: r(model.models.LV.u_vol_remodel_factor, 3),
  };
}

// run one challenge from a fresh build: warm up, snapshot baseline, apply, snapshot acute + remodeled
function challenge(name, apply) {
  const model = freshModel();
  const run = (s) => send("POST", "calc", s);
  run(WARMUP);
  const base = panel(model, `${name}: baseline`);
  apply(model);
  run(60);
  const acute = panel(model, `${name}: +60s (acute)`);
  run(240);
  const chronic = panel(model, `${name}: +300s (remodeling)`);
  return [base, acute, chronic];
}

// afterload: arterial constriction (lower arterial unstressed volume -> higher arterial pressure).
// NB: term_neonate has a low-resistance runoff that defeats a pure SVR increase, so we constrict
// the arterial capacitances; the response is directional but modest in this scenario.
const afterload = challenge("afterload (art constrict x0.2)", (model) => {
  for (const n of ["AA", "AAR", "AD"]) {
    const m = model.models[n];
    if (m && typeof m.u_vol_factor_ps === "number") m.u_vol_factor_ps *= 0.2;
  }
});

// volume overload: transfuse the venous pools (+60%) -> over-fill the heart
const dilation = challenge("volume overload (transfuse +60%)", (model) => {
  for (const n of ["IVCI", "SVC", "VLB", "VUB", "PV"]) {
    const m = model.models[n];
    if (m && typeof m.vol === "number") m.vol *= 1.6;
  }
});

console.log(JSON.stringify({ results: [...afterload, ...dilation] }, null, 2));
