// Steady-state ventilatory response to inhaled CO2 (hypercapnic ventilatory response, HCVR).
//
// Warms the scenario at rest, then raises the inspired CO2 at the mouth in steps (default 0, 2 and
// 4 %), holding each step until ventilation settles. At the end of each step it averages minute
// ventilation, rate, tidal volume and the arterial gases, and reports the slope of ventilation
// against PaCO2 in mL/kg/min per mmHg, as the steady-state method in the neonatal literature does
// (Rigatto 1991; Cohen 1991 for term babies at 4-6 days: ~39 in quiet sleep, ~12 in REM sleep).
// The inspired gas is set on MOUTH, a fixed-composition source, with the dry O2 fraction unchanged.
// The chemoreflex stays on: the response is the closed-loop one a baby shows.
//
// Usage: node scripts/probe_co2_response.mjs [scenario] [--steps 0,2,4] [--warmup S] [--hold S] [--window S] [--json]

import fs from "node:fs";
import { createEngine } from "./_harness.mjs";

const argv = process.argv.slice(2);
const scenario = argv.find((a) => !a.startsWith("-") && !/^[\d.,]+$/.test(a)) || "term_neonate_72h";
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const steps = String(opt("--steps", "0,2,4")).split(",").map(Number);
const WARMUP = Number(opt("--warmup", 300));
const HOLD = Number(opt("--hold", 480));
const WINDOW = Number(opt("--window", 120));
const asJson = argv.includes("--json");
// the harness silences console.log, so results go straight to stdout
const out = (line = "") => process.stdout.write(line + "\n");

const def = JSON.parse(fs.readFileSync(new URL(`../model_definitions/${scenario}.json`, import.meta.url), "utf8"));
const eng = await createEngine();
// imported after createEngine, which registers the extensionless-import resolve hook
const { calc_gas_composition } = await import("../component_models/GasComposition.js");
const model = eng.build(def.model_definition || def);
const M = model.models;
const W = model.weight;
const mouth = M.MOUTH;
if (!mouth) throw new Error("no MOUTH compartment");
const dry_fo2 = (() => { const d = mouth.co2 + mouth.cco2 + mouth.cn2 + mouth.cother; return d > 0 ? mouth.co2 / d : 0.205; })();

eng.calc(WARMUP);

const DT = 0.1;
const rows = [];
for (const pct of steps) {
  calc_gas_composition(mouth, dry_fo2, mouth.temp, mouth.humidity, pct / 100);
  const acc = { mv: 0, rr: 0, vt: 0, paco2: 0, pao2: 0, ph: 0, etco2: 0, spo2: 0, pmus: 0, mouth_pco2: 0 };
  let n = 0;
  for (let t = 0; t < HOLD; t += DT) {
    eng.calc(DT);
    if (t >= HOLD - WINDOW) {
      acc.mv += (M.Breathing.minute_volume * 1000) / W; // L/min -> mL/kg/min
      acc.rr += M.Breathing.resp_rate;
      acc.vt += (M.Breathing.exp_tidal_volume * 1000) / W; // L -> mL/kg
      acc.paco2 += M.AA.pco2;
      acc.pao2 += M.AA.po2;
      acc.ph += M.AA.ph;
      acc.etco2 += M.Monitor?.etco2 ?? NaN;
      acc.spo2 += M.AA.so2;
      acc.pmus += M.Breathing.pmus_max;
      acc.mouth_pco2 += mouth.pco2;
      n++;
    }
  }
  for (const k in acc) acc[k] /= n;
  rows.push({ fico2_pct: pct, ...acc });
}

// least-squares slope of ventilation (and its parts) against PaCO2
const slope = (ys) => {
  const xs = rows.map((r) => r.paco2);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0, sxx = 0;
  xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; });
  return sxx > 0 ? sxy / sxx : NaN;
};
const b = rows[0];
const result = {
  scenario, weight: W, steps, warmup: WARMUP, hold: HOLD, window: WINDOW, rows,
  hcvr_ml_kg_min_mmhg: slope(rows.map((r) => r.mv)),
  hcvr_fraction_per_mmhg: slope(rows.map((r) => r.mv / b.mv)),
  rr_per_mmhg: slope(rows.map((r) => r.rr)),
  vt_ml_kg_per_mmhg: slope(rows.map((r) => r.vt)),
};

if (asJson) {
  out(JSON.stringify(result, null, 2));
} else {
  const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "-").padStart(8);
  out(`\n=== ${scenario}: steady-state CO2 response (warm-up ${WARMUP} s, ${HOLD} s per step, last ${WINDOW} s averaged) ===`);
  out("  FiCO2 %  mouth pCO2    PaCO2    etCO2    MV/kg       RR    Vt/kg     PaO2       pH     SpO2     Pmus");
  for (const r of rows) {
    out(`${f(r.fico2_pct)}${f(r.mouth_pco2)}${f(r.paco2)}${f(r.etco2)}${f(r.mv, 0)}${f(r.rr)}${f(r.vt, 2)}${f(r.pao2)}${f(r.ph, 3)}${f(r.spo2)}${f(r.pmus, 2)}`);
  }
  out(`\nslope MV/PaCO2   ${result.hcvr_ml_kg_min_mmhg.toFixed(1)} mL/kg/min per mmHg   (${(100 * result.hcvr_fraction_per_mmhg).toFixed(1)} % of resting MV per mmHg)`);
  out(`  from RR        ${result.rr_per_mmhg.toFixed(2)} /min per mmHg`);
  out(`  from Vt        ${result.vt_ml_kg_per_mmhg.toFixed(3)} mL/kg per mmHg`);
  out(`reference (term, 4-6 d, rebreathing; Cohen 1991): quiet sleep 38.7 +/- 3.0, REM sleep 12.2 +/- 3.0`);
}
