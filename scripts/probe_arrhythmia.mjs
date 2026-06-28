// Verification / demo probe for conduction-driven arrhythmias (Heart conduction model). Drives the
// engine headless and, for each rhythm, counts the ATRIAL (P) and VENTRICULAR (QRS) activation rates
// independently — their dissociation is the signature that the rhythm is now conduction-driven, not a
// fixed SA→QRS sequence. Also reports the haemodynamic consequence (heart rate, MAP, cardiac output).
//
//   normal           — sinus: atrial rate == ventricular rate
//   complete block    — 3rd-degree AV block: atria (sinus) and ventricles (escape ~50) DISSOCIATE
//   second_degree 2:1 — every 2nd P fails → ventricular rate ≈ ½ atrial rate
//   sinus_arrest      — SA node off → ventricular escape rhythm only
//   vt                — fast ventricular focus → ventricular tachycardia, low stroke volume
//   pvc               — a triggered premature ventricular contraction
//
// Usage: node scripts/probe_arrhythmia.mjs [--scenario term_neonate] [--verbose]

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const sopt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const SCENARIO = sopt("--scenario", "term_neonate");
const VERBOSE = flag("--verbose");

let liveModel = null;
globalThis.self = globalThis;
globalThis.postMessage = (msg) => {
  if (!msg || !msg.type) return;
  if (msg.type === "state") liveModel = msg.payload;
  if (msg.type === "error") console.error("ENGINE ERROR:", msg.message, msg.payload ?? "");
};
const _log = console.log;
if (!VERBOSE) console.log = () => {};

await import("../explain/ModelEngine.js");
const send = (type, message, payload) => self.onmessage({ data: { type, message, payload } });
const def = JSON.parse(fs.readFileSync(new URL(`../public/model_definitions/${SCENARIO}.json`, import.meta.url), "utf8")).model_definition;

function build() {
  send("POST", "build", def);
  send("GET", "state", []);
  const M = liveModel.models;
  if (M.Ans) M.Ans.is_enabled = false; // fix the sinus rate so rhythm changes are clean
  return M;
}
const r = (x, n = 1) => Number((x ?? 0).toFixed(n));
let dt;

// count atrial + ventricular activations (ncc reset to -1 then +1 → value dips to 0) over `seconds`,
// and window-average MAP + cardiac output (AA flow)
function measure(M, seconds = 20) {
  const H = M.Heart, AA = M.AA, AA_BR = M.AA_BR_ART; // any systemic flow proxy
  const N = Math.round(seconds / dt);
  let aBeats = 0, vBeats = 0, prevA = H.ncc_atrial, prevV = H.ncc_ventricular, map = 0, co = 0;
  const lvOut = M.LV_AA || M.LV_PA;
  for (let i = 0; i < N; i++) {
    send("POST", "calc", dt);
    if (H.ncc_atrial < prevA) aBeats++;       // atrial activation (counter reset)
    if (H.ncc_ventricular < prevV) vBeats++;   // ventricular activation
    prevA = H.ncc_atrial; prevV = H.ncc_ventricular;
    map += AA.pres;
    co += lvOut ? Math.max(0, lvOut.flow) : 0;
  }
  return {
    atrial_rate: r((aBeats / seconds) * 60, 0),
    vent_rate: r((vBeats / seconds) * 60, 0),
    MAP: r(map / N, 1),
    CO_mLmin: r((co / N) * 60 * 1000, 1),
  };
}

const rows = {};
let M;
M = build(); dt = liveModel.modeling_stepsize; send("POST", "calc", 30); rows["normal sinus"] = measure(M);
M = build(); M.Heart.av_block_mode = "complete"; send("POST", "calc", 30); rows["complete AV block"] = measure(M);
M = build(); M.Heart.av_block_mode = "second_degree"; M.Heart.av_block_ratio = 2; send("POST", "calc", 30); rows["2nd-deg 2:1 block"] = measure(M);
M = build(); M.Heart.av_block_mode = "first_degree"; send("POST", "calc", 30); rows["1st-deg (long PR)"] = measure(M);
M = build(); M.Heart.sa_node_enabled = false; send("POST", "calc", 30); rows["sinus arrest (escape)"] = measure(M);
M = build(); M.Heart.vent_pacemaker_mode = "vt"; M.Heart.vt_rate = 200; send("POST", "calc", 30); rows["ventricular tachycardia"] = measure(M);

console.log = _log;
console.log(`\nConduction-arrhythmia probe — scenario=${SCENARIO} (ANS off)\n`);
console.table(rows);

const n = rows["normal sinus"], cb = rows["complete AV block"], s2 = rows["2nd-deg 2:1 block"],
  sa = rows["sinus arrest (escape)"], vt = rows["ventricular tachycardia"];
console.log("normal: atria == ventricles (1:1):", Math.abs(n.atrial_rate - n.vent_rate) <= 5);
console.log("COMPLETE block → AV DISSOCIATION (atria > ventricles, vent at escape rate):",
  cb.atrial_rate > cb.vent_rate + 20 && cb.vent_rate > 35 && cb.vent_rate < 70,
  "| CO falls:", cb.CO_mLmin < n.CO_mLmin);
console.log("2:1 block → ventricular rate ≈ ½ atrial:", Math.abs(s2.vent_rate - s2.atrial_rate / 2) < 12);
console.log("sinus arrest → escape rhythm (few/no P, ventricles at escape):", sa.vent_rate > 35 && sa.vent_rate < 70 && sa.atrial_rate < 10);
console.log("VT → fast ventricular rate, low CO:", vt.vent_rate > 150 && vt.CO_mLmin < n.CO_mLmin);
