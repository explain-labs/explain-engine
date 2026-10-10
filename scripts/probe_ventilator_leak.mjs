// Ventilator tube-leak probe: sweeps the leak around an uncuffed ET tube (Ventilator.leak_size, the
// equivalent gap diameter in mm) and reports what the ventilator measures (Vti, Vte, leak %) next to
// what actually reaches the lungs (the alveolar volume swing), plus the effect on PC, volume guarantee
// and PS. Spontaneous drive off except for PS. Interactive verification tool: read the table, it is
// not a pass/fail gate.
//
// Usage: node scripts/probe_ventilator_leak.mjs [scenario] [--seconds N]

import fs from "node:fs";
import { createEngine } from "./_harness.mjs";

const argv = process.argv.slice(2);
const scenario = argv.find((a, i) => !a.startsWith("-") && !(argv[i - 1] ?? "").startsWith("--")) || "term_neonate";
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? Number(argv[i + 1]) : d; };
const SECONDS = opt("--seconds", 40);

const eng = await createEngine();
const log = eng.log;
const json = JSON.parse(fs.readFileSync(new URL(`../model_definitions/${scenario}.json`, import.meta.url), "utf8"));
const def = json.model_definition || json;
const col = (v, w = 9) => String(v).padStart(w);
const f1 = (x) => (typeof x === "number" && isFinite(x) ? x.toFixed(1) : "-");

function run(setup, leak, spont = false) {
  const m = eng.build(def);
  const V = m.models.Ventilator, B = m.models.Breathing;
  if (!spont) B.switch_breathing?.(false);
  V.switch_ventilator(true);
  setup(V);
  V.leak_size = leak;
  eng.calc(SECONDS);
  // alveolar tidal volume = the lung volume swing over two breaths
  let vmin = Infinity, vmax = -Infinity;
  const dt = m.modeling_stepsize;
  for (let i = 0; i < Math.round((2 * 60) / V.vent_rate / dt); i++) {
    eng.calc(dt);
    const v = (m.models.ALL.vol + m.models.ALR.vol) * 1000;
    vmin = Math.min(vmin, v);
    vmax = Math.max(vmax, v);
  }
  return { leak_perc: V.leak_perc, vti: V.insp_tidal_volume * 1000, vte: V.exp_tidal_volume * 1000,
    lung: vmax - vmin, pip: V.pip_delivered, pco2: m.models.AA?.pco2 };
}

// the useful leak range scales with the tube: about 0.5-1.25 mm for a neonatal tube, 1-3 mm for an adult
const adult = (def.weight ?? 3) > 20;
const sizes = adult ? [0, 1, 2, 3] : [0, 0.5, 0.75, 1.0, 1.25];
const cases = adult
  ? [["PC 20/5", (V) => V.set_pc(20, 5, 14, 1.0, 60)], ["PC + VG 450 mL", (V) => { V.set_pc(20, 5, 14, 1.0, 60); V.set_volume_guarantee(true, 450, 35); }]]
  : [["PC 20/5", (V) => V.set_pc(20, 5, 40, 0.4, 12)], ["PC + VG 15 mL", (V) => { V.set_pc(20, 5, 40, 0.4, 12); V.set_volume_guarantee(true, 15, 30); }],
     ["PS 10/5 (spont)", (V) => V.set_psv(15, 5, 30, 0.6, 12), true]];

log(`\n== Ventilator tube leak on ${scenario} (warm-up ${SECONDS} s) ==`);
for (const [name, setup, spont] of cases) {
  log(`\n${name}`);
  log(`${col("leak mm")}${col("leak %")}${col("Vti mL")}${col("Vte mL")}${col("lung mL")}${col("PIP")}${col("PaCO2")}`);
  for (const d of sizes) {
    const r = run(setup, d, spont);
    log(`${col(d)}${col(f1(r.leak_perc))}${col(f1(r.vti))}${col(f1(r.vte))}${col(f1(r.lung))}${col(f1(r.pip))}${col(f1(r.pco2))}`);
  }
}
log("\n  -> leak % = (Vti - Vte) / Vti at the tube; PC compensates (lung Vt holds), VG chases the falling");
log("     Vte up to its pressure limit, PS still cycles on flow (leak compensation takes the learned leak");
log("     flow off the termination; without it PS cycles on Ti max once the leak keeps flow from decaying)");
