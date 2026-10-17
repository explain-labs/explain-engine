// Blood composition mixing, shared by every blood-carrying compartment (BloodCapacitance,
// BloodTimeVaryingElastance, HeartChamber). Call it from volume_in AFTER the volume has been added:
// with V = the volume after the inflow, c += (c_from - c) * dvol / V is exact mass balance
// (c_new * V = c_old * (V - dvol) + c_from * dvol). Mixed: to2, tco2, every solute and drug the
// target carries (a key missing on the source counts as 0) and temperature. Viscosity is not mixed:
// Blood derives it from each compartment's haemoglobin every step.
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
}

// Dispersive exchange between two blood compartments that form one continuous pool (e.g. the two
// halves of the right atrium): eddies and vortex flow swap blood both ways without any net volume
// transfer. An equal volume dv moves a→b and b→a; with the pre-exchange concentrations,
// c_a += (c_b − c_a)·dv/V_a and c_b += (c_a − c_b)·dv/V_b, so every quantity is conserved
// (c_a·V_a + c_b·V_b is unchanged). dv is clamped to half the smaller volume (stability), and a
// fixed-composition compartment keeps its composition (it acts as an infinite reservoir).
export function exchange_blood(a, b, dv) {
  if (!(dv > 0.0) || a.vol <= 0.0 || b.vol <= 0.0) return;
  dv = Math.min(dv, 0.5 * Math.min(a.vol, b.vol));
  const fa = a.fixed_composition ? 0.0 : dv / a.vol;
  const fb = b.fixed_composition ? 0.0 : dv / b.vol;

  const swap = (ca, cb, set_a, set_b) => {
    const d = cb - ca;
    set_a(ca + d * fa);
    set_b(cb - d * fb);
  };
  swap(a.to2, b.to2, (v) => (a.to2 = v), (v) => (b.to2 = v));
  swap(a.tco2, b.tco2, (v) => (a.tco2 = v), (v) => (b.tco2 = v));
  swap(a.temp, b.temp, (v) => (a.temp = v), (v) => (b.temp = v));
  for (const key of new Set([...Object.keys(a.solutes), ...Object.keys(b.solutes)])) {
    swap(a.solutes[key] ?? 0.0, b.solutes[key] ?? 0.0, (v) => (a.solutes[key] = v), (v) => (b.solutes[key] = v));
  }
  for (const key of new Set([...Object.keys(a.drugs ?? {}), ...Object.keys(b.drugs ?? {})])) {
    if (!a.drugs || !b.drugs) break;
    swap(a.drugs[key] ?? 0.0, b.drugs[key] ?? 0.0, (v) => (a.drugs[key] = v), (v) => (b.drugs[key] = v));
  }
}
