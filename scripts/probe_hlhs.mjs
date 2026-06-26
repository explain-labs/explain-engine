// HLHS probe: the single-(right)-ventricle parallel-circulation read-outs that characterize hypoplastic
// left heart syndrome, which probe_vitals.mjs does not surface. In HLHS the right ventricle is the only
// pump: it ejects into the pulmonary artery, from where the flow divides between the lungs (Qp) and — via
// the ductus arteriosus, right-to-left — the entire systemic circulation (Qs), with the ascending aorta
// and coronaries perfused RETROGRADE up the arch. All pulmonary venous return is obligated left-to-right
// across the foramen ovale. This reports:
//   - the single RV output and the Qp:Qs split (pulmonary over-circulation steals from systemic output)
//   - the obligate atrial (FO, LA->RA) and the systemic ductal (PDA, PA->aorta) flows
//   - retrograde aortic-arch flow (AAR->AA) and coronary inflow — the duct-dependent, vulnerable beds
//   - LA vs RA pressure (a high LA with a small atrial shunt = restrictive septum, an emergency)
//   - pre/post-ductal SpO2 (uniformly reduced — fully mixed in the RV)
//
//   node scripts/probe_hlhs.mjs <scenario> [--seconds N] [--window W] [--no-ans]

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const argv = process.argv.slice(2);
const scenario = argv.find((a) => !a.startsWith("-")) || "hlhs";
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
const M = m.Monitor, LA = m.LA, RA = m.RAIVCI, AA = m.AA, AD = m.AD;
const Pda = m.Pda, Shunts = m.Shunts;
const RV_PA = m.RV_PA;     // the single ventricle's outflow (total cardiac output)
const AA_AAR = m.AA_AAR;   // arch resistor; in HLHS flow runs AAR->AA (retrograde) to fill ascending aorta
const AA_COR = m.AA_COR;   // coronary inflow off the ascending aorta

send("POST", "calc", SECONDS);
const SLICE = 0.02, N = Math.round(WINDOW / SLICE);
const acc = {}, add = (k, v) => { acc[k] = (acc[k] || 0) + (v ?? 0); };
for (let i = 0; i < N; i++) {
  send("POST", "calc", SLICE);
  add("rv", RV_PA?.flow);          // single RV output: RV -> PA (L/s) = total cardiac output
  add("q_da", Pda?.flow_pa);       // ductal (L/s); +ve = Ao->PA, -ve = PA->Ao (systemic, expected R->L)
  add("q_fo", Shunts?.flow_fo);    // atrial (L/s); +ve = LA->RA (obligate, expected +ve)
  add("q_arch", AA_AAR?.flow);     // arch (L/s); +ve = AA->AAR (antegrade), -ve = AAR->AA (retrograde)
  add("q_cor", AA_COR?.flow);      // coronary inflow (L/s)
  add("la", LA?.pres); add("ra", RA?.pres);
  add("map", M?.minmax?.abp_pre_pres_mean); add("pap_m", M?.minmax?.pap_pres_mean);
  add("spo2_pre", M?.sao2_pre); add("spo2_post", M?.sao2_post);
  add("so2_aa", AA?.so2);
}
for (const k in acc) acc[k] /= N;

console.log = _log;
const r = (x, n = 1) => (typeof x === "number" && isFinite(x) ? Number(x.toFixed(n)) : x);
const mlmin = (q) => (q || 0) * 60 * 1000;
const co = mlmin(acc.rv);            // total cardiac output (RV)
const qs = -mlmin(acc.q_da);         // systemic flow = duct PA->aorta (sign-flipped: R->L is +ve systemic)
const qp = co - qs;                  // pulmonary flow = total - systemic

console.log(`\n=== HLHS probe: ${scenario}  (warmup ${SECONDS}s, ANS ${m.Ans?.is_enabled ? "ON" : "OFF"}) ===\n`);
console.log(`RV output (single pump)   ${String(r(co, 0)).padStart(7)} mL/min     (total cardiac output)`);
console.log(`  -> systemic (duct R->L) ${String(r(qs, 0)).padStart(7)} mL/min     Qs`);
console.log(`  -> pulmonary (to lungs) ${String(r(qp, 0)).padStart(7)} mL/min     Qp     Qp:Qs ${qs ? r(qp / qs, 2) : "n/a"}`);
console.log(`Atrial shunt (FO)         ${String(r(mlmin(acc.q_fo), 0)).padStart(7)} mL/min     ${acc.q_fo > 0.0001 ? "LA->RA (obligate)" : acc.q_fo < -0.0001 ? "RA->LA (!)" : "~nil"}`);
console.log(`Ductal shunt (PDA)        ${String(r(mlmin(acc.q_da), 0)).padStart(7)} mL/min     ${mlmin(acc.q_da) < -1 ? "PA->Ao (systemic, R->L)" : mlmin(acc.q_da) > 1 ? "Ao->PA (L->R)" : "~nil"}`);
console.log(`Aortic arch flow          ${String(r(mlmin(acc.q_arch), 0)).padStart(7)} mL/min     ${acc.q_arch < -0.0001 ? "AAR->AA (RETROGRADE — duct-fed ascending aorta)" : "AA->AAR (antegrade)"}`);
console.log(`Coronary inflow           ${String(r(mlmin(acc.q_cor), 0)).padStart(7)} mL/min     (retrograde-duct-dependent)`);
console.log(`LA / RA pressure (mean)   ${String(r(acc.la)).padStart(7)} / ${r(acc.ra)} mmHg   ${acc.la > 12 ? "<- high LA: restrictive atrial septum" : ""}`);
console.log(`MAP                       ${String(r(acc.map)).padStart(7)} mmHg`);
console.log(`PAP mean                  ${String(r(acc.pap_m)).padStart(7)} mmHg`);
console.log(`SpO2 pre / post           ${String(r(acc.spo2_pre)).padStart(7)} / ${r(acc.spo2_post)} %   (mixed; sO2 AA ${r(acc.so2_aa)})`);
console.log("");
