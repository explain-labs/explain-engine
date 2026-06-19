// Mitral-valve E/A ratio probe for the Explain engine.
//
// Builds a scenario headless (same global-shim trick as probe_vitals.mjs), warms to steady state,
// then records mitral-valve inflow (LA_LV.flow) at the model stepsize over a few cardiac cycles and
// reports the diastolic E/A ratio. The E (early passive filling) and A (atrial contraction) waves are
// separated using the Heart's own atrial activation signal (Heart.aaf): aaf == 0 during early/passive
// diastole, aaf > 0 only during atrial systole.
//
// Usage:
//   node scripts/probe_ea.mjs <scenario> [--seconds N] [--beats B] [--no-ans] [--trace] [--verbose]

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const argv = process.argv.slice(2);
const scenario = argv.find((a) => !a.startsWith("-")) || "adult_female";
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? Number(argv[i + 1]) : d; };
const SECONDS = opt("--seconds", 60);
const BEATS = opt("--beats", 6);
const NO_ANS = flag("--no-ans");
const TRACE = flag("--trace");
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

if (NO_ANS && model.models.Ans) model.models.Ans.is_enabled = false;

const Heart = model.models.Heart;
const LA_LV = model.models.LA_LV;   // mitral valve resistor
const LA = model.models.LA;         // left atrium
const LV = model.models.LV;         // left ventricle
const Monitor = model.models.Monitor;
if (!Heart || !LA_LV || !LA || !LV) {
  console.log = _log;
  console.error(`Missing heart models (Heart/LA_LV/LA/LV) in "${scenario}".`);
  process.exit(1);
}

// warm up to steady state
send("POST", "calc", SECONDS);

// record at the model stepsize so the diastolic waveform is fully resolved
const dt = model.modeling_stepsize;
const hr = Heart.heart_rate || Heart.heart_rate_ref || 70;
const cycle = 60 / hr;                       // seconds per beat
const recordSeconds = cycle * (BEATS + 1);   // +1 to cover the leading partial beat we discard
const steps = Math.round(recordSeconds / dt);

const trace = [];
let prevAaf = Heart.aaf;
for (let i = 0; i < steps; i++) {
  send("POST", "calc", dt);
  const aaf = Heart.aaf;
  // beat boundary = atrial activation onset (aaf rises from 0 to > 0)
  const beatStart = prevAaf <= 0 && aaf > 0;
  trace.push({
    t: model.model_time_total,
    flow: LA_LV.flow,        // L/s, mitral inflow
    la: LA.pres,
    lv: LV.pres,
    aaf,
    vaf: Heart.vaf,
    beatStart,
  });
  prevAaf = aaf;
}

// segment into beats using the atrial-activation onset markers
const boundaries = [];
trace.forEach((s, i) => { if (s.beatStart) boundaries.push(i); });

// Each diastole runs E-wave -> diastasis -> A-wave, in that order. We center a beat on the atrial
// activation onset `b` (boundary): the A wave is the mitral-flow hump at/after `b` (aaf > 0); the
// paired E wave is the contiguous flow > 0 region immediately BEFORE `b` (aaf == 0) — the same
// diastole, since flow stays positive through diastasis right up to the atrial kick and only drops
// to zero during the preceding systole.
function analyzeBeat(b) {
  // A wave: forward from the onset while atrial activation is engaged
  let aPeak = 0, aT = null, laMax = 0, lvMin = Infinity;
  for (let k = b; k < trace.length && trace[k].aaf > 0; k++) {
    const s = trace[k];
    if (s.flow > aPeak) { aPeak = s.flow; aT = s.t; }
    if (s.la > laMax) laMax = s.la;
    if (s.lv < lvMin) lvMin = s.lv;
  }
  // E wave: backward from just before the onset over the contiguous diastolic-inflow region
  let ePeak = 0, eT = null;
  for (let k = b - 1; k >= 0 && trace[k].flow > 0 && trace[k].aaf <= 0; k--) {
    const s = trace[k];
    if (s.flow > ePeak) { ePeak = s.flow; eT = s.t; }
    if (s.lv < lvMin) lvMin = s.lv;
  }
  return { ePeak, eT, aPeak, aT, laMax, lvMin };
}

