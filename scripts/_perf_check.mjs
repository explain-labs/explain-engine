// Performance benchmark + physiological-equivalence check for engine optimisations.
//
//   node scripts/_perf_check.mjs --save  <file.json>   measure and store a baseline
//   node scripts/_perf_check.mjs --check <file.json>   measure and compare against a baseline
//   node scripts/_perf_check.mjs --bench               benchmark only
//   options: --scenario term_neonate  --seconds 30 (benchmark span)  --cases rest,hypoxia,...
//
// Benchmark: wall time for --seconds of simulated time on the scenario (after a 5 s warm-up),
// median of 3 runs in one process (JIT warm).
// Equivalence: cycle-averaged vitals and blood gases (scripts/_probe.mjs measureVitals) at rest and
// in a set of challenges that exercise the dynamic paths (hypoxia, apnoea, drug infusion,
// ventilation, ECLS). --check reports, per case, the largest relative deviation over the vitals and
// the absolute deviation of the blood gases, against the acceptance limits of the performance work:
// vitals within 0.1 % and blood gases within 0.1 mmHg / 0.002 pH of the baseline.
import fs from "node:fs";
import { createEngine } from "./_harness.mjs";
import { measureVitals } from "./_probe.mjs";

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const SCENARIO = opt("--scenario", "term_neonate");
const SECONDS = Number(opt("--seconds", 30));
const SAVE = opt("--save", null);
const CHECK = opt("--check", null);
const BENCH_ONLY = argv.includes("--bench");
const REL_LIMIT = 0.001; // 0.1 %
const GAS_LIMIT = { pco2: 0.1, po2: 0.1, ph: 0.002 };
const GAS_KEYS = new Set(Object.keys(GAS_LIMIT));

const out = (...a) => process.stderr.write(a.join(" ") + "\n");
const json = JSON.parse(fs.readFileSync(new URL(`../model_definitions/${SCENARIO}.json`, import.meta.url), "utf8"));
const def = json.model_definition || json;
const eng = await createEngine();
const build = () => eng.build(structuredClone(def));

// challenges: each sets the patient up, then runs `settle` seconds before the vitals are measured
const CASES = {
  rest: { settle: 60, setup: () => {} },
  hypoxia: { settle: 60, setup: (M) => M.Gas.set_fio2(0.12) },
  apnoea: { settle: 30, setup: (M) => M.Breathing.switch_breathing(false) },
  adrenaline: { settle: 60, setup: (M) => M.Drugs.set_infusion("adrenaline", 0.5) },
  ventilated: { settle: 60, setup: (M) => M.Ventilator.sle_apply({ mode: "PTV" }) },
  ecls: { settle: 60, setup: (M) => { M.Ecls.ecls_clamped = false; M.Ecls.ecls_running = true; M.Ecls.pump_rpm = 3000; } },
};
const caseNames = opt("--cases", Object.keys(CASES).join(",")).split(",");

function bench() {
  const times = [];
  for (let i = 0; i < 3; i++) {
    build();
    eng.calc(5);
    const t = performance.now();
    eng.calc(SECONDS);
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  return times[1] / 1000;
}

function measure() {
  const res = {};
  for (const name of caseNames) {
    const model = build();
    CASES[name].setup(model.models);
    eng.calc(CASES[name].settle);
    res[name] = measureVitals(model, eng.send, { window: 10 });
  }
  return res;
}

const wall = bench();
out(`benchmark ${SCENARIO}: ${SECONDS} s simulated in ${wall.toFixed(2)} s wall (${(SECONDS / wall).toFixed(2)}x realtime)`);
if (BENCH_ONLY) process.exit(0);

const vitals = measure();
if (SAVE) {
  fs.writeFileSync(SAVE, JSON.stringify({ scenario: SCENARIO, wall, seconds: SECONDS, vitals }, null, 1));
  out(`baseline saved to ${SAVE}`);
}
if (CHECK) {
  const base = JSON.parse(fs.readFileSync(CHECK, "utf8"));
  out(`speed-up vs baseline: ${(base.wall / wall).toFixed(2)}x (${base.wall.toFixed(2)} -> ${wall.toFixed(2)} s)`);
  let ok = true;
  for (const name of caseNames) {
    const a = base.vitals[name], b = vitals[name];
    if (!a) { out(`  ${name}: not in baseline`); continue; }
    let worst = { k: "", rel: 0 }; const gas = [];
    for (const k of Object.keys(a)) {
      if (typeof a[k] !== "number" || typeof b[k] !== "number") continue;
      if (GAS_KEYS.has(k)) {
        const d = Math.abs(b[k] - a[k]);
        if (d > GAS_LIMIT[k]) { ok = false; gas.push(`${k} ${a[k].toFixed(3)}->${b[k].toFixed(3)} FAIL`); }
        else gas.push(`${k} ${d.toFixed(3)}`);
        continue;
      }
      const scale = Math.max(Math.abs(a[k]), 1e-6);
      // ductal/FO flows near zero are judged on an absolute scale (1e-5 L/s), not relative
      const rel = (k === "q_da" || k === "q_fo") ? Math.abs(b[k] - a[k]) / Math.max(scale, 1e-2) : Math.abs(b[k] - a[k]) / scale;
      if (rel > worst.rel) worst = { k, rel, a: a[k], b: b[k] };
    }
    const pass = worst.rel <= REL_LIMIT;
    if (!pass) ok = false;
    out(`  ${name.padEnd(11)} worst ${worst.k || "-"} ${(worst.rel * 100).toFixed(4)} %${worst.k ? ` (${worst.a.toFixed(3)} -> ${worst.b.toFixed(3)})` : ""} ${pass ? "ok" : "FAIL"} | gases: ${gas.join(", ")}`);
  }
  out(ok ? "EQUIVALENT within limits" : "NOT EQUIVALENT");
  process.exit(ok ? 0 : 1);
}
