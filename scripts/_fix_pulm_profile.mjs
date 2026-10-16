// One-off repair: give term_neonate a physiological pulmonary pressure profile.
//
// In term_neonate 37 % of the pulmonary vascular resistance sat between the main and the branch
// pulmonary arteries (PA -> PAAL/PAAR) and the capillaries ran at 8.5 mmHg, only 22 % of the PA-LA
// drop above LA. This script redistributes the resistance along each lung path
//   PA -> PAAL -> LL_ART -> LL_CAP -> LL_VEN -> PV -> LA      (and the same for the right lung)
// so that, as a share of (PA - LA) above LA, the nodes sit at
//   PAAL 95 %, LL_ART 65 %, LL_CAP 40 % (Gaar), LL_VEN 20 %, PV 10 %
// i.e. large PAs 5 %, small arteries 30 %, arterioles 25 %, capillaries 20 %, veins 10 %, PV->LA 10 %.
// Total PVR is unchanged. Because the intrapulmonary shunt (IPSL/IPSR, LL_ART -> LL_VEN, set by
// Shunts.ips_res) runs in parallel with the capillary path, ips_res is scaled with that path so the
// shunt fraction stays the same. The unstressed volumes of the lung compartments are adjusted so
// every compartment holds the same blood as before. Only the touched fields are patched in the JSON.
//
//   node scripts/_fix_pulm_profile.mjs [scenario=term_neonate] [--write]
import fs from "node:fs";
import { createEngine } from "./_harness.mjs";
import { measureVitals } from "./_probe.mjs";

const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const name = argv.find((a) => !a.startsWith("--")) ?? "term_neonate";
const file = new URL(`../model_definitions/${name}.json`, import.meta.url);
const raw = fs.readFileSync(file, "utf8");
const json = JSON.parse(raw);
const out = (s) => process.stderr.write(s + "\n");

// target node pressure as a share of (PA - LA) above LA
const SHARE = { BR: 0.95, ART: 0.65, CAP: 0.40, VEN: 0.20, PV: 0.10 };
const LUNGS = [["L", "PAAL", "LL_ART", "LL_CAP", "LL_VEN", "IPSL", "LL_VEN_PV"], ["R", "PAAR", "RL_ART", "RL_CAP", "RL_VEN", "IPSR", "RL_VEN_PV"]];
const NODES = ["PA", "PAAL", "PAAR", "LL_ART", "RL_ART", "LL_CAP", "RL_CAP", "LL_VEN", "RL_VEN", "PV", "LA"];
const VESSELS = ["PAAL", "PAAR", "LL_ART", "RL_ART", "LL_CAP", "RL_CAP", "LL_VEN", "RL_VEN", "PV"];
const U_SET = ["PA", ...VESSELS];
const ARTERIES = ["PAAL", "PAAR", "LL_ART", "RL_ART"];
const FLOWS = ["PAAL", "PAAR", "LL_ART", "RL_ART", "LL_CAP", "RL_CAP", "LL_VEN", "RL_VEN", "IPSL", "IPSR", "LL_VEN_PV", "RL_VEN_PV", "PV_LA"];

const eng = await createEngine();
const send = eng.send;

