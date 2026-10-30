// Build the tetralogy of Fallot (ToF) scenarios from term_neonate_72h: a term neonate of 3.545 kg at 72 h,
// in four grades of right ventricular outflow tract (RVOT) obstruction. Reference values and their sources:
// docs/TofReference.md and scripts/reference/<key>.json; validate with
//   node scripts/probe_term_reference.mjs <key> --ref scripts/reference/<key>.json
//
// ToF is one malformation (anterior-cephalad deviation of the outlet septum) that gives four features, each
// mapped onto an existing lever:
//   1. a large malaligned VSD (non-restrictive)    -> Shunts.diameter_vsd
//   2. RVOT obstruction                            -> an orifice on RV_PA: r_k = the Bernoulli coefficient of an
//                                                     effective RVOT diameter (valve + infundibulum lumped,
//                                                     discharge coefficient RVOT_CD), so the pressure drop rises
//                                                     with the square of the flow (dP = r_for Q + r_k Q^2, solved
//                                                     exactly per step by Resistor); r_for keeps the baseline
//                                                     valve resistance. Pulmonary atresia = RV_PA disabled
//   3. an aorta overriding the VSD                 -> the pre-wired RV_AA valve (RV -> AA) enabled next to
//                                                     LV_AA, so both ventricles eject into the aorta
//   4. a right ventricle built for systemic pressure -> HeartFunction.wall_frac_rv = wall_frac_lv. The RV has
//                                                     worked at systemic pressure since fetal life, so it never
//                                                     thins after birth: its free wall stays about as thick as
//                                                     the LV's. With the term baby's thin postnatal wall (0.15),
//                                                     HeartFunction read the systemic RV pressure as an
//                                                     afterload mismatch and cut RV contractility to 0.2-0.6.
//                                                     Contractility (el_max) and stiffness are not changed
// The duct is closed in the mild and moderate grades and held open on PGE1 in the duct-dependent ones.
// No weight scaling and no contractility change: the scenario keeps the term baby's size and heart.
//
// Breathing is adapted to the chronic hypoxaemia: the hypoxic ventilatory depression (Breathing.hvd_*)
// is an acute newborn response, tuned to the term baby (threshold 70 mmHg, resting PaO2 ~72). Every ToF
// baby rests below it, so the depression sat at its floor (factor 0.2) and the chemoreflex wound up
// against it (EF_MV ~5): ventilation stayed at the term level and PaCO2 rose to ~44, where cyanotic
// babies are hyperpnoeic with a normal or low PaCO2 (Rudolph ch 14). The threshold is re-anchored just
// below the baby's own resting PaO2 (HVD_REST_FRAC), so it rests undepressed and an acute fall (duct
// closure) still triggers the depression. The chemoreflex keeps the term setpoints (hypoxic drive at rest).
//
// The lesion is applied to the live model, which is then warmed to steady state and serialized (the
// equilibrium gas/volume seeds are baked in, as in the app's save-state).
//
// The diagram is a simplified teaching version of the term baby's (TOF_DIAGRAM below): the lower body with its
// organs and veins and the upper body with the brain and veins each one disc, the coronaries and the
// intrapulmonary shunt hidden, the shunts in a muted tone with captions, the overriding aorta and the RVOT
// captioned, and flow arrows instead of dots. It changes the drawing only, not the model.
//
// Usage:
//   node scripts/_make_tof.mjs <key|--all> [--seconds 300] [--write | --out DIR] [--diagram-only]
//   --write writes model_definitions/<key>.json and adds the key to index.json; --out writes DIR/<key>.json
//   (a prototype, probe it with --file); neither = dry run. --diagram-only rebuilds just the diagram of the
//   existing model_definitions/<key>.json (no simulation; the model is left byte-for-byte as it is).
import fs from "node:fs";
import { orifice_b } from "../helpers/Orifice.js";
import { createEngine } from "./_harness.mjs";
import { serializeState } from "./_serialize_state.mjs";
import { addChordConnector, addVsdConnector, hideConnectors, narrowConnector, simplifyDiagram } from "./_diagram.mjs";

