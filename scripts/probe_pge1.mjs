// Verification / demo probe for PGE1 (prostaglandin E1 / alprostadil) — keeping the ductus arteriosus
// patent in duct-dependent CHD. Drives the engine headless through the same { type, message, payload }
// envelope as Model.js. Reuses the PK/PD plumbing of probe_drugs.mjs and the duct read-outs of
// probe_pda.mjs.
//
// Clinical loop demonstrated:
//   1. baseline (duct open, as calibrated)
//   2. SIMULATE A CLOSING DUCT — set Pda.diameter_relative low → the duct-dependent circulation fails
//      (ductal flow ↓, SpO2 ↓ [pulmonary-ductal lesions] or MAP ↓ [systemic-ductal lesions], lactic
//      acidosis)
//   3. start a PGE1 infusion → Pda.diameter_relative_eff rises, ductal flow + SpO2/MAP recover
//   4. stop PGE1 (washout) → the duct re-constricts and the patient deteriorates again
//
// Usage:
//   node scripts/probe_pge1.mjs [--scenario pa_ivs] [--close 0.2] [--infuse 0.05] [--no-ans] [--verbose]
//   --scenario  duct-dependent scenario (pa_ivs = pulmonary-ductal, hlhs = systemic-ductal, dtga, ...)
//   --close     diameter_relative the "closing" duct constricts to (default 0.2)
//   --infuse    PGE1 infusion rate, mcg/kg/min (default 0.05)

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? Number(argv[i + 1]) : d; };
const sopt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const SCENARIO = sopt("--scenario", "pa_ivs");
const CLOSE = opt("--close", 0.2);     // diameter_relative the duct constricts to
const INFUSE = opt("--infuse", 0.05);  // PGE1 mcg/kg/min
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
if (!model?.models?.Pda || !model?.models?.Drugs) { console.error(`Build failed / no Pda+Drugs in "${SCENARIO}"`); process.exit(1); }

const Pda = model.models.Pda;
const D = model.models.Drugs;
const Mon = model.models.Monitor;
const AA = model.models.AA;
if (NO_ANS && model.models.Ans) model.models.Ans.is_enabled = false;

const r = (x, n = 3) => Number((x ?? 0).toFixed(n));
const dt = model.modeling_stepsize;

// window-average the pulsatile read-outs over `seconds`, then snapshot the duct/drug state
function measure(label, seconds = 4) {
  const N = Math.round(seconds / dt);
  let flow = 0, pre = 0, post = 0, map = 0, lo = Infinity, hi = -Infinity;
  for (let i = 0; i < N; i++) {
    send("POST", "calc", dt);
    flow += Pda.flow;                 // L/s, signed (+ve = L->R aorta->pulmonary)
    pre += Mon ? Mon.sao2_pre : 0;    // pre-ductal SaO2 (%)
    post += Mon ? Mon.sao2_post : 0;  // post-ductal SaO2 (%)
    const p = AA.pres; map += p; if (p < lo) lo = p; if (p > hi) hi = p;
  }
  return {
    phase: label,
    eff_diam: r(Pda.diameter_relative_eff, 3),
    pda_factor: r(D.pda_drug_factor, 3),
    pge1_conc: r(D.concentrations?.pge1, 3),
    duct_flow_mLs: r((flow / N) * 1000, 2),       // mL/s, signed
    SpO2_pre: r((pre / N), 1),
    SpO2_post: r((post / N), 1),
    MAP: r(map / N, 1),
    lact: r(AA.solutes?.lact, 2),
  };
}

const rows = [];
send("POST", "calc", 60);                       // warm to steady state
rows.push(measure("1 baseline (duct open)"));

// --- 2. simulate a closing duct (start PGE1 before total circulatory collapse) ---
Pda.diameter_relative = CLOSE;
send("POST", "calc", 45);                       // early compromise
rows.push(measure("2 duct closing"));

// --- 3. start PGE1 infusion ---
D.set_infusion("pge1", INFUSE);
send("POST", "calc", 60);  rows.push(measure("3 PGE1 60s"));
send("POST", "calc", 120); rows.push(measure("3 PGE1 180s"));

// --- 4. stop PGE1 (washout) ---
D.set_infusion("pge1", 0);
send("POST", "calc", 180); rows.push(measure("4 washout 180s"));

console.log(`\nPGE1 probe — scenario=${SCENARIO}, closing duct→${CLOSE}, infuse=${INFUSE} mcg/kg/min, ANS=${model.models.Ans?.is_enabled ?? "n/a"}`);
console.table(rows);

const base = rows[0], closing = rows[1], pge1 = rows[3], wash = rows[4];
// the lesion's "lifeline" read-out: pulmonary-ductal (pa_ivs/critical_ps) → SpO2; systemic-ductal (hlhs/iaa) → MAP
const sysDuctal = /hlhs|iaa|coarc|critical_as|tapvc/i.test(SCENARIO);
const vital = (x) => sysDuctal ? x.MAP : x.SpO2_post;
const vitalName = sysDuctal ? "MAP" : "post-ductal SpO2";
console.log(`\nlifeline read-out for ${SCENARIO}: ${vitalName}`);
console.log("CLOSING duct: eff diameter↓:", closing.eff_diam < base.eff_diam,
  "| ductal flow↓:", Math.abs(closing.duct_flow_mLs) < Math.abs(base.duct_flow_mLs),
  `| ${vitalName}↓:`, vital(closing) < vital(base),
  "| lactate↑:", closing.lact > base.lact);
console.log("PGE1 rescue: factor>1:", pge1.pda_factor > 1.01,
  "| eff diameter↑ vs closing:", pge1.eff_diam > closing.eff_diam,
  "| ductal flow↑:", Math.abs(pge1.duct_flow_mLs) > Math.abs(closing.duct_flow_mLs),
  `| ${vitalName}↑:`, vital(pge1) > vital(closing));
console.log("WASHOUT: factor→1:", wash.pda_factor < pge1.pda_factor,
  "| eff diameter↓ again:", wash.eff_diam < pge1.eff_diam,
  `| ${vitalName}↓ again:`, vital(wash) < vital(pge1));
