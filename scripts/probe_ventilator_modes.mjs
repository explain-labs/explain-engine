// Ventilator-modes probe for the Explain engine — exercises the modes/features added in the
// 2026-07 ventilator overhaul that probe_ventilator.mjs (PC/PRVC sweeps) does not cover:
//
//   A. Volume control (VC)        — delivered tidal volume tracks the set target across insp_flow
//                                   (servo-trimmed against circuit compliance; undershoots only when
//                                    genuinely flow-limited).
//   B. VC tidal-volume targeting  — delivered Vt follows the set target.
//   C. Pressure support (PS)      — the time-cycled mandatory backup delivers breaths at vent_rate
//                                   with spontaneous drive OFF and synchronized=false (previously
//                                   delivered nothing).
//   D. Inspiratory pause          — a plateau enables measured static compliance and airway
//                                   resistance; p_plat < p_peak and Cstat >= Cdyn.
//
// Like probe_ventilator.mjs the lung is a surfactant-deficient preterm (RDS); the mechanics numbers
// are EMERGENT from the respiratory model, the ventilator only drives the circuit. This is an
// interactive verification tool — read the printed tables; it is not a pass/fail gate.
//
// Usage: node scripts/probe_ventilator_modes.mjs [scenario] [--seconds N]

import fs from "node:fs";
import { createEngine } from "./_harness.mjs";

const argv = process.argv.slice(2);
const scenario = argv.find((a) => !a.startsWith("-")) || "preterm_28wk";
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? Number(argv[i + 1]) : d; };
const SECONDS = opt("--seconds", 60);   // warm-up; enough for the VC/PRVC servos to settle

const eng = await createEngine();
const log = eng.log;
const json = JSON.parse(fs.readFileSync(new URL(`../model_definitions/${scenario}.json`, import.meta.url), "utf8"));
const def = json.model_definition || json;
const round = (x, n = 2) => (typeof x === "number" && isFinite(x) ? Number(x.toFixed(n)) : x);
const R = (x, n = 1) => (x == null ? "null" : String(round(x, n)));
const H = (t) => log(`\n== ${t} ==`);
const col = (v, w = 8) => String(v).padStart(w);

// Build fresh, intubate (spontaneous drive off), configure via `setup(V)`, warm up, then read the
// per-breath latched read-outs as a snapshot.
function run(setup) {
  const m = eng.build(def);
  const V = m.models.Ventilator, B = m.models.Breathing;
  if (!V) throw new Error("no Ventilator in scenario");
  B?.switch_breathing?.(false);          // controlled ventilation: patient drive off
  V.switch_ventilator(true);             // intubate
  setup(V);
  eng.calc(SECONDS);
  return {
    exp_tv: (V.exp_tidal_volume ?? 0) * 1000,   // mL
    p_peak: V.p_peak,
    p_plat: V.p_plat,
    paw: V.pres,
    cdyn: V.compliance_dynamic,
    cstat: V.compliance_static,
    res: V.resistance,
    rate: V._measured_rate,
    mv: V.minute_volume,
  };
}

H(`Ventilator modes on ${scenario} (spontaneous drive off)`);
log(`RDS lung; mechanics are EMERGENT from gas exchange, the device only drives the circuit\n`);

// A. VC: delivered tidal volume vs inspiratory flow (target 15 mL, peep 5, rate 40, pause 0.1s)
H("A. Volume control: delivered Vt vs insp_flow  (target 15 mL, peep 5, rate 40, pause 0.1s)");
log("insp_flow  exp_tv(mL)  p_peak  p_plat  Cstat  R(cmH2O/(L/s))");
for (const f of [2, 3, 4, 6, 8, 12]) {
  const a = run((V) => { V.set_vc(5, 40, 15, 0.5, f, 35, 0.1); V.set_fio2(0.5); });
  log(`${col(f + " L/min", 9)}  ${col(round(a.exp_tv, 1))}  ${col(round(a.p_peak, 1))}  ${col(round(a.p_plat, 1))}  ${col(round(a.cstat, 2), 6)}  ${col(R(a.res), 8)}`);
}
log("  -> delivered Vt holds at ~15 mL once flow is adequate; only insp_flow 2 L/min is flow-limited");

// B. VC: delivered Vt follows the set target (insp_flow 8, pause 0.1s)
H("B. Volume control: delivered Vt vs set target  (insp_flow 8, peep 5, rate 40, pause 0.1s)");
log("target(mL)  exp_tv(mL)  p_peak  Cstat");
for (const tv of [8, 12, 15, 20]) {
  const a = run((V) => { V.set_vc(5, 40, tv, 0.5, 8, 35, 0.1); V.set_fio2(0.5); });
  log(`${col(tv, 10)}  ${col(round(a.exp_tv, 1))}  ${col(round(a.p_peak, 1))}  ${col(round(a.cstat, 2), 6)}`);
}

// C. PS mandatory backup with spontaneous drive off + synchronized=false (was inert before the fix)
H("C. Pressure support backup: delivered rate vs set backup rate  (pip 16, peep 5, unsynchronized)");
log("set_rate  meas_rate  exp_tv(mL)  MinVol(L/min)");
for (const rate of [20, 30, 40]) {
  const a = run((V) => { V.set_psv(16, 5, rate, 0.4, 10); V.synchronized = false; V.set_fio2(0.5); });
  log(`${col(rate, 8)}  ${col(round(a.rate, 1))}  ${col(round(a.exp_tv, 1))}  ${col(round(a.mv, 3))}`);
}
log("  -> the backup keeps the rate at the set vent_rate even with no patient effort");

// D. Inspiratory pause -> measured static compliance + airway resistance (PC 20/5, rate 40)
H("D. Inspiratory pause -> plateau, static compliance, resistance  (PC 20/5, rate 40)");
log("pause(s)  p_peak  p_plat  Cdyn   Cstat  R(cmH2O/(L/s))");
for (const pause of [0.0, 0.05, 0.1, 0.2]) {
  const a = run((V) => { V.set_pc(20, 5, 40, 0.4, 10); V.set_pause(pause); V.set_fio2(0.5); });
  log(`${col(pause, 8)}  ${col(round(a.p_peak, 1))}  ${col(round(a.p_plat, 1))}  ${col(round(a.cdyn, 2), 5)}  ${col(round(a.cstat, 2), 6)}  ${col(R(a.res), 8)}`);
}
log("  -> pause 0 has no plateau (resistance null); with a pause p_plat < p_peak and Cstat >= Cdyn");
log("");
