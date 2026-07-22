// CPR / Resuscitation probe for the Explain engine.
//
// Builds a scenario headless (same global-shim trick as probe_vitals.mjs / probe_pda.mjs), warms to
// steady state, then simulates a cardiac ARREST (disables the Heart and makes the ventricles flaccid
// by zeroing their activation factor), and finally runs CPR via Resuscitation.switch_cpr(true) and
// records what the chest compressions do to the circulation and the ventilator.
//
// It is an INTERACTIVE probe (like every probe in this repo): it prints a labelled verdict table and
// always exits 0. A bad number is flagged in the table, not via the exit code — read the output.
//
// What it checks:
//   1. Compression waveform      - chest_comp_pres sweeps 0 -> chest_comp_max_pres -> 0 while compressing.
//   2. No stale pressure in pause - the paused branch forces chest_comp_pres to 0 each step, so no
//                                   stale compression pressure is applied during the ventilation pause
//                                   (regression for the "stale compression pressure during pause" bug;
//                                   tested deterministically because, under normal cycle timing, a
//                                   pause is always entered when the waveform is already ~0).
//   3. Compressions drive flow    - mean forward aortic-valve (LV_AA) flow under CPR rises well above
//                                   the arrested baseline (the pres_ext coupling reaches the heart/vessels).
//   4. Ventilations per pause     - breaths delivered during the pauses match vent_no per pause
//                                   (regression for the pause-breath scheduling cleanup).
//   5. Clean re-toggle            - switch_cpr(false) then (true) restarts a clean cycle: every internal
//                                   timer/counter and chest_comp_pres is back to 0 (regression for the
//                                   "cycle state not reset on switch_cpr" bug).
//
// Usage:
//   node scripts/probe_resuscitation.mjs <scenario> [--warmup N] [--cpr-seconds N] [--no-ans] [--verbose]

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const argv = process.argv.slice(2);
const scenario = argv.find((a) => !a.startsWith("-")) || "term_neonate";
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? Number(argv[i + 1]) : d; };
const WARMUP = opt("--warmup", 60);
const CPR_SECONDS = opt("--cpr-seconds", 40);
const ARREST_SETTLE = opt("--arrest-settle", 5);
const ARREST_WINDOW = opt("--arrest-window", 5);
const NO_ANS = flag("--no-ans");
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

await import("../ModelEngine.js");
const send = (type, message, payload) => self.onmessage({ data: { type, message, payload } });

const path = new URL(`../model_definitions/${scenario}.json`, import.meta.url);
const json = JSON.parse(fs.readFileSync(path, "utf8"));
const def = json.model_definition || json;

send("POST", "build", def);
send("GET", "state", []);
const model = liveModel;
if (!model || !model.models) { console.log = _log; console.error(`Build failed for "${scenario}".`); process.exit(1); }

if (NO_ANS && model.models.Ans) model.models.Ans.is_enabled = false;

const Resus = model.models.Resuscitation;
const Vent = model.models.Ventilator;
const Heart = model.models.Heart;
const LV_AA = model.models.LV_AA;   // aortic valve resistor (LV -> AA), flow in L/s
const AA = model.models.AA;         // ascending aorta
if (!Resus || !Vent || !Heart || !LV_AA || !AA) {
  console.log = _log;
  console.error(`Missing Resuscitation/Ventilator/Heart/LV_AA/AA models in "${scenario}".`);
  process.exit(1);
}

const dt = model.modeling_stepsize;
const round = (x, n = 2) => (typeof x === "number" && isFinite(x) ? Number(x.toFixed(n)) : x);

// warm up to steady state
send("POST", "calc", WARMUP);

// --- simulate cardiac arrest: freeze the heart and make the chambers flaccid (act_factor = 0) so the
//     only thing that can move blood is the chest compression itself.
Heart.is_enabled = false;
const chamberNames = ["LV", "RV", "LA", "RA", "RASVC", "RAIVCI"];
for (const n of chamberNames) {
  const m = model.models[n];
  if (m && typeof m.act_factor === "number") m.act_factor = 0.0;
}

// let the arrested circulation settle, then measure the baseline (no compressions) aortic flow
send("POST", "calc", ARREST_SETTLE);
let baseFlowSum = 0, baseN = 0;
{
  const steps = Math.round(ARREST_WINDOW / dt);
  for (let i = 0; i < steps; i++) {
    send("POST", "calc", dt);
    baseFlowSum += LV_AA.flow;
    baseN++;
  }
}
const arrestFlowLmin = (baseFlowSum / Math.max(baseN, 1)) * 60.0; // L/min

// --- start CPR
Resus.switch_cpr(true);
const maxPres = Resus.chest_comp_max_pres;
const ventNo = Resus.vent_no;

let compMax = -Infinity, compMin = Infinity;   // compression-pressure envelope while compressing
let pausePresMax = 0;                            // max compression pressure seen during pauses
let cprFlowSum = 0, cprFlowN = 0;                // mean aortic flow under CPR
let cprFlowFwdSum = 0;                           // forward-only aortic flow
let aaMin = Infinity, aaMax = -Infinity, aaSum = 0, aaN = 0;
let breathCount = 0, pauseCount = 0;
let prevInsp = Vent._inspiration;
let prevPause = Resus._comp_pause;

