// Measure uterine circulation (flows, node pressures, settled compartment seeds) at steady state.
//
//   node scripts/probe_uterus.mjs [scenario] [--seconds N] [--window W]
//
// Reports mean flow (mL/min) through each uterine connector, mean node pressures, and the
// settled vol/pres of each UT compartment (handy for re-seeding the definition).
import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const argv = process.argv.slice(2);
const scenario = argv.find((a) => !a.startsWith("-")) || "adult_female_uterus";
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? Number(argv[i + 1]) : d; };
const SECONDS = opt("--seconds", 120);
const WINDOW = opt("--window", 20);
const flag = (n) => argv.includes(n);
const GA = argv.indexOf("--ga") >= 0 ? Number(argv[argv.indexOf("--ga") + 1]) : null; // pregnancy GA (weeks)
const PREGNANT = flag("--pregnant") || GA !== null; // --ga implies pregnant
const COUPLE = flag("--couple"); // exercise maternal-placental coupling (also enables placenta)
const CONTRACT = flag("--contract"); // enable uterine contractions and characterize the flow waveform

let liveModel = null;
globalThis.self = globalThis;
globalThis.postMessage = (msg) => {
  if (!msg || !msg.type) return;
  if (msg.type === "state") liveModel = msg.payload;
  if (msg.type === "error") console.error("ENGINE ERROR:", msg.message, msg.payload ?? "");
};
const _log = console.log; console.log = () => {};
await import("../explain/ModelEngine.js");
const send = (type, message, payload) => self.onmessage({ data: { type, message, payload } });
const def = (JSON.parse(fs.readFileSync(new URL(`../public/model_definitions/${scenario}.json`, import.meta.url), "utf8"))).model_definition;
send("POST", "build", def);
send("GET", "state", []);
const model = liveModel;
console.log = _log;
if (!model || !model.models) { console.error("build failed for", scenario); process.exit(1); }

// optional pregnancy overrides (applied before warm-up so the bed settles at the scaled state)
const ut = model.models.Uterus;
if (ut && (PREGNANT || COUPLE)) {
  if (PREGNANT) ut.pregnant = true;
  if (GA !== null) ut.preg_ga = GA;
  if (COUPLE) {
    ut.couple_placenta = true;
    const pl = model.models.Placenta;
    if (pl) { pl.skip_mat_gas_write = true; pl.placenta_running = true; pl.umb_clamped = false; }
  }
  console.log(`[override] pregnant=${ut.pregnant} preg_ga=${ut.preg_ga} couple_placenta=${ut.couple_placenta}`);
}
if (ut && CONTRACT) { ut.contractions_running = true; console.log(`[override] contractions_running=true period=${ut.contraction_period}s amp=${ut.contraction_amplitude}mmHg`); }

send("POST", "calc", SECONDS);
const SLICE = 0.02;
const N = Math.round(WINDOW / SLICE);
const resistors = ["AD_UT_ART", "UT_ART_UT_CAP", "UT_CAP_UT_VEN", "UT_VEN_VLB", "AD_KID_ART"];
const nodes = ["AD", "UT_ART", "UT_CAP", "UT_VEN", "VLB"];
const comps = ["UT_ART", "UT_CAP", "UT_VEN"];
const o2nodes = ["UT_ART", "UT_CAP", "UT_VEN", "KID_ART", "KID_VEN"];
const fAcc = Object.fromEntries(resistors.map((r) => [r, 0]));
const pAcc = Object.fromEntries(nodes.map((p) => [p, 0]));
const vAcc = Object.fromEntries(comps.map((c) => [c, 0]));
const oAcc = Object.fromEntries(o2nodes.map((c) => [c, 0]));
const uKeys = ["ut_blood_flow", "ut_do2", "ut_vo2_ml", "ut_o2er", "ut_avo2"];
const uAcc = Object.fromEntries(uKeys.map((k) => [k, 0]));
for (let i = 0; i < N; i++) {
  send("POST", "calc", SLICE);
  for (const r of resistors) fAcc[r] += model.models[r]?.flow ?? 0;
  for (const p of nodes) pAcc[p] += model.models[p]?.pres ?? 0;
  for (const c of comps) vAcc[c] += model.models[c]?.vol ?? 0;
  for (const c of o2nodes) oAcc[c] += model.models[c]?.to2 ?? 0;
  for (const k of uKeys) uAcc[k] += model.models.Uterus?.[k] ?? 0;
}
const mlmin = (lps) => (lps / N * 60000).toFixed(1).padStart(8);
console.log(`\n=== uterine circulation: ${scenario} (warmup ${SECONDS}s, mean over ${WINDOW}s) ===\n`);
console.log("-- mean flows (mL/min) --");
console.log(`  AD -> UT_ART      ${mlmin(fAcc.AD_UT_ART)}`);
console.log(`  UT_ART -> UT_CAP  ${mlmin(fAcc.UT_ART_UT_CAP)}`);
console.log(`  UT_CAP -> UT_VEN  ${mlmin(fAcc.UT_CAP_UT_VEN)}`);
console.log(`  UT_VEN -> VLB     ${mlmin(fAcc.UT_VEN_VLB)}`);
console.log(`  (ref) AD->KID_ART ${mlmin(fAcc.AD_KID_ART)}`);
console.log("\n-- mean node pressures (mmHg) --");
for (const p of nodes) console.log(`  ${p.padEnd(8)} ${(pAcc[p] / N).toFixed(2).padStart(8)}`);
console.log("\n-- settled compartment seeds (mean) --");
for (const c of comps) console.log(`  ${c.padEnd(8)} vol=${(vAcc[c] / N).toFixed(6)}  pres=${(pAcc[c] / N).toFixed(2)}`);

