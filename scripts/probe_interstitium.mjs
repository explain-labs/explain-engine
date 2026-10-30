// Probe for the Interstitium model (capillary filtration, interstitial pool, lymph).
//
// (A) NEUTRALITY at rest: the scenario with and without the Interstitium over --minutes (default 30):
//     blood volume, MAP, CVP, Hb, albumin and Na must not drift apart, and the pool must hold its
//     resting volume, pressure and albumin.
// (B) --saline ML_KG: normal saline over 10 min into IVCI (fraction of the infused volume still in the
//     blood at 10/20/30/60 min after its start).
// (C) --bleed FRAC: an arterial bleed of FRAC of the blood volume over 5 min (Brace 1983's protocol),
//     with and without the Interstitium: restitution = share of the shed volume back by 10/20/30/60 min.
// (D) --merrill: Merrill 1995's volume expansion (conscious lambs 3-7 d: 6 % dextran 70, 0.7 mL/kg/min
//     for 60 min = 42 mL/kg; RAP +5.6 ± 0.5 mmHg, reflex bradycardia), with an iso-oncotic colloid
//     (albumin at the patient's own level in plasma electrolytes) into IVCI.
// (E) --compliance: instant ±5 % blood-volume steps, CVP change over the first 10 s → total vascular
//     compliance (mL/mmHg/kg; fetal sheep 3.0-3.5, Brace & Gold 1984).
// --skip-rest skips (A).
//
// Usage: node scripts/probe_interstitium.mjs [--scenario term_neonate_72h] [--minutes 30] [--saline 20]
//        [--bleed 0.14] [--skip-rest] [--set kf_per_kg=0.1,compliance_below=4]

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const SCENARIO = opt("--scenario", "term_neonate_72h");
const MINUTES = Number(opt("--minutes", 30));
const SALINE = Number(opt("--saline", 0));
const BLEED = Number(opt("--bleed", 0));
const SKIP_REST = argv.includes("--skip-rest");
const MERRILL = argv.includes("--merrill");
// --venous K: scale the systemic venous compliance by 1/K first (scripts/_fix_venous_compliance.mjs)
const VENOUS_K = Number(opt("--venous", 0));
const { scale_venous } = await import("./_fix_venous_compliance.mjs");
const COMPLIANCE = argv.includes("--compliance");
// --set key=value,key=value overrides Interstitium parameters (fitting)
const SET = Object.fromEntries((opt("--set", "") || "").split(",").filter(Boolean).map((kv) => { const [k, v] = kv.split("="); return [k, Number(v)]; }));

let live = null;
globalThis.self = globalThis;
globalThis.postMessage = (msg) => {
  if (!msg || !msg.type) return;
  if (msg.type === "state") live = msg.payload;
  if (msg.type === "error") console.error("ENGINE ERROR:", msg.message, msg.payload ?? "");
  if (msg.type === "status" && /ERROR/i.test(msg.message || "")) console.error("ENGINE:", msg.message);
};
const _log = console.log;
console.log = () => {};
await import("../ModelEngine.js");
const send = (type, message, payload) => self.onmessage({ data: { type, message, payload } });
const base = JSON.parse(fs.readFileSync(new URL(`../model_definitions/${SCENARIO}.json`, import.meta.url), "utf8")).model_definition;

const r = (x, n = 2) => Number((x ?? NaN).toFixed(n));
const ISF_DEF = { name: "Interstitium", model_type: "Interstitium", is_enabled: true };

// build a copy of the scenario, with an Interstitium when `isf` and the scenario has none
function build(isf) {
  const def = structuredClone(base);
  if (isf && !def.models.Interstitium) def.models = { Interstitium: { ...ISF_DEF }, ...def.models };
  if (!isf) delete def.models.Interstitium;
  else Object.assign(def.models.Interstitium, SET);
  if (VENOUS_K > 0) scale_venous(def, VENOUS_K);
  send("POST", "build", def);
  send("GET", "state", []);
  return live;
}

