// Verification / demo probe for apnea of prematurity (the Apnea controller + the hypoxic-bradycardia
// chemoreflex). Drives the engine headless, enables apnea generation, and characterises each episode:
// its duration, the oxygen-desaturation nadir, the bradycardia nadir, and the lag between desaturation
// onset and bradycardia onset — the clinical signature of AOP (apnea -> desaturation -> bradycardia,
// with heart-rate recovery typically preceding saturation recovery).
//
// The cascade is emergent: the Apnea model only suppresses ventilation (central = cut drive,
// obstructive = occlude MOUTH_DS, mixed = both). Falling alveolar/arterial pO2 desaturates the blood
// through the unchanged gas-exchange physics, and the pO2 chemoreceptor (CR_PO2_HR -> EF_HR_CHEMO ->
// Heart.hr_chemo_factor) slows the heart. --no-chemoreflex disables that efferent to show that without
// it the episodes still desaturate but the heart rate barely moves.
//
// Usage:
//   node scripts/probe_apnea.mjs [preterm_28wk]
//   node scripts/probe_apnea.mjs preterm_24wk --type mixed --seconds 300
//   node scripts/probe_apnea.mjs preterm_28wk --no-chemoreflex
// Flags: --type central|obstructive|mixed, --seconds N (measure window), --warmup N, --seed N,
//        --no-chemoreflex, --verbose

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const sopt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const SCENARIO = (argv[0] && !argv[0].startsWith("--")) ? argv[0] : "preterm_28wk";
const TYPE = sopt("--type", null);
const WINDOW = Number(sopt("--seconds", 300));
const WARMUP = Number(sopt("--warmup", 60));
const SEED = sopt("--seed", null);
const NO_CHEMO = flag("--no-chemoreflex");
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

await import("../ModelEngine.js");
const send = (type, message, payload) => self.onmessage({ data: { type, message, payload } });
const raw = JSON.parse(fs.readFileSync(new URL(`../model_definitions/${SCENARIO}.json`, import.meta.url), "utf8"));
const def = raw.model_definition || raw;

send("POST", "build", def);
send("GET", "state", []);
const M = liveModel.models;
const r = (x, n = 1) => Number((x ?? 0).toFixed(n));

if (!M.Apnea) {
  console.error(`${SCENARIO} has no Apnea model — run: node scripts/_add_apnea.mjs ${SCENARIO}`);
  process.exit(1);
}

// SLICE sets the sampling resolution of the SpO2 / heart-rate time series (episodes are ~10-18 s, so
// 0.1 s is ample to resolve nadirs and the desat->brady lag).
const SLICE = 0.1;
const readSao2 = () => M.AA?.so2 ?? -1;   // pre-ductal arterial saturation (%)
const readHr = () => M.Heart?.heart_rate ?? 0; // instantaneous computed heart rate (bpm)

// ---- baseline (apnea dormant) ----
M.Apnea.apnea_enabled = false;
send("POST", "calc", WARMUP);
let bSao2 = 0, bHr = 0, bN = 0;
for (let t = 0; t < 15; t += SLICE) { send("POST", "calc", SLICE); bSao2 += readSao2(); bHr += readHr(); bN++; }
const baseSao2 = bSao2 / bN, baseHr = bHr / bN;

// ---- optionally sever the chemoreflex (disable the efferent's step; the Ans manager re-asserts
// ans_active every cycle, so is_enabled is the flag that actually sticks) ----
if (NO_CHEMO && M.EF_HR_CHEMO) {
  M.EF_HR_CHEMO.is_enabled = false;
  M.Heart.hr_chemo_factor = 1.0;
}

// ---- enable apnea and record the time series ----
M.Apnea.apnea_enabled = true;
if (TYPE) M.Apnea.apnea_type = TYPE;
if (SEED !== null) { M.Apnea.seed = Number(SEED); M.Apnea._rng_state = (Number(SEED) >>> 0) || 1; }

const desatThresh = baseSao2 - 3;   // % — onset of a meaningful desaturation
const bradyThresh = baseHr * 0.9;   // bpm — onset of a meaningful bradycardia (-10%)

const series = [];
let tSim = 0;
for (let i = 0; i < Math.round(WINDOW / SLICE); i++) {
  send("POST", "calc", SLICE);
  tSim += SLICE;
  series.push({ t: tSim, sao2: readSao2(), hr: readHr(), in_apnea: M.Apnea.in_apnea });
}

// ---- segment into episodes on rising edges of in_apnea; nadir/recovery may extend past the pause,
// so each episode owns the samples up to the next episode's onset ----
const onsets = [];
for (let i = 1; i < series.length; i++) {
  if (series[i].in_apnea && !series[i - 1].in_apnea) onsets.push(i);
}

