// Tetralogy of Fallot probe: the read-outs that define a ToF phenotype, which probe_vitals.mjs does not
// surface. Reports:
//   - peak RV / LV / PA / aortic pressures, the RV-LV peak difference (non-restrictive VSD -> ~equal) and
//     the RVOT gradient (RV peak - PA peak)
//   - the VSD shunt: net flow plus its L->R and R->L components (Shunts.flow_vsd, +ve = LV->RV)
//   - the overriding aorta: RV_AA vs LV_AA flow and the RV share of aortic output
//   - pulmonary flow: antegrade RV_PA + ductal (Pda.flow_pa, +ve = Ao->PA); Qp from pulmonary venous
//     return (PV_LA), Qs = aortic output - ductal steal; Qp:Qs
//   - pre/post-ductal SpO2, MAP, HR and systemic output in mL/kg/min
// --close-duct re-probes after sealing the duct (diameter_relative 0) to show duct dependence.
//
//   node scripts/probe_tof.mjs <scenario> [--seconds N] [--window W] [--no-ans] [--close-duct]
//                              [--set Model.prop=value ...]

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const argv = process.argv.slice(2);
const scenario = argv.find((a, i) => !a.startsWith("-") && !/^\d/.test(a) && argv[i - 1] !== "--set") || "tof";
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? Number(argv[i + 1]) : d; };
const SECONDS = opt("--seconds", 120);
const WINDOW = opt("--window", 20);
const NO_ANS = flag("--no-ans");
const CLOSE_DUCT = flag("--close-duct");

let liveModel = null;
globalThis.self = globalThis;
globalThis.postMessage = (m) => {
  if (!m || !m.type) return;
  if (m.type === "state") liveModel = m.payload;
  if (m.type === "error") console.error("ENGINE ERROR:", m.message, m.payload ?? "");
};
const _log = console.log; console.log = () => {};
await import("../ModelEngine.js");
const send = (t, msg, p) => self.onmessage({ data: { type: t, message: msg, payload: p } });

const path = new URL(`../model_definitions/${scenario}.json`, import.meta.url);
const json = JSON.parse(fs.readFileSync(path, "utf8"));
send("POST", "build", json.model_definition || json);
send("GET", "state", []);
const model = liveModel;
if (!model || !model.models) { console.log = _log; console.error(`Build failed for "${scenario}".`); process.exit(1); }
if (NO_ANS && model.models.Ans) model.models.Ans.is_enabled = false;
// --set Model.prop=value (repeatable): tuning overrides applied after build, before warm-up
argv.forEach((a, i) => {
  if (a !== "--set") return;
  const [lhs, rhs] = argv[i + 1].split("=");
  const [mn, prop] = lhs.split(".");
  const v = rhs === "true" ? true : rhs === "false" ? false : Number(rhs);
  model.models[mn][prop] = v;
});

const m = model.models;
const Mon = m.Monitor, Sh = m.Shunts, Pda = m.Pda;
const r = (x, n = 1) => (typeof x === "number" && isFinite(x) ? Number(x.toFixed(n)) : x);
const mlmin = (q) => (q || 0) * 60 * 1000;
const pad = (x, n = 0) => String(r(x, n)).padStart(7);

