// Respiratory dose-response probe for the Explain engine (companion respiratory paper, §3.2–3.4).
//
// Runs four mechanism sweeps against a calibrated baseline, each point built fresh and warmed to
// steady state, reporting the arterial blood gas the solver derives (BloodComposition.js):
//   1. Oxygenation vs inspired O2 fraction (FiO2)            -> Eqs 5,13,21-23
//   2. Oxygenation vs alveolar O2 diffusion (dif_o2 factor)  -> Eqs 13-14,22-23  (the PO2/SpO2 lever)
//   3. Arterial CO2 vs ventilatory drive (minute_volume)     -> Eqs 9-11,13-17   (the PCO2 lever)
//   4. Acid-base vs unmeasured strong anions (UMA)           -> Eqs 15,19-20     (the BE/pH lever)
//
// The autonomic chemoreflex is disabled (--ans to keep it on) so each relation shows the pure
// respiratory/acid-base mechanism; in the closed loop the chemoreflex attenuates the CO2 response.
//
// Usage: node scripts/probe_respiratory.mjs [scenario] [--seconds N] [--window W] [--ans]

import fs from "node:fs";
import { createEngine } from "./_harness.mjs";

const argv = process.argv.slice(2);
const scenario = argv.find((a) => !a.startsWith("-")) || "term_neonate";
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? Number(argv[i + 1]) : d; };
const SECONDS = opt("--seconds", 90);
const WINDOW = opt("--window", 15);
const ANS_ON = flag("--ans");

const eng = await createEngine();
const log = eng.log;
const path = new URL(`../public/model_definitions/${scenario}.json`, import.meta.url);
const json = JSON.parse(fs.readFileSync(path, "utf8"));
const def = json.model_definition || json;
const round = (x, n = 2) => (typeof x === "number" && isFinite(x) ? Number(x.toFixed(n)) : x);

// build fresh, apply a mutator, warm to steady state, cycle-average the arterial gas + resp signals
function run(mutate) {
  const model = eng.build(def);
  if (!ANS_ON && model.models.Ans) model.models.Ans.is_enabled = false;
  mutate(model);
  eng.calc(SECONDS);
  const AA = model.models.AA, M = model.models.Monitor;
  const SLICE = 0.02, N = Math.round(WINDOW / SLICE), acc = {};
  const add = (k, v) => { acc[k] = (acc[k] || 0) + (v ?? 0); };
  for (let i = 0; i < N; i++) {
    eng.calc(SLICE);
    add("po2", AA?.po2); add("so2", AA?.so2); add("pco2", AA?.pco2);
    add("ph", AA?.ph); add("hco3", AA?.hco3); add("be", AA?.be);
    add("spo2", M?.sao2_pre); add("rr", M?.resp_rate); add("etco2", M?.etco2);
  }
  for (const k in acc) acc[k] /= N;
  return acc;
}

const H = (t) => log(`\n== ${t} ==`);
const fio2Of = (m) => m.models.Gas?.fio2;

// ---- 1. FiO2 sweep ----
H(`1. Oxygenation vs FiO2  (${scenario}, ANS ${ANS_ON ? "on" : "off"})`);
log("FiO2     pO2     SpO2    pCO2");
for (const fio2 of [0.21, 0.3, 0.4, 0.6, 0.9]) {
  const a = run((m) => m.models.Gas?.set_fio2(fio2, ["MOUTH"]));
  log(`${String(fio2).padEnd(6)} ${String(round(a.po2)).padStart(7)} ${String(round(a.so2)).padStart(7)} ${String(round(a.pco2)).padStart(7)}`);
}

// ---- 2. Alveolar O2 diffusion sweep (the PO2/SpO2 lever) ----
H("2. Oxygenation vs alveolar O2 diffusion (dif_o2 factor)");
log("difO2x   pO2     SpO2");
for (const f of [0.25, 0.5, 1.0, 2.0, 4.0]) {
  const a = run((m) => { for (const g of ["GASEX_LL", "GASEX_RL"]) if (m.models[g]) m.models[g].dif_o2_factor_ps = f; });
  log(`${String(f).padEnd(6)} ${String(round(a.po2)).padStart(7)} ${String(round(a.so2)).padStart(7)}`);
}

// ---- 3. Arterial CO2 vs ventilatory drive ----
H("3. Arterial CO2 vs ventilatory drive (minute_volume_ref factor)");
log("MVx      pCO2    pH      rr");
for (const f of [0.6, 0.8, 1.0, 1.3, 1.7]) {
  const a = run((m) => { if (m.models.Breathing) m.models.Breathing.minute_volume_ref_factor = f; });
  log(`${String(f).padEnd(6)} ${String(round(a.pco2)).padStart(7)} ${String(round(a.ph)).padStart(7)} ${String(round(a.rr)).padStart(7)}`);
}

// ---- 4. Acid-base vs unmeasured strong anions (metabolic acidosis lever) ----
H("4. Acid-base vs unmeasured strong anions (UMA)");
log("UMA+     pH      HCO3    BE      pCO2");
const base = run(() => {});
log(`base   ${String(round(base.ph)).padStart(7)} ${String(round(base.hco3)).padStart(7)} ${String(round(base.be)).padStart(7)} ${String(round(base.pco2)).padStart(7)}`);
for (const d of [3, 6, 9]) {
  const a = run((m) => { const u = (m.models.AA?.solutes?.uma ?? 0) + d; if (m.models.Blood) m.models.Blood.set_solute("uma", u); });
  log(`+${String(d).padEnd(5)} ${String(round(a.ph)).padStart(7)} ${String(round(a.hco3)).padStart(7)} ${String(round(a.be)).padStart(7)} ${String(round(a.pco2)).padStart(7)}`);
}
log("");
