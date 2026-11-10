// Build a hypoplastic left heart syndrome (HLHS) neonate from the calibrated term_neonate_72h baseline:
// mitral + aortic atresia (the left ventricle excluded), 48 h old, duct held open on PGE1, stable (no
// shock). A single-(right)-ventricle parallel circulation:
//   - all pulmonary venous return is OBLIGATED left-to-right across the atrial septum (LA -> RA) and mixes
//     with the systemic venous return (fully mixed: pre- = post-ductal saturation);
//   - the right ventricle is the only pump: it fills the pulmonary arteries AND, right-to-left through a
//     wide ductus arteriosus, the whole systemic circulation, the arch and coronaries filled RETROGRADE.
// Oxygenation and systemic flow are set by the Qp:Qs balance (the lungs steal output when PVR is low).
//
// Revived from scripts/archive/_make_hlhs.mjs (built on the old engine, archived 2026-10-20), rebuilt on
// the current term baby so it carries every current feature. Targets: classic textbook values for a
// stable pre-Norwood HLHS (docs/HlhsReference.md, scripts/reference/hlhs.json).
//
// Levers (live model, then warmed, baked and serialized like scripts/_make_tof.mjs):
//   A left heart   LA_LV (mitral) + LV_AA (aortic) disabled, no_flow -> LV excluded. Heart.calc_model derives
//                  the cardiac cycle from the ventricular activation window when the LV has no outflow
//   B atrial       Shunts.diameter_fo (non-restrictive), fo_lr_factor 1 (a symmetric hole: the whole pulmonary
//                  venous return must pass LA -> RA)
//   C duct         a wide duct (diameter_*_max) with its own closing tendency (diameter_relative < 1), held
//                  fully open by a PGE1 infusion (Drugs: patency factor ~2.1 at 0.02 mcg/kg/min, capped at the
//                  anatomic maximum). Stopping PGE1 narrows the duct back to diameter_relative
//   D aorta        hypoplastic ascending aorta (AA u_vol down, el_base up), filled retrograde
//   E PVR          pulmonary arteriolar resistance (PAAL/PAAR/{L,R}L_ART/{L,R}L_CAP r_for/r_back) raised to
//                  balance Qp:Qs (at the term baby's PVR the lungs steal the RV output)
//   F systemic RV  HeartFunction.wall_frac_rv = wall_frac_lv: an RV at systemic pressure since fetal life has a
//                  thick wall (see _make_tof.mjs step 4; otherwise HeartFunction reads afterload mismatch)
//   H RV pump      RV el_max x3 (~ the LV's: the hypertrophied systemic RV). With the term baby's RV (a third of
//                  the LV's contractility) the single ventricle delivered ~300 ml/kg/min and Qs only ~125
//                  (lactate 2.7); it has to carry Qp + Qs. u_vol (dilation) left at x1: little effect
//   G breathing    the hypoxic ventilatory depression threshold re-anchored to the resting PaO2 (chronic
//                  hypoxaemia, as in _make_tof.mjs step 6)
//
//   node scripts/_make_hlhs.mjs [--pvr 2.5] [--duct 7] [--rv-emax 3] [--rv-uvol 1] [--fo 6] [--seconds 300]
//                               [--write | --out DIR] [--diagram-only]
//   Calibration (2026-11-10, headless, textbook targets): duct 4 mm restricted Qs (systolic gradient 12-13 mmHg);
//   7 mm -> 3 mmHg. PVR x1/2/3 -> Qp:Qs 2.5/1.6/1.2; RV Emax x3 + PVR x2.5 -> SpO2 77, Qp:Qs 1.30, MAP 48,
//   lactate 1.6, pH 7.44, LA-RA 2.2 mmHg, arch -72 ml/kg/min (retrograde)
//   --write writes model_definitions/hlhs.json and adds it to index.json; --out writes DIR/hlhs.json (a
//   prototype); neither = dry run. Validate with:
//   node scripts/probe_hlhs.mjs hlhs
//   node scripts/probe_term_reference.mjs hlhs --ref scripts/reference/hlhs.json

import fs from "node:fs";
import { createEngine } from "./_harness.mjs";
import { serializeState } from "./_serialize_state.mjs";
import { SHUNT_STYLE, narrowConnector, simplifyDiagram } from "./_diagram.mjs";

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };

