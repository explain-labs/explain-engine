// Vitals + blood-gas calibration probe for the Explain engine.
//
// Builds a scenario headless (same global-shim trick as headless.mjs), warms up to steady state
// with the ANS active (calibration target is the *regulated* operating point), then reports the
// vitals a clinician would read off the monitor plus an arterial blood gas, with normal-range flags.
//
// Usage:
//   node scripts/probe_vitals.mjs <scenario> [--seconds N] [--window W] [--no-ans] [--verbose]

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const argv = process.argv.slice(2);
const scenario = argv.find((a) => !a.startsWith("-")) || "term_neonate_72h";
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? Number(argv[i + 1]) : d; };
const SECONDS = opt("--seconds", 60);
const WINDOW = opt("--window", 20);
const NO_ANS = flag("--no-ans");
const VERBOSE = flag("--verbose");

let liveModel = null;
globalThis.self = globalThis;
globalThis.postMessage = (msg) => {
  if (!msg || !msg.type) return;
  if (msg.type === "state") liveModel = msg.payload;
  if (msg.type === "error") console.error("ENGINE ERROR:", msg.message, msg.payload ?? "");
  if (msg.type === "status" && /ERROR/i.test(msg.message || "")) console.error("ENGINE:", msg.message);
};
const _log = console.log;
if (!VERBOSE) console.log = () => {};

await import("../ModelEngine.js");
const send = (type, message, payload) => self.onmessage({ data: { type, message, payload } });

const path = new URL(`../model_definitions/${scenario}.json`, import.meta.url);
const json = JSON.parse(fs.readFileSync(path, "utf8"));
const def = json.model_definition || json;

send("POST", "build", def);
send("GET", "state", []);
const model = liveModel;
if (!model || !model.models) { console.log = _log; console.error(`Build failed for "${scenario}".`); process.exit(1); }

if (NO_ANS && model.models.Ans) model.models.Ans.is_enabled = false;

// live solute overrides (propagate to every blood compartment via Blood.set_solute) for fast sweeps
const Blood = model.models.Blood;
const setSolute = (s, v) => { if (Blood && v != null) Blood.set_solute(s, v); };
setSolute("hemoglobin", opt("--hb", null));
setSolute("uma", opt("--uma", null));
setSolute("cl", opt("--cl", null));

// scale unstressed volume of the large systemic capacitance veins (VLB+VUB) to tune venous filling/CVP
const venUvol = opt("--venuvol", null);
if (venUvol != null) for (const n of ["VLB", "VUB"]) { const m = model.models[n]; if (m) m.u_vol *= venUvol; }

// scale ventricular contractility (persistent el_max factor) to re-balance CO against the raised preload
const contract = opt("--contract", null);
if (contract != null) for (const n of ["LV", "RV"]) { const m = model.models[n]; if (m) m.el_max_factor_ps = contract; }

// scale the CO2 diffusion constant at the alveolar gas exchangers (higher = fuller blood↔alveolar
// CO2 equilibration → arterial pCO2 ≈ alveolar/etCO2, narrowing the a-ET gap)
const difCo2 = opt("--difco2", null);
if (difCo2 != null) for (const n of ["GASEX_LL", "GASEX_RL"]) { const m = model.models[n]; if (m) m.dif_co2_factor_ps = difCo2; }

// override the intrapulmonary shunt resistance (higher = less venous admixture → narrower a-ET CO2 gap)
const ipsRes = opt("--ipsres", null);
if (ipsRes != null && model.models.Shunts) model.models.Shunts.ips_res = ipsRes;

// override the heart-rate reference (resting HR setpoint, bpm)
const hrRef = opt("--hrref", null);
if (hrRef != null && model.models.Heart) model.models.Heart.heart_rate_ref = hrRef;

// scale right-heart diastolic stiffness (el_min) — raises filling pressure (CVP) for a given stroke volume
const rstiff = opt("--rstiff", null);
if (rstiff != null) for (const n of ["RV", "RAIVCI"]) { const m = model.models[n]; if (m) m.el_min_factor_ps = rstiff; }

// scale total circulating volume: multiply vol of every live blood compartment (skip the
// disabled ECLS priming circuit and URINE) — lowers stressed volume → CO/MAP without touching CVP coupling
const bloodVol = opt("--bloodvol", null);
if (bloodVol != null) for (const [n, m] of Object.entries(model.models)) {
  if (m && typeof m.vol === "number" && m.solutes && Object.keys(m.solutes).length && !n.startsWith("ECLS") && n !== "URINE") m.vol *= bloodVol;
}

