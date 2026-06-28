// Verification probe for the Thermoregulation model.
//
// Drives the engine headless through the same { type, message, payload } envelope as Model.js.
// Confirms (1) NEUTRALITY at rest (core holds ~37, hr_temp_factor/vo2_temp_factor ~1, baseline HR
// unchanged), then perturbs the thermal environment: cold (low env_temp) → core/HR fall + brown-fat
// engages + vo2_temp_factor < 1; radiant warmer → fever + tachycardia. Also checks the blood
// temperature tracks the core (feeds the acid-base solver).
//
// Usage: node scripts/probe_thermo.mjs [--scenario term_neonate] [--no-ans] [--verbose]

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const sopt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const SCENARIO = sopt("--scenario", "term_neonate");
const NO_ANS = flag("--no-ans");
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

const path = new URL(`../public/model_definitions/${SCENARIO}.json`, import.meta.url);
const def = JSON.parse(fs.readFileSync(path, "utf8")).model_definition;
send("POST", "build", def);
send("GET", "state", []);
const model = liveModel;
console.log = _log;
if (!model?.models?.Thermoregulation) { console.error("Build failed — no Thermoregulation model"); process.exit(1); }

const T = model.models.Thermoregulation;
const Heart = model.models.Heart;
const Met = model.models.Metabolism;
const AA = model.models.AA;
if (NO_ANS && model.models.Ans) model.models.Ans.is_enabled = false;

const r = (x, n = 3) => Number((x ?? 0).toFixed(n));
const snap = (label) => ({
  t: label,
  core: r(T.core_temp, 2),
  skin: r(T.skin_temp, 2),
  AA_temp: r(AA.temp, 2),
  HR: r(Heart.heart_rate, 1),
  hr_f: r(T.hr_temp_factor, 3),
  vo2_f: r(T.vo2_temp_factor, 3),
  Q_prod: r(T.heat_production, 2),
  Q_loss: r(T.heat_loss, 2),
  BAT: r(T.brown_fat_heat, 2),
});

send("POST", "calc", 60); // warm up + auto-seed
const rows = [snap("rest")];

// step to a cumulative time (s after the perturbation), sampling as we go
const trace = (label, dt) => { send("POST", "calc", dt); rows.push(snap(label)); };

// --- cold stress: drop incubator air temperature ---
T.env_temp = 24.0;
trace("cold 120s", 120);
trace("cold 300s", 180);
trace("cold 600s", 300);

// --- recover to baseline, then apply a hot environment (overheating) ---
T.env_temp = 32.0;
send("POST", "calc", 600); // re-equilibrate to ~37 (not sampled)
T.env_temp = 40.0;
trace("warm 300s", 300);
trace("warm 900s", 600);
trace("warm 1500s", 600);

console.log = _log;
console.log(`\nThermoregulation probe — scenario=${SCENARIO}, ANS=${model.models.Ans?.is_enabled ?? "n/a"}`);
console.table(rows);

const base = rows[0];
const cold = rows.find((x) => x.t === "cold 600s");
const warm = rows[rows.length - 1];
console.log("\nNEUTRALITY (rest): core≈37:", Math.abs(base.core - 37) < 0.15,
  "| hr_f≈1:", Math.abs(base.hr_f - 1) < 0.02,
  "| vo2_f≈1:", Math.abs(base.vo2_f - 1) < 0.02,
  "| AA_temp≈37:", Math.abs(base.AA_temp - 37) < 0.15);
console.log("COLD stress: core↓:", cold.core < base.core - 0.2,
  "| HR↓:", cold.HR < base.HR,
  "| BAT engaged:", cold.BAT > 0.1,
  "| vo2_f<1:", cold.vo2_f < 0.99,
  "| AA_temp tracks core:", Math.abs(cold.AA_temp - cold.core) < 0.05);
console.log("HOT environment: core↑:", warm.core > base.core + 0.2,
  "| HR↑:", warm.HR > base.HR,
  "| vo2_f>1:", warm.vo2_f > 1.01);
