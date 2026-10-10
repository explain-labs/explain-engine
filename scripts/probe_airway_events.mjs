// Airway events (Ventilator.tube_position / circuit_connected, Respiration.airway_obstructed_left/
// right): right mainstem intubation with resorption atelectasis of the left lung (faster on oxygen)
// and its recruitment after pulling the tube back, accidental extubation and circuit disconnection
// (apnoeic and breathing), a bronchial plug without the ventilator, and switching the ventilator off
// mid-event. Pass/fail checks; see docs/Ventilator.md and docs/Respiration.md.
//
// Usage: node scripts/probe_airway_events.mjs [--scenario term_neonate] [--verbose]
// Exit code 1 when a check fails.

import fs from "node:fs";
import { createEngine } from "./_harness.mjs";

const argv = process.argv.slice(2);
const sopt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const SCENARIO = sopt("--scenario", "term_neonate");
const VERBOSE = argv.includes("--verbose");
const eng = await createEngine();
const log = eng.log;
const def = JSON.parse(fs.readFileSync(new URL(`../model_definitions/${SCENARIO}.json`, import.meta.url), "utf8")).model_definition;

const r = (v, d = 1) => (Number.isFinite(v) ? Number(v.toFixed(d)) : v);
const table = (rows) => { const t = console.log; console.log = log; console.table(rows); console.log = t; };
const checks = [];
const check = (id, ok, note = "") => checks.push({ id, ok: !!ok, note });

function start({ mode = "CMV", spont = false, fio2 = 0.21 } = {}) {
  const m = eng.build(structuredClone(def));
  const M = m.models, V = M.Ventilator;
  if (!spont) M.Breathing.switch_breathing(false);
  V.sle_apply({ mode, pip: 20, peep: 5, rr: 40, ti: 0.4, o2: fio2 * 100 });
  eng.calc(60);
  return { m, M, V, R: M.Respiration };
}
const read = ({ M, V, R }) => ({
  SaO2: r(M.AD.so2), PaCO2: r(M.AD.pco2), Vte: r(V.mon_vte), C: r(V.mon_c, 2), Pcirc: r(V.pres),
  leak: r(V.mon_leak, 0), atel_L: r(R.atelectasis_left, 2), atel_R: r(R.atelectasis_right, 2),
  ALL: r(M.ALL.vol * 1000), ALR: r(M.ALR.vol * 1000),
});
const finite = (row) => Object.values(row).every((v) => typeof v !== "number" || Number.isFinite(v));
const trace = (label, rows) => { if (VERBOSE || true) { log(`\n${label} — ${SCENARIO}`); table(rows); } };

// 1. right mainstem intubation, on air and on oxygen
const rm = {};
for (const fio2 of [0.21, 1.0]) {
  const s = start({ fio2 });
  const rows = [{ phase: "trachea", ...read(s) }];
  s.V.set_tube_position("right_main");
  eng.calc(60); rows.push({ phase: "right main 1 min", ...read(s) });
  eng.calc(540); rows.push({ phase: "right main 10 min", ...read(s) });
  s.V.set_tube_position("trachea");
  eng.calc(60); rows.push({ phase: "pulled back 1 min", ...read(s) });
  s.V.sle_apply({ pip: 28, peep: 8 });
  eng.calc(60); rows.push({ phase: "PIP 28 / PEEP 8 1 min", ...read(s) });
  trace(`Right mainstem, FiO2 ${fio2}`, rows);
  rm[fio2] = rows;
  check(`right main (${fio2}): compliance falls`, rows[1].C < 0.8 * rows[0].C, `${rows[0].C} -> ${rows[1].C}`);
  check(`right main (${fio2}): left lung resorbs`, rows[2].atel_L > 0.1, `atel_L ${rows[2].atel_L}`);
  check(`right main (${fio2}): left bronchus released on pull-back`, !s.R.airway_obstructed_left && !s.M.DS_ALL.no_flow);
  check(`right main (${fio2}): recruitment after pull-back`, rows[4].atel_L < rows[3].atel_L - 0.05, `${rows[3].atel_L} -> ${rows[4].atel_L}`);
  check(`right main (${fio2}): all finite`, rows.every(finite));
}
check("right main: resorption faster on oxygen", rm[1.0][2].atel_L > rm[0.21][2].atel_L + 0.1, `${rm[0.21][2].atel_L} vs ${rm[1.0][2].atel_L}`);