// ---- lever table ---------------------------------------------------------------------------------------
//   vsd     Shunts.diameter_vsd, mm (large, non-restrictive)
//   rvot    effective RVOT orifice diameter, mm; null = pulmonary atresia (RV_PA disabled)
//   rvot_w  diagram width of the RV_PA connector (standard 7 px), narrowed with the obstruction
//   duct    Pda diameter in mm when held open on PGE1 (diameter_relative 1); 0 = closed
const VSD_MM = 8;
const RVOT_CD = 0.7; // discharge coefficient of the RVOT orifice (between a sharp-edged hole, ~0.64, and a funnel)
const HVD_REST_FRAC = 0.95; // hypoxic ventilatory depression threshold as a fraction of the resting PaO2 (see the header)
const TOF = {
  tof_pink: {
    vsd: VSD_MM, rvot: 6, rvot_w: 5, duct: 0,
    title: "TETRALOGY OF FALLOT - PINK",
    desc: "Term neonate (3.5 kg, 72 h) with a mild ('pink') tetralogy of Fallot: a large malaligned " +
      "ventricular septal defect with an overriding aorta and only mild right ventricular outflow tract " +
      "obstruction, so the ventricular shunt runs net left-to-right, pulmonary blood flow exceeds systemic " +
      "flow and the baby is acyanotic. The ductus arteriosus has closed.",
  },
  tof: {
    vsd: VSD_MM, rvot: 4.5, rvot_w: 4, duct: 0,
    title: "TETRALOGY OF FALLOT - MODERATE",
    desc: "Term neonate (3.5 kg, 72 h) with tetralogy of Fallot and moderate right ventricular outflow " +
      "tract obstruction: a large malaligned ventricular septal defect, an overriding aorta receiving output " +
      "from both ventricles, ventricles at equal systemic pressure and bidirectional ventricular shunting " +
      "with mild to moderate cyanosis. Not duct-dependent; the ductus arteriosus has closed.",
  },
  tof_severe: {
    vsd: VSD_MM, rvot: 2, rvot_w: 2, duct: 2.2,
    title: "TETRALOGY OF FALLOT - SEVERE (PGE1)",
    desc: "Term neonate (3.5 kg, 72 h) with severe tetralogy of Fallot: critical right ventricular outflow " +
      "tract obstruction leaves little antegrade pulmonary flow and the ventricular shunt runs right-to-left " +
      "into the overriding aorta. Pulmonary blood flow is duct-dependent: the ductus arteriosus is held open " +
      "on prostaglandin E1. Closing it produces profound cyanosis.",
  },
  tof_pa: {
    vsd: VSD_MM, rvot: null, duct: 2.5,
    title: "TETRALOGY OF FALLOT - PULMONARY ATRESIA (PGE1)",
    desc: "Term neonate (3.5 kg, 72 h) with tetralogy of Fallot and pulmonary atresia: no antegrade pulmonary " +
      "flow, the whole right ventricular output leaves through the ventricular septal defect into the " +
      "overriding aorta, and the ductus arteriosus, held open on prostaglandin E1, is the only source of " +
      "pulmonary blood flow (no major aortopulmonary collaterals).",
  },
};

