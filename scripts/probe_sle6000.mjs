// SLE6000 device model: pass/fail checks of the phase-1 modes on term_neonate (CPAP, CMV, PTV,
// PSV, SIMV with VTV), the phase-2 oscillatory modes (HFOV with VTV, sighs and oscillation pause;
// HFOV+CMV), the settings validation, the monitored values and the patient monitor's RR. See
// docs/Sle6000.md.
//
// Usage: node scripts/probe_sle6000.mjs [--verbose]
// Exit code 1 when a check fails.

import fs from "node:fs";
import { createEngine } from "./_harness.mjs";

const VERBOSE = process.argv.includes("--verbose");
const eng = await createEngine();
const log = eng.log;
const json = JSON.parse(fs.readFileSync(new URL("../model_definitions/term_neonate.json", import.meta.url), "utf8"));
const def = json.model_definition;

const checks = [];
const check = (id, value, lo, hi, note = "") => {
  const ok = Number.isFinite(value) && value >= lo && value <= hi;
  checks.push({ id, value, lo, hi, ok, note });
};

// a fresh patient per case, the SLE started with `settings`
function start(settings, setup = null) {
  const m = eng.build(structuredClone(def));
  if (setup) setup(m);
  const V = m.models.Ventilator;
  V.sle_apply(settings);
  return { m, V, B: m.models.Breathing };
}

// count breaths over `seconds` at step resolution
function count(m, V, seconds) {
  const B = m.models.Breathing, dt = m.modeling_stepsize;
  const n = { efforts: 0, blocked: 0, triggered: 0, mandatory: 0, supported: 0, ti_max: 0 };
  let prev = V._inspiration;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    eng.calc(dt);
    if (B.ncc_insp === 1) { n.efforts++; if (V._trigger_blocked) n.blocked++; }
    // a breath counts once an effort has been seen in the window, so a breath triggered by an
    // effort just before the window doesn't count without its effort (window-edge artefact)
    if (!prev && V._inspiration && (n.efforts > 0 || !B.breathing_enabled)) {
      if (V._ps_breath) n.supported++;
      if (V.triggered_breath && !V._mandatory_breath) n.triggered++;
      else n.mandatory++;
    }
    if (prev && !V._inspiration) n.ti_max = Math.max(n.ti_max, V.ti_meas);
    prev = V._inspiration;
  }
  n.trigger_frac = n.efforts > n.blocked ? n.triggered / (n.efforts - n.blocked) : 0;
  return n;
}

// 1. settings validation: ranges, resolutions, interlocks, parameter memory
{
  const m = eng.build(structuredClone(def));
  const V = m.models.Ventilator;
  check("standby at load", V.is_enabled ? 1 : 0, 0, 0);
  V.sle_apply({ mode: "CMV", pip: 99, peep: 7.3, rr: 60, ti: 2.0, rise: 1.0 });
  check("PIP clamped to 65", V.sle_pip, 65, 65);
  check("PEEP 7.3 -> 7.5 (0.5 below 10)", V.sle_peep, 7.5, 7.5);
  check("Ti <= 60/RR - 0.1 at RR 60", V.sle_ti, 0, 0.9 + 1e-9);
  check("rise <= Ti", V.sle_rise, 0, V.sle_ti + 1e-9);
  V.sle_apply({ mode: "CPAP", peep: 6 });
  V.sle_apply({ mode: "CMV" });
  check("CPAP level carries over as PEEP", V.sle_peep, 6, 6);
  V.sle_apply({ mode: "CMV", vtv: 4.33 });
  check("VTV 4.33 -> 4.4 (0.2 below 10 ml)", V.sle_vtv, 4.4, 4.4);
  V.sle_apply({ mode: "Standby" });
  check("standby switches off", V.is_enabled ? 1 : 0, 0, 0);
}

