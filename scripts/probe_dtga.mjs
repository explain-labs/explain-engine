// d-TGA probe: the mixing + parallel-circulation read-outs that distinguish transposition physiology,
// which probe_vitals.mjs does not surface. In d-TGA the aorta arises from the RV and the PA from the LV,
// so the two circulations run in parallel and systemic oxygenation depends entirely on the volume of
// mixing across the foramen ovale and the ductus arteriosus. This reports:
//   - the systemic (RV->aorta) and pulmonary (LV->PA) ventricular outputs and the Qp:Qs ratio
//   - the atrial (FO) and ductal (PDA) shunt directions/volumes — the mixing channels
//   - pre- vs post-ductal SpO2, flagging the classic REVERSED differential cyanosis (post > pre) that
//     arises because the aorta (pre-ductal, off the RV) carries desaturated blood while oxygenated PA
//     blood can reach the descending aorta through the duct
//   - PAP vs MAP
//
//   node scripts/probe_dtga.mjs <scenario> [--seconds N] [--window W] [--no-ans]

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const argv = process.argv.slice(2);
const scenario = argv.find((a) => !a.startsWith("-")) || "dtga";
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
const M = m.Monitor, LA = m.LA, RA = m.RAIVCI, AA = m.AA, AD = m.AD, PA = m.PA;
const Pda = m.Pda, Shunts = m.Shunts;
const RV_AA = m.RV_AA, LV_PA = m.LV_PA; // the transposed outflow valves (systemic / pulmonary output)

send("POST", "calc", SECONDS);
const SLICE = 0.02, N = Math.round(WINDOW / SLICE);
const acc = {}, add = (k, v) => { acc[k] = (acc[k] || 0) + (v ?? 0); };
for (let i = 0; i < N; i++) {
  send("POST", "calc", SLICE);
  add("qs", RV_AA?.flow);          // systemic output: RV -> aorta (L/s)
  add("qp", LV_PA?.flow);          // pulmonary output: LV -> PA (L/s)
  add("q_da", Pda?.flow_pa);       // ductal (L/s); +ve = Ao->PA (systemic->pulmonary)
  add("q_fo", Shunts?.flow_fo);    // atrial (L/s); +ve = LA->RA
  add("la", LA?.pres); add("ra", RA?.pres);
  add("map", M?.minmax?.abp_pre_pres_mean); add("pap_m", M?.minmax?.pap_pres_mean);
  add("spo2_pre", M?.sao2_pre); add("spo2_post", M?.sao2_post);
  add("so2_aa", AA?.so2); add("so2_ad", AD?.so2); add("so2_pa", PA?.so2);
}
for (const k in acc) acc[k] /= N;

console.log = _log;
const r = (x, n = 1) => (typeof x === "number" && isFinite(x) ? Number(x.toFixed(n)) : x);
const dir = (q, a, b) => (q > 1 ? a : q < -1 ? b : "~nil");
const mlmin = (q) => (q || 0) * 60 * 1000;
const qs = mlmin(acc.qs), qp = mlmin(acc.qp);
const diff = r((acc.spo2_pre || 0) - (acc.spo2_post || 0));

console.log(`\n=== d-TGA probe: ${scenario}  (warmup ${SECONDS}s, ANS ${m.Ans?.is_enabled ? "ON" : "OFF"}) ===\n`);
console.log(`Systemic output (RV->Ao)  ${String(r(qs, 0)).padStart(7)} mL/min`);
console.log(`Pulmonary output (LV->PA) ${String(r(qp, 0)).padStart(7)} mL/min     Qp:Qs ${qs ? r(qp / qs, 2) : "n/a"}`);
console.log(`Atrial mix  (FO)          ${String(r(mlmin(acc.q_fo), 0)).padStart(7)} mL/min     ${dir(mlmin(acc.q_fo), "LA->RA", "RA->LA")}`);
console.log(`Ductal mix  (PDA)         ${String(r(mlmin(acc.q_da), 0)).padStart(7)} mL/min     ${dir(mlmin(acc.q_da), "Ao->PA", "PA->Ao")}`);
console.log(`LA / RA pressure (mean)   ${String(r(acc.la)).padStart(7)} / ${r(acc.ra)} mmHg`);
console.log(`MAP                       ${String(r(acc.map)).padStart(7)} mmHg`);
console.log(`PAP mean                  ${String(r(acc.pap_m)).padStart(7)} mmHg     ${acc.pap_m >= acc.map ? ">= MAP (suprasystemic)" : "< MAP"}`);
console.log(`SpO2 pre / post           ${String(r(acc.spo2_pre)).padStart(7)} / ${r(acc.spo2_post)} %   ` +
  `(pre-post ${diff}${diff < -1 ? "  <- REVERSED differential cyanosis (post>pre): TGA sign" : ""})`);
console.log(`sO2  AA / AD / PA         ${String(r(acc.so2_aa)).padStart(7)} / ${r(acc.so2_ad)} / ${r(acc.so2_pa)} %   (AA=systemic out, PA=pulmonary out)`);
console.log("");