function avg(M, sec) {
  const N = Math.round(sec / 0.02), p = {}, q = {}, v = {};
  for (const n of NODES) p[n] = v[n] = 0;
  for (const n of FLOWS) q[n] = 0;
  for (let i = 0; i < N; i++) {
    send("POST", "calc", 0.02);
    for (const n of NODES) { p[n] += M[n].pres / N; v[n] += M[n].vol / N; }
    for (const n of FLOWS) q[n] += M[n].flow / N;
  }
  return { p, q, v };
}
// scale the base resistances so the effective input resistance of `n` becomes R (measured R = dP/Q)
function scaleR(M, n, R, Rnow) {
  const k = R / Rnow;
  for (const key of ["r_for", "r_back", "r_k"]) M[n][key] *= k;
}
const KEYS = ["pap_s", "pap_d", "pap_m", "lvo", "map", "cvp", "spo2_pre", "pco2", "etco2"];
function report(label, def) {
  const model = eng.build(def), M = model.models;
  eng.calc(180);
  const a = avg(M, 20), v = measureVitals(model, send, { window: 30 });
  const d = a.p.PA - a.p.LA, sh = (n) => (((a.p[n] - a.p.LA) / d) * 100).toFixed(0);
  const ips = a.q.IPSL / (a.q.IPSL + a.q.LL_CAP);
  out(`${label}: PA ${a.p.PA.toFixed(1)} -> PAAL ${a.p.PAAL.toFixed(1)} (${sh("PAAL")}%) -> LL_ART ${a.p.LL_ART.toFixed(1)} (${sh("LL_ART")}%) -> LL_CAP ${a.p.LL_CAP.toFixed(1)} (${sh("LL_CAP")}%) -> ` +
    `LL_VEN ${a.p.LL_VEN.toFixed(1)} (${sh("LL_VEN")}%) -> PV ${a.p.PV.toFixed(1)} (${sh("PV")}%) -> LA ${a.p.LA.toFixed(1)} | shunt fraction ${(ips * 100).toFixed(1)} %, lung blood ${(U_SET.reduce((t, n) => t + a.v[n], 0) * 1000).toFixed(1)} mL (arteries ${(ARTERIES.reduce((t, n) => t + a.v[n], 0) * 1000).toFixed(1)}, PV ${(a.v.PV * 1000).toFixed(1)})`);
  out(`  ` + KEYS.map((k) => `${k} ${v[k]?.toFixed(2)}`).join(", "));
}

// 1. warm, take the reference volumes and the original capillary-path resistance
const model = eng.build(structuredClone(json.model_definition));
const M = model.models;
eng.calc(150);
const ref = avg(M, 20);
const vRef = measureVitals(model, send, { window: 20 });
const ppRef = vRef.pap_s - vRef.pap_d;
const STIFF = ["PA", "PAAL", "PAAR"];
let pp = ppRef;
const capPath = (S) => S.LL_CAP.r_for + S.LL_VEN.r_for;
const capPath0 = capPath(M), ips0 = M.Shunts.ips_res;

// 2. iterate: resistances to the target profile, unstressed volumes to the reference volumes
for (let it = 0; it < 12; it++) {
  const { p, q, v } = avg(M, 10);
  if (!Number.isFinite(p.PA)) throw new Error(`solver diverged at iteration ${it}`);
  const la = p.LA, d = p.PA - la, T = (s) => la + s * d;
  const shErr = Math.max(...LUNGS.flatMap(([, BR, ART, CAP, VEN]) => [[BR, "BR"], [ART, "ART"], [CAP, "CAP"], [VEN, "VEN"]].map(([n, s]) => Math.abs((p[n] - la) / d - SHARE[s]))), Math.abs((p.PV - la) / d - SHARE.PV));
  const artGain = ARTERIES.reduce((s, n) => s + (v[n] - ref.v[n]), 0);
  const volErr = Math.max(...U_SET.filter((n) => !ARTERIES.includes(n)).map((n) => Math.abs(v[n] - (n === "PV" ? ref.v.PV - artGain : ref.v[n])) / ref.v[n]));
  if (process.env.DEBUG) out(`it ${it}: share error ${(shErr * 100).toFixed(1)} %, volume error ${(volErr * 100).toFixed(1)} %`);
  if (process.env.DEBUG) out(`   PA pulse pressure ${pp.toFixed(1)} (target ${ppRef.toFixed(1)})`);
  if (shErr < 0.01 && volErr < 0.01 && Math.abs(pp - ppRef) < 0.5) break;
  for (const [, BR, ART, CAP, VEN, , VPV] of LUNGS) {
    scaleR(M, BR, (p.PA - T(SHARE.BR)) / q[BR], (p.PA - p[BR]) / q[BR]);
    scaleR(M, ART, (T(SHARE.BR) - T(SHARE.ART)) / q[ART], (p[BR] - p[ART]) / q[ART]);
    scaleR(M, CAP, (T(SHARE.ART) - T(SHARE.CAP)) / q[CAP], (p[ART] - p[CAP]) / q[CAP]);
    scaleR(M, VEN, (T(SHARE.CAP) - T(SHARE.VEN)) / q[VEN], (p[CAP] - p[VEN]) / q[VEN]);
  }
  // PV (shared by both lungs' venous inputs) and the PV->LA resistor
  const qv = (q.LL_VEN_PV + q.RL_VEN_PV) / 2, pven = (p.LL_VEN + p.RL_VEN) / 2;
  scaleR(M, "PV", (T(SHARE.VEN) - T(SHARE.PV)) / qv, (pven - p.PV) / qv);
  scaleR(M, "PV_LA", (T(SHARE.PV) - la) / q.PV_LA, (p.PV - la) / q.PV_LA);
  // keep the intrapulmonary shunt fraction: scale its resistance with the capillary path
  M.Shunts.ips_res = ips0 * (capPath(M) / capPath0);
  // volumes: the arteries now sit at a higher pressure and keep the extra blood that distends them
  // (holding their volume would need a negative unstressed volume); the pulmonary veins give up the
  // same amount, so the total lung blood volume is unchanged. Every other compartment holds its own.
  const gain = ARTERIES.reduce((s, n) => s + (v[n] - ref.v[n]), 0);
  for (const n of U_SET) {
    if (ARTERIES.includes(n)) continue;
    const target = n === "PV" ? ref.v.PV - gain : ref.v[n];
    const c = M[n]; c.u_vol += (0.5 * (target - v[n])) / (c.u_vol_eff / c.u_vol);
  }
  eng.calc(60);
  // the low large-PA resistance couples the main PA to the compliant branches and damps the pulse:
  // restore the PA pulse pressure with the stiffness of the main and branch PAs
  const vv = measureVitals(model, send, { window: 10 });
  pp = vv.pap_s - vv.pap_d;
  const kEl = Math.pow(ppRef / pp, 0.8);
  for (const n of STIFF) M[n].el_base *= kEl;
}