// ---- teaching diagram (see simplifyDiagram in _diagram.mjs) ---------------------------------------------
// the shunt lines a shade warmer than the grey vessels (#4a4a4a), so they stand apart without drawing the eye
const SHUNT_TONE = "#6a5d48";
// captions: light grey, turned along the line (`along`) and nudged off it; `at` is the fraction along the line
// from its start, so the FO (LA->RA) and VSD (LV->RV), two nearly parallel lines across the ring, carry theirs
// at opposite ends instead of side by side; written-out names are a bit smaller
const caption = (at, size = 13) => ({ visible: true, along: true, at, pos_x: 0, pos_y: -13, size, color: "#b8b8b8" });
const TOF_DIAGRAM = {
  hide: ["IPS", "COR"],
  lump: [
    { name: "RLB", label: "LOWER\nBODY", members: ["RLB", "LS", "KID", "INT", "VLB"] },
    { name: "RUB", label: "UPPER\nBODY", members: ["RUB", "BR", "VUB"], layout: { sprite: { pos: { y: 0.32 } } } }, // was y 0.25
  ],
  layout: {
    // the venae cavae a little closer to their body discs (SVC was x -0.7 y 0.1, IVC 160 deg)
    SVC: { sprite: { pos: { x: -0.56, y: 0.2 } } },
    IVCI: { sprite: { pos: { dgs: 145 } } },
    DA: { path: { accent: SHUNT_TONE }, label: caption(0.72, 11) },
    FO: { path: { accent: SHUNT_TONE }, label: caption(0.3, 11) },
    VSD: { path: { accent: SHUNT_TONE }, label: caption(0.7) },
    // the overriding aorta and the RVOT keep the vessel grey (the RVOT stays narrowed)
    RV_AA: { label: caption(0.5, 11) },
    RV_PA: { label: caption(0.5) },
  },
  labels: { IVCI: "IVC", DA: "DUCTUS ARTERIOSUS", FO: "FORAMEN OVALE", RV_AA: "OVERRIDING AORTA", RV_PA: "RVOT", VSD: "VSD" },
  settings: { flowMarker: "arrow" }, // arrows instead of dots show the flow direction
};

// the ToF diagram from the term baby's: draw the VSD and the RV -> aorta pathway (a chord: an arc from RV to AA
// would run along the ring over the RV_PA path), narrow or hide the RVOT, title, then the teaching simplification
function tofDiagram(baseDiagram, cfg) {
  const dd = structuredClone(baseDiagram);
  const dc = dd.components;
  addVsdConnector(dc);
  addChordConnector(dc, "RV_AA", ["RV_AA"], "RV", "AA");
  if (cfg.rvot === null) hideConnectors(dc, "RV_PA");
  else narrowConnector(dc, "RV_PA", cfg.rvot_w);
  if (dc.TITLE) dc.TITLE.label = cfg.title;
  return simplifyDiagram(dd, TOF_DIAGRAM);
}

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const SECONDS = Number(opt("--seconds", 300));
const WRITE = argv.includes("--write");
const OUT = opt("--out", null);
const DIAGRAM_ONLY = argv.includes("--diagram-only");
const keys = argv.includes("--all") ? Object.keys(TOF) : argv.filter((a, i) => !a.startsWith("-") && !argv[i - 1]?.startsWith("--"));
if (keys.length === 0 || keys.some((k) => !TOF[k])) {
  console.error(`usage: node scripts/_make_tof.mjs <key|--all> [--seconds N] [--write | --out DIR] [--diagram-only]\nkeys: ${Object.keys(TOF).join(", ")}`);
  process.exit(1);
}

const dir = new URL("../model_definitions/", import.meta.url);
const say = (...a) => process.stderr.write(a.join(" ") + "\n");

if (DIAGRAM_ONLY) {
  const base = JSON.parse(fs.readFileSync(new URL("term_neonate_72h.json", dir), "utf8")).diagram_definition;
  for (const key of keys) {
    const file = new URL(`${key}.json`, dir);
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    j.diagram_definition = tofDiagram(base, TOF[key]);
    if (j.model_definition?.diagram_definition !== undefined) j.model_definition.diagram_definition = j.diagram_definition;
    const text = JSON.stringify(j, null, 2);
    if (WRITE) { fs.writeFileSync(file, text); say(`${key}: diagram rewritten`); }
    else say(`${key}: diagram rebuilt, dry run (pass --write)`);
  }
  process.exit(0);
}

const eng = await createEngine();

