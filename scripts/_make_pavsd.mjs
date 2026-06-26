// Build a pulmonary atresia with ventricular septal defect (PA+VSD) neonate scenario from the calibrated
// term_neonate baseline. The pulmonary valve is atretic, but — UNLIKE pulmonary atresia with an intact
// septum (PA-IVS) — a large VSD lets the right ventricle DECOMPRESS into the left ventricle and aorta. The
// consequences:
//   - the RV is not a blind hypertensive chamber; through the large VSD it equilibrates with the LV at
//     systemic pressure and both ventricles eject into the single aortic outlet (systemic venous return:
//     RA -> RV -> VSD -> LV -> aorta), so the atrial septum need NOT be patent (this lesion is duct-
//     dependent but NOT foramen-ovale-dependent — contrast PA-IVS / tricuspid atresia),
//   - pulmonary blood flow is supplied ENTIRELY by the ductus arteriosus (aorta -> PA, left-to-right) in
//     the absence of major aortopulmonary collateral arteries (MAPCAs, which are not modelled here), so
//     the lungs are duct-dependent (ductal closure -> lethal hypoxaemia),
//   - the aortic blood is mixed (desaturated systemic venous return via the VSD + oxygenated pulmonary
//     venous return), producing cyanosis.
// The left heart is structurally normal, so the cardiac cycle is detected normally (no engine change).
//
// Calibration note: in this lumped model BOTH ventricles eject into one aortic outlet, which doubles the
// combined contractile output and makes the systemic circulation hyperdynamic (supraphysiological CO and
// MAP). Heart.cont_factor_left/right are lowered together to ~0.6 to normalise the combined output to a
// physiological cardiac output and MAP — a geometry compensation, not an intrinsic ventricular weakness.
//
// Refs (PubMed): Soquet Ann Thorac Surg 2019 PMID 30831109; Presnell World J Pediatr Congenit Heart Surg
// 2015 PMID 26467877 (PA/VSD: duct- and/or MAPCA-supplied pulmonary flow). See
// explain/docs/chd_duct_fo_dependent.md (lesion A2). KNOWN LIMITATION: MAPCAs are not modelable.
//
// Un-warmed output; warm to its operating point with:
//   node scripts/reseed_pavsd.mjs <key|--all> --write
// then validate with scripts/probe_pavsd.mjs and scripts/probe_vitals.mjs --profile neonate.
//
// Usage:
//   node scripts/_make_pavsd.mjs <key>     (one variant)
//   node scripts/_make_pavsd.mjs --all      (all)

import fs from "node:fs";

// ---- per-variant lever table (starting points; tune against probe_pavsd.mjs) --------------------------
const PAVSD = {
  pa_vsd: {
    vsd: 5, // large VSD -> RV decompresses into LV/aorta (equilibrated pressures)
    cont: 0.6, // both ventricles -> normalise the combined (two-into-one-outlet) systemic output
    ductal: { pda: 1.0, duct_mm: 4 }, // wide ductus = the SOLE pulmonary supply
    desc: "term 3.5 kg neonate with pulmonary atresia and a ventricular septal defect: the atretic " +
      "pulmonary valve gives no antegrade pulmonary flow, but a large VSD lets the right ventricle " +
      "decompress into the left ventricle and aorta (the ventricles equilibrate at systemic pressure and " +
      "both eject into the aorta), so the atrial septum need not be open; pulmonary blood flow is supplied " +
      "entirely by the ductus arteriosus (no MAPCAs modelled) and the mixed aortic blood produces cyanosis " +
      "— a duct-dependent lesion kept alive on prostaglandin E1 pending repair/shunt",
  },
};

const argv = process.argv.slice(2);
const keys = argv.includes("--all") ? Object.keys(PAVSD) : argv.filter((a) => !a.startsWith("-"));
if (keys.length === 0 || keys.some((k) => !PAVSD[k])) {
  console.error(`usage: node scripts/_make_pavsd.mjs <key|--all>\nkeys: ${Object.keys(PAVSD).join(", ")}`);
  process.exit(1);
}

const srcPath = new URL("../public/model_definitions/term_neonate.json", import.meta.url);

for (const key of keys) {
  const cfg = PAVSD[key];
  const j = JSON.parse(fs.readFileSync(srcPath, "utf8"));

  j.name = key;
  j.user = "timothy";
  j.description = cfg.desc;

  const md = j.model_definition;
  md.name = key;
  md.description = cfg.desc;
  const M = md.models;
  const heart = M.Heart.components;
  const log = [];

  // A. Pulmonary atresia + large VSD (RV decompresses to the aorta) --------------------------------------
  heart.RV_PA.no_flow = true;
  heart.RV_PA.is_enabled = false; // atretic pulmonary valve — no antegrade flow
  M.Shunts.diameter_vsd = cfg.vsd; // large VSD -> RV -> LV -> aorta
  M.Shunts.diameter_fo = 0; // intact atrial septum (NOT foramen-ovale-dependent)
  log.push(`A atresia: RV_PA no_flow (atretic), diameter_vsd=${cfg.vsd} (RV decompresses to aorta), diameter_fo=0`);

  // B. Normalise the combined two-ventricle output into the single aortic outlet ------------------------
  M.Heart.cont_factor_left = cfg.cont;
  M.Heart.cont_factor_right = cfg.cont;
  log.push(`B contractility: cont_factor_left/right=${cfg.cont} (normalise the two-into-one-outlet systemic output)`);

  // C. Duct-dependent pulmonary flow — the sole pulmonary supply -----------------------------------------
  M.Pda.diameter_relative = cfg.ductal.pda;
  M.Pda.diameter_ao_max = cfg.ductal.duct_mm;
  M.Pda.diameter_pa_max = cfg.ductal.duct_mm;
  log.push(`C ductal: Pda.diameter_relative=${cfg.ductal.pda} duct=${cfg.ductal.duct_mm}mm (sole pulmonary supply, no MAPCAs)`);

  const dst = new URL(`../public/model_definitions/${key}.json`, import.meta.url);
  fs.writeFileSync(dst, JSON.stringify(j, null, 1) + "\n");
  console.log(`wrote ${key}.json\n  ${log.join("\n  ")}`);
}
