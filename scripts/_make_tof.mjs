// Build Tetralogy of Fallot (ToF) neonate scenarios from the calibrated term_neonate baseline: a term
// neonate of 24 hours, 3.3 kg. ToF is one malformation — anterior-cephalad deviation of the outlet
// septum — that produces the four textbook features, each mapped onto an existing engine lever:
//   1. a large, non-restrictive malaligned VSD      -> Shunts.diameter_vsd (Poiseuille, symmetric)
//   2. right ventricular outflow tract obstruction  -> Heart.components.RV_PA.r_for (valve + infundibulum
//                                                      lumped into one static resistance)
//   3. an aorta overriding the VSD                  -> the pre-wired RV_AA valve (RV -> AA) enabled next
//                                                      to LV_AA, so BOTH ventricles eject into the aorta;
//                                                      RV_AA.r_for sets the override share
//   4. right ventricular hypertrophy                -> NOT applied: RVH is essentially absent in the fetus
//                                                      and develops after birth under systemic RV loading
//                                                      (Alipour Symakani 2023). The RV chamber keeps its
//                                                      baseline el_min/el_k/u_vol; HeartFunction remodelling
//                                                      will stiffen it slowly over multi-hour runs.
// With a non-restrictive VSD the two ventricles equilibrate at systemic pressure. Where the VSD shunts
// depends on the balance of RVOT + pulmonary resistance against systemic resistance: mild obstruction ->
// net left-to-right ("pink tet"), moderate -> bidirectional, severe -> right-to-left with duct-dependent
// pulmonary flow, atresia -> the duct is the sole pulmonary supply.
//
// Weight: term_neonate is 3.545 kg. The model is built, allometrically scaled to 3.3 kg (volumes only —
// scale_to_weight's resistance/elastance inverse-allometry is commented out), the lesion levers are
// applied to the live model, and it is serialized back (same route as _make_fetus.mjs). Weight scaling
// MUST come first: ModelScaler writes the *_scaling_ps layer absolutely.
//
// Calibration note (as pa_vsd): both ventricles ejecting into one aortic outlet over-pumps the lumped
// systemic circulation, so Heart.cont_factor_left/right are lowered together — a geometry compensation,
// not intrinsic ventricular weakness.
//
// Each variant is a 24 h snapshot: the engine has no automatic ductal closure or PVR fall. The duct
// patency is set per phenotype (tof_pink closed; tof a small closing duct; tof_severe / tof_pa open on
// PGE1). Tet spells (dynamic infundibular obstruction) are rare in the first days and are not modelled;
// demonstrate one live by tweening RV_PA.r_factor_ps (see docs/chd_duct_fo_dependent.md, A5).
//
// Refs: Bailliard & Anderson, Orphanet J Rare Dis 2009 (PMC2651859); Vetten et al., Prenat Diagn 2025
// (PMC12137033; pulmonary-valve z-score bands, duct dependence); Horenstein, StatPearls TOF 2024
// (NBK513288); Bader & Huhta, Perinatal Cardiology Handbook (neonatal SpO2 thresholds); Taiwo et al.,
// Glob Pediatr Health 2022 (PMC9112315; term BP at 24 h); Alipour Symakani et al., Front Pediatr 2023
// (PMC10061113; postnatal RVH). See docs/chd_duct_fo_dependent.md (lesion A5).
//
// Un-warmed output; warm to its operating point with:
//   node scripts/reseed_tof.mjs <key|--all> --write
// then validate with scripts/probe_tof.mjs and scripts/probe_vitals.mjs --profile neonate.
//
// Usage:
//   node scripts/_make_tof.mjs <key>     (one variant)
//   node scripts/_make_tof.mjs --all      (all)

import fs from "node:fs";
import { createEngine } from "./_harness.mjs";
import { serializeState } from "./_serialize_state.mjs";

const WEIGHT = 3.3; // kg
const AGE = 1 / 365; // years (adult scenarios store age in years); 24 hours — a label, no model reads it