const KEY = "hlhs";
const CFG = {
  age_days: 2, // 48 h
  fo: Number(opt("--fo", 6)), // mm, non-restrictive atrial communication
  duct_mm: Number(opt("--duct", 7)), // mm: a wide duct, as wide as the pulmonary trunk (the systemic lifeline)
  duct_rel: 0.5, // own closing tendency; PGE1 opens it fully
  pge1: 0.02, // mcg/kg/min
  aa_u_vol: 0.6, // hypoplastic ascending aorta
  aa_el: 1.4,
  pvr: Number(opt("--pvr", 2.5)), // pulmonary arteriolar resistance multiplier (Qp:Qs balance)
  rv_emax: Number(opt("--rv-emax", 3.0)), // RV contractility multiplier (the hypertrophied systemic RV)
  rv_uvol: Number(opt("--rv-uvol", 1.0)), // RV unstressed volume multiplier (the dilated, volume-loaded RV)
  title: "HYPOPLASTIC LEFT HEART SYNDROME (PGE1)",
  desc:
    "Term neonate (3.5 kg, 48 h) with hypoplastic left heart syndrome (mitral and aortic atresia): the left " +
    "ventricle is excluded, so the right ventricle is the single pump of a parallel circulation. All pulmonary " +
    "venous return crosses a non-restrictive atrial septum left-to-right and mixes in the right atrium; the " +
    "systemic circulation, including the ascending aorta and coronaries filled retrograde, is supplied " +
    "right-to-left through a wide ductus arteriosus held open on prostaglandin E1. Stable, before Norwood palliation.",
};
const PVR_VESSELS = ["PAAL", "PAAR", "LL_ART", "RL_ART", "LL_CAP", "RL_CAP"];
const HVD_REST_FRAC = 0.95; // as _make_tof.mjs

const SECONDS = Number(opt("--seconds", 300));
const WRITE = argv.includes("--write");
const OUT = opt("--out", null);
const DIAGRAM_ONLY = argv.includes("--diagram-only");
const dir = new URL("../model_definitions/", import.meta.url);
const say = (...a) => process.stderr.write(a.join(" ") + "\n");

// ---- teaching diagram (as the ToF family: see simplifyDiagram in _diagram.mjs) ---------------------------
const HLHS_DIAGRAM = {
  hide: ["IPS", "COR", "VSD", "RV_AA"],
  lump: [
    { name: "RLB", label: "LOWER\nBODY", members: ["RLB", "LS", "KID", "INT", "VLB"] },
    { name: "RUB", label: "UPPER\nBODY", members: ["RUB", "BR", "VUB"], layout: { sprite: { pos: { y: 0.32 } } } },
  ],
  layout: {
    SVC: { sprite: { pos: { x: -0.56, y: 0.2 } } },
    IVCI: { sprite: { pos: { dgs: 145 } } },
    ...SHUNT_STYLE.layout,
    // the hypoplastic LV: small, at a fixed size, and grey (no oxygenation tint: its stagnant blood would
    // otherwise show as a red, oxygenated disc)
    LV: { sprite: { fixed_size: 0.07, color: "#8a8a8a" }, general: { tinting: false } },
  },
  labels: { ...SHUNT_STYLE.labels, IVCI: "IVC", FO: "ASD" },
  settings: { ...SHUNT_STYLE.settings, scaling: 1 },
};
function hlhsDiagram(baseDiagram) {
  const dd = structuredClone(baseDiagram);
  const dc = dd.components;
  // mitral + aortic atresia: drawn as thin lines (no flow runs through them, so no dots)
  narrowConnector(dc, "LA_LV");
  narrowConnector(dc, "LV_AA");
  narrowConnector(dc, "AA_AAR", 3); // the hypoplastic ascending aorta
  if (dc.TITLE) dc.TITLE.label = CFG.title;
  return simplifyDiagram(dd, HLHS_DIAGRAM);
}

if (DIAGRAM_ONLY) {
  const base = JSON.parse(fs.readFileSync(new URL("term_neonate_72h.json", dir), "utf8")).diagram_definition;
  const file = new URL(`${KEY}.json`, dir);
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  j.diagram_definition = hlhsDiagram(base);
  if (j.model_definition?.diagram_definition !== undefined) j.model_definition.diagram_definition = j.diagram_definition;
  const text = JSON.stringify(j, null, 2);
  if (WRITE) { fs.writeFileSync(file, text); say(`${KEY}: diagram rewritten`); } else say(`${KEY}: diagram rebuilt, dry run (pass --write)`);
  process.exit(0);
}

