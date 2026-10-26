// Gas exchange between two gas compartments without net flow: molecular diffusion and cardiogenic
// mixing at the junction between the airways and the alveoli. An equal volume dv of the gas at each
// connecting end is swapped, species by species (O2, CO2, N2, H2O, other), so every species is
// conserved and no volume moves. A series dead space (GasCapacitance sub-tanks) exchanges through the
// sub-tank at the end that faces the neighbour; a fixed-composition compartment keeps its
// composition (an infinite reservoir). dv is clamped to half the smaller end volume.
// scratch buffers: the hot path allocates nothing (two calls per step in term_neonate_72h)
const _ca = [0, 0, 0, 0, 0];
const _cb = [0, 0, 0, 0, 0];
const _dn = [0, 0, 0, 0, 0];
const _dn_neg = [0, 0, 0, 0, 0];

export function exchange_gas(a, b, dv) {
  if (!(dv > 0.0)) return;
  const va = a._end_conc_into(b, _ca);
  const vb = b._end_conc_into(a, _cb);
  if (!(va > 0.0) || !(vb > 0.0)) return;
  dv = Math.min(dv, 0.5 * Math.min(va, vb));
  for (let k = 0; k < 5; k++) {
    _dn[k] = (_cb[k] - _ca[k]) * dv; // mmol moving b -> a
    _dn_neg[k] = -_dn[k];
  }
  a._end_add(b, _dn);
  b._end_add(a, _dn_neg);
}
