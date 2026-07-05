// ECMO / ECLS probe for the Explain engine (companion devices paper, §3.2).
//
// Induces severe respiratory failure (near-abolished alveolar diffusion) so the native lung cannot
// oxygenate, then starts veno-arterial ECMO (drain RA, return aortic root) and sweeps pump speed and
// sweep-gas flow, reporting the extracorporeal circuit flow and the EMERGENT systemic blood gas —
// oxygenation and CO2 removal come from the membrane gas-exchanger (same Fick law as the native lung).
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
const json = JSON.parse(fs.readFileSync(new URL(`../public/model_definitions/${scenario}.json`, import.meta.url), "utf8"));
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
  }
  for (const k in acc) acc[k] /= N;
  return acc;
}

// build fresh, cripple lung, optionally run ECMO with given settings, warm, measure
function run({ ecmo = false, rpm = 3000, gas_flow = 0.5, gas_fio2 = 1.0 } = {}) {
  const m = eng.build(def);
  const E = m.models.Ecls;
  if (!E) throw new Error(`no Ecls model in "${scenario}"`);
  crippleLung(m);
  if (ecmo) {
    E.ecls_running = true;
    E.ecls_clamped = false;   // open the blood path + enable membrane exchange
    E.pump_rpm = rpm;
    E.gas_flow = gas_flow;
    E.gas_fio2 = gas_fio2;
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

// B. ECMO on, sweep pump speed (fixed sweep gas 0.5 L/min, FiO2 1.0)
H("B. ECMO rescue vs pump speed  (sweep gas 0.5 L/min, sweep FiO2 1.0)");
log("RPM     Qcirc   PaO2    SpO2    PaCO2   Svo2    postOxy");
for (const rpm of [1500, 2500, 3500, 4500]) {
  const a = run({ ecmo: true, rpm, gas_flow: 0.5 });
  log(`${String(rpm).padEnd(6)} ${String(round(a.flow,2)).padStart(7)} ${String(round(a.po2)).padStart(7)} ${String(round(a.spo2)).padStart(7)} ${String(round(a.pco2)).padStart(7)} ${String(round(a.sat_ven)).padStart(7)} ${String(round(a.sat_postoxy)).padStart(7)}`);
}

// C. ECMO on, sweep sweep-gas flow (fixed pump 3500 rpm) — CO2 removal
H("C. CO2 removal vs sweep-gas flow  (pump 3500 rpm, sweep FiO2 1.0)");
log("Gas(L/min) PaCO2   PaO2    SpO2");
for (const gf of [0.2, 0.5, 1.0, 2.0]) {
  const a = run({ ecmo: true, rpm: 3500, gas_flow: gf });
  log(`${String(gf).padEnd(10)} ${String(round(a.pco2)).padStart(6)} ${String(round(a.po2)).padStart(7)} ${String(round(a.spo2)).padStart(7)}`);
}
log("");
