// High-frequency oscillation probe: intubates (2.5 mm ETT) a spontaneous-drive-off patient on HFOV and
// reports the relationships HFOV teaching rests on:
//
//   A. frequency  -> Vt, DCO2 (f * Vt^2), PaCO2     (higher f: smaller Vt, LESS CO2 clearance)
//   B. amplitude  -> Vt, DCO2, PaCO2                 (more amplitude: more CO2 clearance)
//   C. MAP        -> lung volume, PaO2, SpO2         (oxygenation follows mean airway pressure)
//   D. damping    -> pressure swing at circuit / trachea / alveoli
//   E. I:E        -> 1:2 vs 1:1
//   F. volume targeting -> the amplitude servoed on the average expired volume, limit, switch-off
//   G. sigh / oscillation pause -> held pressure and duration, automatic sigh rate
//   H. HFOV_CMV   -> CMV breaths with the oscillation in both phases or in expiration only
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

// F-H use a short warm-up: they check the device behaviour, not the blood gases
function setup(warm = 20) {
  const m = eng.build(structuredClone(def));
  const V = m.models.Ventilator;
  m.models.Breathing.switch_breathing?.(false);
  V.switch_ventilator(true);
  V.set_ettube_diameter(2.5);
  V.set_hfov(10, 20, 10, 0.33, 10);
  eng.calc(warm);
  return [m, V];
}

log(`\nF. volume targeting (MAP 10, amplitude 20, 10 Hz): working amplitude and Vte`);
{
  const [, V] = setup();
  log(`  start: amplitude 20, Vte ${f1(V.exp_tidal_volume * 1000, 2)} mL`);
  for (const [vt, max, secs] of [[1.5, 40, 15], [3.0, 40, 15], [6.0, 25, 15]]) {
    V.set_hfo_volume_guarantee(true, vt, max);
    eng.calc(secs);
    log(`  target ${f1(vt)} mL, max ${max}: amplitude ${f1(V.hfo_amplitude_delivered)} -> Vte ${f1(V.exp_tidal_volume * 1000, 2)} mL${V.pressure_limited ? "  (pressure limited)" : ""}`);
  }
  V.set_hfo_volume_guarantee(false);
  eng.calc(2);
  log(`  off: amplitude back to the set ${f1(V.hfo_amplitude_delivered)}`);
}

log(`\nG. sigh (20 cmH2O, 1 s) and oscillation pause`);
{
  const [, V] = setup();
  V.hfo_sigh_cmh2o = 20;
  V.hfo_sigh_time = 1.0;
  V.hfo_sigh();
  let t = 0, lo = Infinity, hi = -Infinity;
  while (V.hfo_sigh_remaining > 0) {
    eng.calc(0.01);
    t += 0.01;
    if (t > 0.5) { lo = Math.min(lo, V.pres); hi = Math.max(hi, V.pres); }
  }
  log(`  sigh: ${f1(t, 2)} s, held at ${f1(lo)}-${f1(hi)} cmH2O`);
  V.hfo_pause();
  eng.calc(5);
  log(`  pause: ${f1(V.hfo_pause_remaining)} s left, circuit ${f1(V.pres)} cmH2O (MAP 10)`);
  V.hfo_pause();
  eng.calc(0.5);
  log(`  cancelled: oscillating again, swing ${f1(V.hfo_amplitude_meas)} cmH2O`);
  V.set_hfo_sigh(6, 0.5, 15);
  let n = 0, was = false;
  for (let i = 0; i < 6000; i++) {
    eng.calc(0.01);
    const on = V.hfo_sigh_remaining > 0;
    if (on && !was) n++;
    was = on;
  }
  log(`  automatic sighs at 6/min: ${n} in 60 s`);
}

log(`\nH. HFOV_CMV (PIP 18, PEEP 5, 30/min, Ti 0.4, amplitude 10, 10 Hz)`);
log(`${col("activity")}${col("RR")}${col("insp")}${col("swing")}${col("exp")}${col("swing")}`);
for (const act of ["both", "exp"]) {
  const [, V] = setup();
  V.set_hfov_cmv(18, 5, 30, 0.4, 10, 10, act, 10);
  eng.calc(20);
  const ins = [], exs = [];
  for (let i = 0; i < 3000; i++) {
    eng.calc(0.01);
    if (V._inspiration && V._insp_time_counter > 0.2 && V._insp_time_counter < 0.35) ins.push(V.pres);
    if (V._expiration && V._te_counter > 0.5) exs.push(V.pres);
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const sw = (a) => Math.max(...a) - Math.min(...a);
  log(`${col(act)}${col(f1(V.rr_meas))}${col(f1(mean(ins)))}${col(f1(sw(ins)))}${col(f1(mean(exs)))}${col(f1(sw(exs)))}`);
}
