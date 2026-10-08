// Respiratory validation suite: a pass/fail gate for the breathing, lung mechanics, gas exchange and
// ventilator interaction, checked against clinical ranges per patient class (scripts/_resp_targets.mjs).
//
// Per scenario, each case is built fresh from the scenario file:
//   base      spontaneous steady state: RR, Vt/kg, MV/kg, PaCO2, pH, SpO2, pleural swing
//   co2       chemoreflex: cut the ventilatory drive (minute_volume_ref_factor 0.7), measure how much
//             the achieved ventilation recovers per mmHg PaCO2 rise
//   res_load  lower-airway resistance x3
//   stiff     lung elastance x2
//   cpap      intubated, CPAP 5
//   ps        intubated, PS 10 above PEEP 5 (also counts triggering)
//   flowtrig  as ps, with a flow trigger instead of the volume trigger (0.6 L/min; 0.3 below 2 kg,
//             where clinicians set the most sensitive setting that doesn't auto-trigger) and 5 %
//             termination: in a short-time-constant (RDS) lung 30 % ends the breath well inside the
//             neural inspiration and the ongoing effort triggers a second breath (double triggering)
//   simv      SIMV at half the spontaneous rate, PS 5, flow trigger, 5 % termination: the mandatory rate holds and
//             the efforts between mandatory breaths are supported
//   apnea     drive off: no muscle effort
//   cstat     drive off, PC 15/5 with a 0.2 s pause: static compliance per kg
//   hfov      (preterm class only) PaCO2·DCO2 over f = 8/10/12 Hz and an amplitude step
//
// Volumes are measured at the lungs (ALL + ALR swing per breath) and the pleural swing on THORAX, so
// the checks do not depend on how Breathing or the Ventilator measure tidal volume themselves.
//
// Usage:
//   node scripts/validate_respiratory.mjs [scenario ...] [--json] [--quick] [--only case,case]
//   (default scenarios: preterm_28wk term_neonate adult_female, run in parallel child processes)
// Exit code 1 when a check fails that is not in KNOWN_FAILURES.

import fs from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { TARGETS, RESPONSE_TARGETS, KNOWN_FAILURES, classify } from "./_resp_targets.mjs";

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const optStr = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const QUICK = flag("--quick");
const ONLY = optStr("--only")?.split(",");
const CHILD = optStr("--child");
const scenarios = argv.filter((a, i) => !a.startsWith("-") && !(argv[i - 1] ?? "").startsWith("--"));
const DEFAULT_SCENARIOS = ["preterm_28wk", "term_neonate", "adult_female"];

const MMHG_TO_CMH2O = 1.35951;
const SETTLE = QUICK ? 60 : 120;   // s after a change before measuring
const SLOW = QUICK ? 120 : 240;    // s for changes that move PaCO2 (body CO2 stores)
const WINDOW = 20;                 // s measured
const SLICE = 0.01;                // s per sample

if (CHILD) await runChild(CHILD);
else await runParent(scenarios.length ? scenarios : DEFAULT_SCENARIOS);

// ---------------------------------------------------------------------------------------------
// child: run every case on one scenario and print the metrics as JSON on stdout

