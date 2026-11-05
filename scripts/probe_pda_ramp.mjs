// Ductus-arteriosus opening ramp: ductal Doppler features at each duct size.
//
// Builds a scenario headless, warms it up, then widens the duct slowly from closed to its anatomic
// maximum (Pda.diameter_relative 0 -> 1, linear in pulmonary-end diameter). At each listed size it
// records `--window` seconds at the model stepsize and reports, averaged per beat (beats split on
// Heart.ncc_ventricular):
//
//   Vpk / Ved        peak and end-diastolic ductal velocity (Pda.velocity_doppler, m/s)
//   P/E              Vpk / Ved (> 2 pulsatile/unrestrictive, < 2 restrictive)
//   4v²/ΔP pk/mn/ED  Bernoulli consistency: 4v² over the instantaneous AAR - PA pressure difference at the
//                    velocity peak, over the beat mean and at end-diastole. Catheter data put it near 1
//                    (Musewe 1987, doi 10.1161/01.cir.76.5.1081: slopes 1.03 / 1.06 / 1.12).
//   dip              lowest velocity in the first quarter of the beat as % of the velocity at activation
//                    (the early-systolic dip), and when it occurs (ms after ventricular activation)
//   ΔPpk / ΔPed      AAR - PA pressure difference, beat maximum and end-diastole (mmHg)
//   shunt            mean duct flow (mL/kg/min, + = left to right); R->L % of the beat
//
// Like every probe it prints a table to read; it exits 0 whatever the numbers are.
//
// Usage:
//   node scripts/probe_pda_ramp.mjs [scenario] [--ramp S] [--warmup S] [--window S] [--sizes 0.25,0.5,...]

import fs from "node:fs";
import { createEngine } from "./_harness.mjs";

const argv = process.argv.slice(2);
const scenario = argv.find((a) => !a.startsWith("-")) || "term_neonate_72h";
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const RAMP = Number(opt("--ramp", 600));      // s of simulated time from closed to fully open
const WARMUP = Number(opt("--warmup", 120));
const WINDOW = Number(opt("--window", 8));

const path = new URL(`../model_definitions/${scenario}.json`, import.meta.url);
const json = JSON.parse(fs.readFileSync(path, "utf8"));
const eng = await createEngine();
const model = eng.build(json.model_definition || json);
const M = model.models;
if (!M?.Pda || !M.AAR || !M.PA || !M.Heart) { console.error(`"${scenario}" lacks Pda/AAR/PA/Heart.`); process.exit(1); }
const P = M.Pda, dt = model.modeling_stepsize, w = model.weight || 1;
const DMAX = P.diameter_pa_max;
const sizes = opt("--sizes", null)?.split(",").map(Number) ?? [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3].map((f) => (f * DMAX) / 3);

eng.calc(WARMUP);

function record() {
  const s = [];
  for (let i = 0; i < Math.round(WINDOW / dt); i++) {
    eng.calc(dt);
    s.push([P.velocity_doppler, M.AAR.pres - M.PA.pres, P.flow, M.Heart.ncc_ventricular]);
  }
  return s;
}
const mean = (x) => x.reduce((a, b) => a + b, 0) / x.length;

function analyse(s) {
  const starts = [];
  for (let i = 1; i < s.length; i++) if (s[i][3] < s[i - 1][3]) starts.push(i);
  const r = { pk: [], ed: [], rp: [], rm: [], re: [], dip: [], dipt: [], gp: [], ge: [] };
  for (let k = 0; k + 1 < starts.length; k++) {
    const b = s.slice(starts[k], starts[k + 1]);
    const v = b.map((x) => x[0]), g = b.map((x) => x[1]);
    let ip = 0; v.forEach((x, i) => { if (x > v[ip]) ip = i; });
    const ed = mean(v.slice(-3)), ged = mean(g.slice(-3));
    const q = Math.floor(v.length / 4); let im = 0; for (let i = 0; i < q; i++) if (v[i] < v[im]) im = i;
    r.pk.push(v[ip]); r.ed.push(ed); r.gp.push(Math.max(...g)); r.ge.push(ged);
    r.rp.push((4 * v[ip] ** 2) / g[ip]); r.re.push((4 * ed * ed) / ged);
    r.rm.push(mean(v.map((x) => 4 * x * Math.abs(x))) / mean(g));
    r.dip.push(v[0] !== 0 ? v[im] / v[0] : NaN); r.dipt.push(im * dt * 1000);
  }
  return Object.fromEntries(Object.entries(r).map(([k, x]) => [k, mean(x)]));
}

const f = (x, n = 2, p = 6) => (Number.isFinite(x) ? x.toFixed(n) : "-").padStart(p);
const rows = [];
let d = 0; const rate = DMAX / RAMP;
for (const target of sizes) {
  while (d < target - 1e-9) { const step = Math.min(1, (target - d) / rate); d += rate * step; P.diameter_relative = d / DMAX; eng.calc(step); }
  const s = record();
  rows.push({ d: target, ...analyse(s), shunt: (mean(s.map((x) => x[2])) * 60000) / w, rtol: (100 * s.filter((x) => x[2] < 0).length) / s.length });
}

process.stdout.write(
  `\n=== Duct opening ramp — ${scenario} (pulmonary end 0 -> ${DMAX} mm over ${RAMP} s; ` +
  `ampulla ${P.diameter_ao_max} mm, length ${P.length} mm, constriction ${P.constriction_length} mm) ===\n\n` +
  `  d mm    Vpk    Ved   P/E | 4v²/ΔP pk  mean    ED |  dip %  at ms | ΔPpk  ΔPed | shunt mL/kg/min  R->L %\n` +
  rows.map((r) =>
    `${f(r.d)} ${f(r.pk)} ${f(r.ed)} ${f(r.pk / r.ed, 1)} |    ${f(r.rp)}${f(r.rm)}${f(r.re)} | ${f(100 * r.dip, 0)} ${f(r.dipt, 0)} |${f(r.gp, 1)}${f(r.ge, 1)} |${f(r.shunt, 0, 16)}${f(r.rtol, 0, 8)}`,
  ).join("\n") + "\n\nTargets (docs/Pda.md): 4v²/ΔP 0.8-1.1; velocity rising as the duct narrows; P/E < 2 restrictive, > 2 unrestrictive.\n",
);
