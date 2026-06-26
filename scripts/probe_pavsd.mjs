// PA+VSD probe: the read-outs that characterize pulmonary atresia with VSD, which probe_vitals.mjs does
// not surface. The pulmonary valve is atretic, but (unlike PA-IVS) a large VSD lets the right ventricle
// DECOMPRESS into the left ventricle / aorta, so both ventricles eject into the single aortic outlet and
// the lungs are supplied entirely by the duct. Reports:
//   - confirmation of NO antegrade pulmonary flow (atretic valve) and the duct as the sole pulmonary supply
//   - the VSD decompression flow (RV->LV) and the RV vs LV peak pressures (equilibrated by the large VSD —
//     the RV is NOT a blind hypertensive chamber, contrast PA-IVS)
//   - systemic cardiac output and MAP/PAP
//   - pre/post-ductal SpO2 (cyanosis from mixing at the ventricular/aortic level)
//
//   node scripts/probe_pavsd.mjs <scenario> [--seconds N] [--window W] [--no-ans]

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const argv = process.argv.slice(2);
const scenario = argv.find((a) => !a.startsWith("-")) || "pa_vsd";
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
const M = m.Monitor, RV = m.RV, LV = m.LV;
const Shunts = m.Shunts, Pda = m.Pda, RV_PA = m.RV_PA, LV_AA = m.LV_AA;

send("POST", "calc", SECONDS);
const SLICE = 0.02, N = Math.round(WINDOW / SLICE);
const acc = {}, add = (k, v) => { acc[k] = (acc[k] || 0) + (v ?? 0); };
let rvPeak = -1e9, lvPeak = -1e9;
for (let i = 0; i < N; i++) {
  send("POST", "calc", SLICE);
  add("q_ante", RV_PA?.flow);      // antegrade pulmonary-valve flow (expected ~0, atretic)
  add("q_da", Pda?.flow_pa);       // ductal (L/s); +ve = Ao->PA (sole pulmonary supply)
  add("q_vsd", Shunts?.flow_vsd);  // VSD (L/s); +ve = LV->RV, -ve = RV->LV (RV decompression)
  add("co", LV_AA?.flow);          // systemic cardiac output via the aortic valve (L/s)
  add("map", M?.minmax?.abp_pre_pres_mean); add("pap_m", M?.minmax?.pap_pres_mean);
  add("spo2_pre", M?.sao2_pre); add("spo2_post", M?.sao2_post);
  if (typeof RV?.pres === "number" && RV.pres > rvPeak) rvPeak = RV.pres;
  if (typeof LV?.pres === "number" && LV.pres > lvPeak) lvPeak = LV.pres;
}
for (const k in acc) acc[k] /= N;

console.log = _log;
const r = (x, n = 1) => (typeof x === "number" && isFinite(x) ? Number(x.toFixed(n)) : x);
const mlmin = (q) => (q || 0) * 60 * 1000;

console.log(`\n=== PA+VSD probe: ${scenario}  (warmup ${SECONDS}s, ANS ${m.Ans?.is_enabled ? "ON" : "OFF"}) ===\n`);
console.log(`Antegrade pulmonary flow  ${String(r(mlmin(acc.q_ante), 0)).padStart(7)} mL/min   ${Math.abs(mlmin(acc.q_ante)) < 1 ? "(none — pulmonary valve atretic)" : "(!)"}`);
console.log(`Ductal flow (PDA)         ${String(r(mlmin(acc.q_da), 0)).padStart(7)} mL/min   ${mlmin(acc.q_da) > 1 ? "Ao->PA (SOLE pulmonary supply)" : "~nil"}`);
console.log(`VSD flow (RV decompress)  ${String(r(mlmin(acc.q_vsd), 0)).padStart(7)} mL/min   ${mlmin(acc.q_vsd) < -1 ? "RV->LV->aorta" : mlmin(acc.q_vsd) > 1 ? "LV->RV" : "~nil"}`);
console.log(`RV / LV peak pressure     ${String(r(rvPeak, 0)).padStart(7)} / ${r(lvPeak, 0)} mmHg   ${Math.abs(rvPeak - lvPeak) < 15 ? "(equilibrated — RV decompresses, not blind)" : ""}`);
console.log(`Systemic output (CO)      ${String(r(mlmin(acc.co), 0)).padStart(7)} mL/min`);
console.log(`MAP                       ${String(r(acc.map)).padStart(7)} mmHg`);
console.log(`PAP mean                  ${String(r(acc.pap_m)).padStart(7)} mmHg`);
console.log(`SpO2 pre / post           ${String(r(acc.spo2_pre)).padStart(7)} / ${r(acc.spo2_post)} %   (mixed — cyanosis)`);
console.log("");
