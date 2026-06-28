import { BaseModelClass } from "../base_models/BaseModelClass";

/*
Anatomy & Embryology

    The ductus arteriosus is a short, conical vessel arising from the distal portion of the left sixth aortic arch.
    It connects the roof of the pulmonary trunk (just downstream of the pulmonary valve) to the descending aorta
    immediately distal to the left subclavian artery.

    Histologically, its wall contains a high proportion of smooth muscle cells arranged circumferentially,
    making it exquisitely sensitive to oxygen tension and vasoactive mediators.

    General Shape

    Conical/funnel-shaped: widest at the aortic (ampullary) end, tapering toward the pulmonary end.

    Anatomic variants (when patent beyond birth) are classified angiographically as:
        Type A (conical)   – classic funnel
        Type B (window)    – short, wide
        Type C (tubular)   – nearly uniform diameter
        Type D (complex)   – multiple constrictions
        Type E (elongated) – long, narrow funnel

    Typical length 2–3 cm; conical, wider at the aortic end and tapering toward the pulmonary end.
        Diameter growth: ≈ 0.0935 mm/week (y = 0.2072 + 0.0935·x)
        Length growth:   ≈ 0.4381 mm/week (y = –3.0726 + 0.4381·x)

    Term neonate:
        Diameter ~2–4 mm (approximating the descending aorta at the same level)
        Length   ~20–30 mm (2–3 cm)
        Ampullary height (at aortic end) often 4–6 mm.

    References:
        StatPearls "Patent Ductus Arteriosus" – conical shape, neonatal dimensions.
        Szpinda M. Morphometric study of the ductus arteriosus, 2007 – fetal diameter/length data.
        ScienceDirect "Ductus Arteriosus" – comparison to descending aorta.

Closure

    Closure always begins at the pulmonary end and proceeds toward the aortic end:

        Anatomic basis – the conical shape gives the pulmonary end a smaller lumen and thinner wall,
        so it constricts faster under rising O2.
        Physiologic triggers – with the first breaths, arterial PO2 rises and PGE2 falls; both effects
        are strongest at the pulmonary junction.
        Clinical correlation – even when closure is incomplete, angiography shows a residual aortic
        ampulla while the pulmonary end is already sealed off.

Elastance

    Passive elastance is measured by slowly changing lumen pressure on an isolated vessel in a
    calcium-free bath (no muscle tone). Active elastance is the additional stiffening from smooth-
    muscle contraction under physiologic conditions.

    The PDA has high SM content and a low elastin ratio, so its passive elastance at baseline is
    higher than the aorta. In utero, PGE2 keeps SM relaxed (low active EE). Postnatally, O2-induced
    SM contraction sharply raises active EE; the P-V curve can shift total elastance by an order
    of magnitude.

    Dynamic phases:
        Fetal (patent):           low active EE, high compliance (PGE2-mediated relaxation)
        Functional closure 12-24h: rising O2 + falling PGE2 → SM contraction → active EE rises
        Anatomic remodeling 2-3wk: fibrosis and intimal cushion coalescence → effective infinity

    Clinical implications:
        Preterm: attenuated active EE rise → persistent patency
        NSAIDs: lower PGE2 → raise active EE → pharmacologic closure
        Largest active-EE jumps correlate with post-closure hypotension and low CO

    See also: docs/Pda-velocity.md for the rationale behind the velocity outputs.
*/

// Hagen-Poiseuille resistance unit conversion: Pa·s/m^3 → mmHg·s/L.
const PA_S_PER_M3_TO_MMHG_S_PER_L = 0.00000750062;
// Pre-multiplied prefactors for the resistance formulas (saves one multiply per call).
//   uniform cylinder: R = (8 / π) · μ · L / r⁴ · [Pa→mmHg]
//   conical taper:    R = (8 / 3π) · μ · L · (r1² + r1·r2 + r2²) / (r1³ · r2³) · [Pa→mmHg]
const RESISTANCE_PREFACTOR = (8.0 / Math.PI) * PA_S_PER_M3_TO_MMHG_S_PER_L;
const CONICAL_RESISTANCE_PREFACTOR = (8.0 / (3.0 * Math.PI)) * PA_S_PER_M3_TO_MMHG_S_PER_L;
// Resistance returned when geometry collapses to zero (sentinel "no flow").
const RESISTANCE_NO_FLOW = 1e8;

