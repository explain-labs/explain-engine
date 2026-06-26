// Build a critical aortic stenosis (critical AS) neonate scenario from the calibrated term_neonate
// baseline. The aortic valve is severely — but not completely — obstructed (the left-sided mirror of
// critical pulmonary stenosis). The consequences make this a duct-dependent systemic lesion:
//   - the left ventricle is PRESSURE-loaded and FAILS: it generates a high pressure across a large
//     trans-valvular gradient but, in the classic low-flow/low-gradient way, cannot sustain an adequate
//     stroke volume, so antegrade systemic flow is inadequate,
//   - systemic perfusion — especially the lower body — becomes DUCT-DEPENDENT: the ductus carries
//     pulmonary-artery blood into the aorta (PA->aorta, right-to-left); this duct-fed lower body is
//     desaturated relative to the LV-fed upper body, producing DIFFERENTIAL cyanosis (pre-ductal pinker
//     than post-ductal). Ductal closure -> systemic hypoperfusion / cardiogenic shock,
//   - the failing LV raises left-atrial / end-diastolic pressure (pulmonary venous congestion), which
//     decompresses left-to-right across the foramen ovale.
// The aortic valve stays patent (a trickle of antegrade flow remains), so the cardiac cycle is detected
// normally and no engine change is needed.
//
// Refs (PubMed): Affolter & Ghanayem Cardiol Young 2014 PMID 25647388 (critical AS: cardiogenic shock, high
// LV wall stress, PGE1 to maintain systemic perfusion, balloon valvuloplasty). See
// explain/docs/chd_duct_fo_dependent.md (lesion B2).
//
// Lever groups (see term_neonate baseline):
//   A stenosis  LV_AA.r_for raised to a critical value (valve kept patent — no_flow stays false).
//               Heart.cont_factor_left is lowered to represent the failing, pressure-loaded LV — this keeps
//               the peak LV pressure in a realistic range (~110 rather than ~190 mmHg), models the low-flow/
//               low-gradient state, and deepens both the duct dependence and the differential cyanosis.
//   B ductal    Pda.diameter_relative wide open: the systemic lifeline (PA->aorta, R->L). diameter_vsd 0.
//   C atrial    Shunts.diameter_fo open with a modest fo_lr_factor for left-to-right LA decompression (the
//               high LA pressure pushes LA->RA, so — unlike HLHS/TGA which need fo_lr_factor ~1 — a slightly
//               restrictive flap is left so the LA partially decompresses while staying mildly congested).
//
// Un-warmed output; warm to its operating point with:
//   node scripts/reseed_cas.mjs <key|--all> --write
// then validate with scripts/probe_as.mjs and scripts/probe_vitals.mjs --profile neonate.
//
// Usage:
//   node scripts/_make_cas.mjs <key>     (one variant)
//   node scripts/_make_cas.mjs --all      (all)

import fs from "node:fs";

// ---- per-variant lever table (starting points; tune against probe_as.mjs) -----------------------------
const AS = {
  critical_as: {
    lv_aa_r_for: 8000, // severe aortic valve stenosis (baseline 55); valve stays patent (trickle)
    lv_cont: 0.4, // failing, pressure-loaded LV -> realistic peak (~110 mmHg), low-flow/low-gradient
    atrial: { fo: 2.5, fo_lr_factor: 4 }, // modest L->R LA decompression; LA stays mildly congested
    ductal: { pda: 1.0, vsd: 0 }, // duct supplies the (lower) body, intact ventricular septum
    desc: "term 3.5 kg neonate with critical aortic stenosis: a severely obstructed aortic valve pressure-" +
      "loads and fails the left ventricle (a low-flow/low-gradient state), so systemic perfusion — " +
      "especially the lower body — is duct-dependent (pulmonary-artery to aorta through the ductus) with " +
      "differential cyanosis, while the high left-atrial pressure decompresses left-to-right across the " +
      "foramen ovale; a duct-dependent lesion that presents in cardiogenic shock as the duct closes, " +
      "managed with prostaglandin E1 and balloon valvuloplasty",
  },
};

const argv = process.argv.slice(2);
const keys = argv.includes("--all") ? Object.keys(AS) : argv.filter((a) => !a.startsWith("-"));
if (keys.length === 0 || keys.some((k) => !AS[k])) {
  console.error(`usage: node scripts/_make_cas.mjs <key|--all>\nkeys: ${Object.keys(AS).join(", ")}`);
  process.exit(1);
}

const srcPath = new URL("../public/model_definitions/term_neonate.json", import.meta.url);

for (const key of keys) {
  const cfg = AS[key];
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

  // A. Critical aortic valve stenosis + failing pressure-loaded LV (valve patent) -----------------------
  heart.LV_AA.r_for = cfg.lv_aa_r_for; // no_flow stays false: stenosis, not atresia
  M.Heart.cont_factor_left = cfg.lv_cont; // failing, pressure-loaded LV
  log.push(`A stenosis: LV_AA.r_for=${cfg.lv_aa_r_for} (patent valve), cont_factor_left=${cfg.lv_cont} (failing LV)`);

  // B. Duct-dependent systemic flow — open ductus; intact ventricular septum ----------------------------
  M.Pda.diameter_relative = cfg.ductal.pda;
  M.Shunts.diameter_vsd = cfg.ductal.vsd;
  log.push(`B ductal: Pda.diameter_relative=${cfg.ductal.pda} (PA->aorta, systemic lifeline), diameter_vsd=${cfg.ductal.vsd}`);

  // C. Left-to-right atrial decompression (foramen ovale) -----------------------------------------------
  M.Shunts.diameter_fo = cfg.atrial.fo;
  M.Shunts.fo_lr_factor = cfg.atrial.fo_lr_factor;
  log.push(`C atrial: diameter_fo=${cfg.atrial.fo} fo_lr_factor=${cfg.atrial.fo_lr_factor} (L->R LA decompression)`);

  const dst = new URL(`../public/model_definitions/${key}.json`, import.meta.url);
  fs.writeFileSync(dst, JSON.stringify(j, null, 1) + "\n");
  console.log(`wrote ${key}.json\n  ${log.join("\n  ")}`);
}