// 2. CMV 20/5, RR 40, Ti 0.4: delivered pressures and timing
{
  const { m, V } = start({ mode: "CMV", rr: 40, ti: 0.4, peep: 5, pip: 20 }, (m) => m.models.Breathing.switch_breathing(false));
  eng.calc(70); // Vmin sums the expired volume of the last minute
  check("CMV PIP (mbar)", V.mon_pip, 19, 21);
  check("CMV PEEP (mbar)", V.mon_peep, 4.5, 5.5);
  check("CMV Ti (s)", V.mon_ti, 0.38, 0.42);
  check("CMV RR (BPM)", V.mon_rr, 39, 41);
  check("CMV MAP between PEEP and PIP", V.mon_map, 5.5, 19);
  check("CMV Vmin = RR x Vte (l/min)", V.mon_vmin / ((V.mon_rr * V.mon_vte) / 1000), 0.9, 1.1);
  check("CMV C (ml/mbar)", V.mon_c, 0.5, 20);
  check("CMV R (mbar/l/s)", V.mon_r, 10, 400);
  check("CMV O2 monitor at 21 %", V.mon_o2, 20, 22);
  if (VERBOSE) log({ pip: V.mon_pip, peep: V.mon_peep, map: V.mon_map, vte: V.mon_vte, vmin: V.mon_vmin, c: V.mon_c, r: V.mon_r, c20c: V.mon_c20c, ie: V.mon_ie, leak: V.mon_leak, fg: V.mon_fg_flow });
}

// 3. PTV: every effort triggers a breath (flow trigger 0.6 l/min)
{
  const { m, V } = start({ mode: "PTV", rr: 30, ti: 0.35, peep: 5, pip: 15, trig_sens: 0.6 });
  eng.calc(40);
  const n = count(m, V, 30);
  check("PTV trigger fraction", n.trigger_frac, 0.95, 1.0);
  check("PTV no backup breaths while breathing", n.mandatory, 0, 1);
  check("PTV Trig/min = RR", V.mon_trig / V.mon_rr, 0.9, 1.1);
}

// 4. PSV: flow-cycled at Term Sens; a higher Term Sens ends breaths earlier
{
  const ti = {};
  for (const term of [5, 50]) {
    const { m, V } = start({ mode: "PSV", rr: 10, ti: 1.0, peep: 5, pip: 15, term_sens: term });
    eng.calc(40);
    const n = count(m, V, 30);
    if (term === 5) check("PSV trigger fraction", n.trigger_frac, 0.95, 1.0);
    ti[term] = V.mon_ti;
  }
  check("PSV Ti shorter at Term Sens 50 than 5", ti[5] - ti[50], 0.05, 1.0, `Ti ${ti[5].toFixed(2)} vs ${ti[50].toFixed(2)} s`);
  check("PSV flow-cycled before Ti Max", ti[5], 0.1, 0.99);
}

// 5. SIMV RR 20 + P Support 10: one mandatory/synchronised breath per window, efforts supported
{
  const { m, V } = start({ mode: "SIMV", rr: 20, ti: 0.35, peep: 5, pip: 15, p_support: 10 });
  eng.calc(40);
  const n = count(m, V, 60);
  check("SIMV window breaths per minute", n.triggered - n.supported + n.mandatory, 19, 21);
  check("SIMV supported breaths", n.supported, 1, 1000);
  check("SIMV P Support delivered (mbar above PEEP)", V.ps_cmh2o / 1.01972, 4.9, 5.1);
}

// 6. VTV in CMV: converges to the target within 20 breaths; off restores the set PIP
{
  const { m, V } = start({ mode: "CMV", rr: 40, ti: 0.35, peep: 5, pip: 25 }, (m) => m.models.Breathing.switch_breathing(false));
  eng.calc(10);
  V.sle_apply({ vtv: 15 });
  eng.calc(30); // 20 breaths at RR 40
  check("VTV Vte within 10 % of 15 ml", V.exp_tidal_volume * 1000, 13.5, 16.5);
  check("VTV working PIP below PIP Max", V.pip_delivered / 1.01972, 6, 25);
  V.sle_apply({ vtv: 0 });
  eng.calc(5);
  check("VTV off restores the set PIP (mbar)", V.mon_pip, 24, 26);
}

