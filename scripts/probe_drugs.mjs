// Verification probe for the Drugs (pharmacology) model — covers Milestones 1–3.
//
// Drives the engine headless through the same { type, message, payload } envelope as Model.js,
// doses a drug into the term_neonate circuit, and traces the full PK/PD loop:
//   injection-site conc → effect-site conc → (optional biophase) → HR / inotropy / SVR → pressure → washout.
//
// Usage:
//   node scripts/probe_drugs.mjs [--drug NAME] [--bolus MCG] [--infuse MCG_KG_MIN]
//                                [--ke0 RATE] [--throttle-organ FACTOR] [--no-ans] [--verbose]
//   --drug             adrenaline (default) | noradrenaline
//   --ke0 RATE         enable the effect-compartment (biophase) lag for the dosed drug (1/s)
//   --throttle-organ F set r_factor_ps=F on the arterioles feeding the clearing organs (KID/LS/INT)
//                      to cut their perfusion — demonstrates perfusion-scaled organ clearance

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? Number(argv[i + 1]) : d; };
const sopt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const DRUG = sopt("--drug", "adrenaline");
const BOLUS = opt("--bolus", 5.0); // mcg
const INFUSE = opt("--infuse", 0.0); // mcg/kg/min
const KE0 = opt("--ke0", 0.0); // 1/s; >0 enables biophase lag
const THROTTLE = opt("--throttle-organ", 0.0); // >0 sets r_factor_ps on organ-feeding arterioles
const ORGAN_ONLY = flag("--organ-only"); // zero the diffuse clearance → isolate organ clearance
const NO_ANS = flag("--no-ans");
const VERBOSE = flag("--verbose");
const SCENARIO = sopt("--scenario", "term_neonate");

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
if (!model?.models?.Drugs) { console.error("Build failed — no Drugs model on model.models"); process.exit(1); }

const D = model.models.Drugs;
const Heart = model.models.Heart;
const IVCI = model.models.IVCI; // injection site (central vein)
const AA = model.models.AA;     // effect site (arterial)
if (NO_ANS && model.models.Ans) model.models.Ans.is_enabled = false;

const r = (x, n = 3) => Number((x ?? 0).toFixed(n));
const snap = (label) => ({
  t: label,
  HR: r(Heart.heart_rate, 1),
  conc_AA: r(AA.drugs?.[DRUG], 3),
  biophase: r(D.biophase?.[DRUG], 3),
  hr_f: r(D.hr_drug_factor, 3),
  cont_f: r(D.cont_drug_factor, 3),
  svr_f: r(D.svr_drug_factor, 3),
});

// windowed arterial-pressure summary (AA.pres is pulsatile → report systolic/diastolic/mean over W s)
function pressure(seconds) {
  const N = Math.round(seconds / 0.005);
  let sum = 0, lo = Infinity, hi = -Infinity;
  for (let i = 0; i < N; i++) {
    send("POST", "calc", 0.005);
    const p = AA.pres;
    sum += p; if (p < lo) lo = p; if (p > hi) hi = p;
  }
  return { sys: r(hi, 1), dia: r(lo, 1), map: r(sum / N, 1) };
}

// warm up to steady state
send("POST", "calc", 30);

// optional setup: biophase lag + organ-perfusion throttle (applied before dosing)
if (KE0 > 0 && D.drug_defs[DRUG]) D.drug_defs[DRUG].ke0 = KE0;
if (ORGAN_ONLY && D.drug_defs[DRUG]?.clearance) D.drug_defs[DRUG].clearance.global = 0.0;
if (THROTTLE > 0) {
  for (const rn of ["AD_KID_ART", "AD_LS_ART", "AD_INT_ART"]) {
    const m = model.models[rn];
    if (m) m.r_factor_ps = THROTTLE;
  }
  send("POST", "calc", 5); // let flows re-settle at the throttled perfusion
}

const baseP = pressure(4);
const rows = [snap("baseline")];
if (INFUSE > 0) D.set_infusion(DRUG, INFUSE);
if (BOLUS > 0) D.administer_bolus(DRUG, BOLUS);

// trace at cumulative checkpoints (s after dose)
const checkpoints = [0, 1, 2, 5, 10, 20, 30, 45, 60, 90, 120];
let prev = 0;
let peakP = null;
for (const cp of checkpoints) {
  if (cp > prev) { send("POST", "calc", cp - prev); prev = cp; }
  rows.push(snap(cp + "s"));
  if (cp === 5) { peakP = pressure(3); prev += 3; } // pressure window near the concentration peak
}

console.log(`\nDrugs probe — drug=${DRUG}, bolus=${BOLUS} mcg, infuse=${INFUSE} mcg/kg/min, ke0=${KE0}, throttle-organ=${THROTTLE}, ANS=${model.models.Ans?.is_enabled ?? "n/a"}`);
console.log("weight:", model.weight, "kg | IVCI vol:", r(IVCI.vol, 4), "L | AA vol:", r(AA.vol, 4), "L\n");
console.table(rows);

const baseHR = rows[0].HR;
const peakHR = Math.max(...rows.map((x) => x.HR));
const peakAA = Math.max(...rows.map((x) => x.conc_AA));
const conc60 = rows.find((x) => x.t === "60s")?.conc_AA ?? 0;
const conc120 = rows.find((x) => x.t === "120s")?.conc_AA ?? 0;
const peakCont = Math.max(...rows.map((x) => x.cont_f));
const peakSvr = Math.max(...rows.map((x) => x.svr_f));
const peakHrF = Math.max(...rows.map((x) => x.hr_f));
const finalHR = rows[rows.length - 1].HR;
console.log("\narterial pressure (sys/dia/map mmHg):");
console.log("  baseline:", baseP, " near peak conc:", peakP);
console.log(`\npeak AA conc: ${peakAA}  | conc@60s: ${conc60}  | conc@120s: ${conc120}  (lingering ↑ when organ perfusion throttled)`);
console.log("baseline HR:", baseHR, " peak HR:", peakHR, " final HR:", finalHR);
console.log("PASS checks:",
  "transport(AA>0):", peakAA > 0,
  "| HR↑:", peakHrF > 1.01,
  "| inotropy↑:", peakCont > 1.01,
  "| SVR↑:", peakSvr > 1.01,
  "| MAP↑:", peakP && baseP ? peakP.map > baseP.map : "n/a",
  "| recovered:", BOLUS > 0 && INFUSE === 0 ? finalHR < peakHR : "n/a");
