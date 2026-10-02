// Probe the patient builder (scripts/build_patient.mjs) end to end: run it on a few SPECs,
// reload each emitted scenario in a fresh engine, and check that what the build_report claims
// is what the reloaded patient actually does.
//
// Usage:
//   node scripts/probe_build_patient.mjs            all cases (each build takes about a minute)
//   node scripts/probe_build_patient.mjs fio2       only cases whose name contains "fio2"
//
// Checks per case:
//   - the builder exits 0 and emits a scenario with a build_report
//   - every calibrated target the report calls `within` is still within tolerance after reload
//   - unknown targets are listed under ignored_targets
//   - with targets.fio2: the reloaded scenario carries that FiO2, and the same patient put in
//     room air desaturates (i.e. the oxygen lever was fitted AT the given FiO2)
//   - with sys/dia: the derived pulse pressure (and MAP, when not given) are in the report
//   - with pda_mm: the reloaded duct has that diameter at its pulmonary end
//   - with fo_mm: the reloaded foramen ovale has that diameter
//   - with ef and co: ef is reported as superseded by co (same lever)
//   - with only structural targets: the patient is still emitted, with measured vitals and a note
//   - with an SpO2 out of diffusion's reach on high FiO2: the shunt is opened and noted
//   - with a raised PAP: the intrapulmonary shunt fraction stays near the seed's
//   - with solutes: each one is reported, read back within 3 % of what was set, and holds after
//     reload (lactate and glucose have their own controllers, which must have been moved with them)
// Levers that ended on a bound are printed as notes.
// Exits 1 if any check fails.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createEngine } from "./_harness.mjs";
import { measureVitals } from "./_probe.mjs";

// createEngine() silences console.log (engine chatter); keep our own handle to stdout
const print = console.log.bind(console);

const BUILDER = fileURLToPath(new URL("./build_patient.mjs", import.meta.url));
const READKEY = { co: "lvo", spo2: "spo2_pre" };

const CASES = [
  {
    name: "term_room_air",
    spec: { baseline: "term_neonate", name: "probe_term", targets: { hr: 140, map: 48, spo2: 96, pco2: 42, be: -1 } },
  },
  {
    name: "preterm_fio2",
    spec: {
      baseline: "term_neonate", name: "probe_preterm_fio2", max_iters: 10,
      targets: { weight: 1.08, gestational_age: 28, hr: 158, map: 34, spo2: 91, pco2: 51, be: -4.5, hb: 9.0, fio2: 0.3, not_a_target: 1 },
    },
    expectIgnored: ["not_a_target"],
  },
  {
    // MAP derived from sys/dia; pulse pressure and respiratory rate calibrated
    name: "term_bp_rr",
    spec: { baseline: "term_neonate", name: "probe_term_bp_rr", targets: { hr: 140, sys: 68, dia: 40, spo2: 96, pco2: 42, rr: 52 } },
    expectDerived: { pp: 28, map: 49.3 },
  },
  {
    // lactic acidosis with measured electrolytes: the BE target is fitted by the unmeasured
    // anions left over after Na/K/Cl/lactate/albumin
    name: "term_lactate_electrolytes",
    spec: {
      baseline: "term_neonate", name: "probe_term_lact",
      targets: { hr: 150, map: 45, spo2: 95, pco2: 40, be: -7, na: 134, k: 4.8, cl: 104, lactate: 4.5, glucose: 3.2, albumin: 24 },
    },
    expectSolutes: true,
  },
  {
    // echo inputs: a measured duct diameter and a TR-jet systolic PA pressure
    name: "preterm_echo",
    spec: {
      baseline: "term_neonate", name: "probe_preterm_echo", max_iters: 10,
      targets: { weight: 1.08, gestational_age: 28, hr: 158, map: 34, spo2: 91, pco2: 51, be: -4.5, pda_mm: 2.2, pap_s: 32 },
    },
    expectPdaMm: 2.2,
  },
  {
    // echo inputs: a measured foramen ovale and a poor LV ejection fraction
    name: "term_echo_fo_ef",
    spec: {
      baseline: "term_neonate", name: "probe_term_fo_ef",
      targets: { hr: 145, map: 45, spo2: 95, ef: 42, fo_mm: 3 },
    },
    expectFoMm: 3,
  },
  {
    // co and ef share the contractility lever: co keeps it and ef is reported as superseded
    name: "term_co_ef",
    spec: { baseline: "term_neonate", name: "probe_term_co_ef", targets: { hr: 145, map: 45, co: 0.6, ef: 42 } },
    expectSuperseded: [{ key: "ef", by: "co" }],
  },
  {
    // an SpO2 below what lung diffusion alone can reach on 40 % oxygen: the oxygen lever must
    // continue into the intrapulmonary shunt
    name: "preterm_high_fio2_shunt",
    spec: {
      baseline: "term_neonate", name: "probe_preterm_shunt", max_iters: 10,
      targets: { weight: 1.08, gestational_age: 28, hr: 158, map: 34, spo2: 85, pco2: 51, be: -4.5, fio2: 0.4 },
    },
    expectNote: /intrapulmonary shunt was opened/,
  },
  {
    // a raised pulmonary pressure: the PAP lever moves the intrapulmonary shunt with the bed, so
    // the shunt's share of pulmonary flow stays near the seed's (33 % here; 46 % when it did not)
    name: "preterm_raised_pap",
    spec: {
      baseline: "term_neonate", name: "probe_preterm_pap", max_iters: 10,
      targets: { weight: 1.08, gestational_age: 28, hr: 158, map: 34, pco2: 51, be: -4.5, fio2: 0.3, pap_s: 36 },
    },
    expectMaxShuntFraction: 0.37,
  },
  {
    // structural targets only: nothing to iterate, but the patient is settled, measured and emitted
    name: "structural_only",
    spec: { baseline: "term_neonate", name: "probe_structural", targets: { weight: 1.35, gestational_age: 30 } },
    expectNote: /no iterated targets/,
    expectNoTargets: true,
  },
];

