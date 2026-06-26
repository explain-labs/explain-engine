// PA-IVS probe: the read-outs that characterize pulmonary atresia with intact ventricular septum — a
// blind right ventricle, an obligate right-to-left atrial shunt, and entirely duct-dependent pulmonary
// flow — which probe_vitals.mjs does not surface. Reports:
//   - confirmation of NO antegrade pulmonary flow (atretic valve) and the duct as the sole pulmonary supply
//   - the blind RV: peak pressure (hypertensive) and its only outlet, the tricuspid-regurgitation flow
//   - the obligate foramen-ovale shunt (R->L = the whole systemic venous return) and RA pressure
//   - pre/post-ductal SpO2 (cyanosis from mixing the systemic venous return into the left heart) and MAP
//
//   node scripts/probe_paivs.mjs <scenario> [--seconds N] [--window W] [--no-ans]

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const argv = process.argv.slice(2);
const scenario = argv.find((a) => !a.startsWith("-")) || "pa_ivs";
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
const M = m.Monitor, RA = m.RAIVCI, RV = m.RV;
const Pda = m.Pda, Shunts = m.Shunts;
const RV_PA = m.RV_PA;                          // atretic pulmonary valve (antegrade should be ~0)
const TRI = [m.RAIVCI_RV, m.RASVC_RV];          // tricuspid valves; negative flow = regurgitation

send("POST", "calc", SECONDS);
const SLICE = 0.02, N = Math.round(WINDOW / SLICE);
const acc = {}, add = (k, v) => { acc[k] = (acc[k] || 0) + (v ?? 0); };
let rvPeak = -1e9, trRegurg = 0; // TR = the backward (negative) tricuspid flow during systole
for (let i = 0; i < N; i++) {
  send("POST", "calc", SLICE);
  add("q_ante", RV_PA?.flow);      // antegrade pulmonary-valve flow (expected ~0, atretic)
  add("q_da", Pda?.flow_pa);       // ductal (L/s); +ve = Ao->PA (sole pulmonary supply)
  add("q_fo", Shunts?.flow_fo);    // atrial (L/s); -ve = RA->LA (obligate R->L return)
  add("ra", RA?.pres);
  add("map", M?.minmax?.abp_pre_pres_mean); add("pap_m", M?.minmax?.pap_pres_mean);
  add("spo2_pre", M?.sao2_pre); add("spo2_post", M?.sao2_post);
  if (typeof RV?.pres === "number" && RV.pres > rvPeak) rvPeak = RV.pres;
  const triFlow = (TRI[0]?.flow ?? 0) + (TRI[1]?.flow ?? 0);
  if (triFlow < 0) trRegurg += triFlow; // accumulate regurgitant (negative) flow
}
for (const k in acc) acc[k] /= N;
const trRegurgMean = trRegurg / N;

console.log = _log;
const r = (x, n = 1) => (typeof x === "number" && isFinite(x) ? Number(x.toFixed(n)) : x);
const mlmin = (q) => (q || 0) * 60 * 1000;

console.log(`\n=== PA-IVS probe: ${scenario}  (warmup ${SECONDS}s, ANS ${m.Ans?.is_enabled ? "ON" : "OFF"}) ===\n`);
console.log(`Antegrade pulmonary flow  ${String(r(mlmin(acc.q_ante), 0)).padStart(7)} mL/min     ${Math.abs(mlmin(acc.q_ante)) < 1 ? "(none — pulmonary valve atretic)" : "(!)"}`);
console.log(`Ductal flow (PDA)         ${String(r(mlmin(acc.q_da), 0)).padStart(7)} mL/min     ${mlmin(acc.q_da) > 1 ? "Ao->PA (SOLE pulmonary supply)" : "~nil"}`);
console.log(`Blind RV peak pressure    ${String(r(rvPeak, 0)).padStart(7)} mmHg     ${rvPeak >= acc.map ? "(suprasystemic — hypertensive blind RV)" : ""}`);
console.log(`Tricuspid regurg flow     ${String(r(mlmin(trRegurgMean), 0)).padStart(7)} mL/min     (the blind RV's only outlet)`);
console.log(`Atrial shunt (FO)         ${String(r(mlmin(acc.q_fo), 0)).padStart(7)} mL/min     ${mlmin(acc.q_fo) < -1 ? "RA->LA (obligate R->L — whole venous return)" : mlmin(acc.q_fo) > 1 ? "LA->RA" : "~nil"}`);
console.log(`RA pressure (mean)        ${String(r(acc.ra)).padStart(7)} mmHg`);
console.log(`MAP                       ${String(r(acc.map)).padStart(7)} mmHg`);
console.log(`SpO2 pre / post           ${String(r(acc.spo2_pre)).padStart(7)} / ${r(acc.spo2_post)} %   (cyanosis — mixed systemic+pulmonary venous return)`);
console.log("");
