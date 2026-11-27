// Generate adult_female_pregnant_36wk: the calibrated non-pregnant adult_female at 36 weeks of a healthy singleton
// pregnancy, lying left lateral (no aortocaval compression), with the fetus represented as an O2 sink in the placenta.
// Reference values: docs/PregnancyReference.md and scripts/reference/adult_female_pregnant_36wk.json; check with
//   node scripts/probe_term_reference.mjs adult_female_pregnant_36wk --ref scripts/reference/adult_female_pregnant_36wk.json [--file OUT]
//
//   node scripts/_make_adult_female_pregnant.mjs [--settle 300] [--final 600] [--write | --out FILE] [--levers none|all|a,b,...]
//
// User decisions 2026-11-27: a separate scenario derived from the released adult_female (as the 1/12/24 h babies derive
// from the 72 h baby), 36 weeks, left lateral, fetus = O2 sink (no fetal circulation); targets = the non-pregnant reference
// x within-study longitudinal changes (docs/PregnancyReference.md).
//
// Order (as scripts/_make_adult_female.mjs): the pregnancy topology (intervillous space PL_IVS and its resistors, the
// MaternalPlacenta model) and the pregnancy switches are applied to the definition before the build; the maternal levers
// (step 4, one at a time) act on the live model; then every controller is re-anchored (scripts/_reanchor.mjs; the
// baroreflex folded last, the brain references captured last), the scaling layer of the ModelScaler groups is baked (the
// uterine vessels and PL_IVS are deliberately not in a group: Uterus and MaternalPlacenta keep their pregnancy factors in
// that layer and rewrite them every step) and the state is saved at a sinus-node firing.
import fs from "node:fs";
import { createEngine } from "./_harness.mjs";
import { serializeState } from "./_serialize_state.mjs";
import * as RA from "./_reanchor.mjs";

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const SETTLE = Number(opt("--settle", 300));
const FINAL = Number(opt("--final", 600));
const PRE_FOLD = Number(opt("--pre-fold", 300));
const WRITE = argv.includes("--write");
const OUT = opt("--out", null);
const SOURCE = "adult_female";
const NAME = "adult_female_pregnant_36wk";
const say = (...a) => process.stderr.write(a.join(" ") + "\n");

const GA = 36; // weeks
const WEIGHT = 71.0; // kg: 60 + IOM 2009 normal-BMI gain at 36 weeks (user decision)
const IVS_VOL = Number(opt("--ivs-vol", 0.15)); // L, intervillous blood at ~36 wk (textbook ~150 mL; C)
const DESCRIPTION = "healthy woman (26 y, 1.65 m, 60 kg before pregnancy) at 36 weeks of a singleton pregnancy, 71 kg: awake, " +
  "left lateral (no aortocaval compression), at rest, room air; the fetus is an O2 sink in the placenta";

function flatten(models) { const o = {}; const w = (x) => { for (const [k, v] of Object.entries(x)) { o[k] = v; if (v?.components) w(v.components); } }; w(models); return o; }

// --- pregnancy topology and switches (definition stage) ---------------------------------------------------------------
// MaternalPlacenta (docs/MaternalPlacenta.md) needs the intervillous space PL_IVS fed from UT_ART (UT_ART_PL_IVS, the
// spiral arteries) and draining into UT_VEN (PL_IVS_UT_VEN), in parallel with the myometrial capillaries UT_CAP. PL_IVS is
// a clone of UT_CAP (same kind of compartment), sized to the intervillous blood volume; its resistors clone UT_CAP's.
// The volume comes out of VLB here, so the skeleton keeps the blood volume (the expansion of pregnancy is a lever).
function applyPregnancy(def) {
  const o = flatten(def.models), C = o.Circulation;
  const ren = (x, from, to) => JSON.parse(JSON.stringify(x).split(from).join(to));
  const cap = C.components.UT_CAP;
  const ivs = ren(cap, "UT_CAP", "PL_IVS");
  Object.assign(ivs, { description: "intervillous space (maternal placenta)", inputs: ["UT_ART"] });
  const f = IVS_VOL / cap.vol;
  for (const p of ["vol", "u_vol"]) ivs[p] *= f;
  ivs.el_base /= f; if (ivs.el_k) ivs.el_k /= f * f;
  C.components.PL_IVS = ivs;
  if (!C.systemic_capillaries.includes("PL_IVS")) C.systemic_capillaries.push("PL_IVS");
  const rin = ren(def.models.UT_ART_UT_CAP, "UT_CAP", "PL_IVS"); rin.description = "spiral arteries (input connector for PL_IVS)";
  const rout = ren(def.models.UT_CAP_UT_VEN, "UT_CAP", "PL_IVS"); rout.description = "intervillous drainage into UT_VEN";
  def.models[rin.name] = rin; def.models[rout.name] = rout;
  const vlb = o.VLB, k = (vlb.vol - ivs.vol) / vlb.vol; vlb.vol *= k; vlb.u_vol *= k;
  def.models.MaternalPlacenta = {
    name: "MaternalPlacenta", description: "maternal placenta: intervillous perfusion and the placental + fetal O2 sink",
    is_enabled: true, model_type: "MaternalPlacenta", pl_ivs_name: "PL_IVS", spiral_res_name: "UT_ART_PL_IVS",
    drain_res_name: "PL_IVS_UT_VEN", ut_art_name: "UT_ART", ut_in_res_name: "AD_UT_ART", uterus_name: "Uterus",
    mp_running: true, preg_ga_threshold: 4, preg_ga_term: 40, spiral_res_term_factor: 0.01, met_active: true,
    mp_vo2: Number(opt("--mp-vo2", 0.3)), vo2_factor: 1, vo2_factor_ps: 1, resp_q: 0.8, contraction_pres_gain: 0.6,
  };
  Object.assign(o.Uterus, { pregnant: true, preg_ga: GA, description: "uterine organ: pregnant, 36 weeks" });
  if (!o.Monitor.flow_targets.some((t) => t.name === "pl_flow")) o.Monitor.flow_targets.push({ name: "pl_flow", model: "UT_ART_PL_IVS.flow" });
  Object.assign(def, { weight: WEIGHT, _baseline_weight: WEIGHT });
  return { ivs: ivs.vol };
}

