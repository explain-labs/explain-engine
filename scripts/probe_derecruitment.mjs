// PEEP-loss derecruitment demo for the Surfactant (dynamic RDS recruitment) model. Shows the other
// half of the recruitment loop (the surfactant-therapy half is probe_surfactant.mjs): an RDS preterm
// managed on CPAP loses PEEP → the alveoli derecruit (collapse) → compliance ↓, intrapulmonary shunt ↑,
// PaO2/SpO2 ↓. Because recruitment is HYSTERETIC, simply restoring the same PEEP does NOT reopen the
// lung — it takes a higher-pressure RECRUITMENT MANEUVER (the "open lung" concept).
//
// The baseline is established ON CPAP so the recruitment dead zone is centered on the on-CPAP pressure;
// dropping PEEP then pushes the mean transpulmonary pressure below the closing threshold.
//
// Usage: node scripts/probe_derecruitment.mjs [--scenario preterm_28wk] [--peep 6] [--low 1]
//                                             [--maneuver 12] [--no-ans] [--verbose]

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? Number(argv[i + 1]) : d; };
const sopt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const SCENARIO = sopt("--scenario", "preterm_28wk");
const PEEP = opt("--peep", 6.0);       // baseline CPAP level (cmH2O)
const LOW = opt("--low", 1.0);         // PEEP after the loss (cmH2O)
const MANEUVER = opt("--maneuver", 12.0); // recruitment-maneuver PEEP (cmH2O)
const FLOW = opt("--flow", 8.0);
const NO_ANS = flag("--no-ans");
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

await import("../explain/ModelEngine.js");
const send = (type, message, payload) => self.onmessage({ data: { type, message, payload } });

const def = JSON.parse(fs.readFileSync(new URL(`../public/model_definitions/${SCENARIO}.json`, import.meta.url), "utf8")).model_definition;
send("POST", "build", def);
send("GET", "state", []);
const model = liveModel;
console.log = _log;
if (!model?.models?.Surfactant || !model?.models?.Ventilator) { console.error(`Build failed / no Surfactant+Ventilator in "${SCENARIO}"`); process.exit(1); }

const S = model.models.Surfactant;
const Vent = model.models.Ventilator;
const Breathing = model.models.Breathing;
const ALL = model.models.ALL;
const Mon = model.models.Monitor;
const Blood = model.models.Blood;
if (NO_ANS && model.models.Ans) model.models.Ans.is_enabled = false;

const r = (x, n = 3) => Number((x ?? 0).toFixed(n));
const dt = model.modeling_stepsize;

function measure(label, seconds = 6) {
  const N = Math.round(seconds / dt);
  let el = 0, po2 = 0, pco2 = 0, spo2 = 0;
  for (let i = 0; i < N; i++) {
    send("POST", "calc", dt);
    el += ALL.el_eff;
    const g = Blood.art_bloodgas; po2 += g.po2; pco2 += g.pco2;
    spo2 += Mon ? Mon.sao2_pre : 0;
  }
  return {
    phase: label,
    open_frac: r(S.open_fraction, 3),
    P_tp: r(S.transpulmonary_pressure, 2),
    TCP: r(S.close_pressure, 2),
    el_lung_f: r(S.el_lung_factor, 3),
    ips_f: r(S.ips_factor, 3),
    ALL_el_eff: r(el / N, 0),
    PaO2: r(po2 / N, 1),
    PaCO2: r(pco2 / N, 1),
    SpO2: r(spo2 / N, 1),
  };
}

const rows = [];
// --- 1. establish the baseline ON CPAP (the standard RDS management) ---
Vent.switch_ventilator(true);
Vent.set_cpap(PEEP, FLOW);
Breathing.breathing_enabled = true;
send("POST", "calc", 90); // warm past the Surfactant 30 s seed → dead zone centered on the on-CPAP pressure
rows.push(measure(`1 on CPAP ${PEEP}`));

// --- 2. PEEP loss (disconnection / CPAP failure) → derecruitment ---
Vent.set_cpap(LOW, FLOW);
send("POST", "calc", 60); rows.push(measure(`2 PEEP lost ${LOW} (+60s)`));
send("POST", "calc", 120); rows.push(measure(`2 PEEP lost ${LOW} (+180s)`));

// --- 3a. restore the SAME PEEP — hysteresis: the lung should NOT reopen ---
Vent.set_cpap(PEEP, FLOW);
send("POST", "calc", 120); rows.push(measure(`3 restore PEEP ${PEEP}`));

// --- 3b. recruitment maneuver (higher PEEP) → reopen the lung ---
Vent.set_cpap(MANEUVER, FLOW);
send("POST", "calc", 120); rows.push(measure(`4 maneuver PEEP ${MANEUVER}`));

console.log(`\nDerecruitment probe — scenario=${SCENARIO}, CPAP ${PEEP}→${LOW}→${PEEP}→${MANEUVER} cmH2O, ANS=${model.models.Ans?.is_enabled ?? "n/a"}`);
console.table(rows);

const cpap = rows[0], lost = rows[2], restore = rows[3], maneuver = rows[4];
console.log("\nPEEP LOSS → derecruitment:",
  "open↓:", lost.open_frac < cpap.open_frac - 0.05,
  "| compliance↓ (el_eff↑):", lost.ALL_el_eff > cpap.ALL_el_eff,
  "| shunt↑ (ips_f↓):", lost.ips_f < cpap.ips_f,
  "| PaO2↓:", lost.PaO2 < cpap.PaO2 - 2,
  "| SpO2↓:", lost.SpO2 < cpap.SpO2);
console.log("HYSTERESIS (restore same PEEP does NOT fully reopen):", restore.open_frac < cpap.open_frac - 0.02);
console.log("RECRUITMENT MANEUVER reopens:", maneuver.open_frac > restore.open_frac + 0.05,
  "| PaO2 recovers:", maneuver.PaO2 > lost.PaO2 + 2);
