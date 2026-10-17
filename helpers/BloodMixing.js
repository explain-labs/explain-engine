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

  // the inflow's share of the new volume (hot path: ~45 calls per step, so no per-call allocation —
  // plain for-in loops instead of Object.keys().forEach)
  const f = dvol / target.vol;

  // process the gases o2 and co2
  target.to2 += (comp_from.to2 - target.to2) * f;
  target.tco2 += (comp_from.tco2 - target.tco2) * f;

  // process the solutes (a key missing, zero or NaN on the source counts as 0)
  const ts = target.solutes;
  const fs = comp_from.solutes;
  for (const solute in ts) {
    const from = fs[solute];
    ts[solute] += ((from ? from : 0.0) - ts[solute]) * f;
  }

  // process the drug concentrations
  const td = target.drugs;
  const fd = comp_from.drugs;
  for (const drug in td) {
    const from = fd[drug];
    td[drug] += ((from ? from : 0.0) - td[drug]) * f;
  }

  // process the temperature (treat it as a solute)
  target.temp += (comp_from.temp - target.temp) * f;
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