async function runChild(scenario) {
  const { createEngine } = await import("./_harness.mjs");
  const eng = await createEngine();
  const json = JSON.parse(fs.readFileSync(new URL(`../model_definitions/${scenario}.json`, import.meta.url), "utf8"));
  const def = json.model_definition || json;
  const cls = classify(scenario, def);
  const out = { scenario, cls, weight: def.weight, cases: {} };
  const want = (c) => !ONLY || ONLY.includes(c);

  // a fresh deep copy per case: the engine keeps references into the definition and mutates them
  const build = () => eng.build(structuredClone(def));

  // per-breath statistics over WINDOW seconds of spontaneous breathing
  function spont(m) {
    const B = m.models.Breathing, T = m.models.THORAX, AA = m.models.AA, Mon = m.models.Monitor;
    const lungs = ["ALL", "ALR"].map((n) => m.models[n]).filter(Boolean);
    const breaths = [];
    let cur = null, prevNcc = B.ncc_insp, t = 0;
    const starts = [];
    const gas = { paco2: 0, pao2: 0, ph: 0, spo2: 0 };
    const n = Math.round(WINDOW / SLICE);
    for (let i = 0; i < n; i++) {
      eng.calc(SLICE);
      const v = lungs.reduce((s, l) => s + l.vol, 0);
      const p = T.pres;
      t += SLICE;
      if (B.ncc_insp < prevNcc) { // a new breath started
        starts.push(t);
        if (cur) breaths.push(cur);
        cur = { vmin: v, vmax: v, pmin: p, pmax: p };
      } else if (cur) {
        cur.vmin = Math.min(cur.vmin, v); cur.vmax = Math.max(cur.vmax, v);
        cur.pmin = Math.min(cur.pmin, p); cur.pmax = Math.max(cur.pmax, p);
      }
      prevNcc = B.ncc_insp;
      gas.paco2 += AA.pco2; gas.pao2 += AA.po2; gas.ph += AA.ph; gas.spo2 += Mon?.sao2_pre ?? AA.so2 ?? 0;
    }
    for (const k in gas) gas[k] /= n;
    const mean = (f) => (breaths.length ? breaths.reduce((s, b) => s + f(b), 0) / breaths.length : 0);
    const vt = mean((b) => b.vmax - b.vmin) * 1000; // mL
    // rate from the breath start times (a count over the window is quantized to 60/WINDOW)
    const rr = starts.length > 1 ? ((starts.length - 1) / (starts.at(-1) - starts[0])) * 60 : 0;
    return {
      ...gas, rr, vt, vt_kg: vt / def.weight, mv_kg: (vt * rr) / 1000 / def.weight,
      ppl_swing: mean((b) => b.pmax - b.pmin) * MMHG_TO_CMH2O, breaths: breaths.length,
      mv_ans: m.models.Breathing.mv_ans_factor, finite: Number.isFinite(vt) && Number.isFinite(gas.paco2),
    };
  }

  // inspiratory (demand) flow limit: about 1 L/kg/min for infants, 60 L/min for an adult
  const flow = def.weight > 20 ? 60 : Math.max(8, Math.round(def.weight * 3));
  const intubate = (m, setup) => {
    const V = m.models.Ventilator;
    V.switch_ventilator(true);
    setup(V);
    return V;
  };

  if (want("base") || want("co2") || want("res_load") || want("stiff")) {
    const m = build();
    eng.calc(SETTLE);
    out.cases.base = spont(m);
  }
  if (want("co2")) {
    const m = build();
    m.models.Breathing.minute_volume_ref_factor = 0.7;
    eng.calc(SLOW);
    out.cases.co2 = spont(m);
  }
  if (want("res_load")) {
    const m = build();
    m.models.Respiration.res_lower_airways_factor = 3.0;
    eng.calc(SLOW);
    out.cases.res_load = spont(m);
  }
  if (want("stiff")) {
    const m = build();
    m.models.Respiration.el_lungs_factor = 2.0;
    eng.calc(SLOW);
    out.cases.stiff = spont(m);
  }
  if (want("cpap") || want("ps")) {
    // reference for the support cases: intubated on CPAP 5
    const m = build();
    intubate(m, (V) => V.set_cpap(5, flow));
    eng.calc(SLOW);
    out.cases.cpap = spont(m);
  }
  // efforts outside ventilator inspiration and how the ventilator answered them (same counting as
  // probe_ventilator_trigger.mjs, at step resolution): triggered = patient-triggered breaths (SIMV
  // synchronised + supported), mandatory = time-cycled breaths
  const countBreaths = (m, V, seconds = WINDOW) => {
    const B = m.models.Breathing, dt = m.modeling_stepsize;
    const n = { efforts: 0, blocked: 0, triggered: 0, supported: 0, mandatory: 0 };
    let prevInsp = V._inspiration;
    for (let i = 0; i < Math.round(seconds / dt); i++) {
      eng.calc(dt);
      if (B.ncc_insp === 1) { n.efforts++; if (V._trigger_blocked) n.blocked++; }
      // breaths count from the first effort in the window on, so an effort that started just before
      // it can't leave a triggered breath without its effort (a one-breath edge effect)
      if (!prevInsp && V._inspiration && n.efforts > 0) {
        if (V._ps_breath) n.supported++;
        if (V.triggered_breath && !V._mandatory_breath) n.triggered++;
        else n.mandatory++;
      }
      prevInsp = V._inspiration;
    }
    n.trigger_frac = n.efforts > n.blocked ? n.triggered / (n.efforts - n.blocked) : 0;
    return n;
  };
  // Ti max at the patient's own inspiratory time, as set clinically; a longer one over-assists and
  // the patient's next effort falls in the ventilator's expiration (ineffective efforts)
  const ownTi = (m) => (m.models.Breathing.ie_ratio * 60) / Math.max(m.models.Breathing.resp_rate, 1);
  if (want("ps")) {
    const m = build();
    const V = intubate(m, (V) => V.set_psv(15, 5, 10, ownTi(m), flow));
    eng.calc(SLOW - 2 * WINDOW);
    const n = countBreaths(m, V);
    out.cases.ps = { ...spont(m), trigger_frac: n.trigger_frac };
  }
  if (want("flowtrig")) {
    const m = build();
    const V = intubate(m, (V) => {
      V.set_psv(15, 5, 10, ownTi(m), flow);
      V.trigger_mode = "flow";
      V.trigger_flow = def.weight < 2 ? 0.3 : 0.6;
      V.term_sens_perc = 5;
    });
    eng.calc(SETTLE);
    out.cases.flowtrig = { trigger_frac: countBreaths(m, V).trigger_frac };
  }
  if (want("simv")) {
    const m = build();
    const rate = Math.max(5, Math.round(m.models.Breathing.resp_rate / 2));
    const V = intubate(m, (V) => {
      V.set_pc(15, 5, rate, ownTi(m), flow);
      V.vent_mode = "SIMV";
      V.ps_cmh2o = 5;
      V.trigger_mode = "flow";
      V.trigger_flow = def.weight < 2 ? 0.3 : 0.6;
      V.term_sens_perc = 5; // as in flowtrig
    });
    eng.calc(SETTLE);
    // a minute, so the count covers enough windows at an adult's low rate
    const n = countBreaths(m, V, 60);
    // every window gets exactly one synchronised or mandatory breath; the rest are supported
    const windows = rate;
    out.cases.simv = {
      rate, ...n,
      window_breath_ratio: (n.triggered - n.supported + n.mandatory) / windows,
      // efforts left after the synchronised window breaths (each takes one effort; a mandatory,
      // untriggered window breath takes none). Efforts that start inside a ventilator breath stay in:
      // with a flow trigger they can still trigger once that breath ends
      supported_frac:
        n.efforts - (n.triggered - n.supported) > 0
          ? n.supported / (n.efforts - (n.triggered - n.supported))
          : NaN,
    };
  }
  if (want("apnea")) {
    const m = build();
    m.models.Breathing.switch_breathing(false);
    eng.calc(10);
    // pleural swing with the drive off: only cardiac and residual effects, no muscle
    const T = m.models.THORAX;
    let pmin = Infinity, pmax = -Infinity;
    for (let i = 0; i < Math.round(5 / SLICE); i++) {
      eng.calc(SLICE);
      pmin = Math.min(pmin, T.pres); pmax = Math.max(pmax, T.pres);
    }
    out.cases.apnea = { effort: (pmax - pmin) * MMHG_TO_CMH2O, rmp: m.models.Breathing.resp_muscle_pressure };
  }
  if (want("cstat")) {
    const m = build();
    m.models.Breathing.switch_breathing(false);
    const adult = def.weight > 20;
    const V = intubate(m, (V) => { V.set_pc(15, 5, adult ? 12 : 30, adult ? 1.2 : 0.6, adult ? 60 : 12); V.set_pause(0.2); });
    eng.calc(SETTLE);
    out.cases.cstat = {
      cstat_kg: (V.compliance_static ?? 0) / def.weight, cdyn_kg: (V.compliance_dynamic ?? 0) / def.weight,
      vt_kg: (V.exp_tidal_volume * 1000) / def.weight, raw: V.resistance,
    };
  }
  if (cls === "preterm" && want("hfov")) {
    const hf = (freq, amp) => {
      const m = build();
      m.models.Breathing.switch_breathing(false);
      const V = intubate(m, (V) => { V.set_ettube_diameter(2.5); V.set_fio2(0.4); V.set_hfov(10, amp, freq, 0.33, 10); });
      eng.calc(QUICK ? 180 : 300);
      return { freq, amp, vt: V.hfo_tidal_volume * 1000, dco2: V.hfo_dco2, paco2: m.models.AA.pco2 };
    };
    const runs = [hf(8, 20), hf(10, 20), hf(12, 20), hf(10, 30)];
    const prod = runs.slice(0, 3).map((r) => r.paco2 * r.dco2);
    const mean = prod.reduce((a, b) => a + b, 0) / prod.length;
    out.cases.hfov = {
      runs, spread: (Math.max(...prod) - Math.min(...prod)) / mean,
      amp_paco2_falls: runs[3].paco2 < runs[1].paco2 ? 1 : 0,
    };
  }
  process.stdout.write(JSON.stringify(out));
}

