// Tricuspid atresia probe: the single-LV, obligate-atrial-shunt and VSD-routed-pulmonary-flow read-outs
// that characterize tricuspid atresia, which probe_vitals.mjs does not surface. With no tricuspid valve,
// all systemic venous return crosses the foramen ovale right-to-left, the left ventricle is the only pump,
// and the lungs are reached only through the VSD (LV -> RV -> PA), supplemented by the duct. Reports:
//   - the obligate foramen-ovale shunt (R->L = the whole systemic venous return) and RA/LA pressures
//   - the pulmonary supply split: antegrade VSD->RV->PA flow vs ductal flow, and their sum (total Qp)
//   - the single LV output (systemic cardiac output) and MAP/PAP
//   - pre/post-ductal SpO2 (cyanosis from mixing the systemic venous return into the left heart)
//
//   node scripts/probe_ta.mjs <scenario> [--seconds N] [--window W] [--no-ans]

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const argv = process.argv.slice(2);
const scenario = argv.find((a) => !a.startsWith("-")) || "tricuspid_atresia";
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
const M = m.Monitor, LA = m.LA, RA = m.RAIVCI;
const Shunts = m.Shunts, Pda = m.Pda, RV_PA = m.RV_PA, LV_AA = m.LV_AA; // RV_PA = antegrade Qp; LV_AA = CO

send("POST", "calc", SECONDS);
const SLICE = 0.02, N = Math.round(WINDOW / SLICE);
const acc = {}, add = (k, v) => { acc[k] = (acc[k] || 0) + (v ?? 0); };
for (let i = 0; i < N; i++) {
  send("POST", "calc", SLICE);
  add("q_fo", Shunts?.flow_fo);    // atrial (L/s); -ve = RA->LA (obligate R->L)
  add("q_vsd", Shunts?.flow_vsd);  // VSD (L/s); +ve = LV->RV (the antegrade pulmonary route)
  add("q_ante", RV_PA?.flow);      // antegrade pulmonary flow RV->PA (L/s)
  add("q_da", Pda?.flow_pa);       // ductal (L/s); +ve = Ao->PA (supplements Qp)
  add("co", LV_AA?.flow);          // LV output = systemic cardiac output (L/s)
  add("la", LA?.pres); add("ra", RA?.pres);
  add("map", M?.minmax?.abp_pre_pres_mean); add("pap_m", M?.minmax?.pap_pres_mean);
  add("spo2_pre", M?.sao2_pre); add("spo2_post", M?.sao2_post);
}
for (const k in acc) acc[k] /= N;

console.log = _log;
const r = (x, n = 1) => (typeof x === "number" && isFinite(x) ? Number(x.toFixed(n)) : x);
const mlmin = (q) => (q || 0) * 60 * 1000;
const ante = mlmin(acc.q_ante), duct = mlmin(acc.q_da), qp = ante + Math.max(0, duct);

console.log(`\n=== tricuspid atresia probe: ${scenario}  (warmup ${SECONDS}s, ANS ${m.Ans?.is_enabled ? "ON" : "OFF"}) ===\n`);
console.log(`Obligate atrial shunt(FO) ${String(r(mlmin(acc.q_fo), 0)).padStart(7)} mL/min   ${mlmin(acc.q_fo) < -1 ? "RA->LA (R->L — whole systemic venous return)" : "~nil"}`);
console.log(`VSD flow (LV->RV)         ${String(r(mlmin(acc.q_vsd), 0)).padStart(7)} mL/min   (the antegrade route to the lungs)`);
console.log(`Antegrade Qp (RV->PA)     ${String(r(ante, 0)).padStart(7)} mL/min`);
console.log(`Ductal Qp (PDA)           ${String(r(duct, 0)).padStart(7)} mL/min   ${duct > 1 ? "Ao->PA (duct supplement)" : "~nil"}`);
console.log(`Total pulmonary flow Qp   ${String(r(qp, 0)).padStart(7)} mL/min   (antegrade + ductal)`);
console.log(`LV output (CO)            ${String(r(mlmin(acc.co), 0)).padStart(7)} mL/min   (single ventricle)`);
console.log(`LA / RA pressure (mean)   ${String(r(acc.la)).padStart(7)} / ${r(acc.ra)} mmHg`);
console.log(`MAP                       ${String(r(acc.map)).padStart(7)} mmHg`);
console.log(`PAP mean                  ${String(r(acc.pap_m)).padStart(7)} mmHg`);
console.log(`SpO2 pre / post           ${String(r(acc.spo2_pre)).padStart(7)} / ${r(acc.spo2_post)} %   (mixed — cyanosis)`);
console.log("");
