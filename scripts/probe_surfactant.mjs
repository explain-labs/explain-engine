// Verification / demo probe for the Surfactant (dynamic RDS recruitment) model. Drives the engine
// headless and shows the classic surfactant-replacement response in a preterm RDS lung:
//   1. baseline (neutral — the calibrated RDS operating point is preserved)
//   2. instill surfactant → opening pressure falls → the lung RECRUITS at the prevailing airway
//      pressure → alveolar compliance ↑ (el_eff ↓), FRC ↑, gas-exchange surface ↑, intrapulmonary
//      shunt ↓ → PaO2 ↑ / SpO2 ↑ / PaCO2 ↓ (RDS improves)
//
// Usage: node scripts/probe_surfactant.mjs [--scenario preterm_28wk] [--target 0.9] [--no-ans] [--verbose]

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? Number(argv[i + 1]) : d; };
const sopt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const SCENARIO = sopt("--scenario", "preterm_28wk");
const TARGET = opt("--target", 0.9);
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
if (!model?.models?.Surfactant) { console.error(`Build failed / no Surfactant in "${SCENARIO}"`); process.exit(1); }

const S = model.models.Surfactant;
const ALL = model.models.ALL;
const Mon = model.models.Monitor;
const Blood = model.models.Blood;
if (NO_ANS && model.models.Ans) model.models.Ans.is_enabled = false;

const r = (x, n = 3) => Number((x ?? 0).toFixed(n));
const dt = model.modeling_stepsize;

// window-average over `seconds` (gases/elastance vary across the breath)
function measure(label, seconds = 6) {
  const N = Math.round(seconds / dt);
  let el = 0, po2 = 0, pco2 = 0, ph = 0, spo2 = 0;
  for (let i = 0; i < N; i++) {
    send("POST", "calc", dt);
    el += ALL.el_eff;
    const g = Blood.art_bloodgas;
    po2 += g.po2; pco2 += g.pco2; ph += g.ph;
    spo2 += Mon ? Mon.sao2_pre : 0;
  }
  return {
    phase: label,
    surfactant: r(S.surfactant, 2),
    open_frac: r(S.open_fraction, 3),
    TOP: r(S.open_pressure, 2),
    el_lung_f: r(S.el_lung_factor, 3),
    dif_f: r(S.dif_factor, 3),
    ips_f: r(S.ips_factor, 3),
    ALL_el_eff: r(el / N, 0),
    PaO2: r(po2 / N, 1),
    PaCO2: r(pco2 / N, 1),
    pH: r(ph / N, 3),
    SpO2: r(spo2 / N, 1),
  };
}

const rows = [];
send("POST", "calc", 60); // warm to steady state (past the 30 s baseline seed)
rows.push(measure("1 baseline RDS"));

// --- instill surfactant ---
S.administer_surfactant(TARGET);
const trace = (label, dt_s) => { send("POST", "calc", dt_s); rows.push(measure(label)); };
trace("2 surfactant +60s", 60);
trace("2 surfactant +180s", 120);
trace("2 surfactant +420s", 240);

console.log(`\nSurfactant probe — scenario=${SCENARIO}, therapy target=${TARGET}, ANS=${model.models.Ans?.is_enabled ?? "n/a"}`);
console.table(rows);

const base = rows[0], end = rows[rows.length - 1];
console.log("\nNEUTRALITY (baseline): effect factors ≈ 1:",
  Math.abs(base.el_lung_f - 1) < 0.02 && Math.abs(base.dif_f - 1) < 0.02 && Math.abs(base.ips_f - 1) < 0.02);
console.log("SURFACTANT therapy: lung recruits:", end.open_frac > base.open_frac + 0.05,
  "| compliance↑ (el_eff↓):", end.ALL_el_eff < base.ALL_el_eff,
  "| diffusion↑:", end.dif_f > 1.01,
  "| shunt↓ (ips_f↑):", end.ips_f > 1.01,
  "| PaO2↑:", end.PaO2 > base.PaO2 + 2,
  "| PaCO2↓:", end.PaCO2 < base.PaCO2 - 1,
  "| SpO2↑:", end.SpO2 > base.SpO2);