// ---------------------------------------------------------------------------------------------
// parent: run each scenario in a child process, evaluate, print

async function runParent(list) {
  const self = fileURLToPath(import.meta.url);
  const passthrough = argv.filter((a, i) => a.startsWith("--") ? a !== "--json" : (argv[i - 1] ?? "").startsWith("--") && argv[i - 1] !== "--json");
  const results = await Promise.all(list.map((s) => new Promise((resolve) => {
    const p = spawn(process.execPath, [self, "--child", s, ...passthrough], { stdio: ["ignore", "pipe", "inherit"] });
    let buf = "";
    p.stdout.on("data", (d) => (buf += d));
    p.on("close", (code) => {
      try { resolve(JSON.parse(buf)); } catch { resolve({ scenario: s, error: `child exited ${code}` }); }
    });
  })));

  const checks = results.flatMap(evaluate);
  if (flag("--json")) {
    process.stdout.write(JSON.stringify({ results, checks }, null, 1) + "\n");
  } else {
    print(results, checks);
  }
  if (checks.some((c) => c.status === "FAIL") || results.some((r) => r.error)) process.exitCode = 1;
}

function evaluate(r) {
  if (r.error) return [{ scenario: r.scenario, id: "run", value: null, range: null, status: "FAIL", note: r.error }];
  const t = TARGETS[r.cls], R = RESPONSE_TARGETS, c = r.cases, out = [];
  const add = (id, value, range) => {
    if (value === undefined) return;
    const inRange = Number.isFinite(value) && (range[0] == null || value >= range[0]) && (range[1] == null || value <= range[1]);
    const known = KNOWN_FAILURES[`${r.cls}.${id}`] ?? KNOWN_FAILURES[`*.${id}`];
    const status = inRange ? (known ? "XPASS" : "PASS") : known ? "XFAIL" : "FAIL";
    out.push({ scenario: r.scenario, cls: r.cls, id, value, range, status, note: known ?? "" });
  };
  const b = c.base;
  if (b) {
    for (const k of ["rr", "vt_kg", "mv_kg", "paco2", "ph", "spo2", "ppl_swing"]) add(`base.${k}`, b[k], t[k]);
  }
  if (b && c.co2) {
    const mvRatio = (c.co2.vt * c.co2.rr) / (0.7 * b.vt * b.rr); // achieved / what the cut alone gives
    const dp = c.co2.paco2 - b.paco2;
    add("co2.gain", dp > 0.2 ? (mvRatio - 1) / dp : NaN, t.co2_gain);
  }
  if (b && c.res_load) {
    add("res_load.paco2_rise", c.res_load.paco2 - b.paco2, R.res_load_paco2_rise);
    add("res_load.vt_ratio", c.res_load.vt / b.vt, R.res_load_vt_ratio);
  }
  if (b && c.stiff) {
    add("stiff.vt_ratio", c.stiff.vt / b.vt, R.stiff_vt_ratio);
    add("stiff.rr_ratio", c.stiff.rr / b.rr, R.stiff_rr_ratio);
    add("stiff.paco2_rise", c.stiff.paco2 - b.paco2, R.stiff_paco2_rise);
  }
  if (b && c.cpap) {
    add("cpap.vt_ratio", c.cpap.vt / b.vt, R.cpap_vt_ratio);
    add("cpap.paco2_delta", c.cpap.paco2 - b.paco2, R.cpap_paco2_delta);
  }
  if (c.cpap && c.ps) {
    add("ps.vt_ratio", c.ps.vt / c.cpap.vt, R.ps_vt_ratio);
    add("ps.ppl_swing_ratio", c.ps.ppl_swing / c.cpap.ppl_swing, R.ps_ppl_swing_ratio);
    add("ps.paco2_delta", c.ps.paco2 - c.cpap.paco2, R.ps_paco2_delta);
    add("ps.trigger_frac", c.ps.trigger_frac, R.ps_trigger_frac);
  }
  if (c.flowtrig) add("flowtrig.trigger_frac", c.flowtrig.trigger_frac, R.flowtrig_trigger_frac);
  if (c.simv) {
    add("simv.window_breath_ratio", c.simv.window_breath_ratio, R.simv_window_breath_ratio);
    add("simv.supported_frac", c.simv.supported_frac, R.simv_supported_frac);
  }
  if (c.apnea) add("apnea.muscle", Math.abs(c.apnea.rmp), R.apnea_effort);
  if (c.cstat) add("cstat.cstat_kg", c.cstat.cstat_kg, t.cstat_kg);
  if (c.hfov) {
    add("hfov.paco2_dco2_spread", c.hfov.spread, R.hfov_paco2_dco2_spread);
    add("hfov.amp_paco2_falls", c.hfov.amp_paco2_falls, R.hfov_amp_paco2_falls);
  }
  return out;
}

