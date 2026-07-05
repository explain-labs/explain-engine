// Mechanical-ventilation probe for the Explain engine (companion devices paper, §3.1).
//
// Intubates a preterm RDS lung (switch_ventilator), runs controlled pressure ventilation
// (spontaneous drive off), and sweeps FiO2 / peak pressure / PEEP, reporting the delivered
// tidal volume, mean airway pressure, dynamic compliance and the EMERGENT arterial blood gas
// (oxygenation/CO2 come from the alveolar gas exchange of the respiratory model, not the device).
//
// Usage: node scripts/probe_ventilator.mjs [scenario] [--seconds N] [--window W]

import fs from "node:fs";
import { createEngine } from "./_harness.mjs";

const argv = process.argv.slice(2);
const scenario = argv.find((a) => !a.startsWith("-")) || "preterm_28wk";
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? Number(argv[i + 1]) : d; };
const SECONDS = opt("--seconds", 120);
const WINDOW = opt("--window", 20);

const eng = await createEngine();
const log = eng.log;
const json = JSON.parse(fs.readFileSync(new URL(`../public/model_definitions/${scenario}.json`, import.meta.url), "utf8"));
const def = json.model_definition || json;
const round = (x, n = 2) => (typeof x === "number" && isFinite(x) ? Number(x.toFixed(n)) : x);

// build fresh, intubate + set pressure-regulated volume control (target tidal volume, spontaneous
// drive off so the servo controls ventilation cleanly), warm, average. vt is the target in mL.
function run({ fio2 = 0.4, vt = 5, peep = 5, rate = 40, pip_max = 30 } = {}) {
  const m = eng.build(def);
  const V = m.models.Ventilator, B = m.models.Breathing;
  if (!V) throw new Error("no Ventilator in scenario");
  B?.switch_breathing?.(false);              // controlled ventilation: patient drive off
  V.switch_ventilator(true);                 // intubate: open VENT_* network, block MOUTH_DS
  V.set_prvc(pip_max, peep, rate, vt, 0.4, 10); // PRVC: servo PIP to hit target vt (mL)
  V.set_fio2(fio2);
  eng.calc(SECONDS);
  const AA = m.models.AA;
  const SLICE = 0.02, N = Math.round(WINDOW / SLICE), acc = {};
  const add = (k, v) => { acc[k] = (acc[k] || 0) + (v ?? 0); };
  for (let i = 0; i < N; i++) {
    eng.calc(SLICE);
    add("paw", V.pres);                      // airway pressure (cmH2O)
    add("po2", AA?.po2); add("pco2", AA?.pco2); add("ph", AA?.ph); add("spo2", m.models.Monitor?.sao2_pre);
  }
  for (const k in acc) acc[k] /= N;
  acc.vt_ml = Math.abs(V.exp_tidal_volume) * 1000;   // achieved per-breath tidal volume (mL)
  acc.pip = V.pip_cmh2o;                              // PIP the PRVC servo settled on (cmH2O)
  acc.compliance = V.compliance;                     // mL/cmH2O
  return acc;
}

const H = (t) => log(`\n== ${t} ==`);

H(`Mechanical ventilation of ${scenario} (pressure control, spontaneous drive off)`);
log(`baseline lung is surfactant-deficient (RDS); oxygenation/CO2 are EMERGENT from gas exchange\n`);

// A. FiO2 sweep at fixed PRVC (target 5 mL/kg, peep 5)
H("A. Oxygenation vs FiO2  (PRVC target 5 mL, peep 5 cmH2O, rate 40)");
log("FiO2    PaO2    SpO2    PaCO2   Vt(mL)");
for (const fio2 of [0.3, 0.5, 0.7, 0.9]) {
  const a = run({ fio2 });
  log(`${String(fio2).padEnd(6)} ${String(round(a.po2)).padStart(7)} ${String(round(a.spo2)).padStart(7)} ${String(round(a.pco2)).padStart(7)} ${String(round(a.vt_ml,1)).padStart(7)}`);
}

// B. Ventilator rate sweep at fixed FiO2/Vt (minute ventilation -> CO2 clearance)
H("B. CO2 clearance vs ventilator rate  (PRVC target 5 mL, FiO2 0.5, peep 5)");
log("Rate    MV(mL)  Vt(mL)  PIP     PaCO2");
for (const rate of [20, 30, 40, 60]) {
  const a = run({ fio2: 0.5, vt: 5, rate });
  log(`${String(rate).padEnd(6)} ${String(round(a.vt_ml * rate, 0)).padStart(7)} ${String(round(a.vt_ml,1)).padStart(7)} ${String(round(a.pip,1)).padStart(7)} ${String(round(a.pco2)).padStart(7)}`);
}

// C. PEEP sweep at fixed PRVC/FiO2 (recruitment -> oxygenation)
H("C. Oxygenation vs PEEP  (PRVC target 5 mL, FiO2 0.4)");
log("PEEP    PaO2    SpO2    Paw");
for (const peep of [2, 4, 6, 8]) {
  const a = run({ fio2: 0.4, vt: 5, peep });
  log(`${String(peep).padEnd(6)} ${String(round(a.po2)).padStart(7)} ${String(round(a.spo2)).padStart(7)} ${String(round(a.paw,1)).padStart(7)}`);
}
log("");