for (const key of keys) {
  const cfg = TOF[key];
  const j = JSON.parse(fs.readFileSync(new URL("term_neonate_72h.json", dir), "utf8"));
  const baselineWeight = j.model_definition._baseline_weight;
  const model = eng.build(j.model_definition);
  if (!model?.models) { say(`build failed for the term_neonate_72h baseline (${key})`); process.exit(1); }
  const M = model.models;

  // 1. large non-restrictive VSD
  M.Shunts.diameter_vsd = cfg.vsd;
  // 2. overriding aorta: the RV ejects into the aorta next to the LV, through a valve like the aortic one
  M.RV_AA.is_enabled = true;
  M.RV_AA.no_flow = false;
  M.RV_AA.r_for = M.LV_AA.r_for;
  M.RV_AA.r_back = M.LV_AA.r_back;
  // 3. RVOT obstruction, or pulmonary atresia
  if (cfg.rvot === null) {
    M.RV_PA.no_flow = true;
    M.RV_PA.is_enabled = false;
  } else {
    M.RV_PA.r_k = orifice_b(cfg.rvot, RVOT_CD);
  }
  // 4. RV free wall as thick as the LV's (see the header)
  M.HeartFunction.wall_frac_rv = M.HeartFunction.wall_frac_lv;
  // 5. ductus arteriosus: closed, or held open on PGE1
  if (cfg.duct > 0) {
    M.Pda.diameter_ao_max = cfg.duct;
    M.Pda.diameter_pa_max = cfg.duct;
    M.Pda.diameter_relative = 1.0;
  }

  eng.calc(SECONDS); // warm to the new steady state
  // 6. breathing adapted to the chronic hypoxaemia: re-anchor the depression threshold to the resting PaO2.
  // Twice, because the extra ventilation lowers PaCO2 and, through the Bohr shift, the PaO2 it rests at
  for (let pass = 0; pass < 2; pass++) {
    M.Breathing.hvd_po2_threshold = Math.min(M.Breathing.hvd_po2_threshold, HVD_REST_FRAC * M[M.Breathing.hvd_model].po2);
    M.Breathing.hvd_factor = 1.0;
    eng.calc(SECONDS);
  }
  model.name = key;
  model.description = cfg.desc;

  j.diagram_definition = tofDiagram(j.diagram_definition, cfg);

  j.name = key;
  j.description = cfg.desc;
  j.provenance = "script-generated";
  j.provenance_note = "derived from term_neonate_72h by scripts/_make_tof.mjs (ToF lever table); reference values in docs/TofReference.md";
  j.model_definition = serializeState(model);
  if (baselineWeight !== undefined) j.model_definition._baseline_weight = baselineWeight;
  const text = JSON.stringify(j, null, 2);
  JSON.parse(text);

  const Mon = M.Monitor;
  say(`${key}: VSD ${cfg.vsd} mm, RVOT ${cfg.rvot === null ? "atretic" : cfg.rvot + " mm"}, duct ${cfg.duct || "closed"}; after ${SECONDS} s ` +
    `SpO2 ${Mon.sao2_pre.toFixed(1)}, HR ${Mon.heart_rate.toFixed(0)}, MAP ${Mon.minmax.abp_pre_pres_mean.toFixed(1)}`);
  if (WRITE) {
    fs.writeFileSync(new URL(`${key}.json`, dir), text);
    const idxUrl = new URL("index.json", dir);
    const idx = JSON.parse(fs.readFileSync(idxUrl, "utf8"));
    if (!idx.includes(key)) { idx.push(key); fs.writeFileSync(idxUrl, JSON.stringify(idx, null, 2) + "\n"); }
    say(`  wrote model_definitions/${key}.json`);
  } else if (OUT) {
    fs.writeFileSync(`${OUT}/${key}.json`, text);
    say(`  wrote ${OUT}/${key}.json`);
  } else say("  dry run (pass --write or --out DIR)");
}
