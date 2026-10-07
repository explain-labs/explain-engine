// Series dead space probe: shows that the airway dead space now behaves as series (Fowler/Bohr) dead
// space, i.e. alveolar ventilation is (Vt - VD) * rate, by comparing the classic well-mixed dead space
// (Respiration.dead_space_segments = 1) with the series model (the default) under controlled
// ventilation (PRVC, spontaneous drive off):
//
//   A. dead-space volume  -> PaCO2   (DS unstressed volume +0 / +50 / +100 %)
//   B. ET-tube lumen      -> PaCO2   (tube length 110 vs 200 mm at the same diameter)
//   C. capnography        -> etCO2 vs PaCO2 (etCO2 samples the airway-opening end of the dead space)
//
// Interactive verification tool: read the table, it is not a pass/fail gate. PaCO2 settles over minutes
// (body CO2 stores), hence the long default warm-up.
//
// Usage: node scripts/probe_dead_space.mjs [scenario] [--seconds N]

import fs from "node:fs";
import { createEngine } from "./_harness.mjs";

const argv = process.argv.slice(2);
const scenario = argv.find((a, i) => !a.startsWith("-") && !(argv[i - 1] ?? "").startsWith("--")) || "preterm_28wk";
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? Number(argv[i + 1]) : d; };
const SECONDS = opt("--seconds", 300);

const eng = await createEngine();
const log = eng.log;
const json = JSON.parse(fs.readFileSync(new URL(`../model_definitions/${scenario}.json`, import.meta.url), "utf8"));
const def = json.model_definition || json;
const col = (v, w = 10) => String(v).padStart(w);
const f1 = (x) => (typeof x === "number" && isFinite(x) ? x.toFixed(1) : "-");

function run({ segments, ds_extra = 0, tube_length = 110 }) {
  const m = eng.build(def);
  const V = m.models.Ventilator, R = m.models.Respiration, DS = m.models.DS;
  if (segments === 1) { R.dead_space_segments = 1; R.dead_space_dispersion = 0.0; }
  m.models.Breathing.switch_breathing?.(false);
  if (ds_extra) { const dv = DS.u_vol * ds_extra; DS.u_vol += dv; DS.vol += dv; }
  V.switch_ventilator(true);
  V.set_ettube_diameter(2.5);
  V.set_ettube_length(tube_length);
  V.set_fio2(0.4);
  V.set_prvc(30, 5, 40, 5 * (def.weight ?? 1), 0.35, 8);
  eng.calc(SECONDS);
  return { vt: V.exp_tidal_volume * 1000, paco2: m.models.AA?.pco2, etco2: V.etco2, vd: DS.vol * 1000 };
}

log(`\n== Series dead space on ${scenario} (PRVC 5 mL/kg, rate 40, ETT 2.5 mm, warm-up ${SECONDS} s) ==`);

log(`\nA. dead-space volume -> PaCO2`);
log(`${"".padEnd(14)}${col("DS +%")}${col("DS mL")}${col("Vt mL")}${col("PaCO2")}`);
for (const segments of [1, 32]) {
  for (const extra of [0, 0.5, 1.0]) {
    const r = run({ segments, ds_extra: extra });
    log(`${(segments === 1 ? "well-mixed" : "series").padEnd(14)}${col(extra * 100)}${col(f1(r.vd))}${col(f1(r.vt))}${col(f1(r.paco2))}`);
  }
}

log(`\nB. ET-tube lumen -> PaCO2 (series model)`);
log(`${"".padEnd(14)}${col("tube mm")}${col("lumen mL")}${col("PaCO2")}`);
for (const L of [110, 200]) {
  const r = run({ segments: 32, tube_length: L });
  const lumen = Math.PI * (1.25e-3) ** 2 * (L / 1000) * 1e6;
  log(`${"".padEnd(14)}${col(L)}${col(lumen.toFixed(2))}${col(f1(r.paco2))}`);
}

log(`\nC. capnography (series model)`);
const c = run({ segments: 32 });
log(`  etCO2 ${f1(c.etco2)} mmHg vs PaCO2 ${f1(c.paco2)} mmHg`);
log("\n  -> series: PaCO2 rises with dead-space and tube volume as (Vt - VD) * rate predicts;");
log("     well-mixed: a single mixed tank's effective dead space saturates, so it barely responds");
