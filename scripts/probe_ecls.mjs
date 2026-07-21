// ECMO / ECLS probe for the Explain engine (companion devices paper, §3.2).
//
// Induces severe respiratory failure (near-abolished alveolar diffusion) so the native lung cannot
// oxygenate, then starts veno-arterial ECMO (drain RA, return aortic root) and sweeps pump speed and
// sweep-gas flow, reporting the extracorporeal circuit flow and the EMERGENT systemic blood gas —
// oxygenation and CO2 removal come from the membrane gas-exchanger (same Fick law as the native lung).
//
// Sections: A baseline, B pump-speed sweep, C CO2-vs-sweep-gas, D pump mode (centrifugal vs roller —
// both must drive FORWARD), E blood-side heater-cooler (hypothermia + no residual time-constant on
// release), F sweep-gas inlet-valve controller (R_insp tracks the set-point; gas_flow=0 shuts off) and
// expiratory-valve management.
//
// Usage: node scripts/probe_ecls.mjs [scenario] [--seconds N] [--window W]

import fs from "node:fs";
import { createEngine } from "./_harness.mjs";

const argv = process.argv.slice(2);
const scenario = argv.find((a) => !a.startsWith("-")) || "term_neonate";
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? Number(argv[i + 1]) : d; };
const SECONDS = opt("--seconds", 120);
const WINDOW = opt("--window", 20);

const eng = await createEngine();
const log = eng.log;
const json = JSON.parse(fs.readFileSync(new URL(`../model_definitions/${scenario}.json`, import.meta.url), "utf8"));
const def = json.model_definition || json;
const round = (x, n = 2) => (typeof x === "number" && isFinite(x) ? Number(x.toFixed(n)) : x);

// cripple the native lung (severe respiratory failure) so ECMO is the oxygen source
function crippleLung(m) {
  for (const n of ["GASEX_LL", "GASEX_RL"]) { const g = m.models[n]; if (g) { g.dif_o2_factor_ps = 0.02; g.dif_co2_factor_ps = 0.08; } }
}

function measure(m) {
  const AA = m.models.AA, E = m.models.Ecls, M = m.models.Monitor;
  const SLICE = 0.02, N = Math.round(WINDOW / SLICE), acc = {};
  const add = (k, v) => { acc[k] = (acc[k] || 0) + (v ?? 0); };
  for (let i = 0; i < N; i++) {
    eng.calc(SLICE);
    add("po2", AA?.po2); add("pco2", AA?.pco2); add("spo2", M?.sao2_pre);
    add("flow", E?.flow_avg ?? E?.flow); add("sat_ven", E?.sat_ven_o2); add("sat_postoxy", E?.sat_postoxy_o2);
    add("temp", AA?.temp);
  }
  for (const k in acc) acc[k] /= N;
  return acc;
}

// build fresh, cripple lung, optionally run ECMO with given settings, warm, measure
function run({ ecmo = false, rpm = 4000, gas_flow = 0.5, gas_fio2 = 1.0, pump_mode = 0,
              pump_type = null, ret_fac = 1.0,
              blood_temp_active = false, blood_temp = 37.0 } = {}) {
  const m = eng.build(def);
  const E = m.models.Ecls;
  if (!E) throw new Error(`no Ecls model in "${scenario}"`);
  crippleLung(m);
  if (ecmo) {
    E.ecls_running = true;
    E.ecls_clamped = false;   // open the blood path + enable membrane exchange
    if (pump_type) E.pump_type = pump_type;   // selecting a pump sets pump_mode + H-Q coefficients
    else E.pump_mode = pump_mode;             // else drive the current pump in the requested mode
    E.pump_rpm = rpm;
    E.return_res_factor = ret_fac;            // afterload proxy: raise the return-side resistance
    E.gas_flow = gas_flow;
    E.gas_fio2 = gas_fio2;
    E.blood_temp_active = blood_temp_active;
    E.blood_temp = blood_temp;
  }
  eng.calc(SECONDS);
  return measure(m);
}

const H = (t) => log(`\n== ${t} ==`);

