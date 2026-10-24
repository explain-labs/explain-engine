// Bernoulli orifice loss, shared by Pda (ductus) and Shunts (foramen ovale, VSD).
//
// A restrictive orifice adds a convective (kinetic) pressure loss on top of the viscous one:
//   ΔP_kinetic [mmHg] = B · Q²,   Q in L/s,   B = K_BERNOULLI / A_eff²  (A_eff in m²)
// Derivation: ΔP = ½·ρ·v², v = (Q·1e-3)/A_eff, ρ ≈ 1060 kg/m³, Pa→mmHg ÷133.322:
//   ΔP [mmHg] = (0.5·ρ / 133.322) · (Q·1e-3 / A_eff)² = (ρ · 3.75e-9) · Q²/A_eff²
// With ρ = 1060 this is ≈ 3.976e-6, i.e. ΔP ≈ 4·v², the textbook modified-Bernoulli form.
export const K_BERNOULLI = 1060.0 * 3.75e-9;

// B for an orifice of the given anatomic diameter (mm). The discharge coefficient cd is the standard
// one: the vena-contracta area over the anatomic area, A_eff = cd · A, so B ∝ 1/cd² and the jet
// (Doppler) velocity is Q/(cd·A). Typical cd: ~0.6-0.65 sharp-edged hole, ~0.9 smooth funnel.
// Returns 0 for a closed orifice; callers decide what a closed orifice means for them.
export function orifice_b(diameter_mm, cd) {
  const r_m = diameter_mm * 0.0005; // anatomic orifice radius (mm/2 → m)
  const area_eff = cd * Math.PI * r_m * r_m;
  return area_eff > 0 ? K_BERNOULLI / (area_eff * area_eff) : 0.0;
}

// Jet velocity (m/s) for flow q (L/s) through an orifice with coefficient b: the kinetic loss B·Q² is
// ½ρv² in mmHg, i.e. (K_BERNOULLI·1e6)·v² ≈ 3.975·v², so v = sign(Q)·√(B·Q² / (K_BERNOULLI·1e6)). Because
// B = K_BERNOULLI / A_eff², this is exactly the continuity velocity Q/A_eff through the vena contracta.
// (The clinical "ΔP = 4v²" rounds 3.975 up to 4, which would read 0.3 % low.)
export function jet_velocity(b, q) {
  return Math.sign(q) * Math.sqrt(Math.abs(b * q * q) / (K_BERNOULLI * 1.0e6));
}