const M = model.models.Monitor;
const AA = model.models.AA;       // ascending aorta — arterial blood gas
const weight = model.weight;
const heightCm = model.height < 3 ? model.height * 100 : model.height; // def stores metres
const round = (x, n = 2) => (typeof x === "number" && isFinite(x) ? Number(x.toFixed(n)) : x);

// warm up to steady state, then cycle-average the pulsatile signals over WINDOW seconds
send("POST", "calc", SECONDS);
const SLICE = 0.02;
const N = Math.round(WINDOW / SLICE);
const acc = {};
const add = (k, v) => { acc[k] = (acc[k] || 0) + (v ?? 0); };
for (let i = 0; i < N; i++) {
  send("POST", "calc", SLICE);
  add("hr", M.heart_rate); add("rr", M.resp_rate);
  add("sys", M.minmax?.abp_pre_pres_max); add("dia", M.minmax?.abp_pre_pres_min); add("map", M.minmax?.abp_pre_pres_mean); add("map_int", M.minmax?.abp_pre_pres_mean_int);
  add("pap_s", M.minmax?.pap_pres_max); add("pap_d", M.minmax?.pap_pres_min); add("pap_m", M.minmax?.pap_pres_mean); add("pap_m_int", M.minmax?.pap_pres_mean_int);
  add("cvp", M.minmax?.cvp_pres_mean);
  add("spo2_pre", M.sao2_pre); add("spo2_post", M.sao2_post); add("svo2", M.svo2); // mixed-venous (PA) saturation, already in %
  add("q_da", model.models.Pda?.flow_pa); // ductal shunt at the PA end (L/s); +ve = left-to-right
  add("temp", M.temp); add("etco2", M.etco2);
  add("lvo", M.flows?.lvo); add("rvo", M.flows?.rvo);
  add("ph", AA?.ph); add("pco2", AA?.pco2); add("po2", AA?.po2); add("hco3", AA?.hco3); add("be", AA?.be); add("so2_aa", AA?.so2);
}
for (const k in acc) acc[k] /= N;

