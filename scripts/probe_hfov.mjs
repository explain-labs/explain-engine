// High-frequency oscillation probe: intubates (2.5 mm ETT) a spontaneous-drive-off patient on HFOV and
// reports the relationships HFOV teaching rests on:
//
//   A. frequency  -> Vt, DCO2 (f * Vt^2), PaCO2     (higher f: smaller Vt, LESS CO2 clearance)
//   B. amplitude  -> Vt, DCO2, PaCO2                 (more amplitude: more CO2 clearance)
//   C. MAP        -> lung volume, PaO2, SpO2         (oxygenation follows mean airway pressure)
//   D. damping    -> pressure swing at circuit / trachea / alveoli
//   E. I:E        -> 1:2 vs 1:1
//
// CO2 clearance comes from the series dead space + axial dispersion of the airway (see
// docs/GasCapacitance.md), not from the device. Interactive verification tool: read the tables, it is
// not a pass/fail gate. PaCO2 settles over minutes (body CO2 stores), hence the long warm-up.
//
// Usage: node scripts/probe_hfov.mjs [scenario] [--seconds N]

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
const f1 = (x, n = 1) => (typeof x === "number" && isFinite(x) ? x.toFixed(n) : "-");

function run({ map = 10, amp = 20, freq = 10, fi = 0.33 }) {
  const m = eng.build(def);
  const V = m.models.Ventilator;
  m.models.Breathing.switch_breathing?.(false);
  V.switch_ventilator(true);
  V.set_ettube_diameter(2.5);
  V.set_fio2(0.4);
  V.set_hfov(map, amp, freq, fi, 10);
  eng.calc(SECONDS);
  // pressure swings and lung volume over two cycles
  const dt = m.modeling_stepsize;
  const sw = { ds: [Infinity, -Infinity], alv: [Infinity, -Infinity], vol: 0 };
  let n = 0;
  for (let i = 0; i < Math.round(2 / freq / dt); i++) {
    eng.calc(dt);
    const ds = (m.models.DS.pres - m.models.DS.pres_atm) * 1.35951;
    const alv = (m.models.ALL.pres - m.models.ALL.pres_atm) * 1.35951;
    sw.ds = [Math.min(sw.ds[0], ds), Math.max(sw.ds[1], ds)];
    sw.alv = [Math.min(sw.alv[0], alv), Math.max(sw.alv[1], alv)];
    sw.vol += (m.models.ALL.vol + m.models.ALR.vol) * 1000;
    n++;
  }
  return {
    vt: V.hfo_tidal_volume * 1000, dco2: V.hfo_dco2, map: V.hfo_map_meas, amp: V.hfo_amplitude_meas,
    ds_sw: sw.ds[1] - sw.ds[0], alv_sw: sw.alv[1] - sw.alv[0], lung: sw.vol / n,
    paco2: m.models.AA?.pco2, pao2: m.models.AA?.po2, spo2: m.models.Monitor?.sao2_pre,
  };
}

log(`\n== HFOV on ${scenario} (ETT 2.5 mm, FiO2 0.4, bias flow 10 L/min, drive off, warm-up ${SECONDS} s) ==`);

log(`\nA. frequency (MAP 10, amplitude 20, I:E 1:2)`);
log(`${col("f Hz")}${col("Vt mL")}${col("DCO2")}${col("PaCO2")}${col("PaCO2*DCO2", 12)}`);
for (const freq of [6, 8, 10, 12, 15]) {
  const r = run({ freq });
  log(`${col(freq)}${col(f1(r.vt, 2))}${col(f1(r.dco2, 0))}${col(f1(r.paco2))}${col(f1(r.paco2 * r.dco2, 0), 12)}`);
}

log(`\nB. amplitude (MAP 10, 10 Hz, I:E 1:2)`);
log(`${col("amp")}${col("Vt mL")}${col("DCO2")}${col("PaCO2")}`);
for (const amp of [10, 15, 20, 30]) {
  const r = run({ amp });
  log(`${col(amp)}${col(f1(r.vt, 2))}${col(f1(r.dco2, 0))}${col(f1(r.paco2))}`);
}

log(`\nC. mean airway pressure (amplitude 20, 10 Hz)`);
log(`${col("MAP")}${col("meas")}${col("lung mL")}${col("PaO2")}${col("SpO2")}`);
for (const map of [6, 10, 14]) {
  const r = run({ map });
  log(`${col(map)}${col(f1(r.map))}${col(f1(r.lung))}${col(f1(r.pao2, 0))}${col(f1(r.spo2, 0))}`);
}

log(`\nD. damping and E. I:E (MAP 10, amplitude 20, 10 Hz)`);
log(`${col("I:E")}${col("circuit")}${col("trachea")}${col("alveoli")}${col("Vt mL")}${col("PaCO2")}`);
for (const [label, fi] of [["1:2", 0.33], ["1:1", 0.5]]) {
  const r = run({ fi });
  log(`${col(label)}${col(f1(r.amp))}${col(f1(r.ds_sw))}${col(f1(r.alv_sw, 2))}${col(f1(r.vt, 2))}${col(f1(r.paco2))}`);
}
log("\n  -> PaCO2 * DCO2 roughly constant (CO2 elimination ~ f * Vt^2); the swing is damped from circuit to alveoli");