// mean CVP and MAP over T seconds, from the Monitor's per-beat aggregates. Sampling the instantaneous
// pressures on a fixed grid aliases against the cardiac cycle (0.1 s against the 0.5 s cycle at HR 120
// is exact 5:1 resonance); the Monitor's minmax means are per-beat, so sampling them weights whole beats.
function means(M, T = 10) {
  let c = 0, p = 0, n = 0;
  for (let i = 0; i < T * 10; i++) { send("POST", "calc", 0.1); c += M.Monitor.minmax.cvp_pres_mean; p += M.Monitor.minmax.abp_pres_mean; n++; }
  return { cvp: c / n, map: p / n };
}

function snap(E, label, T = 10) {
  const M = E.models, W = E.weight, I = M.Interstitium, a = means(M, T);
  return {
    t: label,
    BV: r((M.Circulation.total_blood_volume * 1000) / W, 2),
    MAP: r(a.map, 2),
    CVP: r(a.cvp, 2),
    Hb: r(M.AD.solutes.hemoglobin, 3),
    alb: r(M.AD.solutes.albumin, 2),
    na: r(M.AD.solutes.na, 2),
    ISF: I ? r(I.isf_volume_ml_kg, 1) : "",
    Pif: I ? r(I.pif, 3) : "",
    alb_if: I ? r(I.isf_solutes.albumin, 2) : "",
    Jv: I ? r(I.net_filtration, 3) : "",
    lymph: I ? r(I.lymph_flow, 3) : "",
  };
}

console.log = _log;
const rows = [];
for (const isf of SKIP_REST ? [] : [false, true]) {
  const E = build(isf);
  console.log = () => {};
  send("POST", "calc", 50); // warm-up incl. the 30 s seed
  // the rest comparison averages 30 s, so the breathing cycle and CVP noise do not decide it
  const row0 = snap(E, `${isf ? "isf" : "ctrl"} 1m`, 30);
  send("POST", "calc", MINUTES * 60 - 110);
  const row1 = snap(E, `${isf ? "isf" : "ctrl"} ${MINUTES}m`, 30);
  rows.push(row0, row1);
  console.log = _log;
}
if (!SKIP_REST) {
  console.log(`\nInterstitium probe — ${SCENARIO}: (A) rest, ${MINUTES} min, without and with the model`);
  console.table(rows);
  const c = rows[1], i = rows[3];
  const ok = (x, y, tol) => Math.abs(x - y) <= tol;
  console.log(
    `NEUTRALITY: BV ${ok(c.BV, i.BV, 0.2)} | MAP ${ok(c.MAP, i.MAP, 0.3)} | CVP ${ok(c.CVP, i.CVP, 0.1)} | Hb ${ok(c.Hb, i.Hb, 0.02)} | alb ${ok(c.alb, i.alb, 0.2)} | Na ${ok(c.na, i.na, 0.2)} | ISF held ${ok(rows[2].ISF, i.ISF, 1)} | Pif held ${ok(rows[2].Pif, i.Pif, 0.05)}`,
  );
}

if (SALINE > 0) {
  const E = build(true), M = E.models, W = E.weight;
  console.log = () => {};
  send("POST", "calc", 120);
  const bv0 = M.Circulation.total_blood_volume;
  const out = [snap(E, "before")];
  M.Fluids.add_volume(SALINE * W, 600, "normal_saline", "IVCI");
  let t = 0;
  for (const T of [10, 20, 30, 60]) {
    send("POST", "calc", T * 60 - t - 10); t = T * 60;
    const row = snap(E, `${T} min`);
    const infused = Math.min(T, 10) / 10 * SALINE; // mL/kg given so far
    row.retained_pct = r((100 * ((M.Circulation.total_blood_volume - bv0) * 1000) / W) / infused, 1);
    out.push(row);
  }
  console.log = _log;
  console.log(`\n(B) normal saline ${SALINE} mL/kg over 10 min into IVCI (retained = blood-volume gain / volume given)`);
  console.table(out);
}

