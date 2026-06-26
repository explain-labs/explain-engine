// Critical aortic stenosis probe: the left-heart pressure-overload + duct-dependent-systemic-flow read-outs
// that define critical AS, which probe_vitals.mjs does not surface. The aortic valve is severely obstructed,
// so the LV pressure-loads and fails, antegrade systemic flow is inadequate, and the body — especially the
// lower body — is perfused right-to-left through the duct (PA->aorta), giving DIFFERENTIAL cyanosis
// (pre-ductal, from the LV, is pinker than post-ductal, from the duct). The high LV end-diastolic pressure
// drives a left-to-right atrial decompression. This reports:
//   - peak LV pressure vs peak ascending-aortic pressure and the trans-valvular gradient (the stenosis)
//   - the antegrade aortic-valve flow (reduced) vs the ductal flow (the systemic lifeline, PA->aorta)
//   - pre- vs post-ductal SpO2, flagging differential cyanosis (pre > post)
//   - the foramen-ovale shunt (expected L->R decompression) and LA pressure (pulmonary venous congestion)
//
//   node scripts/probe_as.mjs <scenario> [--seconds N] [--window W] [--no-ans]

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const argv = process.argv.slice(2);
const scenario = argv.find((a) => !a.startsWith("-")) || "critical_as";
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
const M = m.Monitor, LA = m.LA, LV = m.LV, AA = m.AA;
const Pda = m.Pda, Shunts = m.Shunts, LV_AA = m.LV_AA; // LV_AA.flow = antegrade aortic-valve flow

send("POST", "calc", SECONDS);
const SLICE = 0.02, N = Math.round(WINDOW / SLICE);
const acc = {}, add = (k, v) => { acc[k] = (acc[k] || 0) + (v ?? 0); };
let lvPeak = -1e9, aaPeak = -1e9;
for (let i = 0; i < N; i++) {
  send("POST", "calc", SLICE);
  add("q_ante", LV_AA?.flow);      // antegrade aortic-valve flow (L/s); reduced by the stenosis
  add("q_da", Pda?.flow_pa);       // ductal (L/s); -ve = PA->Ao (systemic lifeline, expected R->L)
  add("q_fo", Shunts?.flow_fo);    // atrial (L/s); +ve = LA->RA (expected L->R decompression)
  add("la", LA?.pres);
  add("map", M?.minmax?.abp_pre_pres_mean);
  add("spo2_pre", M?.sao2_pre); add("spo2_post", M?.sao2_post);
  if (typeof LV?.pres === "number" && LV.pres > lvPeak) lvPeak = LV.pres;
  if (typeof AA?.pres === "number" && AA.pres > aaPeak) aaPeak = AA.pres;
}
for (const k in acc) acc[k] /= N;

console.log = _log;
const r = (x, n = 1) => (typeof x === "number" && isFinite(x) ? Number(x.toFixed(n)) : x);
const mlmin = (q) => (q || 0) * 60 * 1000;
const ante = mlmin(acc.q_ante), duct = mlmin(acc.q_da);
const diff = r((acc.spo2_pre || 0) - (acc.spo2_post || 0));

console.log(`\n=== critical AS probe: ${scenario}  (warmup ${SECONDS}s, ANS ${m.Ans?.is_enabled ? "ON" : "OFF"}) ===\n`);
console.log(`LV peak pressure          ${String(r(lvPeak, 0)).padStart(7)} mmHg     (pressure-loaded LV)`);
console.log(`Aortic (AA) peak pressure ${String(r(aaPeak, 0)).padStart(7)} mmHg`);
console.log(`Trans-valvular gradient   ${String(r(lvPeak - aaPeak, 0)).padStart(7)} mmHg     (the stenosis)`);
console.log(`Antegrade aortic flow     ${String(r(ante, 0)).padStart(7)} mL/min     (reduced by the stenosis)`);
console.log(`Ductal flow (PDA)         ${String(r(duct, 0)).padStart(7)} mL/min     ${duct < -1 ? "PA->Ao (systemic lifeline, R->L)" : duct > 1 ? "Ao->PA (L->R)" : "~nil"}`);
console.log(`Atrial shunt (FO)         ${String(r(mlmin(acc.q_fo), 0)).padStart(7)} mL/min     ${mlmin(acc.q_fo) > 1 ? "LA->RA (L->R decompression)" : mlmin(acc.q_fo) < -1 ? "RA->LA" : "~nil"}`);
console.log(`LA pressure (mean)        ${String(r(acc.la)).padStart(7)} mmHg     ${acc.la > 10 ? "(pulmonary venous congestion)" : ""}`);
console.log(`MAP                       ${String(r(acc.map)).padStart(7)} mmHg`);
console.log(`SpO2 pre / post           ${String(r(acc.spo2_pre)).padStart(7)} / ${r(acc.spo2_post)} %   ` +
  `(pre-post ${diff}${diff > 1 ? "  <- differential cyanosis (pre>post): duct-fed lower body" : ""})`);
console.log("");
