// Build a hypoplastic left heart syndrome (HLHS) neonate scenario from the calibrated term_neonate
// baseline. In HLHS the left heart cannot support the systemic circulation: here we model the classic
// mitral-atresia / aortic-atresia form, so the left ventricle is excluded entirely. The consequences are a
// single-(right)-ventricle parallel circulation:
//   - all oxygenated pulmonary venous return is OBLIGATED left-to-right across the foramen ovale (LA->RA),
//     mixing with systemic venous return in the right atrium (foramen-ovale dependent — a restrictive or
//     intact atrial septum is lethal),
//   - the right ventricle is the only pump; it drives the pulmonary arteries AND, through a wide ductus
//     arteriosus (PA->aorta, right-to-left), the entire systemic circulation, perfusing the ascending
//     aorta and coronaries RETROGRADE up the arch (duct-dependent systemic flow — ductal closure causes
//     cardiogenic shock).
// Systemic and pulmonary blood are fully mixed in the RV, so saturations are uniformly reduced and
// oxygenation is set by the Qp:Qs balance (pulmonary over-circulation steals from systemic output).
//
// Refs (PubMed): Connor & Thiagarajan Orphanet J Rare Dis 2007 PMID 17498282 (HLHS overview, duct-dependent
// systemic flow, Qp:Qs); Schranz Pediatr Cardiol 2024 PMID 38664298 (duct stenting / systemic duct
// dependence); Vlahos Circulation 2004 PMID 15136496 (restrictive/intact atrial septum is lethal). See
// explain/docs/chd_duct_fo_dependent.md (lesion B1).
//
// Lever groups (see term_neonate baseline):
//   A left heart  mitral atresia (LA_LV off) + aortic atresia (LV_AA off) -> LV excluded. Heart.calc_model
//                 derives the cardiac cycle from the ventricular activation window when the LV has no
//                 outflow, so the single-RV physiology keeps a valid cycle.
//   B atrial      Shunts.diameter_fo + fo_lr_factor: the OBLIGATE left-to-right atrial communication. A
//                 true ASD/septostomy hole is symmetric, so fo_lr_factor ~1 (a high fetal-flap value would
//                 throttle the very LA->RA flow that must carry the whole pulmonary venous return).
//   C ductal      Pda.diameter_relative wide open + a fat duct (diameter_ao/pa_max): the systemic lifeline
//                 (PA->aorta, R->L). diameter_vsd 0.
//   D aorta       hypoplastic ascending aorta (AA u_vol down / el_base up) — perfused retrograde via the duct.
//   E PVR         raise pulmonary arteriolar resistance (PAAL/PAAR/{L,R}L_ART/{L,R}L_CAP) to BALANCE the
//                 parallel circulation. At baseline PVR the lungs steal the RV output (Qp:Qs ~3.5, systemic
//                 hypoperfusion); a moderate PVR brings Qp:Qs toward ~1.5-2 with SpO2 ~80% — the typical
//                 HLHS balance. (Lowering PVR, e.g. with too much O2/hyperventilation, recreates the
//                 pulmonary-overcirculation / systemic-steal failure mode.)
//
// Un-warmed output; warm to its operating point with:
//   node scripts/reseed_hlhs.mjs <key|--all> --write
// then validate with scripts/probe_hlhs.mjs and scripts/probe_vitals.mjs --profile neonate.
//
// Usage:
//   node scripts/_make_hlhs.mjs <key>     (one variant)
//   node scripts/_make_hlhs.mjs --all      (all)

import fs from "node:fs";

// ---- per-variant lever table (starting points; tune against probe_hlhs.mjs) ---------------------------
const HLHS = {
  hlhs: {
    atrial: { fo: 6, fo_lr_factor: 1 }, // open, non-restrictive atrial communication
    ductal: { pda: 1.0, duct_mm: 4, vsd: 0 }, // wide duct (systemic lifeline), intact ventricular septum
    aorta: { u_vol_factor: 0.6, el_factor: 1.4 }, // hypoplastic ascending aorta
    pvr: 2.0, // pulmonary arteriolar resistance multiplier -> balance Qp:Qs ~1.7, SpO2 ~80%
    desc: "term 3.5 kg neonate with hypoplastic left heart syndrome (mitral and aortic atresia): the left " +
      "ventricle is non-functional, so the right ventricle is the single pump for a parallel circulation — " +
      "all pulmonary venous return crosses the foramen ovale left-to-right to mix in the right atrium, and " +
      "the systemic circulation (including retrograde aortic-arch and coronary perfusion) is supplied " +
      "right-to-left through a wide ductus arteriosus; a foramen-ovale- and duct-dependent lesion with " +
      "moderate cyanosis, kept alive on prostaglandin E1 pending Norwood palliation",
  },

  // Restrictive / intact atrial septum — the lethal HLHS emergency. The atrial communication is too small
  // to pass the WHOLE pulmonary venous return (which in HLHS has nowhere else to go), so the left atrium
  // cannot decompress: LA pressure rises steeply (pulmonary venous hypertension -> pulmonary oedema),
  // the obligate shunt and the single-RV preload fall, and hypoxaemia worsens. Demands emergent atrial
  // decompression (balloon/blade septostomy or stenting). Only the atrial lever differs from `hlhs`.
  hlhs_restrictive: {
    atrial: { fo: 1, fo_lr_factor: 1 }, // restrictive orifice -> severe LA hypertension, choked shunt
    ductal: { pda: 1.0, duct_mm: 4, vsd: 0 },
    aorta: { u_vol_factor: 0.6, el_factor: 1.4 },
    pvr: 2.0,
    desc: "term 3.5 kg neonate with hypoplastic left heart syndrome and a RESTRICTIVE atrial septum: as in " +
      "HLHS the right ventricle is the single pump and all pulmonary venous return must cross the foramen " +
      "ovale, but the atrial communication is too small to decompress the left atrium — left-atrial " +
      "pressure rises steeply (pulmonary venous hypertension and oedema), the obligate left-to-right shunt " +
      "and right-ventricular preload fall, and hypoxaemia is severe; a lethal foramen-ovale-dependent " +
      "emergency requiring immediate atrial decompression (balloon/blade septostomy or stenting)",
  },
};