// ---- per-variant lever table (calibrated with probe_tof.mjs) ---------------------------------------------
//   vsd      Shunts.diameter_vsd, mm. 5 mm already equalises RV/LV peak pressure (non-restrictive). Do NOT
//            go larger: at 6-7 mm the Poiseuille resistance (~1/d^4) is so low that the explicit step loop
//            goes unstable (VSD flow oscillates at tens to hundreds of L/min)
//   rvot     RV_PA.r_for (baseline 55); null = pulmonary atresia (RV_PA no_flow / disabled)
//   rv_aa    RV_AA.r_for — the overriding aorta (lower = more of the RV output goes to the aorta)
//   cont     Heart.cont_factor_left/right (normalise the two-ventricles-into-one-aorta output)
//   pda      { rel: Pda.diameter_relative, mm: Pda.diameter_ao/pa_max }
//   fo       Shunts.diameter_fo, mm (small PFO, near-universal at 24 h)
const TOF = {
  tof_pink: {
    vsd: 5, rvot: 600, rv_aa: 300, cont: 0.75, // mild RVOT, smaller override share -> acyanotic
    pda: { rel: 0, mm: 3 }, fo: 1.5,
    desc: "term 3.3 kg neonate, 24 hours old, with a mild ('pink') tetralogy of Fallot: a large " +
      "malaligned ventricular septal defect with an overriding aorta and only mild right ventricular " +
      "outflow tract obstruction, so the ventricular shunt runs net left-to-right, pulmonary blood flow " +
      "is normal-to-increased and the infant is acyanotic (SpO2 >= 92%); the ductus has closed",
  },
  tof: {
    vsd: 5, rvot: 1500, rv_aa: 110, cont: 0.7,
    pda: { rel: 0.3, mm: 3 }, fo: 1.5,
    desc: "term 3.3 kg neonate, 24 hours old, with tetralogy of Fallot: a large malaligned ventricular " +
      "septal defect, an overriding aorta receiving output from both ventricles, and moderate right " +
      "ventricular outflow tract obstruction; the ventricles equilibrate at systemic pressure, the " +
      "ventricular shunt is bidirectional and a small closing ductus still adds pulmonary flow, giving " +
      "mild cyanosis (SpO2 ~85%)",
  },
  tof_severe: {
    vsd: 5, rvot: 3000, rv_aa: 110, cont: 0.7, // antegrade trickle ~180 mL/min; duct closed -> SpO2 ~58%
    pda: { rel: 0.6, mm: 4 }, fo: 1.5, // PGE1-held duct; Qp:Qs ~1.2
    desc: "term 3.3 kg neonate, 24 hours old, with severe tetralogy of Fallot: critical right ventricular " +
      "outflow tract obstruction leaves little antegrade pulmonary flow, the ventricular shunt runs " +
      "right-to-left into the overriding aorta, and pulmonary blood flow is duct-dependent — the ductus " +
      "is held open on prostaglandin E1 (closing it produces profound cyanosis)",
  },
  tof_pa: {
    vsd: 5, rvot: null, rv_aa: 110, cont: 0.7,
    pda: { rel: 0.8, mm: 4 }, fo: 1.5, // sole Qp; wider over-circulates the lungs (Qp:Qs 1.8)
    desc: "term 3.3 kg neonate, 24 hours old, with tetralogy of Fallot and pulmonary atresia: no antegrade " +
      "pulmonary flow, all systemic venous return leaves the right ventricle through the VSD and the " +
      "overriding aorta, and the ductus arteriosus is the sole pulmonary blood supply (no MAPCAs " +
      "modelled) — a duct-dependent lesion kept alive on prostaglandin E1",
  },
};

const argv = process.argv.slice(2);
const keys = argv.includes("--all") ? Object.keys(TOF) : argv.filter((a) => !a.startsWith("-"));
if (keys.length === 0 || keys.some((k) => !TOF[k])) {
  console.error(`usage: node scripts/_make_tof.mjs <key|--all>\nkeys: ${Object.keys(TOF).join(", ")}`);
  process.exit(1);
}

const srcPath = new URL("../model_definitions/term_neonate.json", import.meta.url);

// diagram connectors for the two ToF-specific pathways, shaped like the baseline FO / RV_PA connectors
const connector = (label, models, from, to, pathType) => ({
  type: "Connector", label, picto: "container.png", enabled: true, models, dbcFrom: from, dbcTo: to,
  layout: {
    general: { animatedBy: "flow", z_index: 8, alpha: 1, tinting: true },
    path: { type: pathType, width: 7, color: pathType === "arc" ? "#666666" : "#333333" },
    sprite: { color: "#ffffff", pos: { type: "rel", x: 0, y: 0, dgs: 0 }, scale: { x: 1, y: 2 }, anchor: { x: 0.5, y: 0.5 }, rotation: 0 },
    label: { pos_x: 0, pos_y: 0, size: 10, rotation: 0, color: "#ffffff" },
  },
});