// normal resting ranges by profile; [low, high]. Auto-selected from body weight (term neonate ≈ 3.5 kg)
// (neonate_1h for a term baby under 6 h old, neonate_12h from 6 to under 18 h, neonate_24h from 18 to
// under 48 h) unless overridden with --profile adult|neonate|neonate_1h|neonate_12h|neonate_24h.
const RANGES = {
  adult: {
    hr: [60, 100], rr: [12, 20], sys: [90, 130], dia: [60, 85], map: [70, 100],
    pap_s: [15, 30], pap_d: [4, 12], pap_m: [9, 18], cvp: [2, 8],
    spo2_pre: [95, 100], svo2: [65, 75], temp: [36.5, 37.5], etco2: [35, 45],
    ph: [7.35, 7.45], pco2: [35, 45], po2: [80, 100], hco3: [22, 26], be: [-2, 2],
  },
  // the healthy term neonate at ~72 h: the ranges of docs/TermNeonateReference.md
  // (scripts/reference/term_neonate_72h.json) where it gives one; SpO2 mean - 2 SD; pap_* stay the
  // age-dependent table below (rangesFor); hco3 and etco2 have no reference range
  neonate: {
    hr: [91, 145], rr: [32, 57], sys: [60, 89], dia: [31, 61], map: [45, 72],
    pap_s: [18, 40], pap_d: [5, 20], pap_m: [12, 30], cvp: [2, 8],
    spo2_pre: [94.5, 100], svo2: [70, 80], temp: [36.5, 37.5], etco2: [35, 45],
    ph: [7.31, 7.47], pco2: [28.5, 48.7], po2: [60, 90], hco3: [18, 24], be: [-4, 2],
  },
  // the healthy term neonate at ~1 h (vaginal birth, delayed cord clamping): the ranges of
  // docs/TermTransitionReference.md (scripts/reference/term_neonate_1h.json); SpO2 mean - 2 SD;
  // pap_s, pap_d and etco2 have no 1 h range
  neonate_1h: {
    hr: [102, 162], rr: [32, 57], sys: [52, 83], dia: [25, 49], map: [36, 59],
    pap_m: [38, 56], cvp: [-3, 4],
    spo2_pre: [94, 100], svo2: [84, 90], temp: [36.5, 37.5],
    ph: [7.27, 7.38], pco2: [30, 42], po2: [60, 90], hco3: [17, 21], be: [-7, -3],
  },
  // the healthy term neonate at ~12 h: the ranges of docs/TermTransitionReference.md
  // (scripts/reference/term_neonate_12h.json); pap_d and etco2 have no 12 h range
  neonate_12h: {
    hr: [97, 152], rr: [32, 57], sys: [54, 85], dia: [28, 53], map: [39, 62],
    pap_s: [34, 71], pap_m: [32, 50], cvp: [-3, 4],
    spo2_pre: [95, 100], svo2: [82, 88], temp: [36.5, 37.5],
    ph: [7.31, 7.41], pco2: [30, 40], po2: [60, 90], hco3: [17, 22], be: [-6, -2],
  },
  // the healthy term neonate at ~24 h: the ranges of docs/TermTransitionReference.md
  // (scripts/reference/term_neonate_24h.json); pap_d and etco2 have no 24 h range
  neonate_24h: {
    hr: [99, 143], rr: [32, 57], sys: [58, 84], dia: [29, 53], map: [41, 61],
    pap_s: [28, 60], pap_m: [24, 44], cvp: [-3, 4],
    spo2_pre: [95, 100], svo2: [81, 87], temp: [36.5, 37.5],
    ph: [7.32, 7.42], pco2: [30, 41], po2: [60, 90], hco3: [18, 23], be: [-5.5, -1.5],
  },
  // preterm neonates with RDS, first days of life. MAP target ~ GA in mmHg; faster HR/RR, lower
  // SpO2/PO2 and mild respiratory acidosis are expected with surfactant deficiency. Ranges loosen
  // (and oxygenation/ventilation targets drop) with decreasing gestational age.
  // etCO2 sits below arterial pCO2 (a-ET gap from RDS V/Q mismatch + dead space); SvO2 runs ~80 in this
  // engine's neonate; spontaneous preterm CVP is low. pap_* left untuned (PVR deferred this pass).
  // late preterm — approaching term physiology; mildest RDS, MAP into the high-30s/40s.
  preterm_36: {
    hr: [115, 170], rr: [38, 62], sys: [48, 80], dia: [27, 52], map: [38, 54],
    pap_s: [20, 43], pap_d: [6, 21], pap_m: [13, 31], cvp: [1, 8],
    spo2_pre: [90, 98], svo2: [57, 82], temp: [36.5, 37.5], etco2: [34, 50],
    ph: [7.27, 7.41], pco2: [38, 52], po2: [48, 80], hco3: [18, 24], be: [-6, 2],
  },
  preterm_34: {
    hr: [120, 175], rr: [40, 65], sys: [45, 75], dia: [25, 50], map: [35, 50],
    pap_s: [22, 45], pap_d: [6, 22], pap_m: [14, 32], cvp: [1, 8],
    spo2_pre: [88, 97], svo2: [55, 82], temp: [36.5, 37.5], etco2: [34, 52],
    ph: [7.25, 7.40], pco2: [40, 55], po2: [45, 75], hco3: [18, 24], be: [-7, 2],
  },
  preterm_32: {
    hr: [125, 180], rr: [40, 70], sys: [40, 70], dia: [22, 48], map: [30, 45],
    pap_s: [20, 48], pap_d: [6, 24], pap_m: [15, 35], cvp: [1, 8],
    spo2_pre: [86, 96], svo2: [52, 82], temp: [36.5, 37.5], etco2: [33, 52],
    ph: [7.22, 7.38], pco2: [42, 58], po2: [42, 70], hco3: [17, 24], be: [-8, 2],
  },
  preterm_30: {
    hr: [128, 185], rr: [40, 72], sys: [35, 68], dia: [20, 46], map: [28, 44],
    pap_s: [20, 49], pap_d: [7, 25], pap_m: [15, 36], cvp: [0, 8],
    spo2_pre: [86, 95], svo2: [51, 82], temp: [36.5, 37.5], etco2: [32, 52],
    ph: [7.21, 7.37], pco2: [44, 60], po2: [41, 68], hco3: [16, 24], be: [-8, 2],
  },
  preterm_28: {
    hr: [130, 190], rr: [40, 75], sys: [30, 65], dia: [18, 45], map: [26, 42],
    pap_s: [20, 50], pap_d: [8, 26], pap_m: [16, 38], cvp: [0, 7],
    spo2_pre: [85, 95], svo2: [50, 82], temp: [36.5, 37.5], etco2: [32, 52],
    ph: [7.20, 7.36], pco2: [45, 62], po2: [40, 65], hco3: [16, 24], be: [-9, 2],
  },
  // extreme prematurity: still lower MAP (~ GA in mmHg), faster HR, more profound RDS hypoxemia and
  // permissive hypercapnia/acidosis. Borderline-viability physiology.
  preterm_26: {
    hr: [135, 198], rr: [40, 80], sys: [28, 60], dia: [18, 42], map: [22, 38],
    pap_s: [18, 55], pap_d: [8, 26], pap_m: [15, 38], cvp: [0, 7],
    spo2_pre: [83, 94], svo2: [48, 82], temp: [36.5, 37.5], etco2: [30, 52],
    ph: [7.18, 7.34], pco2: [46, 66], po2: [38, 62], hco3: [16, 24], be: [-10, 2],
  },
  preterm_24: {
    hr: [135, 200], rr: [40, 85], sys: [24, 58], dia: [16, 40], map: [20, 35],
    pap_s: [16, 55], pap_d: [6, 26], pap_m: [14, 38], cvp: [0, 6],
    spo2_pre: [80, 93], svo2: [46, 82], temp: [36.5, 37.5], etco2: [30, 52],
    ph: [7.15, 7.32], pco2: [48, 70], po2: [35, 60], hco3: [15, 24], be: [-11, 2],
  },
};
const profileArg = (() => { const i = argv.indexOf("--profile"); return i >= 0 ? argv[i + 1] : null; })();
const ageHours = (model.age ?? 1) * 24 * 365;
const profile = profileArg || (weight < 10 ? (ageHours < 6 ? "neonate_1h" : ageHours < 18 ? "neonate_12h" : ageHours < 48 ? "neonate_24h" : "neonate") : "adult");
const ranges = RANGES[profile] || RANGES.adult;
const flagOf = (k, v) => { const r = ranges[k]; if (!r || typeof v !== "number") return ""; return v < r[0] ? " LOW" : v > r[1] ? " HIGH" : " ok"; };
const bsa = Math.sqrt((heightCm * weight) / 3600); // Mosteller
const ci = acc.lvo ? acc.lvo / bsa : null;

