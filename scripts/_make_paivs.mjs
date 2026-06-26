// Build a pulmonary atresia with intact ventricular septum (PA-IVS) neonate scenario from the calibrated
// term_neonate baseline. The pulmonary valve is completely atretic (no antegrade flow at all — this is the
// limit beyond critical pulmonary stenosis) and the ventricular septum is intact, so the right ventricle
// is a BLIND chamber: it can neither reach the lungs (atretic valve) nor decompress through a VSD. The
// consequences make this both a duct- and a foramen-ovale-dependent lesion:
//   - all systemic venous return is OBLIGATED right-to-left across the foramen ovale (RA->LA) to reach the
//     left heart — the entire venous return, not just a pop-off (a restrictive atrial septum is lethal),
//   - the left ventricle is the only effective pump and ejects the mixed (desaturated systemic + oxygenated
//     pulmonary venous) return -> cyanosis,
//   - pulmonary blood flow is ENTIRELY duct-dependent: the ductus carries aortic blood into the pulmonary
//     artery (aorta->PA, left-to-right) — there is no antegrade source at all (ductal closure -> lethal
//     hypoxaemia),
//   - the blind RV is hypoplastic and HYPERTENSIVE: it contracts against the atretic valve and decompresses
//     only as a restrictive tricuspid-regurgitation jet, generating a suprasystemic pressure. (In ~10% of
//     real cases this drives an RV-dependent coronary circulation via sinusoids — not modeled here.)
// The left heart is structurally normal, so the cardiac cycle and LV output are unaffected.
//
// Refs (PubMed): Chikkabyrappa Semin Cardiothorac Vasc Anesth 2018 PMID 29411679 (PA-IVS physiology: no RV
// outflow, obligate R->L atrial shunt, duct-dependent pulmonary flow, RV-dependent coronaries); Jaggers
// AATS consensus J Thorac Cardiovasc Surg 2025 PMID 40320005. See explain/docs/chd_duct_fo_dependent.md (A1).
//
// Lever groups (see term_neonate baseline):
//   A atresia   RV_PA.no_flow=true (pulmonary valve atretic — no antegrade flow). diameter_vsd 0 (intact
//               septum). The blind RV is made hypoplastic & stiff (RV el_min up, u_vol down).
//   B tricuspid the only RV outlet: enable tricuspid regurgitation (RAIVCI_RV/RASVC_RV no_back_flow=false)
//               with a RESTRICTIVE r_back, so the blind RV pressurizes to suprasystemic levels and
//               decompresses as a high-velocity TR jet (instead of trapping volume).
//   C atrial    Shunts.diameter_fo open to carry the WHOLE systemic venous return right-to-left. The fetal-
//               flap asymmetry (fo_lr_factor, kept at the baseline 25) makes R->L easy — the direction this
//               lesion needs (contrast HLHS/TGA, which need it ~1).
//   D ductal    Pda.diameter_relative wide open: the sole pulmonary blood supply (aorta->PA, L->R).
//
// Un-warmed output; warm to its operating point with:
//   node scripts/reseed_paivs.mjs <key|--all> --write
// then validate with scripts/probe_paivs.mjs and scripts/probe_vitals.mjs --profile neonate.
//
// Usage:
//   node scripts/_make_paivs.mjs <key>     (one variant)
//   node scripts/_make_paivs.mjs --all      (all)

import fs from "node:fs";

// ---- per-variant lever table (starting points; tune against probe_paivs.mjs) --------------------------
const PAIVS = {
  pa_ivs: {
    rv: { el_min: 2500, u_vol: 0.002 }, // hypoplastic, stiff right ventricle
    tr_r_back: 5000, // restrictive tricuspid regurgitation -> suprasystemic blind RV (~70 mmHg), still stable
    atrial: { fo: 6 }, // foramen ovale open; baseline fo_lr_factor 25 carries the obligate R->L return
    ductal: { pda: 1.0, vsd: 0 }, // duct = the sole pulmonary blood supply; intact ventricular septum
    desc: "term 3.5 kg neonate with pulmonary atresia and intact ventricular septum: the atretic pulmonary " +
      "valve and intact septum leave the right ventricle a blind, hypoplastic, hypertensive chamber, so all " +
      "systemic venous return is obligated right-to-left across the foramen ovale and the left ventricle " +
      "pumps the mixed return; pulmonary blood flow is supplied entirely by the ductus arteriosus " +
      "(aorta-to-pulmonary-artery), producing cyanosis — a foramen-ovale- and duct-dependent lesion kept " +
      "alive on prostaglandin E1 pending decompression/shunt palliation",
  },
};

const argv = process.argv.slice(2);
const keys = argv.includes("--all") ? Object.keys(PAIVS) : argv.filter((a) => !a.startsWith("-"));
if (keys.length === 0 || keys.some((k) => !PAIVS[k])) {
  console.error(`usage: node scripts/_make_paivs.mjs <key|--all>\nkeys: ${Object.keys(PAIVS).join(", ")}`);
  process.exit(1);
}

const srcPath = new URL("../public/model_definitions/term_neonate.json", import.meta.url);

for (const key of keys) {
  const cfg = PAIVS[key];
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

  // A. Pulmonary atresia + hypoplastic blind RV; intact ventricular septum ------------------------------
  heart.RV_PA.no_flow = true;
  heart.RV_PA.is_enabled = false; // atretic pulmonary valve — no antegrade flow
  heart.RV.el_min = cfg.rv.el_min;
  heart.RV.u_vol = cfg.rv.u_vol;
  M.Shunts.diameter_vsd = cfg.ductal.vsd; // intact septum (0)
  log.push(`A atresia: RV_PA no_flow (atretic), RV el_min=${cfg.rv.el_min}/u_vol=${cfg.rv.u_vol} (hypoplastic), diameter_vsd=${cfg.ductal.vsd}`);

  // B. Tricuspid regurgitation — the only outlet for the blind RV ---------------------------------------
  for (const t of ["RAIVCI_RV", "RASVC_RV"]) {
    heart[t].no_back_flow = false;
    heart[t].r_back = cfg.tr_r_back;
  }
  log.push(`B tricuspid: RAIVCI_RV/RASVC_RV regurgitant (no_back_flow off, r_back=${cfg.tr_r_back}) -> hypertensive blind RV`);

  // C. Obligate right-to-left atrial shunt (foramen ovale carries the whole venous return) --------------
  M.Shunts.diameter_fo = cfg.atrial.fo;
  log.push(`C atrial: diameter_fo=${cfg.atrial.fo} (obligate R->L; fo_lr_factor left at baseline 25)`);

  // D. Duct-dependent pulmonary flow — the sole pulmonary blood supply ----------------------------------
  M.Pda.diameter_relative = cfg.ductal.pda;
  log.push(`D ductal: Pda.diameter_relative=${cfg.ductal.pda} (aorta->PA, sole pulmonary supply)`);

  const dst = new URL(`../public/model_definitions/${key}.json`, import.meta.url);
  fs.writeFileSync(dst, JSON.stringify(j, null, 1) + "\n");
  console.log(`wrote ${key}.json\n  ${log.join("\n  ")}`);
}
