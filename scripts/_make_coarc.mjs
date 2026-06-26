// Build the critical coarctation of the aorta (coarctation) and interrupted aortic arch (iaa) neonate
// scenarios from the calibrated term_neonate baseline. Both are LEFT aortic-arch obstructions that make
// the LOWER body duct-dependent: the upper body (head + arms, off the ascending aorta AA) is perfused
// antegrade by the left ventricle, while the lower body (off the descending aorta AD) depends on the
// ductus arteriosus delivering pulmonary-artery blood right-to-left into the descending aorta. The two
// hallmarks are a pre- vs post-ductal PRESSURE gradient (upper-body hypertension, weak femoral pulses) and
// DIFFERENTIAL cyanosis (pre-ductal pink, post-ductal blue). As the duct closes the lower body collapses
// into shock.
//   coarctation  a tight but patent aortic isthmus (an antegrade trickle remains); the duct supplies the
//                lower body right-to-left. Dominant sign: the pre/post-ductal pressure gradient.
//   iaa          the arch is completely interrupted (no antegrade flow at all); the lower body is ENTIRELY
//                duct-dependent. Almost always with a ventricular septal defect (and a 22q11 association).
//
// Engine wiring note: the ductus is normally wired AAR->PA, but for these lesions it must join the
// DESCENDING aorta, so we re-point the Pda's resistor (AAR_DA) comp_from to "AD" (PA<->AD). This keeps the
// duct desaturating only the lower body, giving correct differential cyanosis; no engine code change is
// needed (the Pda model drives whatever endpoints its resistor names). The isthmus itself is the AD blood
// vessel's forward resistance: AD adopts its same-named input resistor AAR_AD and overwrites its r_for with
// AD.r_for_eff each step, so the coarctation lever is Circulation.components.AD.r_for (raising AAR_AD.r_for
// directly would be wiped); interruption is AD.no_flow = true.
//
// Refs (PubMed): coarctation — Ganigara Semin Cardiothorac Vasc Anesth 2019 PMID 31535945; Egan & Holzer
// Expert Rev Cardiovasc Ther 2009 PMID 19900023. IAA — Jonas Semin Thorac Cardiovasc Surg 2015 PMID
// 26686446; Burbano-Vera Semin Cardiothorac Vasc Anesth 2018 PMID 29742969. See
// explain/docs/chd_duct_fo_dependent.md (lesions B3, B4).
//
// Un-warmed output; warm to its operating point with:
//   node scripts/reseed_coarc.mjs <key|--all> --write
// then validate with scripts/probe_coarc.mjs and scripts/probe_vitals.mjs --profile neonate.
//
// Usage:
//   node scripts/_make_coarc.mjs <key>     (one variant)
//   node scripts/_make_coarc.mjs --all      (all)

import fs from "node:fs";

// ---- per-variant lever table (starting points; tune against probe_coarc.mjs) --------------------------
const COARC = {
  coarctation: {
    isthmus: { interrupted: false, r_for: 30000 }, // tight but patent isthmus (AD.r_for; baseline 30)
    ductal: { pda: 1.0, vsd: 0 }, // duct supplies the lower body (PA->AD); intact ventricular septum
    desc: "term 3.5 kg neonate with critical coarctation of the aorta: a severely narrowed aortic isthmus " +
      "produces upper-body hypertension with weak femoral pulses (a large pre- vs post-ductal pressure " +
      "gradient) and makes the lower body duct-dependent — the ductus delivers pulmonary-artery blood " +
      "right-to-left into the descending aorta with mild differential cyanosis; presents in shock as the " +
      "duct closes, managed with prostaglandin E1 pending surgical repair",
  },

  iaa: {
    isthmus: { interrupted: true }, // arch completely interrupted (AD.no_flow = true)
    ductal: { pda: 1.0, vsd: 4 }, // lower body entirely duct-dependent; VSD is part of the lesion
    desc: "term 3.5 kg neonate with interrupted aortic arch: the aortic arch is discontinuous, so the " +
      "descending aorta and entire lower body are perfused exclusively right-to-left through the ductus " +
      "arteriosus, with a ventricular septal defect and marked differential cyanosis; a duct-dependent " +
      "systemic lesion (strongly associated with 22q11 deletion) that collapses into shock as the duct " +
      "closes, kept alive on prostaglandin E1 pending single-stage repair",
  },
};

const argv = process.argv.slice(2);
const keys = argv.includes("--all") ? Object.keys(COARC) : argv.filter((a) => !a.startsWith("-"));
if (keys.length === 0 || keys.some((k) => !COARC[k])) {
  console.error(`usage: node scripts/_make_coarc.mjs <key|--all>\nkeys: ${Object.keys(COARC).join(", ")}`);
  process.exit(1);
}

const srcPath = new URL("../public/model_definitions/term_neonate.json", import.meta.url);

for (const key of keys) {
  const cfg = COARC[key];
  const j = JSON.parse(fs.readFileSync(srcPath, "utf8"));

  j.name = key;
  j.user = "timothy";
  j.description = cfg.desc;

  const md = j.model_definition;
  md.name = key;
  md.description = cfg.desc;
  const M = md.models;
  const C = M.Circulation.components;
  const log = [];

  // A. Re-point the ductus to the descending aorta (PA <-> AD) -------------------------------------------
  M.Pda.components.AAR_DA.comp_from = "AD"; // the duct now joins the descending aorta, not the arch
  M.Pda.diameter_relative = cfg.ductal.pda;
  log.push(`A duct: AAR_DA re-pointed AD<->PA, Pda.diameter_relative=${cfg.ductal.pda} (lower-body lifeline)`);

  // B. Aortic-arch obstruction at the isthmus (the AD vessel's forward resistance) ----------------------
  if (cfg.isthmus.interrupted) {
    C.AD.no_flow = true; // interrupt the AAR->AD connector entirely
    log.push("B isthmus: AD.no_flow=true (aortic arch interrupted — no antegrade flow)");
  } else {
    C.AD.r_for = cfg.isthmus.r_for;
    C.AD.r_back = cfg.isthmus.r_for;
    log.push(`B isthmus: AD.r_for=${cfg.isthmus.r_for} (tight but patent coarctation; baseline 30)`);
  }

  // C. Ventricular septal defect (part of IAA; intact septum in isolated coarctation) -------------------
  M.Shunts.diameter_vsd = cfg.ductal.vsd;
  M.Shunts.diameter_fo = 0; // atrial septum intact
  log.push(`C septum: diameter_vsd=${cfg.ductal.vsd}, diameter_fo=0`);

  const dst = new URL(`../public/model_definitions/${key}.json`, import.meta.url);
  fs.writeFileSync(dst, JSON.stringify(j, null, 1) + "\n");
  console.log(`wrote ${key}.json\n  ${log.join("\n  ")}`);
}
