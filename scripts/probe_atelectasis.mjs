// Atelectasis (Respiration.atelectasis_left/right): sweeps the collapsed fraction of one lung with
// recruitment off (static effect) and reports oxygenation, ventilation, the lung's shunt share and
// its aerated volume, spontaneously breathing and on the SLE6000 in CMV (where Vte and the dynamic
// compliance fall at a fixed PIP). Then traces recruitment: opening with PIP and an HFOV sigh,
// holding with PEEP, re-collapsing without it, and no response when recruitable is off. Also checks
// that a set-and-clear round trip restores the persistent factors. See docs/Respiration.md.
//
// Usage: node scripts/probe_atelectasis.mjs [--scenario term_neonate] [--side right] [--verbose]
// Exit code 1 when a check fails.

import fs from "node:fs";
import { createEngine } from "./_harness.mjs";

const argv = process.argv.slice(2);
const sopt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const SCENARIO = sopt("--scenario", "term_neonate");
const SIDE = sopt("--side", "right");
const eng = await createEngine();
const log = eng.log;
const def = JSON.parse(fs.readFileSync(new URL(`../model_definitions/${SCENARIO}.json`, import.meta.url), "utf8")).model_definition;

const L = SIDE === "left" ? { alv: "ALL", ips: "IPSL", cap: "LL_ART_LL_CAP" } : { alv: "ALR", ips: "IPSR", cap: "RL_ART_RL_CAP" };
const r = (v, d = 1) => Number(v.toFixed(d));
// console.table goes through the silenced console.log, so print through the harness's log
const table = (rows) => { const t = console.log; console.log = log; console.table(rows); console.log = t; };

function measure(m, vent, seconds = 20) {
  const M = m.models, V = M.Ventilator, dt = 0.1;
  const a = { so2: 0, po2: 0, pco2: 0, ips: 0, cap: 0, vol: 0, ips_all: 0, cap_all: 0 };
  let n = 0;
  for (let i = 0; i < seconds / dt; i++) {
    eng.calc(dt); n++;
    a.so2 += M.AD.so2; a.po2 += M.AD.po2; a.pco2 += M.AD.pco2;
    a.ips += M[L.ips].flow; a.cap += M[L.cap].flow; a.vol += M[L.alv].vol;
    a.ips_all += M.IPSL.flow + M.IPSR.flow; a.cap_all += M.LL_ART_LL_CAP.flow + M.RL_ART_RL_CAP.flow;
  }
  for (const k in a) a[k] /= n;
  return {
    SaO2: r(a.so2), PaO2: r(a.po2), PaCO2: r(a.pco2),
    "lung Qs %": r(100 * a.ips / (a.ips + a.cap), 0), "Qs/Qt %": r(100 * a.ips_all / (a.ips_all + a.cap_all), 0),
    [`${L.alv} ml`]: r(a.vol * 1000), Vt: vent ? r(V.mon_vte) : r(M.Breathing.exp_tidal_volume * 1000),
    ...(vent ? { "C ml/mbar": r(V.mon_c, 2) } : { RR: r(M.Breathing.resp_rate, 0) }),
  };
}

function sweep(label, ventilated) {
  const rows = [];
  for (const c of [0, 0.3, 0.6, 0.9]) {
    const m = eng.build(structuredClone(def));
    if (m.models.Ans) m.models.Ans.is_enabled = false;
    m.models.Respiration.atelectasis_recruitable = false; // the static effect of a fixed collapse
    if (ventilated) {
      m.models.Breathing.switch_breathing(false);
      m.models.Ventilator.sle_apply({ mode: "CMV", pip: 20, peep: 5, rr: 40, ti: 0.4 });
    }
    eng.calc(60);
    m.models.Respiration[`set_atelectasis_${SIDE}`](c);
    eng.calc(120);
    rows.push({ collapse: c, ...measure(m, ventilated) });
  }
  log(`\n${label} — ${SCENARIO}, ${SIDE} lung`);
  table(rows);
  return rows;
}

const checks = [];
const check = (id, ok, note = "") => checks.push({ id, ok, note });
const mono = (rows, k, dir) => rows.every((x, i) => i === 0 || (dir < 0 ? x[k] <= rows[i - 1][k] : x[k] >= rows[i - 1][k]));

const spont = sweep("Spontaneous breathing", false);
check("spont: SaO2 falls with collapse", mono(spont, "SaO2", -1));
check("spont: lung shunt share rises", mono(spont, "lung Qs %", +1));
check("spont: aerated volume falls", mono(spont, `${L.alv} ml`, -1));

const vent = sweep("SLE6000 CMV 20/5 x40", true);
check("vent: Vte falls at fixed PIP", mono(vent, "Vt", -1));
check("vent: dynamic compliance falls", mono(vent, "C ml/mbar", -1));
check("vent: SaO2 falls", mono(vent, "SaO2", -1));

