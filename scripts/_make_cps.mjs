// Build a critical pulmonary stenosis (critical PS) neonate scenario from the calibrated term_neonate
// baseline. The pulmonary valve is severely — but not completely — obstructed (critical PS sits just short
// of pulmonary atresia: a trickle of antegrade flow remains). The consequences:
//   - the right ventricle is PRESSURE-loaded: it must generate a suprasystemic pressure to drive a trickle
//     across the valve, so there is a large trans-valvular gradient (high RV pressure, low post-stenotic
//     pulmonary-artery pressure),
//   - antegrade pulmonary flow is inadequate, so pulmonary blood flow is DUCT-DEPENDENT: the ductus
//     arteriosus carries aortic blood into the pulmonary artery (aorta->PA, left-to-right) to perfuse the
//     lungs (ductal closure -> profound hypoxaemia),
//   - the stiff, pressured right atrium decompresses RIGHT-TO-LEFT across the foramen ovale (a "pop-off"):
//     desaturated systemic venous blood crosses to the left atrium and lowers systemic saturation -> cyanosis.
// The left heart is structurally normal, so the cardiac cycle and LV output are unaffected.
//
// Refs (PubMed): Latson J Interv Cardiol 2001 PMID 12053395 (critical PS: cyanosis, PGE1 to maintain the
// duct, balloon valvuloplasty); Aggarwal Am J Cardiol 2018 PMID 29681368 (neonatal balloon valvuloplasty
// outcomes). See explain/docs/chd_duct_fo_dependent.md (lesion A3).
//
// Lever groups (see term_neonate baseline):
//   A stenosis  RV_PA.r_for raised to a critical value (valve kept patent — no_flow stays false — so a
//               trickle of antegrade flow remains; this is a stenosis, not atresia). The RV generates a
//               suprasystemic pressure against it. Heart.cont_factor_right is lowered to represent the
//               pressure-loaded RV beginning to fail — this keeps the peak RV pressure in a realistic
//               suprasystemic range (~110 mmHg rather than 200), reduces the antegrade trickle (more
//               duct-dependence) and deepens the right-to-left pop-off / cyanosis.
//   B ductal    Pda.diameter_relative open: the pulmonary lifeline (aorta->PA, L->R). diameter_vsd 0.
//   C atrial    Shunts.diameter_fo open for the right-to-left pop-off. The fetal-flap asymmetry
//               (fo_lr_factor, kept at the baseline 25) makes R->L easy and L->R hard — exactly the
//               direction this lesion needs, so it is left untouched (contrast HLHS/TGA, which need it ~1).
//
// Un-warmed output; warm to its operating point with:
//   node scripts/reseed_cps.mjs <key|--all> --write
// then validate with scripts/probe_ps.mjs and scripts/probe_vitals.mjs --profile neonate.
//
// Usage:
//   node scripts/_make_cps.mjs <key>     (one variant)
//   node scripts/_make_cps.mjs --all      (all)

import fs from "node:fs";

// ---- per-variant lever table (starting points; tune against probe_ps.mjs) -----------------------------
const PS = {
  critical_ps: {
    rv_pa_r_for: 8000, // severe pulmonary valve stenosis (baseline 55); valve stays patent (trickle)
    rv_cont: 0.6, // pressure-loaded RV beginning to fail -> realistic suprasystemic peak (~110 mmHg)
    ductal: { pda: 0.7, vsd: 0 }, // duct supplies the lungs (aorta->PA), intact ventricular septum
    atrial: { fo: 5 }, // foramen ovale open; baseline fo_lr_factor 25 gives the R->L pop-off
    desc: "term 3.5 kg neonate with critical pulmonary stenosis: a severely obstructed (but not atretic) " +
      "pulmonary valve pressure-loads the right ventricle to suprasystemic pressures with only a trickle of " +
      "antegrade flow, so pulmonary blood flow is duct-dependent (aorta-to-pulmonary-artery through the " +
      "ductus) and the pressured right atrium decompresses right-to-left across the foramen ovale, " +
      "producing cyanosis; a duct-dependent lesion managed with prostaglandin E1 and balloon valvuloplasty",
  },
};

const argv = process.argv.slice(2);
const keys = argv.includes("--all") ? Object.keys(PS) : argv.filter((a) => !a.startsWith("-"));
if (keys.length === 0 || keys.some((k) => !PS[k])) {
  console.error(`usage: node scripts/_make_cps.mjs <key|--all>\nkeys: ${Object.keys(PS).join(", ")}`);
  process.exit(1);
}

const srcPath = new URL("../public/model_definitions/term_neonate.json", import.meta.url);

for (const key of keys) {
  const cfg = PS[key];
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

  // A. Critical pulmonary valve stenosis (patent — a trickle of antegrade flow remains) -----------------
  heart.RV_PA.r_for = cfg.rv_pa_r_for; // no_flow stays false: stenosis, not atresia
  M.Heart.cont_factor_right = cfg.rv_cont; // pressure-loaded RV beginning to fail
  log.push(`A stenosis: RV_PA.r_for=${cfg.rv_pa_r_for} (patent valve), cont_factor_right=${cfg.rv_cont} (pressure-loaded RV)`);

  // B. Duct-dependent pulmonary flow — open ductus; intact ventricular septum ----------------------------
  M.Pda.diameter_relative = cfg.ductal.pda;
  M.Shunts.diameter_vsd = cfg.ductal.vsd;
  log.push(`B ductal: Pda.diameter_relative=${cfg.ductal.pda} (aorta->PA, pulmonary lifeline), diameter_vsd=${cfg.ductal.vsd}`);

  // C. Right-to-left atrial pop-off (foramen ovale; baseline flap asymmetry favours R->L) ----------------
  M.Shunts.diameter_fo = cfg.atrial.fo;
  log.push(`C atrial: diameter_fo=${cfg.atrial.fo} (R->L pop-off; fo_lr_factor left at baseline 25)`);

  const dst = new URL(`../public/model_definitions/${key}.json`, import.meta.url);
  fs.writeFileSync(dst, JSON.stringify(j, null, 1) + "\n");
  console.log(`wrote ${key}.json\n  ${log.join("\n  ")}`);
}