const only = process.argv[2];
let failures = 0;
const check = (ok, label) => {
  print(`    ${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failures++;
};

for (const c of CASES) {
  if (only && !c.name.includes(only)) continue;
  print(`\n${c.name}`);
  const t0 = Date.now();
  const proc = spawnSync(process.execPath, [BUILDER], { input: JSON.stringify(c.spec), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  check(proc.status === 0, `builder exit 0 (${Math.round((Date.now() - t0) / 1000)} s)`);
  if (proc.status !== 0) {
    print(proc.stderr.split("\n").slice(-4).join("\n"));
    continue;
  }
  const scenario = JSON.parse(proc.stdout);
  const report = scenario.build_report;
  check(!!report && report.version === 1, "scenario carries build_report v1");
  if (!report) continue;
  print(`    ${report.converged ? "CONVERGED" : "INCOMPLETE"} after ${report.iters} iter` +
    report.targets.filter((t) => t.lever_at_bound).map((t) => ` — ${t.key}: lever at bound`).join(""));
  check(scenario.provenance === "calibrator-fitted", "provenance is calibrator-fitted");
  for (const k of c.expectIgnored ?? []) check(report.ignored_targets.includes(k), `unknown target "${k}" reported as ignored`);
  if (c.expectNote) check(report.notes?.some((n) => c.expectNote.test(n)), `note matching ${c.expectNote}`);
  if (c.expectNoTargets) check(report.targets.length === 0 && typeof report.measured?.map?.value === "number", "no calibrated targets, vitals measured");
  for (const s of c.expectSuperseded ?? []) check(report.superseded_targets?.some((x) => x.key === s.key && x.by === s.by), `${s.key} reported as superseded by ${s.by}`);
  for (const [k, v] of Object.entries(c.expectDerived ?? {})) check(report.derived_targets?.[k] === v, `derived target ${k} = ${v}`);
  for (const t of report.targets.filter((t) => t.lever_at_bound)) {
    const atHi = Math.abs(t.lever_value - t.lever_bounds[1]) < 1e-9;
    print(`    note ${t.key}: ${t.lever} at its ${atHi ? "upper" : "lower"} bound (${t.within ? "target reached" : "target missed"})`);
  }

  // reload in a fresh engine: the saved state must reproduce the reported operating point
  const eng = await createEngine();
  const model = eng.build(scenario.model_definition);
  eng.calc(120);
  const v = measureVitals(model, eng.send, { window: 12 });
  v.pp = v.sys - v.dia;
  for (const t of report.targets) {
    if (!t.within) continue;
    const got = v[READKEY[t.key] ?? t.key];
    // allow a little drift on top of the tolerance: reload restarts from the saved state
    check(Math.abs(got - t.target) <= t.tolerance * 1.5, `${t.key} after reload ${got.toFixed(2)} (target ${t.target} ± ${t.tolerance})`);
  }

  if (c.expectSolutes) {
    const KEY = { na: "na", k: "k", cl: "cl", lactate: "lact", glucose: "glucose", albumin: "albumin" };
    for (const [k, sk] of Object.entries(KEY)) {
      const want = c.spec.targets[k];
      if (want == null) continue;
      const rep = report.solutes?.[k];
      check(!!rep && Math.abs(rep.value - want) <= 0.03 * want, `${k} in report ${rep?.value} (set ${want})`);
      const got = model.models.AA.solutes[sk];
      check(Math.abs(got - want) <= 0.03 * want, `${k} after reload ${got.toFixed(2)} (set ${want})`);
    }
    print(`    note unmeasured anions (uma) ${model.models.AA.solutes.uma.toFixed(2)} after reload`);
  }

  if (c.expectPdaMm != null) {
    const P = model.models.Pda;
    const d = P.diameter_relative * P.diameter_pa_max;
    check(Math.abs(d - c.expectPdaMm) < 1e-6, `duct ${d.toFixed(2)} mm after reload (set ${c.expectPdaMm})`);
    check(report.structural.pda_mm === c.expectPdaMm, "pda_mm listed as structural");
    print(`    note ductal shunt ${(v.q_da * 60000).toFixed(0)} mL/min (+ = left-to-right)`);
  }

  if (c.expectFoMm != null) {
    check(model.models.Shunts.diameter_fo === c.expectFoMm, `foramen ovale ${model.models.Shunts.diameter_fo} mm after reload (set ${c.expectFoMm})`);
    check(report.structural.fo_mm === c.expectFoMm, "fo_mm listed as structural");
    print(`    note foramen ovale shunt ${(v.q_fo * 60000).toFixed(0)} mL/min (+ = left-to-right), LV EF ${v.ef.toFixed(1)} %`);
  }

  if (c.expectMaxShuntFraction != null) {
    const M = model.models;
    let ips = 0, cap = 0;
    for (let i = 0; i < 300; i++) { eng.send("POST", "calc", 0.02); ips += M.IPSL.flow + M.IPSR.flow; cap += M.LL_CAP.flow + M.RL_CAP.flow; }
    const sf = ips / (ips + cap);
    check(sf <= c.expectMaxShuntFraction, `intrapulmonary shunt fraction ${(sf * 100).toFixed(1)} % (at most ${c.expectMaxShuntFraction * 100} %)`);
  }

  if (c.spec.targets.fio2 != null) {
    const sites = ["OUT", "MOUTH"].filter((n) => model.models[n]);
    check(Math.abs(model.models.Gas.fio2 - c.spec.targets.fio2) < 1e-9, `reloaded Gas.fio2 is ${c.spec.targets.fio2}`);
    const onOxygen = v.spo2_pre;
    model.models.Gas.set_fio2(0.21, sites);
    eng.calc(180);
    const roomAir = measureVitals(model, eng.send, { window: 12 }).spo2_pre;
    // the size of the drop depends on where the oxygen lever ends up (and lung uptake is flat
    // above ~1.5x), so only require a clear fall, not a particular amount
    check(roomAir < onOxygen - 2, `desaturates in room air: SpO2 ${onOxygen.toFixed(1)} -> ${roomAir.toFixed(1)}`);
  }
}

print(failures ? `\n${failures} check(s) FAILED` : "\nall checks passed");
process.exit(failures ? 1 : 0);