if (BLEED > 0) {
  const out = [];
  for (const isf of [false, true]) {
    const E = build(isf), M = E.models, W = E.weight;
    console.log = () => {};
    send("POST", "calc", 120);
    const bv0 = M.Circulation.total_blood_volume;
    const shed = BLEED * bv0; // L
    const row0 = snap(E, `${isf ? "isf" : "ctrl"} before`);
    row0.HR = r(M.Monitor.heart_rate, 0);
    out.push(row0);
    M.Fluids.remove_volume(shed * 1000, 300, "AD");
    let t = 10;
    for (const T of [5, 10, 20, 30, 60]) {
      send("POST", "calc", T * 60 - t - 10); t = T * 60;
      const row = snap(E, `${isf ? "isf" : "ctrl"} ${T} min`);
      row.HR = r(M.Monitor.heart_rate, 0);
      const lost = Math.min(T, 5) / 5 * shed;
      row.restit_pct = r(100 * (1 - (bv0 - M.Circulation.total_blood_volume) / lost), 1);
      out.push(row);
    }
    console.log = _log;
  }
  console.log(`\n(C) arterial bleed ${BLEED * 100} % of blood volume over 5 min (restitution = shed volume back in the blood)`);
  console.table(out);
}

if (MERRILL) {
  const E = build(true), M = E.models, W = E.weight;
  console.log = () => {};
  send("POST", "calc", 120);
  const a = M.AD.solutes;
  M.Fluids.fluids.colloid_iso = { na: a.na, k: a.k, ca: a.ca, cl: a.cl, mg: a.mg, phosphates: a.phosphates, albumin: a.albumin };
  const bv0 = M.Circulation.total_blood_volume;
  const row0 = snap(E, "before", 30);
  row0.HR = r(M.Monitor.heart_rate, 0);
  const out = [row0];
  M.Fluids.add_volume(42 * W, 3600, "colloid_iso", "IVCI");
  let t = 30;
  for (const T of [15, 30, 45, 60]) {
    send("POST", "calc", T * 60 - t - 30); t = T * 60;
    const row = snap(E, `${T} min`, 30);
    row.HR = r(M.Monitor.heart_rate, 0);
    row.dCVP = r(row.CVP - row0.CVP, 2);
    row.retained_pct = r((100 * ((M.Circulation.total_blood_volume - bv0) * 1000) / W) / (42 * T / 60), 1);
    out.push(row);
  }
  console.log = _log;
  console.log("\n(D) Merrill 1995: iso-oncotic colloid 42 mL/kg over 60 min into IVCI (lamb 3-7 d: RAP +5.6 ± 0.5, HR falls)");
  console.table(out);
}

if (COMPLIANCE) {
  const out = [];
  for (const f of [-0.05, 0.05]) {
    const E = build(true), M = E.models, W = E.weight;
    console.log = () => {};
    send("POST", "calc", 120);
    const a0 = means(M, 30);
    const bv0 = M.Circulation.total_blood_volume;
    for (const m of Object.values(M)) if (m && m.blood_pool !== false && typeof m.vol === "number" && m.solutes && m.vol > 0) m.vol *= 1 + f;
    send("POST", "calc", 0.1);
    const dv = ((M.Circulation.total_blood_volume - bv0) * 1000) / W;
    const a1 = means(M, 10);
    console.log = _log;
    out.push({ step: `${f * 100} %`, dV_mL_kg: r(dv, 2), dCVP: r(a1.cvp - a0.cvp, 2), compliance_mL_mmHg_kg: r(dv / (a1.cvp - a0.cvp), 2) });
  }
  console.log("\n(E) total vascular compliance from instant ±5 % steps (fetal sheep 3.0-3.5 mL/mmHg/kg)");
  console.table(out);
}