// 7. CPAP with backup: apnoea gives backup breaths at the set rate
{
  const { m, V } = start({ mode: "CPAP", peep: 5, pip: 15, ti: 0.35, rr_backup: 30 }, (m) => m.models.Breathing.switch_breathing(false));
  eng.calc(20);
  const n = count(m, V, 60);
  check("CPAP backup rate at apnoea (BPM)", n.mandatory, 29, 31);
}

// 8. O2 Boost: +10 % for 2 minutes, then back
{
  const { m, V } = start({ mode: "CMV", o2: 30 });
  V.sle_o2_boost(true);
  eng.calc(60);
  check("O2 Boost delivers set + 10 %", V.fio2 * 100, 39.5, 40.5);
  check("O2 monitor follows within 60 s", V.mon_o2, 38, 40.5);
  eng.calc(70);
  check("O2 Boost ends after 2 minutes", V.fio2 * 100, 29.5, 30.5);
}

// 9. 15 mm circuit: more compliant circuit, lower expiratory resistance
{
  const { m, V } = start({ mode: "CMV", circuit: 15 });
  check("15 mm circuit compliance (ml/cmH2O)", 1000 / (m.models.VENT_GASCIRCUIT.el_base * 1.35951), 1.0, 1.1);
}

// 9b. PV-loop shape (CMV 14/4, Rise 0.1, breathing off): the 12 ms pressure response rounds the
// corners as on a reference loop of a healthy 3.5 kg neonate (~26 % in at 90 % of PIP, ~84 % left
// when the pressure is back at PEEP + 10 %)
{
  const { m, V } = start({ mode: "CMV", pip: 14 / 1.01972, peep: 4 / 1.01972, rr: 40, ti: 0.4, rise: 0.1 }, (m) => m.models.Breathing.switch_breathing(false));
  eng.calc(30);
  const dt = m.modeling_stepsize, pts = [];
  let prev = V._inspiration, started = false;
  for (let i = 0; i < 4 / dt; i++) {
    eng.calc(dt);
    if (!prev && V._inspiration) { if (started) break; started = true; }
    prev = V._inspiration;
    if (started) pts.push([V.pres, V.vol]);
  }
  const vt = Math.max(...pts.map((p) => p[1]));
  const pip = Math.max(...pts.map((p) => p[0])), peep = pts.at(-1)[0];
  const iR = pts.findIndex((p) => p[0] >= peep + 0.9 * (pip - peep));
  const iMax = pts.findIndex((p) => p[1] === vt);
  const iF = pts.findIndex((p, i) => i > iMax && p[0] <= peep + 0.1 * (pip - peep));
  check("PV loop: volume in at 90 % of PIP (%)", (100 * pts[iR][1]) / vt, 18, 35);
  check("PV loop: volume left back at PEEP + 10 % (%)", (100 * pts[iF][1]) / vt, 75, 90);
  check("scenario starts with Rise 0.1 s", V.sle_rise, 0.1, 0.1);
}