// recruitment trace: right/left lung c = 0.6 on a ventilated patient
function recruitment() {
  const m = eng.build(structuredClone(def));
  const M = m.models, V = M.Ventilator, R = M.Respiration;
  if (M.Ans) M.Ans.is_enabled = false;
  M.Breathing.switch_breathing(false);
  V.sle_apply({ mode: "CMV", pip: 20, peep: 5, rr: 40, ti: 0.4 });
  eng.calc(60);
  R[`set_atelectasis_${SIDE}`](0.6);
  const rows = [];
  const c = () => R[`atelectasis_${SIDE}`];
  const phase = (label, seconds, action = null) => {
    if (action) action();
    eng.calc(Math.max(seconds - 20, 0));
    rows.push({ phase: label, ...measure(m, V.sle_mode !== "Standby", Math.min(seconds, 20)), collapse: r(c(), 3) });
  };
  phase("1 CMV 20/5, c set 0.6", 120);
  phase("2 PIP 28 / PEEP 8", 60, () => V.sle_apply({ pip: 28, peep: 8 }));
  phase("3 PIP 20 / PEEP 8 holds", 120, () => V.sle_apply({ pip: 20 }));
  phase("4 PEEP 5", 180, () => V.sle_apply({ peep: 5 }));
  phase("5 PEEP 2", 180, () => V.sle_apply({ peep: 2 }));
  phase("6 HFOV MAP 12", 60, () => V.sle_apply({ mode: "HFOV", map: 12, dp: 20, freq: 10, ie: 1, sigh_p: 27, sigh_ti: 3 }));
  phase("7 + 5 sighs 27 x 3 s", 40, () => { for (let i = 0; i < 5; i++) { V.sle_sigh(); eng.calc(4); } });
  phase("8 standby, spontaneous", 180, () => { V.sle_apply({ mode: "Standby" }); M.Breathing.switch_breathing(true); });
  log(`\nRecruitment — ${SCENARIO}, ${SIDE} lung`);
  table(rows);
  return rows;
}
const rec = recruitment();
const cc = (i) => rec[i].collapse;
check("rec: holds on CMV 20/5 (little drift)", cc(0) > 0.5, `c ${cc(0)}`);
check("rec: PIP 28 / PEEP 8 recruits", cc(1) < cc(0) - 0.2, `c ${cc(0)} -> ${cc(1)}`);
check("rec: PEEP 8 holds it open", Math.abs(cc(2) - cc(1)) < 0.05, `c ${cc(2)}`);
check("rec: PEEP 2 re-collapses more than PEEP 5", cc(4) > cc(3) && cc(4) > cc(2) + 0.1, `c ${cc(3)} / ${cc(4)}`);
check("rec: HFOV sighs recruit", cc(6) < cc(5) - 0.1, `c ${cc(5)} -> ${cc(6)}`);
check("rec: off support it re-collapses", cc(7) > cc(6) + 0.1, `c ${cc(7)}`);
check("rec: c stays within [0, 0.6]", rec.every((x) => x.collapse >= 0 && x.collapse <= 0.6 + 1e-9));
check("rec: SaO2 better after recruitment", rec[1].SaO2 > rec[0].SaO2, `${rec[0].SaO2} -> ${rec[1].SaO2}`);

// recruitable off: obstructive atelectasis does not respond to pressure
{
  const m = eng.build(structuredClone(def));
  const M = m.models, V = M.Ventilator, R = M.Respiration;
  if (M.Ans) M.Ans.is_enabled = false;
  M.Breathing.switch_breathing(false);
  V.sle_apply({ mode: "CMV", pip: 28, peep: 8, rr: 40, ti: 0.4 });
  R.atelectasis_recruitable = false;
  eng.calc(30);
  R[`set_atelectasis_${SIDE}`](0.6);
  eng.calc(120);
  check("obstructive: no response to PIP 28 / PEEP 8", R[`atelectasis_${SIDE}`] === 0.6, `c ${R[`atelectasis_${SIDE}`]}`);
}

// healthy lungs are untouched: with nothing set, a recruitment-level pressure writes nothing
{
  const m = eng.build(structuredClone(def));
  const M = m.models;
  M.Breathing.switch_breathing(false);
  M.Ventilator.sle_apply({ mode: "CMV", pip: 28, peep: 8, rr: 40, ti: 0.4 });
  eng.calc(30);
  const A = M[L.alv];
  check("healthy: nothing written at c = 0", M.Respiration[`atelectasis_${SIDE}`] === 0 && A.u_vol_factor_ps === 1 && A.el_base_factor_ps === 1);
}

// round trip: set, clear → the persistent layers return to their start values
{
  const m = eng.build(structuredClone(def));
  const R = m.models.Respiration, A = m.models[L.alv], G = m.models[SIDE === "left" ? "GASEX_LL" : "GASEX_RL"];
  const before = [A.u_vol_factor_ps, A.el_base_factor_ps, G.dif_o2_factor_ps, G.dif_co2_factor_ps];
  R[`set_atelectasis_${SIDE}`](0.7); eng.calc(1);
  R[`set_atelectasis_${SIDE}`](0.2); eng.calc(1);
  R[`set_atelectasis_${SIDE}`](0); eng.calc(1);
  const after = [A.u_vol_factor_ps, A.el_base_factor_ps, G.dif_o2_factor_ps, G.dif_co2_factor_ps];
  check("round trip restores the persistent factors", before.every((b, i) => Math.abs(b - after[i]) < 1e-9), JSON.stringify(after));
  R.atelectasis_recruitable = false; // the clamp alone, without recruitment moving it in the same tick
  R.atelectasis_right = 2; R.atelectasis_left = -1; eng.calc(0.1);
  check("fraction clamped to 0..atelectasis_max", R.atelectasis_right === R.atelectasis_max && R.atelectasis_left === 0);
}

table(checks);
const failed = checks.filter((c) => !c.ok);
log(failed.length ? `${failed.length} check(s) FAILED` : "all checks passed");
process.exit(failed.length ? 1 : 0);