const eng = await createEngine();

for (const key of keys) {
  const cfg = TOF[key];
  const j = JSON.parse(fs.readFileSync(srcPath, "utf8"));

  // build() freezes model._baseline_weight = 3.545 — the allometric denominator scale_to_weight needs
  const model = eng.build(j.model_definition);
  if (!model || !model.models) {
    console.error(`build failed for the term_neonate baseline (${key}).`);
    process.exit(1);
  }
  const M = model.models; // live model: Heart/Shunts/Pda components are flattened onto model.models
  const log = [];

  // 0. size — FIRST (ModelScaler sets the scaling layer absolutely) ----------------------------------------
  const baseW = model.weight;
  eng.scale("weight_scale", WEIGHT);
  log.push(`0 size: weight ${baseW} -> ${WEIGHT} kg (volumes x${(WEIGHT / baseW).toFixed(3)}; resistances/elastances unscaled)`);

  // A. large non-restrictive malaligned VSD ----------------------------------------------------------------
  M.Shunts.diameter_vsd = cfg.vsd;
  log.push(`A VSD: diameter_vsd=${cfg.vsd} mm (non-restrictive)`);

  // B. overriding aorta: RV ejects into the aorta alongside the LV -----------------------------------------
  M.RV_AA.is_enabled = true;
  M.RV_AA.no_flow = false;
  M.RV_AA.r_for = cfg.rv_aa;
  M.Heart.cont_factor_left = cfg.cont;
  M.Heart.cont_factor_right = cfg.cont;
  log.push(`B override: RV_AA enabled r_for=${cfg.rv_aa} (LV_AA kept for cycle timing), cont_factor_left/right=${cfg.cont}`);

  // C. RVOT obstruction (or atresia) -----------------------------------------------------------------------
  if (cfg.rvot === null) {
    M.RV_PA.no_flow = true;
    M.RV_PA.is_enabled = false;
    log.push("C RVOT: pulmonary atresia (RV_PA no_flow, disabled)");
  } else {
    M.RV_PA.r_for = cfg.rvot; // no_flow stays false: stenosis, not atresia
    log.push(`C RVOT: RV_PA.r_for=${cfg.rvot} (baseline 55)`);
  }

  // D. ductus arteriosus (static 24 h snapshot) ------------------------------------------------------------
  M.Pda.diameter_relative = cfg.pda.rel;
  M.Pda.diameter_ao_max = cfg.pda.mm;
  M.Pda.diameter_pa_max = cfg.pda.mm;
  log.push(`D duct: Pda.diameter_relative=${cfg.pda.rel} max=${cfg.pda.mm} mm`);

  // E. small PFO (baseline fo_lr_factor 25 kept) -----------------------------------------------------------
  M.Shunts.diameter_fo = cfg.fo;
  log.push(`E PFO: diameter_fo=${cfg.fo} mm`);

  // F. engine-level metadata; build() re-derives _baseline_weight = weight on reload ------------------------
  model.weight = WEIGHT;
  model.gestational_age = 40;
  model.age = AGE;
  model.name = key;
  model.description = cfg.desc;

  // G. diagram: draw the VSD and the RV -> aorta override pathway ------------------------------------------
  const dc = j.diagram_definition.components;
  dc.VSD = connector("VSD", ["VSD"], "LV", "RV", "straight");
  dc.RV_AA = connector("", ["RV_AA"], "RV", "AA", "arc");
  log.push("G diagram: + VSD (LV->RV) and RV_AA (RV->AA) connectors");

  j.name = key;
  j.user = "timothy";
  j.description = cfg.desc;
  j.provenance = "script-generated";
  j.provenance_note =
    "derived from term_neonate by scripts/_make_tof.mjs (weight-scaled to 3.3 kg, ToF lever table), " +
    "tuned with scripts/probe_tof.mjs and baked to steady state by scripts/reseed_tof.mjs";

  serializeState(model);
  j.model_definition = model;
  const out = JSON.stringify(j, null, 1) + "\n";
  JSON.parse(out); // fail loudly before writing if anything is non-serializable
  const dst = new URL(`../model_definitions/${key}.json`, import.meta.url);
  fs.writeFileSync(dst, out);
  eng.log(`wrote ${key}.json\n  ${log.join("\n  ")}`);
}
