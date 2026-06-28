// Verification / demo probe for the Brain (cerebral autoregulation + ICP) model. Demonstrates:
//   A. NEUTRALITY — enabling the model leaves the calibrated cerebral flow unchanged.
//   B. AUTOREGULATION vs PRESSURE-PASSIVE — a hypotensive insult (haemorrhage) with autoregulation
//      INTACT (gain 1) holds cerebral blood flow ~constant and protects brain oxygenation; with the
//      circulation PRESSURE-PASSIVE (gain 0, the sick/preterm or HIE brain) CBF tracks the falling
//      pressure and the brain goes ischaemic (BR_CAP.to2 collapses) — the substrate of IVH / HIE.
//   C. ICP — intracranial oedema raises ICP, lowers cerebral perfusion pressure (CPP = MAP − ICP) and
//      cerebral blood flow, and drives brain hypoxia.
//
// Usage: node scripts/probe_brain.mjs [--scenario term_neonate] [--bleed 0.3] [--edema 6] [--verbose]

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? Number(argv[i + 1]) : d; };
const sopt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const SCENARIO = sopt("--scenario", "term_neonate");
const BLEED = opt("--bleed", 0.15);  // fraction of blood volume removed (moderate haemorrhage)
const EDEMA = opt("--edema", 12.0);  // mL of intracranial oedema for the ICP test
const VERBOSE = flag("--verbose");

let liveModel = null;
globalThis.self = globalThis;
globalThis.postMessage = (msg) => {
  if (!msg || !msg.type) return;
  if (msg.type === "state") liveModel = msg.payload;
  if (msg.type === "error") console.error("ENGINE ERROR:", msg.message, msg.payload ?? "");
};
const _log = console.log;
if (!VERBOSE) console.log = () => {};

await import("../explain/ModelEngine.js");
const send = (type, message, payload) => self.onmessage({ data: { type, message, payload } });
const def = JSON.parse(fs.readFileSync(new URL(`../public/model_definitions/${SCENARIO}.json`, import.meta.url), "utf8")).model_definition;

function build() {
  send("POST", "build", def);
  send("GET", "state", []);
  const M = liveModel.models;
  if (M.Ans) M.Ans.is_enabled = false; // isolate the cerebral response from the baroreflex
  return M;
}
const r = (x, n = 2) => Number((x ?? 0).toFixed(n));
let dt;
function measure(M) {
  const B = M.Brain;
  const N = Math.round(6 / dt);
  let cbf = 0, map = 0, to2 = 0, n = 0;
  for (let i = 0; i < N; i++) { send("POST", "calc", dt); cbf += B.cbf; map += M.AA.pres; to2 += M.BR_CAP.to2; n++; }
  return { MAP: r(map / n, 1), CPP: r(B.cpp, 1), ICP: r(B.icp, 1), CBF_mLmin: r((cbf / n) * 1000, 1), autoreg_f: r(B.autoreg_factor, 2), brain_to2: r(to2 / n, 3) };
}
function bleed(M, frac) { for (const m of Object.values(M.models ? M.models : M)) { if (m && typeof m.vol === "number" && m.solutes && m.vol > 0) m.vol *= 1 - frac; } }

// ---- A. neutrality + reference baseline ----
let M = build(); dt = liveModel.modeling_stepsize;
send("POST", "calc", 120);
const baseline = measure(M);

// ---- B1. haemorrhage with autoregulation INTACT ----
M = build(); M.Brain.autoregulation_gain = 1.0; send("POST", "calc", 120);
bleed(liveModel, BLEED); send("POST", "calc", 90);
const auto_on = measure(M);

// ---- B2. haemorrhage with PRESSURE-PASSIVE circulation (autoregulation lost) ----
M = build(); M.Brain.autoregulation_gain = 0.0; send("POST", "calc", 120);
bleed(liveModel, BLEED); send("POST", "calc", 90);
const passive = measure(M);

// ---- C. intracranial oedema → ICP (autoregulation intact: CPP falls, CBF defended) ----
M = build(); send("POST", "calc", 120);
M.Brain.set_edema(EDEMA); send("POST", "calc", 120);
const icp = measure(M);

// ---- D. HIE combination: oedema (↑ICP) + impaired autoregulation → CBF falls, brain ischaemic ----
M = build(); M.Brain.autoregulation_gain = 0.0; send("POST", "calc", 120);
M.Brain.set_edema(EDEMA); send("POST", "calc", 120);
const hie = measure(M);

console.log = _log;
console.log(`\nBrain probe — scenario=${SCENARIO}, haemorrhage ${BLEED * 100}% blood vol, oedema ${EDEMA} mL  (ANS off)\n`);
console.table({
  "baseline (neutral)": baseline,
  [`bleed, autoreg INTACT`]: auto_on,
  [`bleed, PRESSURE-PASSIVE`]: passive,
  [`oedema (ICP, autoreg ok)`]: icp,
  [`oedema + lost autoreg (HIE)`]: hie,
});

const cbfDropAuto = (baseline.CBF_mLmin - auto_on.CBF_mLmin) / baseline.CBF_mLmin;
const cbfDropPassive = (baseline.CBF_mLmin - passive.CBF_mLmin) / baseline.CBF_mLmin;
console.log("\nNEUTRALITY: autoreg_f≈1 & CBF≈committed:", Math.abs(baseline.autoreg_f - 1) < 0.05);
console.log(`AUTOREGULATION protects CBF: drop intact ${(cbfDropAuto * 100).toFixed(0)}% << passive ${(cbfDropPassive * 100).toFixed(0)}%:`,
  cbfDropPassive > cbfDropAuto + 0.1,
  "| brain O2 better preserved when intact:", auto_on.brain_to2 > passive.brain_to2);
console.log("ICP: oedema raises ICP:", icp.ICP > baseline.ICP + 2,
  "| lowers CPP:", icp.CPP < baseline.CPP - 2,
  "| autoreg defends CBF (intact):", icp.CBF_mLmin > baseline.CBF_mLmin * 0.8);
console.log("HIE (oedema + lost autoreg): CBF falls:", hie.CBF_mLmin < baseline.CBF_mLmin * 0.85,
  "| brain ischaemia:", hie.brain_to2 < baseline.brain_to2 * 0.9);
