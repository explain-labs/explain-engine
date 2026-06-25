// CDH phenotype probe: the shunt + atrial-pressure read-outs that distinguish pre-capillary from
// post-capillary CDH-PH, which probe_vitals.mjs does not surface. Reports the ductal and atrial shunt
// directions, left- vs right-atrial pressures (the post-capillary marker is a high LA pressure with an
// L->R atrial shunt), and the suprasystemic check (PAP mean vs MAP) and differential cyanosis.
//
//   node scripts/probe_cdh.mjs <scenario> [--seconds N] [--window W] [--no-ans]

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const argv = process.argv.slice(2);
const scenario = argv.find((a) => !a.startsWith("-")) || "cdh_severe";
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? Number(argv[i + 1]) : d; };
const SECONDS = opt("--seconds", 60);
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
const M = m.Monitor, LA = m.LA, RA = m.RAIVCI, LV = m.LV, RV = m.RV, Pda = m.Pda, Shunts = m.Shunts;

send("POST", "calc", SECONDS);
const SLICE = 0.02, N = Math.round(WINDOW / SLICE);
const acc = {}, add = (k, v) => { acc[k] = (acc[k] || 0) + (v ?? 0); };
let laMin = Infinity, lvMin = Infinity; // diastolic (end-diastolic pressure proxies)
for (let i = 0; i < N; i++) {
  send("POST", "calc", SLICE);
  add("q_da", Pda?.flow_pa);       // ductal at PA end (L/s); +ve = L->R (Ao->PA)
  add("q_fo", Shunts?.flow_fo);    // atrial (L/s); +ve = L->R (LA->RA)
  add("la", LA?.pres); add("ra", RA?.pres);
  add("map", M?.minmax?.abp_pre_pres_mean); add("pap_m", M?.minmax?.pap_pres_mean);
  add("spo2_pre", M?.sao2_pre); add("spo2_post", M?.sao2_post);
  if (typeof LA?.pres === "number") laMin = Math.min(laMin, LA.pres);
  if (typeof LV?.pres === "number") lvMin = Math.min(lvMin, LV.pres);
}
for (const k in acc) acc[k] /= N;

console.log = _log;
const r = (x, n = 1) => (typeof x === "number" && isFinite(x) ? Number(x.toFixed(n)) : x);
const dir = (q) => (q > 1 ? "L->R" : q < -1 ? "R->L" : "~nil");
const mlmin = (q) => (q || 0) * 60 * 1000;

console.log(`\n=== CDH probe: ${scenario}  (warmup ${SECONDS}s, ANS ${m.Ans?.is_enabled ? "ON" : "OFF"}) ===\n`);
console.log(`Ductal shunt (PDA)   ${String(r(mlmin(acc.q_da), 0)).padStart(7)} mL/min   ${dir(mlmin(acc.q_da))}`);
console.log(`Atrial shunt (FO)    ${String(r(mlmin(acc.q_fo), 0)).padStart(7)} mL/min   ${dir(mlmin(acc.q_fo))}   <- L->R + high LA = post-capillary (LV) phenotype`);
console.log(`LA pressure (mean)   ${String(r(acc.la)).padStart(7)} mmHg     (min ${r(laMin)})`);
console.log(`RA pressure (mean)   ${String(r(acc.ra)).padStart(7)} mmHg`);
console.log(`LV end-diastolic ~   ${String(r(lvMin)).padStart(7)} mmHg     (LVEDP proxy)`);
console.log(`MAP                  ${String(r(acc.map)).padStart(7)} mmHg`);
console.log(`PAP mean             ${String(r(acc.pap_m)).padStart(7)} mmHg     ${acc.pap_m >= acc.map ? ">= MAP (suprasystemic)" : "< MAP"}`);
console.log(`SpO2 pre / post      ${String(r(acc.spo2_pre)).padStart(7)} / ${r(acc.spo2_post)} %   (diff ${r((acc.spo2_pre || 0) - (acc.spo2_post || 0))})`);
console.log("");
