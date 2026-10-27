// SLE6000 OxyGenie (closed-loop O2): pass/fail checks of the controller on the SLE6000 in CMV. A
// hyperoxic term neonate at 60 % is weaned to air, a manual override delivers the user's O2 for
// 30 s and resumes without a jump, a detached probe holds the O2 for 60 s and then drifts towards
// the reference O2, and the interlocks (O2 Boost, SpO2 monitoring, Standby) hold. See
// docs/Sle6000.md#oxygenie. Takes a few minutes (about 30 simulated minutes).
//
// Usage: node scripts/probe_oxygenie.mjs [--verbose]
// Exit code 1 when a check fails.

import fs from "node:fs";
import { createEngine } from "./_harness.mjs";

const VERBOSE = process.argv.includes("--verbose");
const eng = await createEngine();
const log = eng.log;
const load = (name) => JSON.parse(fs.readFileSync(new URL(`../model_definitions/${name}.json`, import.meta.url), "utf8")).model_definition;
const TERM = load("term_neonate_72h");

const checks = [];
const check = (id, value, lo, hi, note = "") => {
  const ok = Number.isFinite(value) && value >= lo && value <= hi;
  checks.push({ id, value, lo, hi, ok, note });
};

// a fresh, apnoeic patient on CMV at `o2`, settled for 3 minutes
function start(def, o2, pip = 20) {
  const m = eng.build(structuredClone(def));
  m.models.Breathing.switch_breathing(false);
  const V = m.models.Ventilator;
  V.sle_apply({ mode: "CMV", rr: 40, ti: 0.4, peep: 5, pip, o2 });
  eng.calc(180);
  return { m, V };
}

// run `seconds`, tracking the preductal saturation and printing a trace with --verbose
function run(m, V, seconds, label) {
  let lo = 101, hi = 0;
  for (let t = 1; t <= seconds; t++) {
    eng.calc(1);
    lo = Math.min(lo, m.models.AA.so2);
    hi = Math.max(hi, m.models.AA.so2);
    if (VERBOSE && t % 60 === 0) log(`  ${label} ${t}s ${V.oxy_state} SpO2 ${V.mon_spo2?.toFixed(1)} O2 ${V.sle_o2} ref ${V.oxy_ref_o2.toFixed(1)}`);
  }
  return { lo, hi };
}

// 1. hyperoxia: a healthy term neonate at 60 % is weaned to air without dropping below the range
{
  const { m, V } = start(TERM, 60);
  V.sle_oxygenie(true);
  const r = run(m, V, 540, "wean");
  check("weaned to air within 9 min (O2 %)", V.sle_o2, 21, 23);
  check("SpO2 stays above the range while weaning", r.lo, 95, 101);
  check("delivered FiO2 follows the O2 control", V.fio2 * 100, V.sle_o2 - 0.01, V.sle_o2 + 0.01);
}

// 2. manual override: touching O2 delivers the set O2 for 30 s, then Auto resumes from it
{
  const { m, V } = start(TERM, 40);
  V.sle_oxygenie(true);
  eng.calc(30);
  V.sle_set("o2", 50);
  eng.calc(1);
  check("override: state", V.oxy_state === "override" ? 1 : 0, 1, 1);
  check("override: delivers the set O2 (%)", V.fio2 * 100, 49.9, 50.1);
  eng.calc(27);
  check("override: still on at 28 s (%)", V.fio2 * 100, 49.9, 50.1);
  eng.calc(3);
  check("override: Auto after 30 s", V.oxy_state === "auto" ? 1 : 0, 1, 1);
  // one Auto step after the override at SpO2 ~100 %: the Severinghaus-weighted integral unwinds
  // ~4 % a second; without the bumpless restart the O2 would drop at once to the pre-override ~35 %
  check("override: resumes without a jump (O2 %)", V.sle_o2, 44, 50.5);
  const last = V.sle_o2;
  V.sle_oxygenie(false);
  eng.calc(5);
  check("off: O2 keeps the last value (%)", V.fio2 * 100, last - 0.01, last + 0.01);
}

// 3. fallback: no SpO2 holds the O2 for 60 s, then (last reading above the range) moves it slowly
// down towards the reference O2; a valid reading resumes Auto
{
  const { m, V } = start(TERM, 40);
  V.sle_oxygenie(true); // reference O2 40 %
  eng.calc(2);
  V.sle_set("o2", 60); // override at 60 %, above the reference
  V.set_spo2_probe(false);
  eng.calc(31);
  check("probe off: waiting for signal", V.oxy_state === "fallback" ? 1 : 0, 1, 1);
  check("probe off: no SpO2 shown", V.mon_spo2 === null ? 1 : 0, 1, 1);
  eng.calc(55);
  check("fallback: O2 held for 60 s (%)", V.sle_o2, 59.9, 60.1);
  eng.calc(125);
  check("fallback: then down towards the reference (%)", V.sle_o2, 55, 58);
  V.set_spo2_probe(true);
  eng.calc(2);
  check("probe back: Auto", V.oxy_state === "auto" ? 1 : 0, 1, 1);
}

// 4. interlocks
{
  const { m, V } = start(TERM, 30);
  V.sle_oxygenie(true);
  V.sle_o2_boost(true);
  check("O2 Boost refused while OxyGenie is on", V.o2_boost_remaining, 0, 0);
  V.sle_set_spo2({ target: "94-98" });
  check("target range changed (midpoint)", V._oxy_target().mid, 96, 96);
  V.sle_set_spo2({ on: false });
  check("SpO2 monitoring off switches OxyGenie off", V.oxy_state === "off" ? 1 : 0, 1, 1);
  V.sle_oxygenie(true);
  check("OxyGenie unavailable without SpO2 monitoring", V.oxy_state === "off" ? 1 : 0, 1, 1);
  V.sle_set_spo2({ on: true });
  eng.calc(2);
  V.sle_oxygenie(true);
  V.sle_standby();
  check("Standby switches OxyGenie off", V.oxy_state === "off" ? 1 : 0, 1, 1);
  V.sle_oxygenie(true);
  check("OxyGenie unavailable in Standby", V.oxy_state === "off" ? 1 : 0, 1, 1);
}

const f = (x) => (typeof x === "number" ? x.toFixed(3) : String(x));
for (const c of checks) log(`  ${c.ok ? "PASS" : "FAIL"}  ${c.id.padEnd(48)} ${f(c.value).padStart(9)}  [${c.lo}..${c.hi}]${c.note ? "  " + c.note : ""}`);
const failed = checks.filter((c) => !c.ok).length;
log(`\n${checks.length - failed} pass, ${failed} fail`);
if (failed) process.exitCode = 1;