// 10. HFOV: MAP, ΔP, frequency and I:E delivered; VTV; settings
{
  const { m, V } = start({ mode: "HFOV", map: 10, dp: 20, freq: 10, ie: 1 }, (m) => m.models.Breathing.switch_breathing(false));
  eng.calc(30);
  check("HFOV MAP (mbar)", V.mon_map, 9.5, 10.5);
  check("HFOV measured ΔP (mbar)", V.mon_dp, 18, 22);
  check("HFOV frequency (Hz)", V.mon_freq, 10, 10);
  check("HFOV DCO2 = f·Vte² (ml²/s)", V.mon_dco2 / (10 * V.mon_vte * V.mon_vte), 0.8, 1.2);
  // I:E 1:1 -> 1:2: the inspiratory part of the cycle shrinks, so the positive swing grows
  const swing = () => {
    let hi = -Infinity, lo = Infinity;
    for (let i = 0; i < 400; i++) { eng.calc(m.modeling_stepsize); hi = Math.max(hi, V.pres); lo = Math.min(lo, V.pres); }
    return (hi - 10 * 1.01972) / (hi - lo);
  };
  const up11 = swing();
  V.sle_set("ie", 2);
  eng.calc(5);
  const up12 = swing();
  check("I:E 1:2 moves the swing above MAP (fraction)", up12 - up11, 0.1, 0.3, "1:1 0.5 of the swing, 1:2 two thirds");
  V.sle_set("hfo_vtv", 2.0);
  eng.calc(15);
  check("HFO VTV Vte within 10 % of 2.0 ml", V.mon_vte, 1.8, 2.2);
  check("HFO VTV working ΔP below ΔP Max (mbar)", V.hfo_amplitude_delivered / 1.01972, 4, 20);
  V.sle_set("hfo_vtv", 0);
  eng.calc(5);
  check("HFO VTV off restores the set ΔP (mbar)", V.mon_dp, 18, 22);
  V.sle_apply({ freq: 25, dp: 3, map: 50 });
  check("frequency clamped to 20 Hz", V.sle_freq, 20, 20);
  check("ΔP clamped to 4 mbar", V.sle_dp, 4, 4);
  check("MAP clamped to 45 mbar", V.sle_map, 45, 45);
}

// 11. HFOV sighs and oscillation pause
{
  const { m, V } = start({ mode: "HFOV", map: 10, dp: 20, sigh_p: 18, sigh_ti: 1.0 }, (m) => m.models.Breathing.switch_breathing(false));
  eng.calc(10);
  V.sle_sigh();
  let t = 0, p = 0;
  while (V.hfo_sigh_remaining > 0 && t < 5) { eng.calc(0.01); t += 0.01; if (Math.abs(t - 0.8) < 0.005) p = V.pres / 1.01972; }
  check("Sigh lasts Sigh Ti (s)", t, 0.98, 1.03);
  check("Sigh holds Sigh P (mbar)", p, 17, 19);
  V.sle_osc_pause();
  eng.calc(10);
  check("Oscillation Pause holds MAP (mbar)", V.pres / 1.01972, 9.5, 10.5);
  check("Oscillation Pause counts down from 60 s", V.hfo_pause_remaining, 49, 51);
  V.sle_osc_pause();
  eng.calc(1);
  check("Oscillation Pause cancelled by a second press", V.hfo_pause_remaining, 0, 0);
  V.sle_apply({ sigh_rr: 6 });
  let n = 0, was = false;
  for (let i = 0; i < 6000; i++) { eng.calc(0.01); const on = V.hfo_sigh_remaining > 0; if (on && !was) n++; was = on; }
  check("Sigh RR 6 gives 6 sighs a minute", n, 6, 6);
  V.sle_apply({ map: 20 });
  check("MAP above Sigh P drags Sigh P up", V.sle_sigh_p, 20, 20);
  V.sle_apply({ sigh_p: 45 });
  check("Sigh P at most MAP + 15", V.sle_sigh_p, 35, 35);
  V.sle_apply({ sigh_rr: 150 });
  check("Sigh RR limited by Sigh Ti", V.sle_sigh_rr, 1, 60 / (V.sle_sigh_ti + 0.1) + 1e-9);
}