// sanity: confirm the ECLS circuit is present
const probe = eng.build(def);
const need = ["Ecls", "ECLS_PUMP", "ECLS_OXY", "ECLS_GASEX", "ECLS_DRAINAGE", "ECLS_RETURN"];
const missing = need.filter((n) => !probe.models[n]);
if (missing.length) { log(`SKIP: ${scenario} missing ECLS parts: ${missing.join(", ")}`); process.exit(0); }
log(`ECLS circuit present in ${scenario}: drain ${probe.models.Ecls.drainage_site} -> return ${probe.models.Ecls.return_site} (VA)`);

// A. baseline: crippled lung, ECMO off
H("A. Severe respiratory failure, ECMO OFF");
const base = run({ ecmo: false });
log(`PaO2 ${round(base.po2)}  SpO2 ${round(base.spo2)}%  PaCO2 ${round(base.pco2)}  (circuit flow ${round(base.flow,2)} L/min)`);

// B. ECMO on, sweep pump speed (fixed sweep gas 0.5 L/min, FiO2 1.0). With the H-Q pump curve, flow now
// rises with rpm up to the circuit's preload/afterload limit (a real centrifugal characteristic).
H("B. ECMO rescue vs pump speed  (sweep gas 0.5 L/min, sweep FiO2 1.0)");
log("RPM     Qcirc   PaO2    SpO2    PaCO2   Svo2    postOxy");
for (const rpm of [3000, 4000, 5000, 5500]) {
  const a = run({ ecmo: true, rpm, gas_flow: 0.5 });
  log(`${String(rpm).padEnd(6)} ${String(round(a.flow,2)).padStart(7)} ${String(round(a.po2)).padStart(7)} ${String(round(a.spo2)).padStart(7)} ${String(round(a.pco2)).padStart(7)} ${String(round(a.sat_ven)).padStart(7)} ${String(round(a.sat_postoxy)).padStart(7)}`);
}

// C. ECMO on, sweep sweep-gas flow (fixed pump 4500 rpm) — CO2 removal
H("C. CO2 removal vs sweep-gas flow  (pump 4500 rpm, sweep FiO2 1.0)");
log("Gas(L/min) PaCO2   PaO2    SpO2");
for (const gf of [0.2, 0.5, 1.0, 2.0]) {
  const a = run({ ecmo: true, rpm: 4500, gas_flow: gf });
  log(`${String(gf).padEnd(10)} ${String(round(a.pco2)).padStart(6)} ${String(round(a.po2)).padStart(7)} ${String(round(a.spo2)).padStart(7)}`);
}

// D. Pump physics (H-Q curve): (D1) both modes drive FORWARD; (D2) centrifugal flow FALLS with afterload
// while the roller flow-source HOLDS; (D3) each library pump drives forward; (D4) deadhead (very high
// afterload) collapses flow and the pump develops near its max head. Note on a neonate the circuit is
// preload-limited (~0.5 L/min), so the D2 centrifugal drop is modest; run an adult scenario to see it larger.
H("D. Pump physics — H-Q curve  (4500 rpm, sweep 0.5 L/min FiO2 1.0)");
log("D1 mode    Qcirc   PaO2    SpO2   dir");
for (const [name, pt] of [["centrifugal", "Abbott PediMag"], ["roller", "Generic roller pump"]]) {
  const rpm = pt === "Generic roller pump" ? 400 : 4500;
  const a = run({ ecmo: true, rpm, pump_type: pt });
  const dir = a.flow > 0.1 ? "fwd" : (a.flow < -0.1 ? "REVERSE!" : "~0");
  log(`${name.padEnd(10)} ${String(round(a.flow,2)).padStart(6)} ${String(round(a.po2)).padStart(7)} ${String(round(a.spo2)).padStart(6)}   ${dir}`);
}
log("D2 afterload sweep (return_res_factor):   centrifugal        roller");
for (const rf of [1, 2, 4, 8]) {
  const c = run({ ecmo: true, rpm: 4500, pump_type: "Abbott PediMag", ret_fac: rf });
  const r = run({ ecmo: true, rpm: 400, pump_type: "Generic roller pump", ret_fac: rf });
  log(`  x${rf}    centrifugal ${String(round(c.flow,2)).padStart(5)} L/min     roller ${String(round(r.flow,2)).padStart(5)} L/min`);
}
log("D3 library pumps @ rated-ish rpm:");
for (const [pt, rpm] of [["Abbott PediMag",5000],["Abbott CentriMag",4500],["Getinge Rotaflow RF-32",4500],["Medtronic Bio-Pump BP-50",2800]]) {
  const a = run({ ecmo: true, rpm, pump_type: pt });
  log(`  ${pt.padEnd(26)} ${String(rpm).padStart(4)} rpm -> ${String(round(a.flow,2)).padStart(5)} L/min  ${a.flow>0.05?"fwd":"~0"}`);
}
{
  // D4 deadhead: enormous return resistance ≈ clamped outflow. Read pump_pressure (mmHg) directly.
  const m = eng.build(def); const E = m.models.Ecls; crippleLung(m);
  E.ecls_running = true; E.ecls_clamped = false; E.pump_type = "Abbott PediMag"; E.pump_rpm = 5000; E.return_res_factor = 1000;
  eng.calc(SECONDS);
  const a = measure(m);
  log(`D4 deadhead (5000 rpm, return_res x1000): flow ${round(a.flow,2)} L/min (expect ~0)  pump head ${round(-E.pump_pressure)} mmHg`);
}

