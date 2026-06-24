// Ductus-arteriosus (PDA) Doppler-flow probe for the Explain engine.
//
// Builds a scenario headless (same global-shim trick as probe_vitals.mjs / probe_ea.mjs), warms to
// steady state, then records the duct waveform at the model stepsize over a few cardiac cycles and
// reports the metrics used to classify a PDA Doppler envelope:
//
//   - velocity_doppler  (Pda.velocity_doppler, m/s): modified-Bernoulli jet peak from the full
//     trans-ductal gradient p(AAR) - p(PA). This is the value seen on CW Doppler.
//   - flow_pa / flow_ao (L/s): resistive shunt flow; +ve = left->right (aorta -> pulmonary).
//   - gradient          (mmHg): p(AAR) - p(PA), the driver of velocity_doppler (= 4*v^2).
//
// Cardiac cycles are segmented on the Heart's atrial-activation onset (Heart.aaf rises 0 -> >0),
// the same boundary marker probe_ea.mjs uses. Per beat we take the systolic peak velocity, the
// end-diastolic (minimum) velocity, the mean velocity, and the fraction of the beat with forward
// (L->R) flow, then classify the pattern.
//
// Doppler patterns (Su BH et al.; El-Khuffash):
//   restrictive (closing) - pure L->R, continuous high velocity through systole AND diastole,
//                           low pulsatility (Vmax/Vmin small, high end-diastolic velocity).
//   pulsatile (hsPDA)     - pure L->R but near-zero end-diastolic velocity, high pulsatility.
//   bidirectional / PHT   - flow reverses (R->L) during part of the cycle.
//   closed                - no flow.
//
// Usage:
//   node scripts/probe_pda.mjs <scenario> [--seconds N] [--beats B] [--trace] [--no-ans] [--verbose]

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const argv = process.argv.slice(2);
const scenario = argv.find((a) => !a.startsWith("-")) || "preterm_28wk";
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? Number(argv[i + 1]) : d; };
const SECONDS = opt("--seconds", 120);
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
const Pda = model.models.Pda;
const AAR = model.models.AAR;   // aortic-arch compartment (duct aortic end)
const PA = model.models.PA;     // pulmonary-artery compartment (duct pulmonary end)
if (!Heart || !Pda || !AAR || !PA) {
  console.log = _log;
  console.error(`Missing Heart/Pda/AAR/PA models in "${scenario}".`);
  process.exit(1);
}
const weight = model.weight || 1;

// warm up to steady state
send("POST", "calc", SECONDS);

// record at the model stepsize so the velocity envelope is fully resolved
const dt = model.modeling_stepsize;
const hr = Heart.heart_rate || Heart.heart_rate_ref || 150;
const cycle = 60 / hr;                       // seconds per beat
const recordSeconds = cycle * (BEATS + 1);   // +1 to cover the leading partial beat we discard
const steps = Math.round(recordSeconds / dt);

const trace = [];
let prevAaf = Heart.aaf;
for (let i = 0; i < steps; i++) {
  send("POST", "calc", dt);
  const aaf = Heart.aaf;
  const beatStart = prevAaf <= 0 && aaf > 0; // atrial-activation onset
  trace.push({
    t: model.model_time_total,
    v: Pda.velocity_doppler,   // m/s, Bernoulli jet (CW Doppler value)
    q: Pda.flow_pa,            // L/s, +ve = L->R shunt at the PA end
    qao: Pda.flow_ao,          // L/s, +ve = L->R shunt at the AO end
    p_aa: AAR.pres,
    p_pa: PA.pres,
    grad: AAR.pres - PA.pres,  // mmHg
    phase: Heart.cardiac_cycle_state, // 1 = systole (mitral close -> aortic close), 0 = diastole
    beatStart,
  });
  prevAaf = aaf;
}

// segment into beats on the atrial-activation onset markers
const boundaries = [];
trace.forEach((s, i) => { if (s.beatStart) boundaries.push(i); });

