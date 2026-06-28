// Probe the live closed-loop tuner (explain/helpers/Calibrator.js) headlessly:
// load a scenario, warm to steady state, then tune one or more measured quantities
// to targets and report whether they converge. This exercises the SAME calibration
// the in-app live "tune" runs in the Web Worker (here driven by the Node harness).
//
// Usage:
//   node scripts/probe_tune.mjs [scenario] --co 0.5 --map 45 --blood_volume 0.26
//   node scripts/probe_tune.mjs term_neonate --co x0.8        (x<frac> = fraction of baseline)
//
// Targets: map co hr po2 spo2 pco2 be ph blood_volume. A value like "x0.8" means
// 0.8 × the measured baseline (handy when you don't know absolute values).

import fs from "node:fs";
import { createEngine } from "./_harness.mjs";
import { buildLiveControllers, runCalibration, measureWindow, LIVE_TARGETS, DEFAULT_TOL } from "../explain/helpers/Calibrator.js";

const argv = process.argv.slice(2);
const scenario = argv.find((a) => !a.startsWith("-")) || "term_neonate";
const READKEY = { co: "lvo", spo2: "spo2_pre", blood_volume: "total_blood_volume" };

const eng = await createEngine();
const json = JSON.parse(fs.readFileSync(new URL(`../public/model_definitions/${scenario}.json`, import.meta.url), "utf8"));
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

const { controllers, keys } = buildLiveControllers(model, targets);
const res = runCalibration(controllers, {
  measureAll: () => measureWindow(model, step, keys, 8),
  step, settle: 25, warm: 15, maxIters: 12,
  log: (l) => console.error("  " + l),
});

console.error(`\n${res.converged ? "CONVERGED" : "INCOMPLETE"} after ${res.iters} iter (tol: ${JSON.stringify(pickTol(targets))})`);
for (const r of res.residuals)
  console.error(`  ${r.key.padEnd(13)} ${fmt(r.value).toString().padStart(8)}  target ${r.target}  Δ ${fmt(r.value - r.target)}  ${r.within ? "OK" : "MISS"}`);

function fmt(x) { return typeof x === "number" && isFinite(x) ? Number(x.toFixed(3)) : x; }
function pickTol(t) { const o = {}; for (const k in t) o[k] = DEFAULT_TOL[k]; return o; }
