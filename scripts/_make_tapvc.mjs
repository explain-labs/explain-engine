// Build the total anomalous pulmonary venous connection scenarios (tapvc unobstructed + tapvc_obstructed)
// from the calibrated term_neonate baseline. In TAPVC the pulmonary veins do NOT connect to the left
// atrium — the entire pulmonary venous return drains to the SYSTEMIC venous side (here the SVC, the
// supracardiac type, the commonest). The consequences make this a foramen-ovale-dependent lesion:
//   - the right atrium receives BOTH the systemic venous return and all of the (oxygenated) pulmonary
//     venous return, so the blood is fully mixed and saturations are uniformly reduced,
//   - the left atrium has NO direct inflow; it — and the whole left heart and systemic circulation — is
//     filled only by an OBLIGATE right-to-left atrial shunt across the foramen ovale (a restrictive atrial
//     septum is therefore lethal),
//   - in the OBSTRUCTED form the anomalous channel is narrowed, so pulmonary venous pressure rises steeply
//     (pulmonary venous hypertension -> oedema) with secondary pulmonary arterial hypertension, severe
//     hypoxaemia and low output. Obstructed TAPVC is a true neonatal surgical EMERGENCY and is
//     prostaglandin-UNRESPONSIVE (it is not duct-dependent — the duct is left closed).
//
// Engine wiring note (JSON-only, no code change): re-point the pulmonary-vein connector PV_LA's comp_to
// from "LA" to "SVC" so the pulmonary veins drain to the systemic venous side. PV_LA is a free-standing
// Resistor (the LA HeartChamber does not adopt it), so its comp_to AND its r_for can be set directly — the
// channel resistance is the obstruction lever. The foramen ovale is opened (diameter_fo) with the baseline
// fetal-flap asymmetry (fo_lr_factor 25), which makes the obligate R->L direction easy.
//
// Refs (PubMed): Ross Semin Cardiothorac Vasc Anesth 2017 PMID 27694572 (obligate R->L shunt; obstructed =
// PGE1-unresponsive emergency); Vanderlaan 2018 PMID 29425529; Campbell J Am Soc Echocardiogr 2022 PMID
// 35863543. See explain/docs/chd_duct_fo_dependent.md (lesion D1).
//
// Un-warmed output; warm to its operating point with:
//   node scripts/reseed_tapvc.mjs <key|--all> --write
// then validate with scripts/probe_tapvc.mjs and scripts/probe_vitals.mjs --profile neonate.
//
// Usage:
//   node scripts/_make_tapvc.mjs <key>     (one variant)
//   node scripts/_make_tapvc.mjs --all      (all)

import fs from "node:fs";

// ---- per-variant lever table (starting points; tune against probe_tapvc.mjs) --------------------------
const TAPVC = {
  tapvc: {
    drain_to: "SVC", // supracardiac: pulmonary veins -> SVC -> right atrium
    channel_r: 335, // unobstructed anomalous channel (≈ the normal PV_LA resistance)
    fo: 6, // open foramen ovale carrying the obligate R->L left-heart filling
    desc: "term 3.5 kg neonate with (unobstructed, supracardiac) total anomalous pulmonary venous " +
      "connection: all pulmonary venous return drains to the superior vena cava and mixes with systemic " +
      "venous return in the right atrium, and the left heart is filled only by an obligate right-to-left " +
      "shunt across the foramen ovale; produces mild cyanosis from complete mixing and is not duct-" +
      "dependent (a foramen-ovale-dependent lesion)",
  },

  tapvc_obstructed: {
    drain_to: "SVC",
    channel_r: 5000, // obstructed anomalous channel -> pulmonary venous hypertension
    fo: 6,
    desc: "term 3.5 kg neonate with OBSTRUCTED total anomalous pulmonary venous connection: the anomalous " +
      "channel draining the pulmonary veins to the systemic venous circulation is narrowed, causing severe " +
      "pulmonary venous hypertension and oedema with secondary pulmonary arterial hypertension, profound " +
      "cyanosis and low cardiac output; the left heart is filled only by an obligate right-to-left atrial " +
      "shunt — a foramen-ovale-dependent, prostaglandin-UNRESPONSIVE neonatal surgical emergency",
  },
};

const argv = process.argv.slice(2);
const keys = argv.includes("--all") ? Object.keys(TAPVC) : argv.filter((a) => !a.startsWith("-"));
if (keys.length === 0 || keys.some((k) => !TAPVC[k])) {
  console.error(`usage: node scripts/_make_tapvc.mjs <key|--all>\nkeys: ${Object.keys(TAPVC).join(", ")}`);
  process.exit(1);
}

const srcPath = new URL("../public/model_definitions/term_neonate.json", import.meta.url);

for (const key of keys) {
  const cfg = TAPVC[key];
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

  // A. Anomalous pulmonary venous drainage — re-point PV_LA to the systemic venous side ------------------
  C.PV_LA.comp_to = cfg.drain_to; // pulmonary veins -> systemic vein instead of the left atrium
  C.PV_LA.r_for = cfg.channel_r;  // channel resistance = the obstruction lever (free-standing resistor)
  C.PV_LA.r_back = cfg.channel_r;
  log.push(`A drainage: PV_LA re-pointed PV->${cfg.drain_to}, r_for=${cfg.channel_r} (${cfg.channel_r > 1000 ? "OBSTRUCTED" : "unobstructed"})`);

  // B. Obligate right-to-left atrial shunt — the only filling of the left heart -------------------------
  M.Shunts.diameter_fo = cfg.fo; // baseline fo_lr_factor 25 makes the R->L direction easy
  M.Shunts.diameter_vsd = 0;
  log.push(`B atrial: diameter_fo=${cfg.fo} (obligate R->L fills the left heart; fo_lr_factor baseline 25)`);

  // C. Not duct-dependent — duct closed (TAPVC is PGE1-unresponsive) -------------------------------------
  M.Pda.diameter_relative = 0;
  log.push("C ductal: Pda closed (TAPVC is foramen-ovale-dependent, not duct-dependent)");

  const dst = new URL(`../public/model_definitions/${key}.json`, import.meta.url);
  fs.writeFileSync(dst, JSON.stringify(j, null, 1) + "\n");
  console.log(`wrote ${key}.json\n  ${log.join("\n  ")}`);
}
