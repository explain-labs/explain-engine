// Ventilator patient-trigger probe — how many spontaneous efforts become ventilator breaths.
//
// Intubates a spontaneously breathing patient and counts, over a window, per minute:
//   - efforts      patient inspiratory efforts (Breathing.ncc_insp === 1)
//   - in vent insp efforts that start while the ventilator is inspiring (trigger blocked, can't trigger)
//   - triggered    ventilator breaths started by a patient trigger
//   - backup       time-cycled breaths (PS apnea backup, or the mandatory rate in PC/PRVC/VC)
// plus the measured ventilator rate, delivered Vt, SpO2 and arterial pCO2.
//
// Cases: PS with the patient breathing, PS with the drive off (must not auto-trigger: backup only),
// synchronized PC, and PS at a low and a high trigger_volume_perc. Interactive verification tool:
// read the table, it is not a pass/fail gate.
//
// Usage: node scripts/probe_ventilator_trigger.mjs [scenario] [--settle N] [--window N]

import fs from "node:fs";
import { createEngine } from "./_harness.mjs";

const argv = process.argv.slice(2);
const scenario = argv.find((a, i) => !a.startsWith("-") && !(argv[i - 1] ?? "").startsWith("--")) || "term_neonate";
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? Number(argv[i + 1]) : d; };
const SETTLE = opt("--settle", 20); // s before counting
const WINDOW = opt("--window", 30); // s counted

const eng = await createEngine();
const log = eng.log;
const json = JSON.parse(fs.readFileSync(new URL(`../model_definitions/${scenario}.json`, import.meta.url), "utf8"));
const def = json.model_definition || json;
const round = (x, n = 1) => (typeof x === "number" && isFinite(x) ? Number(x.toFixed(n)) : x);
const col = (v, w = 9) => String(v).padStart(w);

function run({ breathing = true, setup }) {
  const m = eng.build(def);
  const V = m.models.Ventilator, B = m.models.Breathing;
  if (!V || !B) throw new Error("scenario needs Ventilator and Breathing");
  B.switch_breathing?.(breathing);
  V.switch_ventilator(true);
  setup(V);
  eng.calc(SETTLE);

  const dt = m.modeling_stepsize;
  const steps = Math.round(WINDOW / dt);
  let efforts = 0, blocked = 0, triggered = 0, backup = 0, prevInsp = V._inspiration;
  for (let i = 0; i < steps; i++) {
    eng.calc(dt);
    if (B.ncc_insp === 1) {
      efforts++;
      if (V._trigger_blocked) blocked++;
    }
    if (!prevInsp && V._inspiration) {
      if (V.triggered_breath && !V._mandatory_breath) triggered++;
      else backup++;
    }
    prevInsp = V._inspiration;
  }
  const pm = 60 / WINDOW;
  return {
    efforts: efforts * pm, blocked: blocked * pm, triggered: triggered * pm, backup: backup * pm,
    rate: V._rate_avg, vt: (V.exp_tidal_volume ?? 0) * 1000,
    spo2: m.models.Monitor?.sao2_pre, pco2: m.models.AA?.pco2,
  };
}

const cases = [
  ["PS 14/5, backup 10", true, (V) => V.set_psv(14, 5, 10, 0.4, 8)],
  ["PS 14/5, backup 10, drive off", false, (V) => V.set_psv(14, 5, 10, 0.4, 8)],
  ["PC 14/5 rate 30, synchronized", true, (V) => { V.set_pc(14, 5, 30, 0.4, 8); V.synchronized = true; }],
  ["PS, trigger 5 %", true, (V) => { V.set_psv(14, 5, 10, 0.4, 8); V.trigger_volume_perc = 5; }],
  ["PS, trigger 20 %", true, (V) => { V.set_psv(14, 5, 10, 0.4, 8); V.trigger_volume_perc = 20; }],
];

log(`\n== Ventilator patient trigger on ${scenario} (settle ${SETTLE} s, counted ${WINDOW} s, per minute) ==\n`);
log(`${"case".padEnd(32)}${col("efforts")}${col("in insp")}${col("trig")}${col("backup")}${col("rate")}${col("Vt mL")}${col("SpO2")}${col("pCO2")}`);
for (const [name, breathing, setup] of cases) {
  const r = run({ breathing, setup });
  log(`${name.padEnd(32)}${col(round(r.efforts))}${col(round(r.blocked))}${col(round(r.triggered))}${col(round(r.backup))}` +
    `${col(round(r.rate))}${col(round(r.vt))}${col(round(r.spo2))}${col(round(r.pco2))}`);
}
log("\n  -> triggered ~ efforts - in insp; backup ~0 while the patient breathes; drive off = backup only");