const eng = await createEngine();
const j = JSON.parse(fs.readFileSync(new URL("term_neonate_72h.json", dir), "utf8"));
const baselineWeight = j.model_definition._baseline_weight;
const model = eng.build(j.model_definition);
if (!model?.models) { say("build failed for the term_neonate_72h baseline"); process.exit(1); }
const M = model.models;

// A. left heart excluded: mitral + aortic atresia
// (flow zeroed too: a disabled resistor no longer steps, so it would keep its last flow, which the
// diagram animates)
for (const v of [M.LA_LV, M.LV_AA]) { v.is_enabled = false; v.no_flow = true; v.flow = 0; }
// B. obligate left-to-right atrial communication
M.Shunts.diameter_fo = CFG.fo;
M.Shunts.fo_lr_factor = 1;
M.Shunts.diameter_vsd = 0;
// C. wide duct with its own closing tendency, held open on PGE1
M.Pda.diameter_ao_max = CFG.duct_mm;
M.Pda.diameter_pa_max = CFG.duct_mm;
M.Pda.diameter_relative = CFG.duct_rel;
M.Drugs.set_infusion("pge1", CFG.pge1);
// D. hypoplastic ascending aorta
M.AA.u_vol *= CFG.aa_u_vol;
M.AA.el_base *= CFG.aa_el;
// E. pulmonary arteriolar resistance (Qp:Qs balance)
for (const n of PVR_VESSELS) { M[n].r_for *= CFG.pvr; M[n].r_back *= CFG.pvr; }
// F. systemic right ventricle: thick wall, and (H) hypertrophied and dilated
M.HeartFunction.wall_frac_rv = M.HeartFunction.wall_frac_lv;
M.RV.el_max *= CFG.rv_emax;
M.RV.u_vol *= CFG.rv_uvol;
// age
model.age = CFG.age_days / 365;

eng.calc(SECONDS);
// G. breathing adapted to the chronic hypoxaemia (twice: the extra ventilation shifts the PaO2 it rests at)
for (let pass = 0; pass < 2; pass++) {
  M.Breathing.hvd_po2_threshold = Math.min(M.Breathing.hvd_po2_threshold, HVD_REST_FRAC * M[M.Breathing.hvd_model].po2);
  M.Breathing.hvd_factor = 1.0;
  eng.calc(SECONDS);
}
model.name = KEY;
model.description = CFG.desc;

j.diagram_definition = hlhsDiagram(j.diagram_definition);
j.name = KEY;
j.description = CFG.desc;
j.provenance = "script-generated";
j.provenance_note = "derived from term_neonate_72h by scripts/_make_hlhs.mjs (HLHS lever table); reference values in docs/HlhsReference.md";
j.model_definition = serializeState(model);
if (baselineWeight !== undefined) j.model_definition._baseline_weight = baselineWeight;
const text = JSON.stringify(j, null, 2);
JSON.parse(text);

const Mon = M.Monitor;
say(`${KEY}: fo ${CFG.fo} mm, duct ${CFG.duct_mm} mm x${CFG.duct_rel} + PGE1 ${CFG.pge1}, PVR x${CFG.pvr}, RV Emax x${CFG.rv_emax} u_vol x${CFG.rv_uvol}; after ${3 * SECONDS} s ` +
  `SpO2 ${Mon.sao2_pre.toFixed(1)}/${Mon.sao2_post.toFixed(1)}, HR ${Mon.heart_rate.toFixed(0)}, MAP ${Mon.minmax.abp_pre_pres_mean.toFixed(1)}`);
if (WRITE) {
  fs.writeFileSync(new URL(`${KEY}.json`, dir), text);
  const idxUrl = new URL("index.json", dir);
  const idx = JSON.parse(fs.readFileSync(idxUrl, "utf8"));
  if (!idx.includes(KEY)) { idx.push(KEY); fs.writeFileSync(idxUrl, JSON.stringify(idx, null, 2) + "\n"); }
  say(`  wrote model_definitions/${KEY}.json`);
} else if (OUT) {
  fs.writeFileSync(`${OUT}/${KEY}.json`, text);
  say(`  wrote ${OUT}/${KEY}.json`);
} else say("  dry run (pass --write or --out DIR)");
