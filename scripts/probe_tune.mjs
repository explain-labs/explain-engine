// Probe the live closed-loop tuner (explain/helpers/Calibrator.js) headlessly:
// load a scenario, warm to steady state, then tune one or more measured quantities
// to targets and report whether they converge. This exercises the SAME calibration
// the in-app live "tune" runs in the Web Worker (here driven by the Node harness).
//
// Usage:
//   node scripts/probe_tune.mjs [scenario] --co 0.5 --map 45 --blood_volume 0.26
//   node scripts/probe_tune.mjs term_neonate --co x0.8        (x<frac> = fraction of baseline)
//   node scripts/probe_tune.mjs path/to/built_patient.json --spo2 80   (a builder output file)
//
// Targets: LIVE_TARGETS (map sys dia co hr pap_m pap_s po2 spo2 pco2 be ph blood_volume); sys and
// dia only as a pair. A value like "x0.8" means 0.8 × the measured baseline (handy when you don't
// know absolute values). Before and after, a context line shows SpO2, pressures and the
// intrapulmonary shunt (ips_res and its share of pulmonary flow).

import fs from "node:fs";
import { createEngine } from "./_harness.mjs";
import { buildLiveControllers, runCalibration, measureWindow, liveWarm, LIVE_TARGETS, DEFAULT_TOL } from "../helpers/Calibrator.js";

const argv = process.argv.slice(2);
const scenario = argv.find((a) => !a.startsWith("-")) || "term_neonate";
const warmArg = (() => { const i = argv.indexOf("--warm"); return i >= 0 ? Number(argv[i + 1]) : null; })(); // s between iterations (default: as the app, liveWarm)
const READKEY = { co: "lvo", spo2: "spo2_pre", blood_volume: "total_blood_volume" };
const CONTEXT = ["spo2_pre", "map", "sys", "dia", "pp", "pap_m", "pap_s", "lvo"];

const eng = await createEngine();
const src = scenario.endsWith(".json") ? scenario : new URL(`../model_definitions/${scenario}.json`, import.meta.url);
const json = JSON.parse(fs.readFileSync(src, "utf8"));
const model = eng.build(json.model_definition || json);
if (!model || !model.models) { console.error(`build failed for "${scenario}"`); process.exit(1); }
const step = (s) => eng.calc(s);

step(60); // warm to steady state
const allKeys = LIVE_TARGETS.map((k) => READKEY[k] ?? k);
const base = measureWindow(model, step, [...new Set(allKeys)], 8);
console.error(`baseline ${scenario}: ` + LIVE_TARGETS.map((k) => `${k}=${fmt(base[READKEY[k] ?? k])}`).join("  "));

// parse --<target> <value|xFRAC>
const targets = {};
for (const k of LIVE_TARGETS) {
  const i = argv.indexOf(`--${k}`);
  if (i < 0 || argv[i + 1] === undefined) continue;
  const raw = argv[i + 1];
  targets[k] = raw.startsWith("x") ? +(base[READKEY[k] ?? k] * Number(raw.slice(1))).toFixed(4) : Number(raw);
}
if (!Object.keys(targets).length) { console.error("no targets given; pass e.g. --co x0.8 --map 45"); process.exit(1); }
console.error("targets:", JSON.stringify(targets));
context("before");

const { controllers, keys } = buildLiveControllers(model, targets);
const res = runCalibration(controllers, {
  measureAll: () => measureWindow(model, step, keys, 8),
  step, settle: 25, warm: warmArg ?? liveWarm(targets), maxIters: 12,
  log: (l) => console.error("  " + l),
});

console.error(`\n${res.converged ? "CONVERGED" : "INCOMPLETE"} after ${res.iters} iter (tol: ${JSON.stringify(pickTol(targets))})`);
for (const r of res.residuals)
  console.error(`  ${r.key.padEnd(13)} ${fmt(r.value).toString().padStart(8)}  target ${r.target}  Δ ${fmt(r.value - r.target)}  ${r.within ? "OK" : "MISS"}`);

context("after ");

// SpO2, pressures and the intrapulmonary shunt: ips_res and the shunt's share of pulmonary flow
function context(label) {
  const v = measureWindow(model, step, CONTEXT, 8);
  const M = model.models, q = (n) => Math.abs(M[n]?.flow ?? 0);
  let ips = 0, pulm = 0;
  for (let i = 0; i < 200; i++) { step(0.02); ips += q("IPSL") + q("IPSR"); pulm += q("IPSL") + q("IPSR") + q("LL_CAP") + q("RL_CAP"); }
  console.error(`${label}: ` + CONTEXT.map((k) => `${k}=${fmt(v[k])}`).join("  ") +
    `  ips_res=${fmt(M.Shunts?.ips_res)}  ips_share=${pulm > 0 ? fmt((100 * ips) / pulm) : "-"}%`);
}

function fmt(x) { return typeof x === "number" && isFinite(x) ? Number(x.toFixed(3)) : x; }
function pickTol(t) { const o = {}; for (const k in t) o[k] = DEFAULT_TOL[k]; return o; }