// 2. accidental extubation: breathing (PTV) and apnoeic (CMV)
for (const spont of [true, false]) {
  const s = start({ mode: spont ? "PTV" : "CMV", spont });
  const rows = [{ phase: "intubated", ...read(s) }];
  s.V.set_tube_position("extubated");
  eng.calc(60); rows.push({ phase: "extubated 1 min", ...read(s) });
  s.V.set_tube_position("trachea");
  eng.calc(120); rows.push({ phase: "re-intubated 2 min", ...read(s) });
  trace(`Extubation, ${spont ? "breathing (PTV)" : "apnoeic (CMV)"}`, rows);
  const tag = spont ? "breathing" : "apnoeic";
  check(`extubated (${tag}): Vte ~0`, rows[1].Vte < 2, `Vte ${rows[1].Vte}`);
  if (spont) check("extubated (breathing): patient keeps oxygenating", rows[1].SaO2 > 85, `SaO2 ${rows[1].SaO2}`);
  else check("extubated (apnoeic): desaturates", rows[1].SaO2 < 80, `SaO2 ${rows[1].SaO2}`);
  check(`re-intubated (${tag}): Vte restored`, rows[2].Vte > 0.85 * rows[0].Vte, `${rows[0].Vte} -> ${rows[2].Vte}`);
  check(`re-intubated (${tag}): SaO2 recovers`, rows[2].SaO2 > 93, `SaO2 ${rows[2].SaO2}`);
  check(`re-intubated (${tag}): tube routing restored`, s.M.VENT_ETTUBE.comp_from === "VENT_GASCIRCUIT" && s.M.VENT_ETTUBE.comp_to === "DS" && s.M.MOUTH_DS.no_flow);
  check(`extubation (${tag}): all finite`, rows.every(finite));
}

// 3. circuit disconnection: apnoeic (CMV) and breathing (PTV)
for (const spont of [false, true]) {
  const s = start({ mode: spont ? "PTV" : "CMV", spont });
  const rows = [{ phase: "connected", ...read(s) }];
  s.V.set_circuit_connected(false);
  eng.calc(30); rows.push({ phase: "disconnected 30 s", ...read(s) });
  s.V.set_circuit_connected(true);
  eng.calc(90); rows.push({ phase: "reconnected 90 s", ...read(s) });
  trace(`Disconnection, ${spont ? "breathing (PTV)" : "apnoeic (CMV)"}`, rows);
  const tag = spont ? "breathing" : "apnoeic";
  check(`disconnected (${tag}): circuit pressure ~0`, rows[1].Pcirc < 4, `Pcirc ${rows[1].Pcirc}`);
  if (!spont) check("disconnected (apnoeic): desaturates", rows[1].SaO2 < rows[0].SaO2 - 5, `${rows[0].SaO2} -> ${rows[1].SaO2}`);
  else check("disconnected (breathing): own breaths through the tube", rows[1].SaO2 > 85, `SaO2 ${rows[1].SaO2}`);
  check(`reconnected (${tag}): recovers`, rows[2].SaO2 > 93 && rows[2].Vte > 0.85 * rows[0].Vte, `SaO2 ${rows[2].SaO2}, Vte ${rows[2].Vte}`);
  check(`reconnected (${tag}): Y-piece closed, tube from the circuit`, s.M.VENT_DISCONNECT.no_flow && s.M.VENT_ETTUBE.comp_from === "VENT_GASCIRCUIT");
  check(`disconnection (${tag}): all finite`, rows.every(finite));
}

// 4. bronchial plug without the ventilator (spontaneous, room air)
{
  const m = eng.build(structuredClone(def));
  const M = m.models, R = M.Respiration, V = M.Ventilator;
  eng.calc(60);
  const s = { M, V, R };
  const rows = [{ phase: "breathing", ...read(s) }];
  R.set_airway_obstructed_right(true);
  eng.calc(300); rows.push({ phase: "plug R 5 min", ...read(s) });
  R.set_airway_obstructed_right(false);
  eng.calc(60); rows.push({ phase: "plug cleared 1 min", ...read(s) });
  trace("Bronchial plug R, breathing, no ventilator", rows);
  check("plug R: right lung resorbs, left untouched", rows[1].atel_R > 0.05 && rows[1].atel_L === 0, `atel_R ${rows[1].atel_R}`);
  check("plug R: SaO2 falls", rows[1].SaO2 < rows[0].SaO2 - 2, `${rows[0].SaO2} -> ${rows[1].SaO2}`);
  check("plug R: trapped lung deflates, no pressure build-up", rows[1].ALR < rows[0].ALR && M.ALR.pres_in < 15 / 1.36, `ALR ${rows[0].ALR} -> ${rows[1].ALR}`);
  check("plug cleared: airway open", !M.DS_ALR.no_flow);
  check("plug: all finite", rows.every(finite));
}

// 5. switching the ventilator off mid-event ends the events
{
  const s = start();
  s.V.set_tube_position("right_main");
  s.V.set_circuit_connected(false);
  eng.calc(5);
  s.V.sle_apply({ mode: "Standby" });
  eng.calc(1);
  check("standby ends the events", s.V.tube_position === "trachea" && s.V.circuit_connected && !s.R.airway_obstructed_left
    && !s.M.DS_ALL.no_flow && s.M.VENT_DISCONNECT.no_flow && s.M.VENT_ETTUBE.comp_from === "VENT_GASCIRCUIT");
}

// 6. a plug set before the tube slips survives pulling the tube back
{
  const s = start();
  s.R.set_airway_obstructed_left(true);
  s.V.set_tube_position("right_main");
  s.V.set_tube_position("trachea");
  check("independent plug L survives the tube going back", s.R.airway_obstructed_left && s.M.DS_ALL.no_flow);
}

table(checks);
const failed = checks.filter((c) => !c.ok);
log(failed.length ? `${failed.length} check(s) FAILED` : "all checks passed");
process.exit(failed.length ? 1 : 0);
