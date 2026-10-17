// Blood composition mixing, shared by every blood-carrying compartment (BloodCapacitance,
// BloodTimeVaryingElastance, HeartChamber). Call it from volume_in AFTER the volume has been added:
// with V = the volume after the inflow, c += (c_from - c) * dvol / V is exact mass balance
// (c_new * V = c_old * (V - dvol) + c_from * dvol). Mixed: to2, tco2, every solute and drug the
// target carries (a key missing on the source counts as 0), temperature and viscosity.
export function mix_blood_in(target, dvol, comp_from) {
  // a fixed-composition compartment is an infinite reservoir: hold its composition
  // (and temperature/viscosity) constant
  if (target.fixed_composition) return;

  // guard against division by zero on an empty compartment (would produce NaN concentrations)
  if (target.vol <= 0.0) return;

  // process the gases o2 and co2
  target.to2 += ((comp_from.to2 - target.to2) * dvol) / target.vol;
  target.tco2 += ((comp_from.tco2 - target.tco2) * dvol) / target.vol;

  // process the solutes
  Object.keys(target.solutes).forEach((solute) => {
    let solute_from = 0;
    if (comp_from.solutes[solute]) {
      solute_from = comp_from.solutes[solute];
    }
    target.solutes[solute] += ((solute_from - target.solutes[solute]) * dvol) / target.vol;
  });

  // process the drug concentrations
  Object.keys(target.drugs).forEach((drug) => {
    let drug_from = 0.0;
    if (comp_from.drugs[drug]) {
      drug_from = comp_from.drugs[drug];
    }
    target.drugs[drug] += ((drug_from - target.drugs[drug]) * dvol) / target.vol;
  });

  // process the temperature (treat it as a solute)
  target.temp += ((comp_from.temp - target.temp) * dvol) / target.vol;

  // process the viscosity (treat it as a solute)
  target.viscosity += ((comp_from.viscosity - target.viscosity) * dvol) / target.vol;
}
