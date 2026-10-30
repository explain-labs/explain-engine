// Probe for the response to blood loss: an arterial bleed of FRAC of the blood volume over 5 min
// (Fluids.remove_volume from AD), traced for 60 min: MAP, HR, CVP, LV output, SVR, blood volume,
// the hormones, the ANS and lactate.
//
// Newborn reference (piglets/lambs, grade C):
//   20 mL/kg (~24 %): MAP -17 %, HR +27 % at once, cardiac output not significantly changed
//                     (2-day-old piglets, Chandler 1991, doi:10.1016/0041-008x(91)90112-r)
//   MAP at 60 % of baseline only after ~35 % of the blood volume (Bauer 1997, doi:10.1016/S0940-2993(97)80139-X)
//   restitution ~53 % of the shed volume by 30 min (fetal sheep, Brace 1983, doi:10.1161/01.res.52.6.730)
//
// Usage: node scripts/probe_haemorrhage.mjs [--scenario term_neonate_72h] [--bleed 0.1,0.2,0.35]

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const SCENARIO = opt("--scenario", "term_neonate_72h");
const BLEEDS = opt("--bleed", "0.1,0.2,0.35").split(",").map(Number);

let live = null;
globalThis.self = globalThis;
globalThis.postMessage = (msg) => {
  if (!msg || !msg.type) return;
  if (msg.type === "state") live = msg.payload;
  if (msg.type === "error") console.error("ENGINE ERROR:", msg.message, msg.payload ?? "");
};
const _log = console.log;
console.log = () => {};
await import("../ModelEngine.js");
const send = (type, message, payload) => self.onmessage({ data: { type, message, payload } });
const base = JSON.parse(fs.readFileSync(new URL(`../model_definitions/${SCENARIO}.json`, import.meta.url), "utf8")).model_definition;
const r = (x, n = 1) => Number((x ?? NaN).toFixed(n));

for (const frac of BLEEDS) {
  send("POST", "build", structuredClone(base));
  send("GET", "state", []);
  const E = live, M = E.models, W = E.weight;
  send("POST", "calc", 120);

  // means over T s. The Monitor's own aggregates are read, never the instantaneous signals:
  // sampling LV_AA.flow or AD.pres on a fixed grid aliases against the cardiac cycle (0.1 s against
  // a 0.5 s cycle at HR 120 is exact 5:1 resonance and swung the computed output by a factor of 2).
  // Monitor.flows is averaged over flow_avg_beats and minmax holds per-beat min/max/mean, so sampling
  // those just weights whole beats. MAP/PAP means follow the Monitor's 1/3 rule, as the reference page reports them.
  const means = (T) => {
    let map = 0, cvp = 0, lvo = 0, n = 0;
    for (let i = 0; i < T * 10; i++) {
      send("POST", "calc", 0.1);
      map += M.Monitor.minmax.abp_pres_mean; cvp += M.Monitor.minmax.cvp_pres_mean;
      lvo += M.Monitor.flows.lvo; n++;
    }
    return { map: map / n, cvp: cvp / n, lvo: ((lvo / n) * 1000) / W };
  };
  const bv0 = M.Circulation.total_blood_volume;
  const shed = frac * bv0;
  const rows = [];
  let ref = null;
  const snap = (label, t_min) => {
    const a = means(20);
    const row = {
      t: label,
      MAP: r(a.map), HR: r(M.Monitor.heart_rate, 0), CVP: r(a.cvp, 2), LVO: r(a.lvo, 0),
      SVRi: r(((a.map - a.cvp) / a.lvo) * 100, 1),
      BV: r((M.Circulation.total_blood_volume * 1000) / W, 1),
      ans: r(M.Circulation.ans_activity, 2), ang: r(M.Hormones.angiotensin, 2), adh: r(M.Hormones.adh, 2),
      lact: r(M.AD.solutes.lact, 2),
    };
    if (!ref) ref = row;
    else {
      row.dMAP_pct = r((100 * (row.MAP - ref.MAP)) / ref.MAP);
      row.dHR_pct = r((100 * (row.HR - ref.HR)) / ref.HR);
      row.dLVO_pct = r((100 * (row.LVO - ref.LVO)) / ref.LVO);
      const lost = (Math.min(t_min, 5) / 5) * shed;
      row.restit_pct = r(100 * (1 - (bv0 - M.Circulation.total_blood_volume) / lost));
    }
    rows.push(row);
  };
  snap("before", 0);
  M.Fluids.remove_volume(shed * 1000, 300, "AD");
  let t = 20;
  for (const T of [5, 15, 30, 60]) {
    send("POST", "calc", T * 60 - t - 20); t = T * 60;
    snap(`${T} min`, T);
  }
  console.log = _log;
  console.log(`\n${SCENARIO}: arterial bleed ${frac * 100} % of blood volume (${r((shed * 1000) / W)} mL/kg) over 5 min`);
  console.table(rows);
  console.log = () => {};
}