// --- maternal levers on the live model (step 4, added one at a time) ----------------------------------------------------
const LEVERS = {};
const pick = opt("--levers", "all");
const DEFAULT = [];
const active = pick === "none" ? [] : pick === "all" ? DEFAULT : pick.split(",");
for (const k of active) if (!LEVERS[k]) { say(`unknown lever ${k}; known: ${Object.keys(LEVERS).join(", ") || "(none yet)"}`); process.exit(1); }

// --- build ----------------------------------------------------------------------------------------------------------
const dir = new URL("../model_definitions/", import.meta.url);
const j = JSON.parse(fs.readFileSync(new URL(`${SOURCE}.json`, dir), "utf8"));
const pg = applyPregnancy(j.model_definition);
say(`pregnancy: ${GA} wk, weight ${WEIGHT} kg, intervillous space ${(pg.ivs * 1000).toFixed(0)} mL (from VLB), MaternalPlacenta added`);
const eng = await createEngine();
globalThis.__bc = await import("../component_models/BloodComposition.js");
const model = eng.build(j.model_definition);
if (!model?.models) { say("build failed"); process.exit(1); }
const M = model.models;
const log = [];
const ctx = { eng, M, model, log };
const snap = (tag) => {
  const a = RA.avgOver(ctx, 3, () => ({ map: M.AA.pres, cvp: (M.RAIVCI.pres + M.RASVC.pres) / 2, co: M.LV_AA.flow * 60, ut: M.AD_UT_ART.flow * 60000, pl: M.UT_ART_PL_IVS.flow * 60000, pco2: M.AA.pco2 ?? NaN }));
  say(`[${tag}] t=${model.model_time_total.toFixed(0)} s HR ${M.Monitor.heart_rate.toFixed(1)} MAP ${a.map.toFixed(1)} CVP ${a.cvp.toFixed(1)} CO ${a.co.toFixed(2)} ` +
    `UT ${a.ut.toFixed(0)} PL ${a.pl.toFixed(0)} mL/min SpO2 ${M.Monitor.sao2_pre.toFixed(1)} pCO2 ${a.pco2.toFixed(1)} RR ${M.Breathing.resp_rate.toFixed(1)}`);
};
for (let t = 0; t < 60; t += 20) { eng.calc(17); snap("load"); }

for (const k of active) { LEVERS[k].apply(M, model); say(`lever ${k}: ${LEVERS[k].why}`); }
RA.reseedInterstitium(ctx);
const settleLevers = active.filter((k) => LEVERS[k].settle);
for (let t = 0; t < SETTLE; t += 60) { eng.calc(Math.min(60, SETTLE - t)); settleLevers.forEach((k) => LEVERS[k].apply(M, model)); snap("settle"); }

// --- re-anchor (as scripts/_make_adult_female.mjs) ---------------------------------------------------------------------
RA.reanchorChemoreflex(ctx);
RA.reanchorHormonesGlucose(ctx);
RA.reanchorKidney(ctx);
RA.reseedLactateThermo(ctx);
RA.reseedInterstitium(ctx);
for (let t = 0; t < PRE_FOLD; t += 60) { eng.calc(60); settleLevers.forEach((k) => LEVERS[k].apply(M, model)); }
RA.reanchorMaintenance(ctx);
RA.reanchorBaroreflex(ctx);
eng.calc(60);
RA.reanchorChemoreflex(ctx);
RA.reanchorBrain(ctx);
RA.relearnHeartFunction(ctx);
for (let t = 0; t < FINAL; t += 120) { eng.calc(Math.min(120, FINAL - t)); snap("final"); }
RA.advanceToSinusFiring(ctx);
eng.scale("incorporate", 1);
log.forEach((l) => say("  " + l));

model.name = NAME;
model.description = DESCRIPTION;
j.name = NAME;
j.description = DESCRIPTION;
j.provenance = "script-generated";
j.provenance_note = `derived from ${SOURCE} by scripts/_make_adult_female_pregnant.mjs; reference values in docs/PregnancyReference.md`;
j.model_definition = serializeState(model);
j.model_definition._baseline_weight = WEIGHT;
const text = JSON.stringify(j, null, 2);
JSON.parse(text);
if (WRITE) {
  fs.writeFileSync(new URL(`${NAME}.json`, dir), text);
  const idxUrl = new URL("index.json", dir);
  const idx = JSON.parse(fs.readFileSync(idxUrl, "utf8"));
  if (!idx.includes(NAME)) { idx.push(NAME); fs.writeFileSync(idxUrl, JSON.stringify(idx, null, 2) + "\n"); }
  say(`wrote model_definitions/${NAME}.json`);
} else if (OUT) {
  fs.writeFileSync(OUT, text);
  say(`wrote ${OUT}`);
} else say("dry run (pass --write or --out FILE)");
