// Probe for the Interstitium model (capillary filtration, interstitial pool, lymph).
//
// (A) NEUTRALITY at rest: the scenario with and without the Interstitium over --minutes (default 30):
//     blood volume, MAP, CVP, Hb, albumin and Na must not drift apart, and the pool must hold its
//     resting volume, pressure and albumin.
// (B) --saline ML_KG: normal saline over 10 min into IVCI (fraction of the infused volume still in the
//     blood at 10/20/30/60 min after its start).
//
// Usage: node scripts/probe_interstitium.mjs [--scenario term_neonate_72h] [--minutes 30] [--saline 20]

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const SCENARIO = opt("--scenario", "term_neonate_72h");
const MINUTES = Number(opt("--minutes", 30));
const SALINE = Number(opt("--saline", 0));

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
  send("POST", "build", def);
  send("GET", "state", []);
  return live;
}

// mean CVP and MAP over T seconds (sampled every 0.1 s, so breathing and the beat average out)
function means(M, T = 10) {
  let c = 0, p = 0, n = 0;
  for (let i = 0; i < T * 10; i++) { send("POST", "calc", 0.1); c += M.RAIVCI.pres; p += M.AD.pres; n++; }
  return { cvp: c / n, map: p / n };
}

function snap(E, label) {
  const M = E.models, W = E.weight, I = M.Interstitium, a = means(M);
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
for (const isf of [false, true]) {
  const E = build(isf);
  console.log = () => {};
  send("POST", "calc", 50); // warm-up incl. the 30 s seed
  const row0 = snap(E, `${isf ? "isf" : "ctrl"} 1m`);
  send("POST", "calc", MINUTES * 60 - 70);
  const row1 = snap(E, `${isf ? "isf" : "ctrl"} ${MINUTES}m`);
  rows.push(row0, row1);
  console.log = _log;
}
console.log(`\nInterstitium probe — ${SCENARIO}: (A) rest, ${MINUTES} min, without and with the model`);
console.table(rows);
const c = rows[1], i = rows[3];
const ok = (x, y, tol) => Math.abs(x - y) <= tol;
console.log(
  `NEUTRALITY: BV ${ok(c.BV, i.BV, 0.2)} | MAP ${ok(c.MAP, i.MAP, 0.3)} | CVP ${ok(c.CVP, i.CVP, 0.1)} | Hb ${ok(c.Hb, i.Hb, 0.02)} | alb ${ok(c.alb, i.alb, 0.2)} | Na ${ok(c.na, i.na, 0.2)} | ISF held ${ok(rows[2].ISF, i.ISF, 1)} | Pif held ${ok(rows[2].Pif, i.Pif, 0.05)}`,
);

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