const beats = [];
for (const b of boundaries) {
  const r = analyzeBeat(b);
  if (r.ePeak > 0 && r.aPeak > 0) beats.push(r);
}

console.log = _log;

if (beats.length === 0) {
  console.error(`\nCould not isolate complete E and A waves over ${BEATS} beats — check that the model is pulsatile / steady.`);
  process.exit(1);
}

// discard the first (transient/partial) beat if we have more than one
const used = beats.length > 1 ? beats.slice(1) : beats;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const round = (x, n = 3) => (typeof x === "number" && isFinite(x) ? Number(x.toFixed(n)) : x);

const eMean = mean(used.map((b) => b.ePeak));
const aMean = mean(used.map((b) => b.aPeak));
const eaMean = mean(used.map((b) => b.ePeak / b.aPeak));
const laMean = mean(used.map((b) => b.laMax));
const lvMean = mean(used.map((b) => b.lvMin));

const NORMAL = [0.8, 2.0]; // adult resting E/A band
const eaFlag = eaMean < NORMAL[0] ? " LOW (impaired relaxation)" : eaMean > NORMAL[1] ? " HIGH (restrictive)" : " ok";

console.log(`\n=== Mitral E/A — ${scenario}  (HR ${round(hr, 1)} bpm, ANS ${model.models.Ans?.is_enabled ? "ON" : "OFF"}, warmup ${SECONDS}s, beats analyzed ${used.length}) ===\n`);
console.log(`${"Peak E flow".padEnd(24)} ${String(round(eMean)).padStart(9)} L/s`);
console.log(`${"Peak A flow".padEnd(24)} ${String(round(aMean)).padStart(9)} L/s`);
console.log(`${"E/A ratio".padEnd(24)} ${String(round(eaMean, 2)).padStart(9)}    ${eaFlag}`);
console.log(`${"  (normal adult)".padEnd(24)} ${`${NORMAL[0]}-${NORMAL[1]}`.padStart(9)}`);
console.log(`${"LA peak pres (diast)".padEnd(24)} ${String(round(laMean, 2)).padStart(9)} mmHg`);
console.log(`${"LV min pres (diast)".padEnd(24)} ${String(round(lvMean, 2)).padStart(9)} mmHg`);

// per-beat breakdown (so we can see beat-to-beat variance => steady state)
console.log(`\n-- per beat --`);
console.log(`${"beat".padEnd(6)}${"E (L/s)".padStart(10)}${"A (L/s)".padStart(10)}${"E/A".padStart(8)}${"E@t".padStart(10)}${"A@t".padStart(10)}`);
used.forEach((b, i) => {
  console.log(
    `${String(i + 1).padEnd(6)}${String(round(b.ePeak)).padStart(10)}${String(round(b.aPeak)).padStart(10)}` +
    `${String(round(b.ePeak / b.aPeak, 2)).padStart(8)}${String(round(b.eT, 3)).padStart(10)}${String(round(b.aT, 3)).padStart(10)}`,
  );
});

if (TRACE) {
  // dump one representative beat's mitral-flow waveform (between the last two boundaries used)
  const lo = boundaries[boundaries.length - 2];
  const hi = boundaries[boundaries.length - 1];
  console.log(`\n-- mitral flow trace (one beat, t/flow/aaf) --`);
  for (let k = lo; k < hi; k += 4) { // every 4th sample (~2 ms) to keep it readable
    const s = trace[k];
    console.log(`${round(s.t, 4)}\t${round(s.flow, 4)}\t${round(s.aaf, 3)}`);
  }
}
console.log("");
