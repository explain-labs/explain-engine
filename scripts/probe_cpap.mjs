// CPAP-mode probe for the Explain engine.
//
// Reproduces and verifies the fix for the "Ventilator on CPAP" bug. The Breathing controller used
// to measure spontaneous tidal volume only from MOUTH_DS.flow; switching the Ventilator on blocks
// MOUTH_DS (no_flow=true) and routes gas through VENT_ETTUBE, so the controller read ~0 tidal
// volume, ramped rmp_gain to its ceiling, and the patient under-ventilated (pCO2 ~85). The fix
// (Breathing.js) measures the active airway inlet instead, so CPAP now ventilates correctly.
//
// This probe builds a scenario headless (same global-shim trick as headless.mjs / probe_vitals.mjs),
// records a spontaneous-breathing baseline, then switches the Ventilator into CPAP and re-measures.
//
// Usage:
//   node scripts/probe_cpap.mjs <scenario> [--baseline N] [--cpap N] [--window W]
//                                          [--peep cmH2O] [--flow L/min] [--verbose]
//   (scenario defaults to term_neonate)

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const argv = process.argv.slice(2);
const scenario = argv.find((a) => !a.startsWith("-")) || "term_neonate";
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? Number(argv[i + 1]) : d; };
const BASELINE = opt("--baseline", 120); // spontaneous warm-up before CPAP (s)
const CPAP_T = opt("--cpap", 240);       // time on CPAP to reach steady state (s)
const WINDOW = opt("--window", 20);      // cycle-averaging window (s)
const PEEP = opt("--peep", 5.0);         // CPAP level (cmH2O)
const FLOW = opt("--flow", 8.0);         // inspiratory bias flow (L/min)
const VERBOSE = flag("--verbose");

let liveModel = null;
globalThis.self = globalThis;
globalThis.postMessage = (msg) => {
  if (!msg || !msg.type) return;
  if (msg.type === "state") liveModel = msg.payload;
  if (msg.type === "error") console.error("ENGINE ERROR:", msg.message, msg.payload ?? "");
  if (msg.type === "status" && /ERROR/i.test(msg.message || "")) console.error("ENGINE:", msg.message);
};
const _log = console.log;
if (!VERBOSE) console.log = () => {};

await import("../explain/ModelEngine.js");
const send = (type, message, payload) => self.onmessage({ data: { type, message, payload } });

const path = new URL(`../public/model_definitions/${scenario}.json`, import.meta.url);
const json = JSON.parse(fs.readFileSync(path, "utf8"));
const def = json.model_definition || json;

send("POST", "build", def);
send("GET", "state", []);
const model = liveModel;
if (!model || !model.models) { console.log = _log; console.error(`Build failed for "${scenario}".`); process.exit(1); }

const Vent = model.models.Ventilator;
const Breathing = model.models.Breathing;
const AA = model.models.AA;          // ascending aorta — arterial blood gas
const M = model.models.Monitor;
if (!Vent || !Breathing) { console.log = _log; console.error(`Scenario "${scenario}" has no Ventilator/Breathing model.`); process.exit(1); }

const round = (x, n = 2) => (typeof x === "number" && isFinite(x) ? Number(x.toFixed(n)) : x);

// cycle-average the noted signals over WINDOW seconds (engine already at steady state)
function measure() {
  const SLICE = 0.02;
  const N = Math.round(WINDOW / SLICE);
  const acc = {};
  const add = (k, v) => { acc[k] = (acc[k] || 0) + (v ?? 0); };
  // these track the last-seen (not averaged) per-breath values
  let last = {};
  for (let i = 0; i < N; i++) {
    send("POST", "calc", SLICE);
    add("ph", AA?.ph); add("pco2", AA?.pco2); add("po2", AA?.po2);
    add("rr", M?.resp_rate ?? Breathing.resp_rate);
    add("spo2", M?.sao2_pre);
    last.rmp_gain = Breathing.rmp_gain;
    last.b_etv = Breathing.exp_tidal_volume;          // L (negative by convention)
    last.b_ttv = Breathing.target_tidal_volume;       // L
    last.v_etv = Vent.exp_tidal_volume;               // L
    last.v_mv = Vent.minute_volume;                   // L/min
  }
  for (const k in acc) acc[k] /= N;
  return { ...acc, ...last };
}