console.log("\n-- blood O2 content to2 (mmol/L) — extraction check --");
const o2 = (c) => (oAcc[c] / N);
for (const c of o2nodes) console.log(`  ${c.padEnd(8)} ${o2(c).toFixed(3)}`);
console.log(`  uterine A-V O2 diff (UT_ART-UT_VEN): ${(o2("UT_ART") - o2("UT_VEN")).toFixed(3)} mmol/L`);
console.log(`  (ref) renal A-V O2 diff (KID_ART-KID_VEN): ${(o2("KID_ART") - o2("KID_VEN")).toFixed(3)} mmol/L`);

if (model.models.Uterus) {
  console.log("\n-- Uterus model read-outs (mean over window) --");
  console.log(`  ut_blood_flow  ${(uAcc.ut_blood_flow / N).toFixed(1)} mL/min`);
  console.log(`  ut_do2         ${(uAcc.ut_do2 / N).toFixed(2)} mL O2/min`);
  console.log(`  ut_vo2_ml      ${(uAcc.ut_vo2_ml / N).toFixed(2)} mL O2/min`);
  console.log(`  ut_o2er        ${(uAcc.ut_o2er / N).toFixed(1)} %`);
  console.log(`  ut_avo2        ${(uAcc.ut_avo2 / N).toFixed(3)} mmol/L`);
} else {
  console.log("\n  (no Uterus model in this scenario)");
}

if (CONTRACT && model.models.Uterus) {
  // sample the instantaneous uterine inflow and IUP over one full contraction period
  const period = model.models.Uterus.contraction_period;
  const M = Math.round(period / SLICE);
  let fMin = Infinity, fMax = -Infinity, fSum = 0, iupMax = -Infinity, iupMin = Infinity;
  for (let i = 0; i < M; i++) {
    send("POST", "calc", SLICE);
    const f = (model.models.UT_ART_UT_CAP?.flow ?? 0) * 60000; // mL/min instantaneous
    const iup = model.models.Uterus.iup;
    fMin = Math.min(fMin, f); fMax = Math.max(fMax, f); fSum += f;
    iupMax = Math.max(iupMax, iup); iupMin = Math.min(iupMin, iup);
  }
  const fMean = fSum / M;
  console.log("\n-- contraction waveform (over one full period) --");
  console.log(`  IUP range        ${iupMin.toFixed(1)} .. ${iupMax.toFixed(1)} mmHg (resting tone .. peak)`);
  console.log(`  inflow mean      ${fMean.toFixed(1)} mL/min`);
  console.log(`  inflow max (rest)${fMax.toFixed(1).padStart(8)} mL/min`);
  console.log(`  inflow min (peak)${fMin.toFixed(1).padStart(8)} mL/min`);
  console.log(`  peak flow dip    ${(100 * (1 - fMin / fMax)).toFixed(0)} % below resting`);
  console.log(`  Montevideo units ${model.models.Uterus.montevideo_units.toFixed(0)}`);
}

if (COUPLE && model.models.PL_MAT) {
  console.log("\n-- maternal-placental coupling check --");
  console.log(`  PL_MAT.to2  ${model.models.PL_MAT.to2.toFixed(3)} mmol/L  (should track UT_ART.to2=${o2("UT_ART").toFixed(3)}, not the constant 6.85)`);
  console.log(`  PL_MAT.tco2 ${model.models.PL_MAT.tco2.toFixed(3)} mmol/L`);
}