function measure() {
  const SLICE = 0.02, N = Math.round(WINDOW / SLICE);
  const acc = {}, add = (k, v) => { acc[k] = (acc[k] || 0) + (v ?? 0); };
  const peak = { rv: -1e9, lv: -1e9, pa: -1e9, aa: -1e9 };
  for (let i = 0; i < N; i++) {
    send("POST", "calc", SLICE);
    const vsd = Sh?.flow_vsd ?? 0;
    add("vsd", vsd); add("vsd_lr", Math.max(0, vsd)); add("vsd_rl", Math.min(0, vsd));
    add("rv_aa", m.RV_AA?.flow); add("lv_aa", m.LV_AA?.flow);
    add("rv_pa", m.RV_PA?.flow); add("duct", Pda?.flow_pa); add("pv", m.PV_LA?.flow);
    add("fo", Sh?.flow_fo);
    add("map", Mon?.minmax?.abp_pre_pres_mean); add("pap_m", Mon?.minmax?.pap_pres_mean);
    add("spo2_pre", Mon?.sao2_pre); add("spo2_post", Mon?.sao2_post); add("hr", Mon?.heart_rate);
    for (const [k, c] of [["rv", m.RV], ["lv", m.LV], ["pa", m.PA], ["aa", m.AA]]) {
      if (typeof c?.pres === "number" && c.pres > peak[k]) peak[k] = c.pres;
    }
  }
  for (const k in acc) acc[k] /= N;
  return { acc, peak };
}

function report(title, { acc, peak }) {
  const w = model.weight;
  const vsd = mlmin(acc.vsd), rvaa = mlmin(acc.rv_aa), lvaa = mlmin(acc.lv_aa);
  const ante = mlmin(acc.rv_pa), duct = mlmin(acc.duct), qp = mlmin(acc.pv);
  const aoOut = rvaa + lvaa, qs = aoOut - duct; // ductal Ao->PA flow is stolen from the systemic output
  const dir = (x, pos, neg) => (x > 1 ? pos : x < -1 ? neg : "~nil");
  console.log(`\n=== ToF probe: ${scenario}${title}  (weight ${w} kg, warmup ${SECONDS}s, ANS ${m.Ans?.is_enabled ? "ON" : "OFF"}) ===\n`);
  console.log(`Peak pressure RV / LV       ${pad(peak.rv)} / ${r(peak.lv, 0)} mmHg   (RV-LV ${r(peak.rv - peak.lv, 0)}; non-restrictive VSD -> ~0)`);
  console.log(`Peak pressure PA / AA       ${pad(peak.pa)} / ${r(peak.aa, 0)} mmHg`);
  console.log(`RVOT gradient (RV-PA peak)  ${pad(peak.rv - peak.pa)} mmHg`);
  console.log(`VSD net flow                ${pad(vsd)} mL/min   ${dir(vsd, "net L->R", "net R->L")}  (L->R ${r(mlmin(acc.vsd_lr), 0)}, R->L ${r(-mlmin(acc.vsd_rl), 0)})`);
  console.log(`Aortic inflow RV / LV       ${pad(rvaa)} / ${r(lvaa, 0)} mL/min   (RV share ${r((100 * rvaa) / (aoOut || 1), 0)}% = override)`);
  console.log(`Antegrade RV_PA flow        ${pad(ante)} mL/min`);
  console.log(`Ductal flow (PDA)           ${pad(duct)} mL/min   ${dir(duct, "Ao->PA", "PA->Ao")}`);
  console.log(`FO flow                     ${pad(mlmin(acc.fo))} mL/min   ${dir(mlmin(acc.fo), "LA->RA", "RA->LA")}`);
  console.log(`Qp / Qs                     ${pad(qp)} / ${r(qs, 0)} mL/min   Qp:Qs ${r(qp / (qs || 1), 2)}`);
  console.log(`Systemic output             ${pad(qs / w)} mL/kg/min   (target 150-200)`);
  console.log(`MAP / mean PAP              ${pad(acc.map)} / ${r(acc.pap_m)} mmHg`);
  console.log(`HR                          ${pad(acc.hr)} bpm`);
  console.log(`SpO2 pre / post             ${pad(acc.spo2_pre)} / ${r(acc.spo2_post)} %`);
}

send("POST", "calc", SECONDS);
const base = measure();
console.log = _log;
report("", base);

if (CLOSE_DUCT) {
  console.log = () => {};
  Pda.diameter_relative = 0;
  send("POST", "calc", SECONDS);
  const closed = measure();
  console.log = _log;
  report("  [duct closed]", closed);
}
console.log("");