// Bernoulli orifice coefficient prefactor: B = K_BERNOULLI / A_eff² gives the
// quadratic pressure loss ΔP_kinetic (mmHg) = B · Q² with Q in L/s and A_eff in m².
// Derivation: ΔP_kinetic = ½·ρ·v², v = (Q·1e-3)/A, ρ ≈ 1060 kg/m³, Pa→mmHg ÷133.322.
//   ΔP[mmHg] = (0.5·ρ / 133.322) · (Q·1e-3 / A)² = (ρ · 3.75e-9) · Q²/A²
// With ρ = 1060 this is ≈ 3.976e-6, i.e. ΔP ≈ 4·v² — the textbook modified-Bernoulli form.
const K_BERNOULLI = 1060.0 * 3.75e-9;

export class Pda extends BaseModelClass {
  // static properties
  static model_type = "Pda";

  constructor(model_ref, name = "") {
    super(model_ref, name);

    // -----------------------------------------------
    // independent properties
    // -----------------------------------------------
    this.diameter_ao_max = 3.0;   // max diameter at aortic origin (mm)
    this.diameter_pa_max = 2.0;   // max diameter at pulmonary end (mm)
    this.diameter_relative = 0.0; // relative diameter [0..1], scales both ends together
    this.length = 20;             // length (mm)
    // discharge_coeff: effective vena-contracta contraction of the pulmonary-end orifice (Cd, 0..1).
    // The Bernoulli coefficient uses the *effective* orifice area A_eff = Cd · A_pa, so B scales as
    // 1/Cd². This is the single tuning knob for peak jet velocity (lower Cd → tighter jet → higher
    // velocity). Cd ≈ 0.8 is typical for a smooth converging duct.
    this.discharge_coeff = 0.8;

    // diameter_drug_factor: patency multiplier owned by the Drugs model (1.0 = neutral). Prostaglandin
    // E1 (alprostadil) drives this above 1.0 to hold the duct open in duct-dependent CHD; it multiplies
    // diameter_relative (capped at the anatomic max). NOTE: it does NOT reopen a fully-closed duct — the
    // diameter_relative === 0 fast path below stays keyed on the raw value (clinically the duct is
    // maintained patent from birth on PGE1, never allowed to reach 0). Reopening from 0 would need an
    // additive term instead of a multiplicative factor (future).
    this.diameter_drug_factor = 1.0;

    // -----------------------------------------------
    // dependent properties (recomputed each step)
    // -----------------------------------------------
    this.diameter_relative_eff = 0.0; // effective relative diameter after the drug factor (read-out)
    this.diameter_ao = 0.0;       // current diameter at aortic origin (mm)
    this.diameter_pa = 0.0;       // current diameter at pulmonary end (mm)
    this.viscosity = 6;           // blood viscosity (cP), pulled from the upstream (AAR) compartment
    this.res = 1500;              // viscous resistance of the full cone (mmHg·s/L)
    this.bernoulli_b = 0;         // orifice Bernoulli coefficient B = K/A_eff² (mmHg·s²/L²)
    this.flow = 0;                // shunt flow through the duct (L/s); +ve = L->R (aorta -> pulmonary)
    this.flow_ao = 0;             // alias of `flow` (kept for probe/back-compat; single resistor now)
    this.flow_pa = 0;             // alias of `flow` (kept for probe/back-compat; single resistor now)
    this.velocity_ao = 0;         // bulk mean velocity at aortic end, Q/A (m/s)
    this.velocity_pa = 0;         // bulk mean velocity at pulmonary end, Q/A (m/s)
    this.velocity_doppler = 0;    // jet peak from the Bernoulli term, sign(Q)·√(|B·Q²|/4) (m/s)

    // -----------------------------------------------
    // local references (preceded with _)
    // -----------------------------------------------
    this._aar_da = null; // Resistor (AAR -> PA), the single "Bernoulli resistor"
    this._aar = null;    // BloodCapacitance (AAR), upstream end (viscosity source)
  }