console.log = _log;
const line = (label, k, unit) => `${label.padEnd(22)} ${String(round(acc[k])).padStart(8)} ${unit.padEnd(12)}${flagOf(k, acc[k])}`;
console.log(`\n=== ${scenario}  (weight ${weight} kg, profile ${profile}, ANS ${model.models.Ans?.is_enabled ? "ON" : "OFF"}, warmup ${SECONDS}s) ===\n`);
console.log("-- Hemodynamics --");
console.log(line("Heart rate", "hr", "bpm"));
console.log(line("ABP systolic", "sys", "mmHg"));
console.log(line("ABP diastolic", "dia", "mmHg"));
console.log(line("ABP mean (dia + PP/3)", "map", "mmHg"));
console.log(line("ABP mean (time avg)", "map_int", "mmHg"));
console.log(line("CVP (mean)", "cvp", "mmHg"));
console.log(line("PAP systolic", "pap_s", "mmHg"));
console.log(line("PAP diastolic", "pap_d", "mmHg"));
console.log(line("PAP mean (dia + PP/3)", "pap_m", "mmHg"));
console.log(line("PAP mean (time avg)", "pap_m_int", "mmHg"));
console.log(`${"LV output (CO)".padEnd(22)} ${String(round(acc.lvo)).padStart(8)} L/min`);
console.log(`${"RV output".padEnd(22)} ${String(round(acc.rvo)).padStart(8)} L/min`);
if (ci) console.log(`${"Cardiac index ~".padEnd(22)} ${String(round(ci)).padStart(8)} L/min/m2`);
console.log("\n-- Oxygenation / Resp --");
console.log(line("SpO2 pre-ductal", "spo2_pre", "%"));
console.log(`${"SpO2 post-ductal".padEnd(22)} ${String(round(acc.spo2_post)).padStart(8)} %`);
const qDaMlMin = (acc.q_da || 0) * 60 * 1000;
console.log(`${"PDA shunt (PA end)".padEnd(22)} ${String(round(qDaMlMin, 0)).padStart(8)} mL/min  ${qDaMlMin > 1 ? "L->R" : qDaMlMin < -1 ? "R->L" : "~nil"}  (${round(qDaMlMin / weight, 0)} mL/kg/min)`);
console.log(line("SvO2", "svo2", "%"));
console.log(line("Resp rate", "rr", "/min"));
console.log(line("etCO2", "etco2", "mmHg"));
console.log(line("Temp", "temp", "°C"));
console.log("\n-- Arterial blood gas (AA) --");
console.log(line("pH", "ph", ""));
console.log(line("pCO2", "pco2", "mmHg"));
console.log(line("pO2", "po2", "mmHg"));
console.log(line("HCO3", "hco3", "mmol/L"));
console.log(line("Base excess", "be", "mmol/L"));
console.log(`${"SaO2 (AA)".padEnd(22)} ${String(round(acc.so2_aa)).padStart(8)} %`);
console.log("");
