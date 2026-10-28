// Nasal CPAP probe: the same CPAP level through an endotracheal tube, nasal prongs and a nasal mask,
// with the mouth closed and open, against spontaneous breathing.
//
// Each case is built fresh from the scenario, switched to its support, settled, and averaged. It reports
// the pressure the CPAP actually reaches (airway dead space = trachea, and alveoli), the end-expiratory
// lung volume, the breathing pattern and the arterial CO2, plus the leak through an open mouth.
//
// Usage: node scripts/probe_nasal_cpap.mjs [scenario] [--cpap 5] [--settle 240] [--window 60] [--json]

import fs from "node:fs";
import { createEngine } from "./_harness.mjs";

const argv = process.argv.slice(2);
const scenario = argv.find((a) => !a.startsWith("-") && !/^[\d.]+$/.test(a)) || "term_neonate_72h";
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? Number(argv[i + 1]) : d; };
const CPAP = opt("--cpap", 5);
const SETTLE = opt("--settle", 240);
const WINDOW = opt("--window", 60);
const asJson = argv.includes("--json");
// the harness silences console.log, so results go straight to stdout
const out = (line = "") => process.stdout.write(line + "\n");
const MMHG_TO_CMH2O = 1.35951;

const def = JSON.parse(fs.readFileSync(new URL(`../model_definitions/${scenario}.json`, import.meta.url), "utf8"));
const eng = await createEngine();

const CASES = [
  { name: "spontaneous" },
  { name: "ETT CPAP", iface: "ett" },
  { name: "prongs, mouth closed", iface: "prongs", mouth: 0 },
  { name: "mask, mouth closed", iface: "mask", mouth: 0 },
  { name: "prongs, mouth half open", iface: "prongs", mouth: 0.5 },
  { name: "prongs, mouth open", iface: "prongs", mouth: 1 },
];

const rows = [];
for (const c of CASES) {
  const model = eng.build(JSON.parse(JSON.stringify(def.model_definition || def)));
  const M = model.models, W = model.weight, V = M.Ventilator;
  if (c.iface) {
    V.switch_ventilator(true);
    V.set_cpap(CPAP, Math.max(8, Math.round(W * 3)));
    V.set_interface(c.iface);
    V.mouth_leak = c.mouth ?? 0;
  }
  eng.calc(SETTLE);
  const atm = M.DS.pres_atm ?? 760;
  const a = { mv: 0, rr: 0, vt: 0, paco2: 0, pao2: 0, p_ds: 0, p_alv: 0, p_circ: 0, eelv: 1e9, mouth_flow: 0 };
  let n = 0;
  for (let t = 0; t < WINDOW; t += 0.01) {
    eng.calc(0.01); n++;
    a.mv += (M.Breathing.minute_volume * 1000) / W;
    a.rr += M.Breathing.resp_rate;
    a.vt += (M.Breathing.exp_tidal_volume * 1000) / W;
    a.paco2 += M.AA.pco2;
    a.pao2 += M.AA.po2;
    a.p_ds += (M.DS.pres - atm) * MMHG_TO_CMH2O;
    a.p_alv += ((M.ALL.pres + M.ALR.pres) / 2 - atm) * MMHG_TO_CMH2O;
    a.p_circ += c.iface ? (M.VENT_GASCIRCUIT.pres - atm) * MMHG_TO_CMH2O : 0;
    a.eelv = Math.min(a.eelv, ((M.ALL.vol + M.ALR.vol) * 1000) / W);
    a.mouth_flow += c.iface && c.iface !== "ett" ? Math.abs(M.MOUTH_DS.flow) * 60 : 0; // L/min
  }
  for (const k in a) if (k !== "eelv") a[k] /= n;
  rows.push({ case: c.name, interface: V.interface, ...a });
}

if (asJson) {
  out(JSON.stringify({ scenario, cpap: CPAP, settle: SETTLE, window: WINDOW, rows }, null, 2));
} else {
  const f = (v, d = 1, w = 8) => (Number.isFinite(v) ? v.toFixed(d) : "-").padStart(w);
  out(`\n=== ${scenario}: CPAP ${CPAP} cmH2O by interface (settle ${SETTLE} s, last ${WINDOW} s averaged) ===`);
  out("case                       P circ  P trach   P alv  EELV/kg   MV/kg      RR   Vt/kg   PaCO2    PaO2  mouth L/min");
  for (const r of rows) {
    out(`${r.case.padEnd(24)}${f(r.p_circ, 2)}${f(r.p_ds, 2)}${f(r.p_alv, 2)}${f(r.eelv)}${f(r.mv, 0)}${f(r.rr)}${f(r.vt, 2)}${f(r.paco2)}${f(r.pao2)}${f(r.mouth_flow, 2, 11)}`);
  }
}