function analyzeBeat(lo, hi) {
  let vMax = -Infinity, vMin = Infinity, gMax = -Infinity;
  let qSum = 0, fwd = 0, n = 0;
  let vMaxT = null;
  // phase-resolved peaks: largest-magnitude velocity (sign kept = direction) in each phase,
  // and the systolic peak of the PA->Ao gradient (positive = suprasystemic PA, drives R->L).
  let sysV = 0, diaV = 0, sysPaAoGrad = -Infinity;
  let sysN = 0, diaN = 0;
  for (let k = lo; k < hi; k++) {
    const s = trace[k];
    if (s.v > vMax) { vMax = s.v; vMaxT = s.t; }
    if (s.v < vMin) vMin = s.v;
    if (s.grad > gMax) gMax = s.grad;
    if (s.phase === 1) { // systole
      if (Math.abs(s.v) > Math.abs(sysV)) sysV = s.v;
      const paAo = s.p_pa - s.p_aa;          // +ve = PA above Ao
      if (paAo > sysPaAoGrad) sysPaAoGrad = paAo;
      sysN++;
    } else {             // diastole
      if (Math.abs(s.v) > Math.abs(diaV)) diaV = s.v;
      diaN++;
    }
    qSum += s.q;
    if (s.q > 0) fwd++;
    n++;
  }
  return {
    vMax, vMin, vMaxT, gMax,
    qMean: qSum / n,           // L/s mean shunt over the beat
    fwdFrac: fwd / n,          // fraction of beat with forward (L->R) flow
    sysV: sysN > 0 ? sysV : NaN,   // systolic peak velocity (sign = direction)
    diaV: diaN > 0 ? diaV : NaN,   // diastolic peak velocity (sign = direction)
    sysPaAoGrad: sysN > 0 ? sysPaAoGrad : NaN, // systolic peak PA-Ao gradient (mmHg)
  };
}

const beats = [];
for (let i = 0; i + 1 < boundaries.length; i++) {
  beats.push(analyzeBeat(boundaries[i], boundaries[i + 1]));
}

console.log = _log;

if (beats.length === 0) {
  console.error(`\nCould not isolate complete cardiac cycles over ${BEATS} beats — check that the model is pulsatile / steady.`);
  process.exit(1);
}

// discard the first (transient/partial) beat if we have more than one
const used = beats.length > 1 ? beats.slice(1) : beats;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const meanF = (xs) => { const f = xs.filter((x) => isFinite(x)); return f.length ? mean(f) : NaN; };
const round = (x, n = 3) => (typeof x === "number" && isFinite(x) ? Number(x.toFixed(n)) : x);

const vMaxMean = mean(used.map((b) => b.vMax));   // systolic peak velocity (m/s)
const vMinMean = mean(used.map((b) => b.vMin));   // end-diastolic / min velocity (m/s)
const gMaxMean = mean(used.map((b) => b.gMax));   // peak trans-ductal gradient (mmHg)
const qMeanMean = mean(used.map((b) => b.qMean)); // mean shunt (L/s)
const fwdMean = mean(used.map((b) => b.fwdFrac)); // forward-flow fraction
const pulsatility = vMinMean > 0.01 ? vMaxMean / vMinMean : Infinity;

// phase-resolved means (the document is defined by phase: systole R->L, diastole L->R)
const sysVMean = meanF(used.map((b) => b.sysV));         // systolic peak velocity (sign = dir)
const diaVMean = meanF(used.map((b) => b.diaV));         // diastolic peak velocity (sign = dir)
const sysGradMean = meanF(used.map((b) => b.sysPaAoGrad)); // systolic peak PA-Ao gradient (mmHg)
const dirOf = (v) => (!isFinite(v) ? "n/a" : v >= 0 ? "L->R" : "R->L");
const sysDir = dirOf(sysVMean);
const diaDir = dirOf(diaVMean);

// mean shunt: L/s -> mL/min and mL/kg/min
const shuntMlMin = qMeanMean * 1000 * 60;
const dir = qMeanMean >= 0 ? "L->R" : "R->L";

// classify
let pattern, note;
if (Math.abs(vMaxMean) < 0.2 && Math.abs(shuntMlMin) < 5) {
  pattern = "closed"; note = "negligible flow / velocity";
} else if (fwdMean < 0.05) {
  // essentially no forward (L->R) flow → suprasystemic PA the whole cycle (severe PPHN)
  pattern = "RIGHT-TO-LEFT (suprasystemic PA / PPHN)";
  note = `flow is R->L for ${round((1 - fwdMean) * 100, 0)}% of the cycle (PA above Ao all cycle)`;
} else if (fwdMean < 0.95) {
  pattern = "bidirectional / PHT"; note = `flow reverses (R->L) for ${round((1 - fwdMean) * 100, 0)}% of the cycle`;
} else if (isFinite(pulsatility) && pulsatility <= 2.0 && vMaxMean >= 2.0) {
  pattern = "RESTRICTIVE (closing)"; note = "continuous L->R, high velocity, low pulsatility";
} else if (pulsatility > 3.0 || vMinMean < 0.5) {
  pattern = "pulsatile (hsPDA)"; note = "continuous L->R but high pulsatility / low end-diastolic velocity";
} else {
  pattern = "intermediate"; note = "between restrictive and pulsatile";
}

