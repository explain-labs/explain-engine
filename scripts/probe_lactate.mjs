// Verification probe for the Lactate (hypoxia-driven) model.
//
// Drives the engine headless through the same { type, message, payload } envelope as Model.js.
// Confirms (1) NEUTRALITY at rest (arterial lactate holds at baseline, ABG unchanged), then induces
// global tissue hypoxia by collapsing inspired O2 (FiO2) so tissue to2 falls below threshold →
// lactate accumulates → the Stewart acid-base solver returns a metabolic acidosis (pH↓, BE↓, HCO3↓).
// Finally restores O2 and confirms lactate clears and pH recovers.
//
// Usage: node scripts/probe_lactate.mjs [--scenario term_neonate] [--no-ans] [--verbose]

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
if (!model?.models?.Lactate) { console.error("Build failed — no Lactate model"); process.exit(1); }

const L = model.models.Lactate;
const Gas = model.models.Gas;
const AA = model.models.AA;
const BR_CAP = model.models.BR_CAP; // a high-VO2 tissue capillary
if (NO_ANS && model.models.Ans) model.models.Ans.is_enabled = false;

const r = (x, n = 3) => Number((x ?? 0).toFixed(n));
const abg = () => { if (typeof model.models.Blood?.calc_model === "function") {} return model.models.Blood?.art_bloodgas ?? {}; };
const snap = (label) => {
  const g = model.models.Blood?.art_bloodgas ?? {};
  return {
    t: label,
    AA_lact: r(AA.solutes?.lact, 3),
    BR_to2: r(BR_CAP?.to2, 3),
    anaer_max: r(L.anaerobic_fraction_max, 2),
    pH: r(g.ph, 3),
    pO2: r(g.po2, 1),
    BE: r(g.be, 2),
    HCO3: r(g.hco3, 1),
  };
};
const trace = (label, dt) => { send("POST", "calc", dt); rows.push(snap(label)); };

send("POST", "calc", 100); // warm up past the lactate model's resting-to2 capture window (_warmup_delay 90 s)
const rows = [snap("rest")];

// --- induce hypoxia: drop inspired O2 fraction (set_fio2 recomputes the source gas composition) ---
const fio2_0 = Gas?.fio2 ?? 0.21;
if (Gas) Gas.set_fio2(0.07, ["MOUTH"]); // severe hypoxic inspired gas at the airway
trace("hypoxia 60s", 60);
trace("hypoxia 180s", 120);
trace("hypoxia 420s", 240);

// --- restore oxygen ---
if (Gas) Gas.set_fio2(fio2_0, ["MOUTH"]); // restore inspired O2
trace("recovery 300s", 300);
trace("recovery 900s", 600);

console.log(`\nLactate probe — scenario=${SCENARIO}, ANS=${model.models.Ans?.is_enabled ?? "n/a"}, FiO2 ${fio2_0}→0.07→${fio2_0}`);
console.table(rows);

const base = rows[0];
const peak = rows.find((x) => x.t === "hypoxia 420s");
const rec = rows[rows.length - 1];
console.log("\nNEUTRALITY (rest): lact≈baseline:", Math.abs(base.AA_lact - L.lact_baseline) < 0.1,
  "| pH normal:", base.pH > 7.2 && base.pH < 7.5);
console.log("HYPOXIA: tissue to2↓ → anaerobic:", peak.anaer_max > 0,
  "| lactate↑:", peak.AA_lact > base.AA_lact + 0.3,
  "| pH↓:", peak.pH < base.pH - 0.01,
  "| BE↓:", peak.BE < base.BE - 1,
  "| HCO3↓:", peak.HCO3 < base.HCO3 - 0.5);
console.log("RECOVERY: lactate clears:", rec.AA_lact < peak.AA_lact,
  "| pH recovers:", rec.pH > peak.pH);