// --- 1. spontaneous-breathing baseline (ventilator off) ---
send("POST", "calc", BASELINE);
const base = measure();

// --- 2. switch to CPAP and re-measure ---
Vent.switch_ventilator(true);
Vent.set_cpap(PEEP, FLOW);
Breathing.breathing_enabled = true; // CPAP only ventilates a spontaneously breathing patient
send("POST", "calc", CPAP_T);
const cpap = measure();

console.log = _log;

const RMP_MAX = Breathing.rmp_gain_max ?? 100;
const fmt = (v, n = 2, w = 9) => String(round(v, n)).padStart(w);
const row = (label, k, n = 2, unit = "") =>
  `${label.padEnd(24)} ${fmt(base[k], n)}  ->  ${fmt(cpap[k], n)}   ${unit}`;

console.log(`\n=== CPAP probe: ${scenario}  (CPAP ${PEEP} cmH2O, bias flow ${FLOW} L/min) ===`);
console.log(`    baseline warm-up ${BASELINE}s,  CPAP ${CPAP_T}s,  window ${WINDOW}s\n`);
console.log(`${"".padEnd(24)} ${"baseline".padStart(9)}      ${"CPAP".padStart(9)}`);
console.log(row("Arterial pCO2", "pco2", 1, "mmHg"));
console.log(row("Arterial pO2", "po2", 1, "mmHg"));
console.log(row("Arterial pH", "ph", 3, ""));
console.log(row("SpO2 (pre-ductal)", "spo2", 1, "%"));
console.log(row("Resp rate", "rr", 1, "/min"));
console.log(row("Breathing.rmp_gain", "rmp_gain", 1, `(max ${RMP_MAX})`));
console.log(`${"Breathing exp TV".padEnd(24)} ${fmt((base.b_etv ?? 0) * 1000, 2)}  ->  ${fmt((cpap.b_etv ?? 0) * 1000, 2)}   mL`);
console.log(`${"Breathing target TV".padEnd(24)} ${fmt((base.b_ttv ?? 0) * 1000, 2)}  ->  ${fmt((cpap.b_ttv ?? 0) * 1000, 2)}   mL`);
console.log(`${"Ventilator exp TV".padEnd(24)} ${"   --   "}  ->  ${fmt((cpap.v_etv ?? 0) * 1000, 2)}   mL`);
console.log(`${"Ventilator minute vol".padEnd(24)} ${"   --   "}  ->  ${fmt(cpap.v_mv, 3)}   L/min`);

// --- pass/fail summary ---
const pinned = cpap.rmp_gain >= RMP_MAX - 0.5;
const hypercarbic = !(cpap.pco2 < 60);
const noTV = !(Math.abs(cpap.b_etv ?? 0) > 1e-6);
const fails = [];
if (pinned) fails.push(`rmp_gain pinned at ceiling (${round(cpap.rmp_gain, 1)})`);
if (hypercarbic) fails.push(`pCO2 not controlled (${round(cpap.pco2, 1)} mmHg)`);
if (noTV) fails.push("Breathing measures ~0 tidal volume on CPAP");

console.log("");
if (fails.length === 0) {
  console.log(`PASS — CPAP ventilates: pCO2 ${round(cpap.pco2, 1)} mmHg, rmp_gain ${round(cpap.rmp_gain, 1)}/${RMP_MAX}, exp TV ${round((cpap.b_etv ?? 0) * 1000, 2)} mL\n`);
} else {
  console.log(`FAIL — ${fails.join("; ")}\n`);
  process.exitCode = 1;
}
