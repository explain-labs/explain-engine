// Coarctation / interrupted-aortic-arch probe: the pre- vs post-ductal split that defines left aortic-arch
// obstruction, which probe_vitals.mjs does not surface. The obstruction sits at the isthmus (the AAR->AD
// resistor); the upper body (off the ascending aorta AA) is perfused antegrade by the LV, while the lower
// body (off the descending aorta AD) is duct-dependent — fed right-to-left through the ductus, which is
// re-pointed to the descending aorta (PA->AD). This produces the two hallmarks:
//   - a PRESSURE gradient: upper-body (pre-ductal, AA) hypertension vs lower-body (post-ductal, AD) hypotension
//   - DIFFERENTIAL cyanosis: pre-ductal pink (LV-fed) vs post-ductal blue (duct-fed)
// Also reports the isthmus flow (a trickle in coarctation, zero in IAA), the ductal flow feeding the lower
// body, and the VSD flow (present in IAA).
//
//   node scripts/probe_coarc.mjs <scenario> [--seconds N] [--window W] [--no-ans]

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const argv = process.argv.slice(2);
const scenario = argv.find((a) => !a.startsWith("-")) || "coarctation";
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
const AA = m.AA, AD = m.AD;                 // pre- (upper) and post-ductal (lower) aorta
const AAR_AD = m.AAR_AD;                    // the isthmus (the coarctation site)
const Pda = m.Pda, Shunts = m.Shunts;

send("POST", "calc", SECONDS);
const SLICE = 0.02, N = Math.round(WINDOW / SLICE);
const acc = {}, add = (k, v) => { acc[k] = (acc[k] || 0) + (v ?? 0); };
let aaSys = -1e9, aaDia = 1e9, adSys = -1e9, adDia = 1e9;
for (let i = 0; i < N; i++) {
  send("POST", "calc", SLICE);
  add("aa", AA?.pres); add("ad", AD?.pres);
  add("so2_aa", AA?.so2); add("so2_ad", AD?.so2);
  add("q_isth", AAR_AD?.flow);     // isthmus flow (L/s); +ve = AAR->AD (antegrade through the arch)
  add("q_da", Pda?.flow_pa);       // ductal (L/s); -ve = PA->AD (lower-body lifeline, expected R->L)
  add("q_vsd", Shunts?.flow_vsd);  // VSD flow (L/s); +ve = LV->RV (present in IAA)
  if (typeof AA?.pres === "number") { aaSys = Math.max(aaSys, AA.pres); aaDia = Math.min(aaDia, AA.pres); }
  if (typeof AD?.pres === "number") { adSys = Math.max(adSys, AD.pres); adDia = Math.min(adDia, AD.pres); }
}
for (const k in acc) acc[k] /= N;

console.log = _log;
const r = (x, n = 1) => (typeof x === "number" && isFinite(x) ? Number(x.toFixed(n)) : x);
const mlmin = (q) => (q || 0) * 60 * 1000;

console.log(`\n=== coarctation/IAA probe: ${scenario}  (warmup ${SECONDS}s, ANS ${m.Ans?.is_enabled ? "ON" : "OFF"}) ===\n`);
console.log(`Pre-ductal  (upper, AA)   ${String(r(aaSys, 0)).padStart(3)}/${r(aaDia, 0)} mmHg  mean ${r(acc.aa)}   SpO2 ${r(acc.so2_aa)}%`);
console.log(`Post-ductal (lower, AD)   ${String(r(adSys, 0)).padStart(3)}/${r(adDia, 0)} mmHg  mean ${r(acc.ad)}   SpO2 ${r(acc.so2_ad)}%`);
console.log(`Pre-post gradient         ${String(r(acc.aa - acc.ad)).padStart(7)} mmHg (mean)   ${acc.aa - acc.ad > 5 ? "<- upper-body hypertension / weak femorals" : ""}`);
console.log(`Differential cyanosis     ${String(r(acc.so2_aa - acc.so2_ad)).padStart(7)} %      ${acc.so2_aa - acc.so2_ad > 3 ? "<- pre>post: duct-fed lower body" : ""}`);
console.log(`Isthmus flow (AAR->AD)    ${String(r(mlmin(acc.q_isth), 0)).padStart(7)} mL/min   ${Math.abs(mlmin(acc.q_isth)) < 1 ? "(none — arch interrupted)" : "(antegrade trickle through the coarctation)"}`);
console.log(`Ductal flow (PDA->AD)     ${String(r(mlmin(acc.q_da), 0)).padStart(7)} mL/min   ${mlmin(acc.q_da) < -1 ? "PA->AD (lower-body lifeline, R->L)" : mlmin(acc.q_da) > 1 ? "AD->PA (L->R)" : "~nil"}`);
console.log(`VSD flow                  ${String(r(mlmin(acc.q_vsd), 0)).padStart(7)} mL/min   ${mlmin(acc.q_vsd) > 1 ? "LV->RV (L->R)" : Math.abs(mlmin(acc.q_vsd)) < 1 ? "(none)" : "RV->LV"}`);
console.log("");