const argv = process.argv.slice(2);
const keys = argv.includes("--all") ? Object.keys(HLHS) : argv.filter((a) => !a.startsWith("-"));
if (keys.length === 0 || keys.some((k) => !HLHS[k])) {
  console.error(`usage: node scripts/_make_hlhs.mjs <key|--all>\nkeys: ${Object.keys(HLHS).join(", ")}`);
  process.exit(1);
}

const srcPath = new URL("../public/model_definitions/term_neonate.json", import.meta.url);

// Atrese a HeartValve (block all flow through it), keeping is_enabled and no_flow consistent.
function atrese(v) { v.is_enabled = false; v.no_flow = true; }

for (const key of keys) {
  const cfg = HLHS[key];
  const j = JSON.parse(fs.readFileSync(srcPath, "utf8"));

  j.name = key;
  j.user = "timothy";
  j.description = cfg.desc;

  const md = j.model_definition;
  md.name = key;
  md.description = cfg.desc;
  const M = md.models;
  const heart = M.Heart.components;
  const circ = M.Circulation.components;
  const log = [];

  // A. Left-heart exclusion — mitral atresia + aortic atresia -------------------------------------------
  atrese(heart.LA_LV); // mitral atresia: no LV inflow
  atrese(heart.LV_AA); // aortic atresia: no LV outflow
  log.push("A left heart: LA_LV (mitral) + LV_AA (aortic) atretic -> LV excluded; single right ventricle");

  // B. Obligate left-to-right atrial communication (foramen ovale) --------------------------------------
  M.Shunts.diameter_fo = cfg.atrial.fo;
  M.Shunts.fo_lr_factor = cfg.atrial.fo_lr_factor; // ~1 = symmetric ASD/septostomy hole (free LA->RA)
  log.push(`B atrial: diameter_fo=${cfg.atrial.fo} fo_lr_factor=${cfg.atrial.fo_lr_factor} (obligate LA->RA)`);

  // C. Duct-dependent systemic flow — wide ductus; intact ventricular septum ----------------------------
  M.Pda.diameter_relative = cfg.ductal.pda;
  M.Pda.diameter_ao_max = cfg.ductal.duct_mm;
  M.Pda.diameter_pa_max = cfg.ductal.duct_mm;
  M.Shunts.diameter_vsd = cfg.ductal.vsd;
  log.push(`C ductal: Pda.diameter_relative=${cfg.ductal.pda} duct=${cfg.ductal.duct_mm}mm (PA->aorta, systemic lifeline), diameter_vsd=${cfg.ductal.vsd}`);

  // D. Hypoplastic ascending aorta (perfused retrograde via the duct) -----------------------------------
  const AA = circ.AA;
  AA.u_vol = Number((AA.u_vol * cfg.aorta.u_vol_factor).toPrecision(9));
  AA.el_base = Number((AA.el_base * cfg.aorta.el_factor).toPrecision(9));
  log.push(`D aorta: AA u_vol x${cfg.aorta.u_vol_factor}, el_base x${cfg.aorta.el_factor} (hypoplastic ascending aorta)`);

  // E. Balance the parallel circulation — raise pulmonary arteriolar resistance -------------------------
  for (const n of ["PAAL", "PAAR", "LL_ART", "RL_ART", "LL_CAP", "RL_CAP"]) {
    circ[n].r_for = Number((circ[n].r_for * cfg.pvr).toPrecision(9));
    circ[n].r_back = Number((circ[n].r_back * cfg.pvr).toPrecision(9));
  }
  log.push(`E PVR: pulmonary arteriolar r x${cfg.pvr} (Qp:Qs balance)`);

  const dst = new URL(`../public/model_definitions/${key}.json`, import.meta.url);
  fs.writeFileSync(dst, JSON.stringify(j, null, 1) + "\n");
  console.log(`wrote ${key}.json\n  ${log.join("\n  ")}`);
}
