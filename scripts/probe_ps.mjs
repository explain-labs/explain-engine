// Critical pulmonary stenosis probe: the right-heart pressure-overload + duct-dependent-pulmonary-flow
// read-outs that define critical PS, which probe_vitals.mjs does not surface. The pulmonary valve is
// severely obstructed, so the RV pressure-loads to suprasystemic levels across a large trans-valvular
// gradient, antegrade pulmonary flow is a trickle, the duct supplies the lungs (aorta->PA), and the
// pressured RA pops off right-to-left across the foramen ovale. This reports:
//   - peak RV pressure vs peak PA pressure and the trans-valvular gradient (the defining lesion)
//   - the antegrade pulmonary-valve flow (trickle) vs the ductal flow (the pulmonary lifeline) and their
//     sum = total pulmonary blood flow
//   - the foramen-ovale shunt (expected R->L pop-off) and RA pressure
//   - pre/post-ductal SpO2 and MAP
//
//   node scripts/probe_ps.mjs <scenario> [--seconds N] [--window W] [--no-ans]

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const argv = process.argv.slice(2);
const scenario = argv.find((a) => !a.startsWith("-")) || "critical_ps";
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
const M = m.Monitor, RA = m.RAIVCI, RV = m.RV, PA = m.PA;
const Pda = m.Pda, Shunts = m.Shunts, RV_PA = m.RV_PA; // RV_PA.flow = antegrade pulmonary-valve flow

send("POST", "calc", SECONDS);
const SLICE = 0.02, N = Math.round(WINDOW / SLICE);
const acc = {}, add = (k, v) => { acc[k] = (acc[k] || 0) + (v ?? 0); };
let rvPeak = -1e9, paPeak = -1e9; // systolic peaks
for (let i = 0; i < N; i++) {
  send("POST", "calc", SLICE);
  add("q_ante", RV_PA?.flow);      // antegrade pulmonary-valve flow (L/s); the trickle
  add("q_da", Pda?.flow_pa);       // ductal (L/s); +ve = Ao->PA (pulmonary lifeline, expected +ve)
  add("q_fo", Shunts?.flow_fo);    // atrial (L/s); +ve = LA->RA, -ve = RA->LA (expected R->L pop-off)
  add("ra", RA?.pres);
  add("map", M?.minmax?.abp_pre_pres_mean); add("pap_m", M?.minmax?.pap_pres_mean);
  add("spo2_pre", M?.sao2_pre); add("spo2_post", M?.sao2_post);
  if (typeof RV?.pres === "number" && RV.pres > rvPeak) rvPeak = RV.pres;
  if (typeof PA?.pres === "number" && PA.pres > paPeak) paPeak = PA.pres;
}
for (const k in acc) acc[k] /= N;

console.log = _log;
const r = (x, n = 1) => (typeof x === "number" && isFinite(x) ? Number(x.toFixed(n)) : x);
const mlmin = (q) => (q || 0) * 60 * 1000;
const ante = mlmin(acc.q_ante), duct = mlmin(acc.q_da), qp = ante + Math.max(0, duct);

console.log(`\n=== critical PS probe: ${scenario}  (warmup ${SECONDS}s, ANS ${m.Ans?.is_enabled ? "ON" : "OFF"}) ===\n`);
console.log(`RV peak pressure          ${String(r(rvPeak, 0)).padStart(7)} mmHg     ${rvPeak >= 70 ? "(suprasystemic — pressure-loaded RV)" : ""}`);
console.log(`PA peak pressure          ${String(r(paPeak, 0)).padStart(7)} mmHg     (post-stenotic)`);
console.log(`Trans-valvular gradient   ${String(r(rvPeak - paPeak, 0)).padStart(7)} mmHg     (the stenosis)`);
console.log(`Antegrade valve flow      ${String(r(ante, 0)).padStart(7)} mL/min     (trickle through the valve)`);
console.log(`Ductal flow (PDA)         ${String(r(duct, 0)).padStart(7)} mL/min     ${duct > 1 ? "Ao->PA (pulmonary lifeline)" : duct < -1 ? "PA->Ao" : "~nil"}`);
console.log(`Total pulmonary flow      ${String(r(qp, 0)).padStart(7)} mL/min     (antegrade + ductal)`);
console.log(`Atrial shunt (FO)         ${String(r(mlmin(acc.q_fo), 0)).padStart(7)} mL/min     ${mlmin(acc.q_fo) < -1 ? "RA->LA (R->L pop-off)" : mlmin(acc.q_fo) > 1 ? "LA->RA" : "~nil"}`);
console.log(`RA pressure (mean)        ${String(r(acc.ra)).padStart(7)} mmHg`);
console.log(`MAP                       ${String(r(acc.map)).padStart(7)} mmHg`);
console.log(`SpO2 pre / post           ${String(r(acc.spo2_pre)).padStart(7)} / ${r(acc.spo2_post)} %   (cyanosis from the R->L atrial shunt)`);
console.log("");
