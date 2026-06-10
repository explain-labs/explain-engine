// Headless calibration harness for the Explain engine.
//
// The engine (explain/ModelEngine.js) is a Web-Worker module: its only entry point is
// `self.onmessage`, and it talks back via `postMessage`. Neither exists in plain Node, so we
// install global shims BEFORE dynamic-importing the engine, then drive it through the very same
// { type, message, payload } envelope that explain/Model.js uses over the wire. `calculate`
// runs fully synchronously, so after each `calc` the model state is final and readable directly.
//
// Usage:
//   node scripts/headless.mjs <scenario> [--seconds N] [--window W] [--no-ans] [--no-autoreg] [--verbose]
//
// <scenario> is a file name in public/model_definitions/ without the .json suffix
// (e.g. term_neonate, adult_female). Prints the renal calibration panel.

import fs from "node:fs";
import { register } from "node:module";

// The engine uses Vite-style extensionless relative imports; register a resolve hook that
// retries with a ".js" suffix so plain Node ESM can load it.
register("./resolve-extensionless.mjs", import.meta.url);

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const scenario = argv.find((a) => !a.startsWith("-")) || "term_neonate";
const flag = (name) => argv.includes(name);
const opt = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? Number(argv[i + 1]) : def;
};
const SECONDS = opt("--seconds", 60); // warm-up to steady state
const WINDOW = opt("--window", 20); // cycle-averaging window (s)
const NO_ANS = flag("--no-ans") || true; // doc protocol: Ans frozen during calibration (default on)
const KEEP_ANS = flag("--ans"); // override to keep Ans enabled
const NO_AUTOREG = flag("--no-autoreg"); // isolate raw filtration (off by default → ship config)
const VERBOSE = flag("--verbose");

// ---------------------------------------------------------------------------
// 1. worker-global shims (must be installed BEFORE importing the engine)
// ---------------------------------------------------------------------------
let liveModel = null; // captured live `model` handle (posted by get_model_state, by reference)
globalThis.self = globalThis;
globalThis.postMessage = (msg) => {
  if (!msg || !msg.type) return;
  if (msg.type === "state") liveModel = msg.payload; // live model object, not a clone
  if (msg.type === "error") console.error("ENGINE ERROR:", msg.message, msg.payload ?? "");
  if (msg.type === "status" && /ERROR/i.test(msg.message || "")) console.error("ENGINE:", msg.message);
};

// silence the engine's chatty per-message console logging unless --verbose
const _log = console.log;
if (!VERBOSE) console.log = () => {};

// ---------------------------------------------------------------------------
// 2. import the engine (runs its module body → registers self.onmessage)
// ---------------------------------------------------------------------------
await import("../explain/ModelEngine.js");
const send = (type, message, payload) => self.onmessage({ data: { type, message, payload } });

// ---------------------------------------------------------------------------
// 3. build the scenario
// ---------------------------------------------------------------------------
const path = new URL(`../public/model_definitions/${scenario}.json`, import.meta.url);
const json = JSON.parse(fs.readFileSync(path, "utf8"));
const def = json.model_definition || json;