const episodes = [];
for (let e = 0; e < onsets.length; e++) {
  const start = onsets[e];
  const end = e + 1 < onsets.length ? onsets[e + 1] : series.length;
  const seg = series.slice(start, end);
  let minSao2 = Infinity, minSao2I = start, minHr = Infinity, minHrI = start;
  let desatT = null, bradyT = null, pauseSamples = 0;
  const t0 = seg[0].t;
  for (let j = 0; j < seg.length; j++) {
    const s = seg[j];
    if (s.in_apnea) pauseSamples++;
    if (s.sao2 < minSao2) { minSao2 = s.sao2; minSao2I = j; }
    if (s.hr < minHr) { minHr = s.hr; minHrI = j; }
    if (desatT === null && s.sao2 < desatThresh) desatT = s.t;
    if (bradyT === null && s.hr < bradyThresh) bradyT = s.t;
  }
  // recovery = first sample AFTER the nadir that climbs back above the onset threshold. HR (fast vagal
  // reflex) is expected to recover before SpO2 (slower re-oxygenation) — a hallmark of AOP.
  let hrRecT = null, sao2RecT = null;
  for (let j = minHrI; j < seg.length; j++) { if (seg[j].hr >= bradyThresh) { hrRecT = seg[j].t; break; } }
  for (let j = minSao2I; j < seg.length; j++) { if (seg[j].sao2 >= desatThresh) { sao2RecT = seg[j].t; break; } }
  episodes.push({
    duration: r(pauseSamples * SLICE, 1),
    sao2_nadir: r(minSao2, 1),
    hr_nadir: r(minHr, 0),
    desat_lag: desatT !== null ? r(desatT - t0, 1) : null,
    brady_lag: bradyT !== null && desatT !== null ? r(bradyT - desatT, 1) : null,
    hr_recovers_first: hrRecT !== null && sao2RecT !== null && hrRecT < sao2RecT,
  });
}

// ---- aggregate ----
const withBrady = episodes.filter((x) => x.hr_nadir < bradyThresh);
const lags = episodes.map((x) => x.brady_lag).filter((x) => x !== null);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const recFirst = episodes.filter((x) => x.hr_recovers_first).length;

const out = [];
out.push(`=== apnea of prematurity: ${SCENARIO}  (GA ${def.gestational_age ?? "?"} wk, ${M.Apnea.apnea_type}, ${NO_CHEMO ? "chemoreflex OFF" : "chemoreflex ON"}) ===`);
out.push("");
out.push(`baseline (eupneic):      SpO2 ${r(baseSao2, 1)} %   HR ${r(baseHr, 0)} bpm`);
out.push(`apnea settings:          freq ${M.Apnea.apnea_frequency}/min, mean dur ${M.Apnea.apnea_duration}s, variability ${M.Apnea.apnea_variability}, seed ${M.Apnea.seed}`);
out.push(`measure window:          ${WINDOW}s`);
out.push("");
out.push(`episodes:                ${episodes.length}  (episodes with bradycardia: ${withBrady.length})`);
if (episodes.length) {
  out.push(`mean episode duration:   ${r(mean(episodes.map((x) => x.duration)), 1)} s   (longest ${r(Math.max(...episodes.map((x) => x.duration)), 1)} s)`);
  out.push(`mean SpO2 nadir:         ${r(mean(episodes.map((x) => x.sao2_nadir)), 1)} %   (deepest ${r(Math.min(...episodes.map((x) => x.sao2_nadir)), 1)} %)`);
  out.push(`mean HR nadir:           ${r(mean(episodes.map((x) => x.hr_nadir)), 0)} bpm (lowest ${r(Math.min(...episodes.map((x) => x.hr_nadir)), 0)} bpm)`);
  out.push(`mean desat->brady lag:   ${lags.length ? r(mean(lags), 1) + " s" : "n/a (no bradycardia)"}`);
  out.push(`HR recovers before SpO2: ${recFirst}/${episodes.length} episodes`);
  out.push("");
  out.push("per-episode:  #   dur(s)  SpO2nadir  HRnadir  desat_lag(s)  brady_lag(s)");
  episodes.forEach((x, i) => {
    out.push(
      `           ${String(i + 1).padStart(4)}  ${String(x.duration).padStart(6)}  ${String(x.sao2_nadir).padStart(9)}  ${String(x.hr_nadir).padStart(7)}  ${String(x.desat_lag ?? "-").padStart(12)}  ${String(x.brady_lag ?? "-").padStart(12)}`
    );
  });
} else {
  out.push("(no episodes in the window — increase --seconds or use a lower gestational age)");
}

_log(out.join("\n"));
