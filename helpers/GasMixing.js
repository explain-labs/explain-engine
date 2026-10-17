// Gas exchange between two gas compartments without net flow: molecular diffusion and cardiogenic
// mixing at the junction between the airways and the alveoli. An equal volume dv of the gas at each
// connecting end is swapped, species by species (O2, CO2, N2, H2O, other), so every species is
// conserved and no volume moves. A series dead space (GasCapacitance sub-tanks) exchanges through the
// sub-tank at the end that faces the neighbour; a fixed-composition compartment keeps its
// composition (an infinite reservoir). dv is clamped to half the smaller end volume.
export function exchange_gas(a, b, dv) {
  if (!(dv > 0.0)) return;
  const ea = a._end_conc(b);
  const eb = b._end_conc(a);
  if (!(ea.v > 0.0) || !(eb.v > 0.0)) return;
  dv = Math.min(dv, 0.5 * Math.min(ea.v, eb.v));
  const dn = ea.c.map((ca, k) => (eb.c[k] - ca) * dv); // mmol moving b -> a
  a._end_add(b, dn);
  b._end_add(a, dn.map((x) => -x));
}