const ansOn = model.models.Ans?.is_enabled ? "ON" : "OFF";
console.log(`\n=== PDA Doppler — ${scenario}  (HR ${round(hr, 1)} bpm, ANS ${ansOn}, warmup ${SECONDS}s, beats ${used.length}) ===\n`);
console.log(`${"Peak velocity (systolic)".padEnd(28)} ${String(round(vMaxMean, 2)).padStart(9)} m/s   (${round(vMaxMean * 100, 0)} cm/s)`);
console.log(`${"End-diastolic velocity".padEnd(28)} ${String(round(vMinMean, 2)).padStart(9)} m/s   (${round(vMinMean * 100, 0)} cm/s)`);
console.log(`${"Mean velocity".padEnd(28)} ${String(round(mean(used.map((b) => (b.vMax + b.vMin) / 2)), 2)).padStart(9)} m/s`);
console.log(`${"Pulsatility (Vmax/Vmin)".padEnd(28)} ${String(round(pulsatility, 2)).padStart(9)}`);
// EDV/PSV ratio (end-diastolic / peak-systolic velocity) — the headline metric for a
// continuous L->R (unrestrictive) duct; low ratio = rapid diastolic pressure equalization.
const edvPsv = vMaxMean !== 0 ? vMinMean / vMaxMean : NaN;
console.log(`${"EDV/PSV ratio".padEnd(28)} ${String(round(edvPsv, 2)).padStart(9)}`);
console.log(`${"Peak gradient".padEnd(28)} ${String(round(gMaxMean, 1)).padStart(9)} mmHg`);
console.log(`${"Forward (L->R) flow".padEnd(28)} ${String(round(fwdMean * 100, 0)).padStart(9)} % of cycle`);
console.log(`${"Mean shunt".padEnd(28)} ${String(round(shuntMlMin, 0)).padStart(9)} mL/min  ${dir}  (${round(shuntMlMin / weight, 0)} mL/kg/min)`);
console.log(`\nPattern:  ${pattern}  — ${note}`);

// phase-resolved summary (maps onto the BidirectionalPDA document panels)
console.log(`\n-- phase-resolved (systole = mitral-close..aortic-close) --`);
console.log(`${"Systolic peak velocity".padEnd(28)} ${String(round(sysVMean, 2)).padStart(9)} m/s   (${round(sysVMean * 100, 0)} cm/s)  ${sysDir}`);
console.log(`${"Diastolic peak velocity".padEnd(28)} ${String(round(diaVMean, 2)).padStart(9)} m/s   (${round(diaVMean * 100, 0)} cm/s)  ${diaDir}`);
console.log(`${"Systolic PA-Ao gradient".padEnd(28)} ${String(round(sysGradMean, 1)).padStart(9)} mmHg  (+ve = suprasystemic PA)`);
if (sysDir === "R->L" && diaDir === "L->R") {
  console.log(`\nBidirectional signature CONFIRMED:  systolic R->L / diastolic L->R (matches BidirectionalPDA.pdf)`);
} else {
  console.log(`\nBidirectional signature NOT met:  systolic ${sysDir} / diastolic ${diaDir} (document wants systolic R->L / diastolic L->R)`);
}

console.log(`\nReference (restrictive_pda_flow.png):  peak ~3.5 m/s (351 cm/s), peak gradient ~49 mmHg, continuous forward flow, low pulsatility.`);

// per-beat breakdown (to confirm steady state)
console.log(`\n-- per beat --`);
console.log(`${"beat".padEnd(6)}${"Vmax".padStart(9)}${"Vmin".padStart(9)}${"V/V".padStart(8)}${"gradMax".padStart(10)}${"fwd%".padStart(8)}${"shunt".padStart(10)}${"sysV".padStart(9)}${"diaV".padStart(9)}${"sysGrad".padStart(9)}`);
used.forEach((b, i) => {
  console.log(
    `${String(i + 1).padEnd(6)}${String(round(b.vMax, 2)).padStart(9)}${String(round(b.vMin, 2)).padStart(9)}` +
    `${String(round(isFinite(b.vMax / b.vMin) ? b.vMax / b.vMin : 0, 2)).padStart(8)}${String(round(b.gMax, 1)).padStart(10)}` +
    `${String(round(b.fwdFrac * 100, 0)).padStart(8)}${String(round(b.qMean * 60000, 0)).padStart(10)}` +
    `${String(round(b.sysV, 2)).padStart(9)}${String(round(b.diaV, 2)).padStart(9)}${String(round(b.sysPaAoGrad, 1)).padStart(9)}`,
  );
});

if (TRACE) {
  // dump one representative beat's waveform (between the last two boundaries used)
  const lo = boundaries[boundaries.length - 2];
  const hi = boundaries[boundaries.length - 1];
  console.log(`\n-- waveform trace (one beat) --`);
  console.log(`t\tv_doppler(m/s)\tflow_pa(L/s)\tgrad(mmHg)`);
  for (let k = lo; k < hi; k += 4) { // every 4th sample (~2 ms) to keep it readable
    const s = trace[k];
    console.log(`${round(s.t, 4)}\t${round(s.v, 4)}\t${round(s.q, 5)}\t${round(s.grad, 2)}`);
  }
}
console.log("");