send("POST", "build", def);
send("GET", "state", []); // capture the live model handle
const model = liveModel;
if (!model || !model.models || !model.models.Kidneys) {
  console.log = _log;
  console.error(`Build failed for scenario "${scenario}" — no Kidneys model.`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 4. calibration setup
// ---------------------------------------------------------------------------
if (NO_ANS && !KEEP_ANS && model.models.Ans) model.models.Ans.is_enabled = false;
if (NO_AUTOREG) model.models.Kidneys.autoregulation_enabled = false;

// --- fast tuning overrides (applied to the live Kidneys model before warm-up) ---
// --kf N            override Kidneys.kf
// --water N         override Kidneys.reabsorption_fraction (water)
// --frac na=0.99,k=0.88,...   override individual reabsorption_fractions entries
const Kpre = model.models.Kidneys;
const kfOv = opt("--kf", null);
if (kfOv != null) Kpre.kf = kfOv;
const waterOv = opt("--water", null);
if (waterOv != null) Kpre.reabsorption_fraction = waterOv;
const fracI = argv.indexOf("--frac");
if (fracI >= 0 && argv[fracI + 1]) {
  for (const pair of argv[fracI + 1].split(",")) {
    const [k, v] = pair.split("=");
    if (k && v !== undefined) Kpre.reabsorption_fractions[k] = Number(v);
  }
}

// --- Hormones overrides: --hset key=val,... patch scalar props on the live Hormones model ---
// (e.g. compress a time constant for a quick loop check: --hset aldosterone_tc=60,angiotensin_tc=5)
const H = model.models.Hormones ?? null;
const hsetI = argv.indexOf("--hset");
if (H && hsetI >= 0 && argv[hsetI + 1]) {
  for (const pair of argv[hsetI + 1].split(",")) {
    const [k, v] = pair.split("=");
    if (k && v !== undefined) H[k] = Number(v);
  }
}

// ---------------------------------------------------------------------------
// 5. measurement helpers
// ---------------------------------------------------------------------------
const K = model.models.Kidneys;
const CAP = model.models.KID_CAP;
const URINE = model.models.URINE;
const CIRC = model.models.Circulation ?? null;
const solutes = K.filterable_solutes || [];
const round = (x, n = 3) => Number(x.toFixed(n));
const weight = model.weight;

const SLICE = 0.02; // sample every 20 ms (sub-cardiac-cycle) so pulsatile pressures average cleanly
// cycle-average the renal + circulatory panel over WINDOW seconds and snapshot the hormone state
function measure() {
  const N = Math.round(WINDOW / SLICE);
  const acc = { gfr: 0, urine_flow: 0, fe_na: 0, nfp: 0, cap_pres: 0, aff: 0, tbv: 0, na: 0 };
  const uconc = {};
  for (const s of solutes) uconc[s] = 0;
  for (let i = 0; i < N; i++) {
    send("POST", "calc", SLICE);
    acc.gfr += K.gfr;
    acc.urine_flow += K.urine_flow;
    acc.fe_na += K.fe_na;
    acc.nfp += K.nfp;
    acc.cap_pres += CAP.pres;
    acc.aff += K.afferent_factor;
    acc.tbv += CIRC?.total_blood_volume ?? 0;
    acc.na += CAP.solutes?.na ?? 0;
    for (const s of solutes) uconc[s] += URINE.solutes?.[s] ?? 0;
  }
  for (const k in acc) acc[k] /= N;
  for (const s of solutes) uconc[s] /= N;

  const fe = (s) => round((1 - (K.reabsorption_fractions?.[s] ?? K.reabsorption_fraction)) * (K.reabsorption_factors?.[s] ?? 1) * 100, 2);
  const panel = {
    gfr_mL_min: round(acc.gfr, 2),
    urine_mL_kg_hr: round((acc.urine_flow * 60) / weight, 3),
    nfp_mmHg: round(acc.nfp, 2),
    kid_cap_pres_mmHg: round(acc.cap_pres, 2),
    total_blood_volume_L: round(acc.tbv, 4),
    plasma_na: round(acc.na, 2),
    afferent_factor: round(acc.aff, 3),
    fe_panel_pct: Object.fromEntries(solutes.map((s) => [s, fe(s)])),
  };
  if (H) {
    panel.hormones = {
      angiotensin: round(H.angiotensin, 3),
      aldosterone: round(H.aldosterone, 3),
      adh: round(H.adh, 3),
      renin: round(H.renin, 3),
      svr_factor: round(H.svr_factor, 3),
      efferent_factor: round(H.efferent_factor, 3),
      na_reabs_factor: round(H.na_reabs_factor, 4),
      k_reabs_factor: round(H.k_reabs_factor, 4),
      water_reabs_factor: round(H.water_reabs_factor, 4),
      sensed_perfusion: round(H.sensed_perfusion, 2),
      sensed_volume: round(H.sensed_volume, 4),
      sensed_na: round(H.sensed_na, 2),
    };
  }
  return panel;
}

// ---------------------------------------------------------------------------
// 6. warm-up, baseline measurement, optional perturbation phase
// ---------------------------------------------------------------------------
send("POST", "calc", SECONDS); // synchronous warm-up to steady state
const baseline = measure();

// perturbations: --bleed FRAC removes a volume fraction from every blood compartment (hemorrhage);
// --naload DELTA raises plasma Na on every blood compartment (hyperosmolar). --phase2 S then runs.
const bleed = opt("--bleed", null);
const naload = opt("--naload", null);
const phase2 = opt("--phase2", 0);
let perturbed = null;
if ((bleed != null || naload != null) && phase2 > 0) {
  for (const m of Object.values(model.models)) {
    if (m && typeof m.vol === "number" && m.solutes) {
      if (bleed != null && m.vol > 0) m.vol *= 1 - bleed;
      if (naload != null && m.solutes.na !== undefined) m.solutes.na += naload;
    }
  }
  send("POST", "calc", phase2); // let the loop respond
  perturbed = measure();
}

// ---------------------------------------------------------------------------
// 7. report
// ---------------------------------------------------------------------------
console.log = _log;
const report = {
  scenario,
  weight_kg: weight,
  autoregulation: K.autoregulation_enabled,
  ans_enabled: model.models.Ans?.is_enabled ?? null,
  hormones: H ? { running: H.hormones_running, raas: H.raas_enabled, adh: H.adh_enabled } : null,
  warmup_s: SECONDS,
  window_s: WINDOW,
  baseline,
};
if (perturbed) {
  report.perturbation = { bleed_frac: bleed, na_load: naload, phase2_s: phase2 };
  report.perturbed = perturbed;
}
console.log(JSON.stringify(report, null, 2));
