// Verification probe for the Glucose (blood glucose / insulin) model.
//
// Drives the engine headless through the same { type, message, payload } envelope as Model.js.
// Confirms (1) NEUTRALITY at rest (arterial glucose holds at set-point, insulin/counter-reg ~1),
// then perturbs: (2) an IV dextrose bolus via the existing Fluids mechanism (d10) → glucose↑,
// insulin↑, then recovery; (3) suppressed hepatic output (hgp_rate↓) → hypoglycemia + counter-reg↑.
//
// Usage: node scripts/probe_glucose.mjs [--scenario term_neonate] [--no-ans] [--verbose]

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
if (!model?.models?.Glucose) { console.error("Build failed — no Glucose model"); process.exit(1); }

const G = model.models.Glucose;
const Fluids = model.models.Fluids;
const AA = model.models.AA;
if (NO_ANS && model.models.Ans) model.models.Ans.is_enabled = false;

const r = (x, n = 3) => Number((x ?? 0).toFixed(n));
const snap = (label) => ({
  t: label,
  AA_glu: r(AA.solutes?.glucose, 3),
  setpoint: r(G.glucose_setpoint, 3),
  insulin: r(G.insulin, 3),
  counterreg: r(G.counterreg, 3),
  uptake_f: r(G.uptake_factor, 3),
  prod_f: r(G.production_factor, 3),
});
const trace = (label, dt) => { send("POST", "calc", dt); rows.push(snap(label)); };

send("POST", "calc", 60); // warm up + auto-seed set-point
const rows = [snap("rest")];

// --- (2) IV dextrose bolus: 2 mL of D10 over 10 s into the central vein ---
Fluids.add_volume(2.0, 10, "d10", "IVCI");
trace("dextrose 30s", 30);
trace("dextrose 120s", 90);
trace("dextrose 600s", 480);

// --- (3) suppress hepatic glucose production → hypoglycemia ---
G.hgp_rate = 0.005; // collapse endogenous output well below utilization
trace("low-hgp 300s", 300);
trace("low-hgp 900s", 600);

console.log(`\nGlucose probe — scenario=${SCENARIO}, ANS=${model.models.Ans?.is_enabled ?? "n/a"}`);
console.table(rows);

const base = rows[0];
const dex = rows.find((x) => x.t === "dextrose 30s");
const dexRec = rows.find((x) => x.t === "dextrose 600s");
const hypo = rows[rows.length - 1];
console.log("\nNEUTRALITY (rest): glucose≈setpoint:", Math.abs(base.AA_glu - base.setpoint) < 0.05,
  "| insulin≈1:", Math.abs(base.insulin - 1) < 0.02,
  "| counterreg≈1:", Math.abs(base.counterreg - 1) < 0.02);
console.log("DEXTROSE bolus: glucose↑:", dex.AA_glu > base.AA_glu + 0.1,
  "| insulin↑:", dex.insulin > 1.01,
  "| recovers toward setpoint:", Math.abs(dexRec.AA_glu - dexRec.setpoint) < Math.abs(dex.AA_glu - dex.setpoint));
console.log("LOW hepatic output: hypoglycemia:", hypo.AA_glu < base.AA_glu - 0.1,
  "| counterreg↑:", hypo.counterreg > 1.01,
  "| no NaN:", Number.isFinite(hypo.AA_glu));
