// TAPVC probe: the read-outs that characterize total anomalous pulmonary venous connection — the
// pulmonary veins drain to the systemic venous side, so the left atrium is filled only by an OBLIGATE
// right-to-left atrial shunt, and (in the obstructed form) the anomalous channel raises pulmonary venous
// pressure. probe_vitals.mjs does not surface these. Reports:
//   - the anomalous pulmonary-venous drainage flow (the re-pointed PV_LA resistor, now PV->systemic vein)
//   - the PULMONARY VENOUS pressure (PV compartment) — the obstructed-TAPVC marker (pulmonary venous
//     hypertension -> oedema), contrasted with a near-normal LA pressure (the LA is filled by the shunt,
//     so the problem is upstream, not in the left atrium)
//   - the obligate foramen-ovale shunt (R->L = the entire left-heart filling) and RA pressure
//   - PAP vs MAP (secondary pulmonary arterial hypertension) and the LV output (low when obstructed)
//   - pre/post-ductal SpO2 (uniformly reduced — fully mixed in the right atrium)
//
//   node scripts/probe_tapvc.mjs <scenario> [--seconds N] [--window W] [--no-ans]

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const argv = process.argv.slice(2);
const scenario = argv.find((a) => !a.startsWith("-")) || "tapvc";
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? Number(argv[i + 1]) : d; };
const SECONDS = opt("--seconds", 120);
const WINDOW = opt("--window", 20);
const NO_ANS = flag("--no-ans");

let liveModel = null;
globalThis.self = globalThis;
globalThis.postMessage = (m) => {
  if (!m || !m.type) return;
  if (m.type === "state") liveModel = m.payload;
  if (m.type === "error") console.error("ENGINE ERROR:", m.message, m.payload ?? "");
};
const _log = console.log; console.log = () => {};
await import("../explain/ModelEngine.js");
const send = (t, msg, p) => self.onmessage({ data: { type: t, message: msg, payload: p } });

const path = new URL(`../public/model_definitions/${scenario}.json`, import.meta.url);
const json = JSON.parse(fs.readFileSync(path, "utf8"));
send("POST", "build", json.model_definition || json);
send("GET", "state", []);
const model = liveModel;
if (!model || !model.models) { console.log = _log; console.error(`Build failed for "${scenario}".`); process.exit(1); }
if (NO_ANS && model.models.Ans) model.models.Ans.is_enabled = false;

const m = model.models;
const M = m.Monitor, LA = m.LA, RA = m.RAIVCI, PV = m.PV;
const Shunts = m.Shunts, PV_LA = m.PV_LA, LV_AA = m.LV_AA; // PV_LA = the anomalous channel; LV_AA flow = CO

send("POST", "calc", SECONDS);
const SLICE = 0.02, N = Math.round(WINDOW / SLICE);
const acc = {}, add = (k, v) => { acc[k] = (acc[k] || 0) + (v ?? 0); };
let pvPeak = -1e9;
for (let i = 0; i < N; i++) {
  send("POST", "calc", SLICE);
  add("q_pv", PV_LA?.flow);        // anomalous pulmonary-venous drainage (L/s); +ve = PV -> systemic vein
  add("q_fo", Shunts?.flow_fo);    // atrial (L/s); -ve = RA->LA (obligate R->L filling the left heart)
  add("co", LV_AA?.flow);          // LV output = systemic cardiac output (L/s)
  add("pv", PV?.pres); add("la", LA?.pres); add("ra", RA?.pres);
  add("map", M?.minmax?.abp_pre_pres_mean); add("pap_m", M?.minmax?.pap_pres_mean);
  add("spo2_pre", M?.sao2_pre); add("spo2_post", M?.sao2_post);
  if (typeof PV?.pres === "number" && PV.pres > pvPeak) pvPeak = PV.pres;
}
for (const k in acc) acc[k] /= N;

console.log = _log;
const r = (x, n = 1) => (typeof x === "number" && isFinite(x) ? Number(x.toFixed(n)) : x);
const mlmin = (q) => (q || 0) * 60 * 1000;

console.log(`\n=== TAPVC probe: ${scenario}  (warmup ${SECONDS}s, ANS ${m.Ans?.is_enabled ? "ON" : "OFF"}) ===\n`);
console.log(`Anomalous PV drainage     ${String(r(mlmin(acc.q_pv), 0)).padStart(7)} mL/min   (pulmonary venous return -> systemic vein)`);
console.log(`Pulmonary venous pressure ${String(r(acc.pv)).padStart(7)} mmHg   (mean; peak ${r(pvPeak)})   ${acc.pv > 12 ? "<- pulmonary venous HYPERTENSION (obstructed)" : "(non-obstructed)"}`);
console.log(`LA pressure (mean)        ${String(r(acc.la)).padStart(7)} mmHg   (filled by the shunt — near-normal)`);
console.log(`Obligate atrial shunt(FO) ${String(r(mlmin(acc.q_fo), 0)).padStart(7)} mL/min   ${mlmin(acc.q_fo) < -1 ? "RA->LA (R->L — fills the entire left heart)" : "~nil"}`);
console.log(`RA pressure (mean)        ${String(r(acc.ra)).padStart(7)} mmHg`);
console.log(`LV output (CO)            ${String(r(mlmin(acc.co), 0)).padStart(7)} mL/min`);
console.log(`MAP                       ${String(r(acc.map)).padStart(7)} mmHg`);
console.log(`PAP mean                  ${String(r(acc.pap_m)).padStart(7)} mmHg   ${acc.pap_m >= acc.map ? ">= MAP (suprasystemic — pulmonary arterial HTN)" : "< MAP"}`);
console.log(`SpO2 pre / post           ${String(r(acc.spo2_pre)).padStart(7)} / ${r(acc.spo2_post)} %   (mixed in the RA)`);
console.log("");