{
  const steps = Math.round(CPR_SECONDS / dt);
  for (let i = 0; i < steps; i++) {
    send("POST", "calc", dt);

    const paused = Resus._comp_pause;
    const p = Resus.chest_comp_pres;

    if (paused) {
      if (p > pausePresMax) pausePresMax = p;
    } else {
      if (p > compMax) compMax = p;
      if (p < compMin) compMin = p;
    }

    // aortic valve flow (L/s) generated by the compressions
    cprFlowSum += LV_AA.flow;
    if (LV_AA.flow > 0) cprFlowFwdSum += LV_AA.flow;
    cprFlowN++;

    // aortic pressure envelope
    const pa = AA.pres;
    if (pa < aaMin) aaMin = pa;
    if (pa > aaMax) aaMax = pa;
    aaSum += pa; aaN++;

    // count mechanical breaths (ventilator inspiration onsets) and pause onsets
    if (Vent._inspiration && !prevInsp) breathCount++;
    if (paused && !prevPause) pauseCount++;
    prevInsp = Vent._inspiration;
    prevPause = paused;
  }
}

const cprFlowLmin = (cprFlowSum / Math.max(cprFlowN, 1)) * 60.0;      // net mean, L/min
const cprFlowFwdLmin = (cprFlowFwdSum / Math.max(cprFlowN, 1)) * 60.0; // forward-only mean, L/min
const aaMean = aaSum / Math.max(aaN, 1);
const expectedBreaths = pauseCount * ventNo;

// --- deterministic bug-1 regression: inject a stale compression pressure while paused and confirm
//     the paused branch zeroes it on the next step (a real pause is always entered at a waveform
//     zero-crossing, so this cannot be exercised through the natural cycle).
Resus._comp_pause = true;
Resus._comp_pause_counter = 0.0;
Resus.chest_comp_pres = 99.0;
send("POST", "calc", dt);
const staleReset = Resus.chest_comp_pres === 0.0;

// --- clean re-toggle test: off then on should reset every internal cycle counter
Resus.switch_cpr(false);
Resus.switch_cpr(true);
const st = {
  _comp_timer: Resus._comp_timer,
  _comp_counter: Resus._comp_counter,
  _comp_pause: Resus._comp_pause,
  _comp_pause_counter: Resus._comp_pause_counter,
  _vent_counter: Resus._vent_counter,
  _vent_breath_count: Resus._vent_breath_count,
  chest_comp_pres: Resus.chest_comp_pres,
};
const toggleClean =
  st._comp_timer === 0 && st._comp_counter === 0 && st._comp_pause === false &&
  st._comp_pause_counter === 0 && st._vent_counter === 0 && st._vent_breath_count === 0 &&
  st.chest_comp_pres === 0;

// -------- report --------
console.log = _log;

const verdict = (ok) => (ok ? "ok" : "FAIL");
const near = (x, target, tol) => Math.abs(x - target) <= tol;

const ansOn = model.models.Ans?.is_enabled ? "ON" : "OFF";
console.log(`\n=== Resuscitation / CPR — ${scenario}  (ANS ${ansOn}, warmup ${WARMUP}s, CPR ${CPR_SECONDS}s) ===\n`);

// 1. compression waveform envelope
const peakOk = compMax >= 0.9 * maxPres && compMax <= 1.01 * maxPres;
const troughOk = compMin < 1.0; // mmHg
console.log(`${"Compression peak".padEnd(30)} ${String(round(compMax, 1)).padStart(9)} mmHg   (target ~${round(maxPres, 0)})  ${verdict(peakOk)}`);
console.log(`${"Compression trough".padEnd(30)} ${String(round(compMin, 2)).padStart(9)} mmHg   (target ~0)          ${verdict(troughOk)}`);

// 2. no stale compression pressure during ventilation pauses (bug-1 regression)
console.log(`${"Observed pause pressure".padEnd(30)} ${String(round(pausePresMax, 6)).padStart(9)} mmHg   (info: ~0 at cycle boundary)`);
console.log(`${"Stale-pressure reset in pause".padEnd(30)} ${String("").padStart(9)}        ${verdict(staleReset)}`);

// 3. compressions generate forward aortic flow vs the arrested baseline
const flowOk = cprFlowFwdLmin > 0.05 && cprFlowFwdLmin > Math.abs(arrestFlowLmin) + 0.02;
console.log(`${"Arrest baseline flow (LV_AA)".padEnd(30)} ${String(round(arrestFlowLmin, 3)).padStart(9)} L/min  (no compressions)`);
console.log(`${"CPR mean aortic flow (net)".padEnd(30)} ${String(round(cprFlowLmin, 3)).padStart(9)} L/min`);
console.log(`${"CPR mean aortic flow (fwd)".padEnd(30)} ${String(round(cprFlowFwdLmin, 3)).padStart(9)} L/min  (> baseline)        ${verdict(flowOk)}`);
console.log(`${"CPR aortic pressure".padEnd(30)} ${String(round(aaMean, 1)).padStart(9)} mmHg   (${round(aaMin, 0)}/${round(aaMax, 0)} min/max)`);

// 4. ventilations per pause (cleanup-7 regression)
const breathsOk = pauseCount > 0 && near(breathCount, expectedBreaths, 1);
console.log(`${"Compression pauses".padEnd(30)} ${String(pauseCount).padStart(9)}`);
console.log(`${"Breaths delivered".padEnd(30)} ${String(breathCount).padStart(9)}        (expect ${expectedBreaths} = pauses×vent_no)  ${verdict(breathsOk)}`);

// 5. clean re-toggle (bug-2 regression)
console.log(`${"Re-toggle resets cycle".padEnd(30)} ${String("").padStart(9)}        ${verdict(toggleClean)}`);
if (!toggleClean) console.log(`   state after off→on: ${JSON.stringify(st)}`);

const allOk = peakOk && troughOk && staleReset && flowOk && breathsOk && toggleClean;
console.log(`\nOverall: ${allOk ? "all checks ok" : "one or more checks FAILED — read the table above"}\n`);
