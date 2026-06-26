// Build a tricuspid atresia neonate scenario from the calibrated term_neonate baseline. The tricuspid
// valve is absent, so there is NO connection from the right atrium to the right ventricle. The
// consequences make this both a foramen-ovale- and a duct-dependent lesion (the classic cyanotic, reduced-
// pulmonary-flow form — tricuspid atresia type Ib, with normally related great arteries, a restrictive VSD
// and pulmonary stenosis):
//   - ALL systemic venous return is OBLIGATED right-to-left across the foramen ovale (RA->LA); the left
//     ventricle is the single functional pump and ejects the mixed (systemic + pulmonary venous) return
//     -> cyanosis (a restrictive atrial septum is poorly tolerated),
//   - the lungs are reached only through the ventricular septal defect: LV -> VSD -> the small right
//     ventricle -> pulmonary artery. A restrictive VSD plus pulmonary stenosis limits this antegrade
//     pulmonary flow, so it is supplemented DUCT-dependently (ductus, aorta->PA, left-to-right) — closing
//     the duct drops the saturation further.
// The left heart is structurally normal, so the cardiac cycle and LV output are unaffected (no engine
// change needed).
//
// Refs (PubMed): Sumal J Card Surg 2020 PMID 32484582 (tricuspid atresia: obligate R->L atrial shunt,
// cyanosis, single-ventricle palliation); Rychik AHA Fontan statement Circulation 2019 PMID 31256636. See
// explain/docs/chd_duct_fo_dependent.md (lesion A4).
//
// Lever groups (see term_neonate baseline):
//   A atresia   the (split) tricuspid valve RAIVCI_RV + RASVC_RV no_flow=true. The right ventricle is
//               hypoplastic (RV el_min up, u_vol down) — it is fed only through the VSD.
//   B atrial    Shunts.diameter_fo open for the OBLIGATE right-to-left atrial shunt (baseline fo_lr_factor
//               25 makes R->L easy — the direction this lesion needs).
//   C pulmonary route to the lungs: Shunts.diameter_vsd (restrictive) + RV_PA pulmonary stenosis limit the
//               antegrade LV->VSD->RV->PA flow; Pda.diameter_relative open supplements it duct-dependently.
//
// Un-warmed output; warm to its operating point with:
//   node scripts/reseed_ta.mjs <key|--all> --write
// then validate with scripts/probe_ta.mjs and scripts/probe_vitals.mjs --profile neonate.
//
// Usage:
//   node scripts/_make_ta.mjs <key>     (one variant)
//   node scripts/_make_ta.mjs --all      (all)

import fs from "node:fs";

// ---- per-variant lever table (starting points; tune against probe_ta.mjs) -----------------------------
const TA = {
  tricuspid_atresia: {
    rv: { el_min: 2200, u_vol: 0.0025 }, // hypoplastic right ventricle (fed only by the VSD)
    atrial: { fo: 6 }, // obligate right-to-left atrial shunt
    pulmonary: { vsd: 2, rv_pa_r_for: 800, pda: 0.8 }, // restrictive VSD + pulmonary stenosis + duct supply
    desc: "term 3.5 kg neonate with tricuspid atresia (normally related great arteries, restrictive " +
      "ventricular septal defect and pulmonary stenosis): the absent tricuspid valve obligates all systemic " +
      "venous return right-to-left across the foramen ovale, leaving the left ventricle as the single pump " +
      "for a mixed circulation, while pulmonary blood flow reaches the lungs only through the VSD into a " +
      "hypoplastic right ventricle and is supplemented duct-dependently — producing cyanosis; a foramen-" +
      "ovale- and duct-dependent lesion managed with prostaglandin E1 and staged single-ventricle palliation",
  },
};

const argv = process.argv.slice(2);
const keys = argv.includes("--all") ? Object.keys(TA) : argv.filter((a) => !a.startsWith("-"));
if (keys.length === 0 || keys.some((k) => !TA[k])) {
  console.error(`usage: node scripts/_make_ta.mjs <key|--all>\nkeys: ${Object.keys(TA).join(", ")}`);
  process.exit(1);
}

const srcPath = new URL("../public/model_definitions/term_neonate.json", import.meta.url);

for (const key of keys) {
  const cfg = TA[key];
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

  // A. Tricuspid atresia (split tricuspid) + hypoplastic right ventricle --------------------------------
  for (const t of ["RAIVCI_RV", "RASVC_RV"]) { heart[t].no_flow = true; heart[t].is_enabled = false; }
  heart.RV.el_min = cfg.rv.el_min;
  heart.RV.u_vol = cfg.rv.u_vol;
  log.push(`A atresia: RAIVCI_RV + RASVC_RV no_flow (tricuspid atretic), RV el_min=${cfg.rv.el_min}/u_vol=${cfg.rv.u_vol} (hypoplastic, VSD-fed)`);

  // B. Obligate right-to-left atrial shunt (foramen ovale carries the whole systemic venous return) -----
  M.Shunts.diameter_fo = cfg.atrial.fo;
  log.push(`B atrial: diameter_fo=${cfg.atrial.fo} (obligate R->L; fo_lr_factor baseline 25)`);

  // C. Pulmonary blood supply — restrictive VSD + pulmonary stenosis + duct -----------------------------
  M.Shunts.diameter_vsd = cfg.pulmonary.vsd;
  heart.RV_PA.r_for = cfg.pulmonary.rv_pa_r_for;
  M.Pda.diameter_relative = cfg.pulmonary.pda;
  log.push(`C pulmonary: diameter_vsd=${cfg.pulmonary.vsd} (LV->RV->PA route), RV_PA.r_for=${cfg.pulmonary.rv_pa_r_for} (pulmonary stenosis), Pda.diameter_relative=${cfg.pulmonary.pda} (duct supply)`);

  const dst = new URL(`../public/model_definitions/${key}.json`, import.meta.url);
  fs.writeFileSync(dst, JSON.stringify(j, null, 1) + "\n");
  console.log(`wrote ${key}.json\n  ${log.join("\n  ")}`);
}
