// Build the tetralogy of Fallot (ToF) scenarios from term_neonate_72h: a term neonate of 3.545 kg at 72 h,
// in four grades of right ventricular outflow tract (RVOT) obstruction. Reference values and their sources:
// docs/TofReference.md and scripts/reference/<key>.json; validate with
//   node scripts/probe_term_reference.mjs <key> --ref scripts/reference/<key>.json
//
// ToF is one malformation (anterior-cephalad deviation of the outlet septum) that gives four features, each
// mapped onto an existing lever:
//   1. a large malaligned VSD (non-restrictive)    -> Shunts.diameter_vsd
//   2. RVOT obstruction                            -> RV_PA.r_for (valve + infundibulum lumped into one linear
//                                                     resistance); pulmonary atresia = RV_PA disabled
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
// The lesion is applied to the live model, which is then warmed to steady state and serialized (the
// equilibrium gas/volume seeds are baked in, as in the app's save-state).
//
// Usage:
//   node scripts/_make_tof.mjs <key|--all> [--seconds 300] [--write | --out DIR]
//   --write writes model_definitions/<key>.json and adds the key to index.json; --out writes DIR/<key>.json
//   (a prototype, probe it with --file); neither = dry run.
import fs from "node:fs";
import { createEngine } from "./_harness.mjs";
import { serializeState } from "./_serialize_state.mjs";
import { addChordConnector, addVsdConnector, hideConnectors, narrowConnector } from "./_diagram.mjs";

// ---- lever table ---------------------------------------------------------------------------------------
//   vsd     Shunts.diameter_vsd, mm (large, non-restrictive)
//   rvot    RV_PA.r_for in mmHg·s/L (term baseline 41.4); null = pulmonary atresia (RV_PA disabled)
//   rvot_w  diagram width of the RV_PA connector (standard 7 px), narrowed with the obstruction
//   duct    Pda diameter in mm when held open on PGE1 (diameter_relative 1); 0 = closed
const VSD_MM = 8;
const TOF = {
  tof_pink: {
    vsd: VSD_MM, rvot: 300, rvot_w: 5, duct: 0,
    title: "TETRALOGY OF FALLOT - PINK",
    desc: "Term neonate (3.5 kg, 72 h) with a mild ('pink') tetralogy of Fallot: a large malaligned " +
      "ventricular septal defect with an overriding aorta and only mild right ventricular outflow tract " +
      "obstruction, so the ventricular shunt runs net left-to-right, pulmonary blood flow exceeds systemic " +
      "flow and the baby is acyanotic. The ductus arteriosus has closed.",
  },
  tof: {
    vsd: VSD_MM, rvot: 1000, rvot_w: 4, duct: 0,
    title: "TETRALOGY OF FALLOT - MODERATE",
    desc: "Term neonate (3.5 kg, 72 h) with tetralogy of Fallot and moderate right ventricular outflow " +
      "tract obstruction: a large malaligned ventricular septal defect, an overriding aorta receiving output " +
      "from both ventricles, ventricles at equal systemic pressure and bidirectional ventricular shunting " +
      "with mild to moderate cyanosis. Not duct-dependent; the ductus arteriosus has closed.",
  },
  tof_severe: {
    vsd: VSD_MM, rvot: 6000, rvot_w: 2, duct: 2.5,
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

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const SECONDS = Number(opt("--seconds", 300));
const WRITE = argv.includes("--write");
const OUT = opt("--out", null);
const keys = argv.includes("--all") ? Object.keys(TOF) : argv.filter((a, i) => !a.startsWith("-") && !argv[i - 1]?.startsWith("--"));
if (keys.length === 0 || keys.some((k) => !TOF[k])) {
  console.error(`usage: node scripts/_make_tof.mjs <key|--all> [--seconds N] [--write | --out DIR]\nkeys: ${Object.keys(TOF).join(", ")}`);
  process.exit(1);
}

const dir = new URL("../model_definitions/", import.meta.url);
const eng = await createEngine();
const say = (...a) => process.stderr.write(a.join(" ") + "\n");

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
    M.RV_PA.r_for = cfg.rvot;
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
  model.name = key;
  model.description = cfg.desc;

  // diagram: draw the VSD and the RV -> aorta pathway (a chord: an arc from RV to AA would run along the ring
  // over the RV_PA path), narrow or hide the RVOT, title
  const dc = j.diagram_definition.components;
  addVsdConnector(dc);
  addChordConnector(dc, "RV_AA", ["RV_AA"], "RV", "AA");
  if (cfg.rvot === null) hideConnectors(dc, "RV_PA");
  else narrowConnector(dc, "RV_PA", cfg.rvot_w);
  if (dc.TITLE) dc.TITLE.label = cfg.title;

  j.name = key;
  j.description = cfg.desc;
  j.provenance = "script-generated";
  j.provenance_note = "derived from term_neonate_72h by scripts/_make_tof.mjs (ToF lever table); reference values in docs/TofReference.md";
  j.model_definition = serializeState(model);
  if (baselineWeight !== undefined) j.model_definition._baseline_weight = baselineWeight;
  const text = JSON.stringify(j, null, 2);
  JSON.parse(text);

  const Mon = M.Monitor;
  say(`${key}: VSD ${cfg.vsd} mm, RV_PA ${cfg.rvot ?? "atretic"}, duct ${cfg.duct || "closed"}; after ${SECONDS} s ` +
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