  init_model(args = {}) {
    super.init_model(args);

    // cache sub-model references so we don't hash-lookup every step
    this._aar_da = this._model_engine.models["AAR_DA"] || null;
    this._aar    = this._model_engine.models["AAR"]    || null;
  }

  calc_model() {
    const aar_da = this._aar_da;

    // the duct is now a single resistor AAR -> PA carrying the full quadratic stenosis element;
    // skip if it is missing (a configuration without the duct connection) rather than dereferencing null
    if (!aar_da) return;

    // viscosity from the upstream (AAR) compartment, falling back to the resistor's resolved
    // inlet or a sane default; tracks hematocrit changes automatically
    this.viscosity = this._aar?.viscosity ?? aar_da._comp_from?.viscosity ?? 6;

    // ----- closed-duct fast path -----
    // diameter_relative === 0 is the postnatal steady state. The cone math, the Bernoulli sqrt, and
    // the continuity divisions all degenerate; seal the resistor and zero the outputs.
    if (this.diameter_relative === 0) {
      this.diameter_relative_eff = 0;
      this.diameter_ao = 0;
      this.diameter_pa = 0;
      aar_da.no_flow = true;
      aar_da.r_for = RESISTANCE_NO_FLOW;
      aar_da.r_back = RESISTANCE_NO_FLOW;
      aar_da.r_k = 0;
      this.res = RESISTANCE_NO_FLOW;
      this.bernoulli_b = 0;
      this.flow = this.flow_ao = this.flow_pa = aar_da.flow;
      this.velocity_doppler = 0;
      this.velocity_ao = 0;
      this.velocity_pa = 0;
      return;
    }

    // ----- geometry: diameters scale together along the effective relative diameter -----
    // PGE1 (via Drugs → diameter_drug_factor) widens a constricting duct; clamp the factor's effect to
    // the anatomic max so the duct can never exceed full patency.
    const eff_rel = this.diameter_relative * this.diameter_drug_factor;
    this.diameter_relative_eff = eff_rel;
    const d_ao = Math.min(eff_rel * this.diameter_ao_max, this.diameter_ao_max);
    const d_pa = Math.min(eff_rel * this.diameter_pa_max, this.diameter_pa_max);
    this.diameter_ao = d_ao;
    this.diameter_pa = d_pa;

    // expose the current shunt flow (single resistor; flow_ao/flow_pa are aliases for back-compat)
    this.flow = this.flow_ao = this.flow_pa = aar_da.flow;

    // when fully constricted, force no flow
    aar_da.no_flow = d_pa === 0;

    // ----- quadratic stenosis element on the single resistor: ΔP = res·Q + B·Q² -----
    // res: viscous Hagen-Poiseuille loss over the full linearly tapered cone (AAR end -> PA end).
    const res = this.calc_conical_resistance(d_ao, d_pa, this.length, this.viscosity);
    this.res = res;

    // B: convective / Bernoulli orifice loss at the narrowest (pulmonary) end, the vena contracta.
    //   B = K_BERNOULLI / A_eff²,  A_eff = discharge_coeff · (anatomic pulmonary area)
    const r_eff_m = this.discharge_coeff * d_pa * 0.0005; // effective orifice radius (mm/2 → m)
    const area_eff = Math.PI * r_eff_m * r_eff_m;
    const b = area_eff > 0 ? K_BERNOULLI / (area_eff * area_eff) : RESISTANCE_NO_FLOW;
    this.bernoulli_b = b;

    // Semi-implicit linearization of the quadratic term: fold B·Q² into the linear resistance as a
    // flow-dependent resistance B·|Q_prev|, so the resistor solves flow = ΔP/(res + B·|Q_prev|). At
    // steady state this reproduces ΔP = res·Q + B·Q² exactly, but unlike the engine's explicit
    // r_k·Q_prev² term it is unconditionally stable — the explicit form diverges here because the
    // open-duct viscous resistance (~1e3-1e4) is far below 2·√(B·ΔP) (~2e4). Keep r_k = 0.
    const r_bernoulli = b * Math.abs(aar_da.flow); // mmHg·s/L, the linearized orifice resistance
    aar_da.r_for = res + r_bernoulli;
    aar_da.r_back = res + r_bernoulli;
    aar_da.r_k = 0;

    // ----- velocity outputs -----
    // Jet peak from the Bernoulli (kinetic) term only: B·Q² (mmHg) = 4·v² → v = sign(Q)·√(B·Q²/4).
    // Because B = K_BERNOULLI/A_eff², this is identically the continuity velocity Q/A_eff through the
    // effective orifice — the modified-Bernoulli jet and continuity are the same number, so this is
    // honest across the whole closure trajectory (no viscous loss is attributed to velocity). Driven
    // by the resistive flow, so it carries the sign of the shunt and reverses cleanly during
    // bidirectional / PHT shunting.
    const q = aar_da.flow; // L/s, +ve = L->R
    this.velocity_doppler = aar_da.no_flow ? 0.0 : Math.sign(q) * Math.sqrt(Math.abs(b * q * q) / 4.0);

    // Continuity (Q/A) bulk mean velocities at each *anatomic* end (for reference / open-duct flows).
    // diameter is in mm; convert to m by *1e-3, then radius = d/2, area = π·r².
    const r_ao_m = d_ao * 0.0005;
    const r_pa_m = d_pa * 0.0005;
    const area_ao = Math.PI * r_ao_m * r_ao_m;
    const area_pa = Math.PI * r_pa_m * r_pa_m;
    // flow is L/s; multiply by 1e-3 to get m³/s so Q/A is in m/s.
    this.velocity_ao = area_ao > 0 ? (q * 0.001) / area_ao : 0.0;
    this.velocity_pa = area_pa > 0 ? (q * 0.001) / area_pa : 0.0;
  }