// E. blood-side heater-cooler: a hypothermia target pulls arterial temperature down while active, and
// releasing it restores the oxygenator compartment's own perfusion time constant (no residual state).
H("E. Heater-cooler  (3500 rpm; target 33.5 C)");
{
  const m = eng.build(def);
  const E = m.models.Ecls, O = m.models.ECLS_OXY;
  crippleLung(m);
  E.ecls_running = true; E.ecls_clamped = false; E.pump_rpm = 3500;
  eng.calc(30);
  const tc0 = O.blood_temp_tc, t0 = m.models.AA.temp;
  E.blood_temp_active = true; E.blood_temp = 33.5;
  eng.calc(SECONDS);
  const tOn = m.models.AA.temp, tcOn = O.blood_temp_tc, ovrOn = O.temp_ext_override;
  E.blood_temp_active = false;
  eng.calc(30);
  const tcOff = O.blood_temp_tc, ovrOff = O.temp_ext_override;
  log(`arterial temp: ${round(t0,2)} -> ${round(tOn,2)} C (target 33.5)   ${tOn < t0 - 0.1 ? "cooling ok" : "NOT cooling"}`);
  log(`oxy tc: ${round(tc0,1)}s -> ${round(tcOn,1)}s (active, override=${ovrOn}) -> ${round(tcOff,1)}s (released, override=${ovrOff})   ${tcOff === tc0 && !ovrOff ? "restored ok" : "RESIDUAL STATE!"}`);
}

// F. sweep-gas inlet-valve controller: R_insp should track the set-point (R_insp = dP/Q - R_exp), and
// gas_flow = 0 must shut the sweep off cleanly (no divide-by-zero). Also confirm the expiratory valve
// is managed (enabled with the circuit, back-flow blocked).
H("F. Sweep-gas valve controller  (3500 rpm)");
{
  const m = eng.build(def);
  const E = m.models.Ecls, INSP = m.models.ECLS_GAS_INSP_VALVE, EXP = m.models.ECLS_GAS_EXP_VALVE;
  crippleLung(m);
  E.ecls_running = true; E.ecls_clamped = false; E.pump_rpm = 3500;
  log("gas(L/min)  R_insp    no_flow");
  for (const gf of [0.5, 1.0, 2.0, 0.0]) {
    E.gas_flow = gf; eng.calc(5);
    log(`${String(gf).padEnd(11)} ${String(round(INSP.r_for,0)).padStart(7)}   ${INSP.no_flow}`);
  }
  log(`exp valve managed: enabled=${EXP?.is_enabled}  no_back_flow=${EXP?.no_back_flow}`);
}
log("");