// 12. HFOV+CMV: CMV breaths at RR with the oscillation in both phases or in expiration only
{
  const { m, V } = start({ mode: "HFOV+CMV", rr: 30, ti: 0.4, peep: 5, pip: 18, dp: 10, freq: 10 }, (m) => m.models.Breathing.switch_breathing(false));
  eng.calc(20);
  const phases = () => {
    const ins = [], exs = [];
    for (let i = 0; i < 2000; i++) {
      eng.calc(0.01);
      if (V._inspiration && V._insp_time_counter > 0.2 && V._insp_time_counter < 0.35) ins.push(V.pres);
      if (V._expiration && V._te_counter > 0.5) exs.push(V.pres);
    }
    const sw = (a) => Math.max(...a) - Math.min(...a);
    return [sw(ins), sw(exs)];
  };
  check("HFOV+CMV rate (BPM)", V.mon_rr, 29, 31);
  const [i1, e1] = phases();
  check("HFOV+CMV oscillates in inspiration (cmH2O)", i1, 8, 12);
  check("HFOV+CMV oscillates in expiration (cmH2O)", e1, 8, 12);
  V.sle_set("hfo_activity", 1);
  const [i2] = phases();
  check("HFO Activity Exp: no oscillation in inspiration", i2, 0, 0.5);
  check("HFOV+CMV MAP is the breath mean (mbar)", V.mon_map, 6.5, 8.5);
  check("HFOV+CMV measured ΔP is the oscillation, not the breath (mbar)", V.mon_dp, 8, 12);
  check("HFOV+CMV PIP is the breath peak (mbar)", V.mon_pip, 18, 24);
  V.sle_manual_breath();
  check("Manual breath accepted in HFOV+CMV", V._manual_breath || V._inspiration ? 1 : 0, 1, 1);
  V.sle_apply({ mode: "CMV" });
  eng.calc(20);
  check("back to CMV keeps the conventional settings (PIP)", V.sle_pip, 18, 18);
  check("back to CMV ventilates (Vte ml)", V.mon_vte, 20, 60);
}

// 13. patient monitor RR: a patient-triggered breath is one breath (the effort and the ventilator
// breath it starts are not counted twice); asynchronous efforts in CMV add to the rate; apnoea decays
{
  const { m, V, B } = start({ mode: "PTV", rr: 30, ti: 0.35, peep: 4, pip: 15 });
  const Mo = m.models.Monitor;
  eng.calc(120);
  check("Monitor RR = SLE RR in PTV (BPM)", Mo.resp_rate, V.mon_rr * 0.9, V.mon_rr * 1.1);
  V.sle_apply({ mode: "PSV" });
  eng.calc(60);
  check("Monitor RR = SLE RR in PSV (BPM)", Mo.resp_rate, V.mon_rr * 0.9, V.mon_rr * 1.1);
  V.sle_apply({ mode: "SIMV", p_support: 10 });
  eng.calc(60);
  check("Monitor RR = efforts in SIMV (BPM)", Mo.resp_rate, B.resp_rate * 0.9, B.resp_rate * 1.1);
  V.sle_apply({ mode: "CMV" });
  eng.calc(60);
  check("Monitor RR in CMV: RR + asynchronous efforts", Mo.resp_rate, V.vent_rate, V.vent_rate + B.resp_rate);
  V.sle_apply({ mode: "CPAP" });
  eng.calc(60);
  check("Monitor RR = SLE RR in CPAP (BPM)", Mo.resp_rate, V.mon_rr * 0.9, V.mon_rr * 1.1);
  V.sle_standby();
  B.switch_breathing(false);
  eng.calc(60);
  check("Monitor RR decays in apnoea (BPM)", Mo.resp_rate, 0, 10);
}

const f = (x) => (typeof x === "number" ? x.toFixed(3) : String(x));
for (const c of checks) log(`  ${c.ok ? "PASS" : "FAIL"}  ${c.id.padEnd(44)} ${f(c.value).padStart(9)}  [${c.lo}..${c.hi}]${c.note ? "  " + c.note : ""}`);
const failed = checks.filter((c) => !c.ok).length;
log(`\n${checks.length - failed} pass, ${failed} fail`);
if (failed) process.exitCode = 1;
