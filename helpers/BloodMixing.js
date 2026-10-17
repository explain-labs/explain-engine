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

  // hot path: no Sets, spreads or closures — swap each quantity in place
  let d = b.to2 - a.to2;
  a.to2 += d * fa;
  b.to2 -= d * fb;
  d = b.tco2 - a.tco2;
  a.tco2 += d * fa;
  b.tco2 -= d * fb;
  d = b.temp - a.temp;
  a.temp += d * fa;
  b.temp -= d * fb;
  exchange_dict(a.solutes, b.solutes, fa, fb);
  if (a.drugs && b.drugs) exchange_dict(a.drugs, b.drugs, fa, fb);
}

// swap every key of two concentration dicts (a key missing on one side counts as 0 and is created)
function exchange_dict(da, db, fa, fb) {
  for (const key in da) exchange_key(da, db, key, fa, fb);
  for (const key in db) if (!(key in da)) exchange_key(da, db, key, fa, fb);
}

function exchange_key(da, db, key, fa, fb) {
  const ca = da[key] ?? 0.0;
  const cb = db[key] ?? 0.0;
  const d = cb - ca;
  da[key] = ca + d * fa;
  db[key] = cb - d * fb;
}
