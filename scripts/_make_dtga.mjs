// Build a d-transposition of the great arteries (d-TGA) neonate scenario from the calibrated
// term_neonate baseline. In d-TGA the aorta arises from the right ventricle and the pulmonary artery from
// the left ventricle, so the systemic and pulmonary circulations run in PARALLEL rather than in series:
// deoxygenated systemic venous blood is pumped straight back out to the body (RV -> aorta) while
// oxygenated pulmonary venous blood recirculates to the lungs (LV -> PA). Survival is impossible without
// MIXING between the two circuits. With an intact ventricular septum (the form modeled here) the only
// mixing sites are the foramen ovale / atrial septum and the ductus arteriosus — making this lesion both
// foramen-ovale- AND duct-dependent. The classic neonatal rescue is prostaglandin E1 (keep the duct open)
// plus balloon atrial septostomy (Rashkind — enlarge the atrial communication to improve mixing).
//
// Refs (PubMed): Martins & Castela Orphanet J Rare Dis 2008 PMID 18851735 (parallel circulations, mixing);
// Rashkind & Miller JAMA 1966 PMID 4160716 (balloon atrial septostomy); Cucerea Biomedicines 2024
// PMID 39335532 (PGE1/BAS effects). See explain/docs/chd_duct_fo_dependent.md (lesion C1).
//
// Lever groups (see term_neonate baseline):
//   A outflow  swap the ventriculo-arterial connection — enable RV_AA (RV->aorta) + LV_PA (LV->PA),
//              disable the normal RV_PA + LV_AA. These four HeartValves are pre-wired in term_neonate.
//   B mixing   Shunts.diameter_fo + fo_lr_factor (the atrial communication: a true ASD/septostomy hole
//              behaves symmetrically, so we DROP fo_lr_factor from the fetal flap-valve value to ~1 — a
//              high fo_lr_factor would throttle the LA->RA flow that oxygenates the systemic circuit) and
//              Pda.diameter_relative (the ductus). Intact ventricular septum -> diameter_vsd stays 0.
//
// Note on the engine: Heart.calc_model detects end-systole from the active LV outflow valve (LV_AA if
// enabled, else LV_PA), so the cardiac-cycle analysis (and HeartFunction's wall-stress inputs) stay valid
// with the great arteries transposed.
//
// Un-warmed output; warm to its operating point with:
//   node scripts/reseed_dtga.mjs <key|--all> --write
// then validate with scripts/probe_dtga.mjs and scripts/probe_vitals.mjs --profile neonate.
//
// Usage:
//   node scripts/_make_dtga.mjs <key>     (one variant)
//   node scripts/_make_dtga.mjs --all      (all)

import fs from "node:fs";

// ---- per-variant lever table (starting points; tune against probe_dtga.mjs) ----------------------------
const TGA = {
  dtga: {
    // mixing: a restrictive-to-moderate atrial communication + an open duct. Cyanotic but viable; the
    // teaching demo is to enlarge diameter_fo (septostomy) and/or open the duct further and watch SpO2 rise.
    mixing: { fo: 6, fo_lr_factor: 1, pda: 1.0, vsd: 0 },
    desc: "term 3.5 kg neonate with d-transposition of the great arteries and intact ventricular septum: " +
      "the aorta arises from the right ventricle and the pulmonary artery from the left ventricle, so the " +
      "systemic and pulmonary circulations run in parallel and survival depends on mixing across the " +
      "foramen ovale and the ductus arteriosus; presents with cyanosis poorly responsive to oxygen — a " +
      "foramen-ovale- and duct-dependent lesion managed with prostaglandin E1 and balloon atrial " +
      "septostomy pending the arterial switch operation",
  },
};

const argv = process.argv.slice(2);
const keys = argv.includes("--all") ? Object.keys(TGA) : argv.filter((a) => !a.startsWith("-"));
if (keys.length === 0 || keys.some((k) => !TGA[k])) {
  console.error(`usage: node scripts/_make_dtga.mjs <key|--all>\nkeys: ${Object.keys(TGA).join(", ")}`);
  process.exit(1);
}

const srcPath = new URL("../public/model_definitions/term_neonate.json", import.meta.url);

// Swap a HeartValve on/off, keeping is_enabled and no_flow consistent (the engine gates flow on no_flow).
function setValve(v, on) {
  v.is_enabled = on;
  v.no_flow = !on;
}

for (const key of keys) {
  const cfg = TGA[key];
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

  // A. Ventriculo-arterial discordance — transpose the great arteries -----------------------------------
  setValve(heart.RV_AA, true);   // RV -> aorta  (the transposed aortic valve)
  setValve(heart.LV_PA, true);   // LV -> PA     (the transposed pulmonary valve)
  setValve(heart.RV_PA, false);  // normal pulmonary valve removed
  setValve(heart.LV_AA, false);  // normal aortic valve removed
  log.push("A outflow: RV->AA + LV->PA enabled; RV->PA + LV->AA disabled (great arteries transposed)");

  // B. Mixing — atrial communication (FO/ASD) + ductus arteriosus; intact ventricular septum ------------
  M.Shunts.diameter_fo = cfg.mixing.fo;
  M.Shunts.fo_lr_factor = cfg.mixing.fo_lr_factor; // ~1 = true ASD/septostomy hole (symmetric), not a flap
  M.Shunts.diameter_vsd = cfg.mixing.vsd;          // 0 = intact ventricular septum
  M.Pda.diameter_relative = cfg.mixing.pda;
  log.push(`B mixing: diameter_fo=${cfg.mixing.fo} fo_lr_factor=${cfg.mixing.fo_lr_factor} (atrial), ` +
    `Pda.diameter_relative=${cfg.mixing.pda} (ductal), diameter_vsd=${cfg.mixing.vsd} (intact septum)`);

  const dst = new URL(`../public/model_definitions/${key}.json`, import.meta.url);
  fs.writeFileSync(dst, JSON.stringify(j, null, 1) + "\n");
  console.log(`wrote ${key}.json\n  ${log.join("\n  ")}`);
}