function print(results, checks) {
  const f = (x, n = 2) => (typeof x === "number" && Number.isFinite(x) ? x.toFixed(n) : String(x));
  const rng = (r) => (r ? `${r[0] ?? ""}..${r[1] ?? ""}` : "");
  for (const r of results) {
    console.log(`\n== ${r.scenario} (${r.cls ?? "?"}, ${r.weight ?? "?"} kg) ==`);
    if (r.error) { console.log(`  ERROR ${r.error}`); continue; }
    const rows = ["case      RR    Vt mL  Vt/kg  MV/kg  PaCO2  PaO2    pH  SpO2  Ppl swing"];
    for (const [k, v] of Object.entries(r.cases)) {
      if (v.vt === undefined || v.rr === undefined) continue;
      rows.push(`${k.padEnd(8)}${f(v.rr, 1).padStart(5)}${f(v.vt, 1).padStart(9)}${f(v.vt_kg).padStart(7)}${f(v.mv_kg, 3).padStart(7)}` +
        `${f(v.paco2, 1).padStart(7)}${f(v.pao2, 0).padStart(6)}${f(v.ph, 3).padStart(7)}${f(v.spo2, 1).padStart(6)}${f(v.ppl_swing, 1).padStart(10)}`);
    }
    console.log(rows.map((l) => "  " + l).join("\n"));
    if (r.cases.cstat) console.log(`  cstat   Cstat ${f(r.cases.cstat.cstat_kg)} mL/cmH2O/kg, Cdyn ${f(r.cases.cstat.cdyn_kg)}, Vt ${f(r.cases.cstat.vt_kg)} mL/kg at PC 15/5`);
    if (r.cases.hfov) console.log(`  hfov    ${r.cases.hfov.runs.map((h) => `f${h.freq}/A${h.amp}: PaCO2 ${f(h.paco2, 1)} DCO2 ${f(h.dco2, 0)}`).join(" | ")}`);
    console.log("");
    for (const c of checks.filter((c) => c.scenario === r.scenario)) {
      console.log(`  ${c.status.padEnd(6)} ${c.id.padEnd(24)} ${f(c.value, 3).padStart(9)}  [${rng(c.range)}]${c.note ? "  " + c.note : ""}`);
    }
  }
  const count = (s) => checks.filter((c) => c.status === s).length;
  console.log(`\n${count("PASS")} pass, ${count("FAIL")} fail, ${count("XFAIL")} known failures, ${count("XPASS")} known failures now passing\n`);
}