  calc_resistance(diameter, length = 20.0, viscosity = 6.0) {
    // Poiseuille's law for a uniform cylinder: R = (8 · μ · L) / (π · r⁴)
    // diameter (mm), length (mm), viscosity (cP).
    if (diameter <= 0.0 || length <= 0.0) return RESISTANCE_NO_FLOW;

    const n_pas = viscosity * 0.001;      // cP → Pa·s
    const length_m = length * 0.001;       // mm → m
    const r_m = diameter * 0.0005;         // mm/2 → m
    const r2 = r_m * r_m;
    const r4 = r2 * r2;
    return (RESISTANCE_PREFACTOR * n_pas * length_m) / r4;
  }

  calc_conical_resistance(d1, d2, length = 20.0, viscosity = 6.0) {
    // Hagen-Poiseuille integrated over a linearly tapered cone:
    //   R = (8 · μ · L) / (3 · π) · (r1² + r1·r2 + r2²) / (r1³ · r2³)
    // diameters (mm), length (mm), viscosity (cP).
    if (d1 <= 0.0 || d2 <= 0.0 || length <= 0.0) return RESISTANCE_NO_FLOW;

    const n_pas = viscosity * 0.001;     // cP → Pa·s
    const length_m = length * 0.001;     // mm → m
    const r1 = d1 * 0.0005;              // mm/2 → m
    const r2 = d2 * 0.0005;              // mm/2 → m
    const numerator = r1 * r1 + r1 * r2 + r2 * r2;
    const denominator = r1 * r1 * r1 * r2 * r2 * r2;
    return (CONICAL_RESISTANCE_PREFACTOR * n_pas * length_m * numerator) / denominator;
  }
}