// 3. patch only the touched fields in the scenario JSON
function findModel(o, n) {
  if (!o || typeof o !== "object") return null;
  if (o.name === n && o.model_type) return o;
  for (const x of Object.values(o)) { const r = findModel(x, n); if (r) return r; }
  return null;
}
const md = json.model_definition;
const changes = [];
const patch = (n, keys) => {
  const t = findModel(md.models, n);
  for (const k of keys) {
    if (typeof t?.[k] !== "number") throw new Error(`${n}.${k} not found in ${name}.json`);
    if (t[k] !== M[n][k]) { if (k === "r_for" || k === "u_vol") changes.push(`${n}.${k} ${k === "u_vol" ? (t[k] * 1000).toFixed(2) + "->" + (M[n][k] * 1000).toFixed(2) + " mL" : t[k].toFixed(0) + "->" + M[n][k].toFixed(0)}`); t[k] = M[n][k]; }
  }
};
for (const n of VESSELS) patch(n, ["r_for", "r_back", "r_k", "u_vol"]);
patch("PA", ["u_vol"]);
for (const n of STIFF) { const t = findModel(md.models, n); const k0 = t.el_base; t.el_base = M[n].el_base; changes.push(`${n}.el_base ${k0.toFixed(0)}->${M[n].el_base.toFixed(0)}`); }
patch("PV_LA", ["r_for", "r_back", "r_k"]);
findModel(md.models, "Shunts").ips_res = M.Shunts.ips_res;
for (const n of ["IPSL", "IPSR"]) { const t = findModel(md.models, n); if (t) { t.r_for = M.Shunts.ips_res; if ("r_back" in t) t.r_back = M.Shunts.ips_res; } }
changes.push(`Shunts.ips_res ${ips0.toFixed(0)}->${M.Shunts.ips_res.toFixed(0)}`);
out(`${name}: ${changes.join(", ")}`);

const text = JSON.stringify(json, null, 1).replace(/[\u007f-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")) +
  (raw.endsWith("\n") ? "\n" : "");

// 4. check: original vs patched, both rebuilt from file contents
report("before", JSON.parse(raw).model_definition);
report("after ", JSON.parse(text).model_definition);

if (WRITE) { fs.writeFileSync(file, text); out(`written ${name}.json`); }
