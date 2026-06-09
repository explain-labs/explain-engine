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
// Multiplier on el_base used when the duct is fully closed. The full computation
// yields el ≈ el_base · (R_no_flow / R_open)^alpha ≈ el_base · few-thousand for
// typical neonatal geometry; the exact value doesn't affect DA pressure when the
// capacitance holds u_vol, so a deterministic constant is sufficient.
const CLOSED_EL_SCALE = 5000;

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
    this.el_base = 30000;         // baseline (open-duct) elastance (mmHg/L); scaled by (R/R_open)^alpha as the duct constricts
    // alpha: resistance-elastance coupling exponent (BloodVessel-style). Between the large-artery
    // thin-wall value (0.5, gives the literature "order of magnitude" elastance rise for ~100x R
    // rise during functional closure) and the arteriole value (0.63), with a small bump for the
    // PDA's high SM content.
    this.alpha = 0.55;
    // jet_exponent: exponent n on (R_total / R_open_total)^(n/4) used to amplify the continuity
    // velocity into a jet-corrected end velocity. Same driver as the elastance α-coupling; the /4
    // normalization makes n = 1 behave like a linear diameter correction (matches the original
    // empirical (d_max/d_pa)^1 formula).
    this.jet_exponent = 0.6;

    // -----------------------------------------------
    // dependent properties (recomputed each step)
    // -----------------------------------------------
    this.diameter_ao = 0.0;       // current diameter at aortic origin (mm)
    this.diameter_pa = 0.0;       // current diameter at pulmonary end (mm)
    this.viscosity = 6;           // blood viscosity (cP), pulled from the DA capacitance
    this.vol = 0;                 // duct volume (L), pulled from the DA capacitance
    this.flow_ao = 0;             // flow at the aortic resistor (L/s)
    this.flow_pa = 0;             // flow at the pulmonary resistor (L/s)
    this.res_ao = 1500;           // resistance of the AO-half of the cone (mmHg·s/L)
    this.res_pa = 1500;           // resistance of the PA-half of the cone (mmHg·s/L)
    this.el = 30000;              // current elastance, el_base * (R/R_open)^alpha (mmHg/L)
    this.velocity_ao = 0;         // bulk mean velocity at aortic end, Q/A (m/s)
    this.velocity_pa = 0;         // bulk mean velocity at pulmonary end, Q/A (m/s)
    this.velocity_doppler = 0;    // peak velocity from modified Bernoulli, sign(ΔP)·√(|ΔP|/4) (m/s)
    this.velocity_ao_jet = 0;     // velocity_ao amplified by stenosis factor (m/s)
    this.velocity_pa_jet = 0;     // velocity_pa amplified by stenosis factor (m/s)

    // -----------------------------------------------
    // local references (preceded with _)
    // -----------------------------------------------
    this._da = null;     // BloodCapacitance (DA)
    this._aar_da = null; // Resistor (AA → DA)
    this._da_pa = null;  // Resistor (DA → PA)
  }

  init_model(args = {}) {
    super.init_model(args);

    // cache sub-model references so we don't hash-lookup every step
    this._aar_da = this._model_engine.models["AAR_DA"] || null;
    this._da     = this._model_engine.models["DA"]     || null;
    this._da_pa  = this._model_engine.models["DA_PA"]  || null;
  }

  calc_model() {
    const aar_da = this._aar_da;
    const da_pa = this._da_pa;
    const da = this._da;

    // the duct coordinates all three sub-models; skip if any is missing (e.g. a configuration
    // without a DA capacitance or its connecting resistors) rather than dereferencing null
    if (!da || !aar_da || !da_pa) return;

    // ----- closed-duct fast path -----
    // diameter_relative === 0 is the postnatal steady state. The cone math, the
    // Bernoulli sqrt, and the continuity divisions all degenerate; set sentinel
    // values and skip the rest.
    if (this.diameter_relative === 0) {
      this.diameter_ao = 0;
      this.diameter_pa = 0;
      this.viscosity = da.viscosity;
      this.flow_ao = aar_da.flow;
      this.flow_pa = da_pa.flow;
      aar_da.no_flow = true;
      da_pa.no_flow = true;
      this.res_ao = RESISTANCE_NO_FLOW;
      this.res_pa = RESISTANCE_NO_FLOW;
      aar_da.r_for = RESISTANCE_NO_FLOW;
      aar_da.r_back = RESISTANCE_NO_FLOW;
      da_pa.r_for = RESISTANCE_NO_FLOW;
      da_pa.r_back = RESISTANCE_NO_FLOW;
      this.el = this.el_base * CLOSED_EL_SCALE;
      da.el_base = this.el;
      this.velocity_doppler = 0;
      this.velocity_ao = 0;
      this.velocity_pa = 0;
      this.velocity_ao_jet = 0;
      this.velocity_pa_jet = 0;
      this.vol = da.vol;
      return;
    }

    // ----- geometry: diameters scale together along diameter_relative -----
    const d_ao = Math.min(this.diameter_relative * this.diameter_ao_max, this.diameter_ao_max);
    const d_pa = Math.min(this.diameter_relative * this.diameter_pa_max, this.diameter_pa_max);
    this.diameter_ao = d_ao;
    this.diameter_pa = d_pa;

    // pull current flows and viscosity from the underlying models
    this.flow_ao = aar_da.flow;
    this.flow_pa = da_pa.flow;
    this.viscosity = da.viscosity;

    // when fully constricted, force no flow on both resistors
    aar_da.no_flow = d_ao === 0;
    da_pa.no_flow  = d_pa === 0;

    // ----- resistance: linearly tapered cone, split at the midpoint -----
    const half_length = this.length * 0.5;
    const d_mid = (d_ao + d_pa) * 0.5;
    const res_ao = this.calc_conical_resistance(d_ao, d_mid, half_length, this.viscosity);
    const res_pa = this.calc_conical_resistance(d_mid, d_pa, half_length, this.viscosity);
    this.res_ao = res_ao;
    this.res_pa = res_pa;
    aar_da.r_for = res_ao;
    aar_da.r_back = res_ao;
    da_pa.r_for = res_pa;
    da_pa.r_back = res_pa;

    // ----- resistance-elastance coupling (BloodVessel α-pattern) -----
    // As the duct constricts, R rises as ~1/d^4 and the wall stiffness rises as (R / R_open)^alpha,
    // reproducing the literature-described order-of-magnitude jump in total elastance during
    // functional closure. The result is unbounded — the closed-duct case naturally drives the
    // elastance toward effective infinity.
    const d_mid_max = (this.diameter_ao_max + this.diameter_pa_max) * 0.5;
    const res_open_ao = this.calc_conical_resistance(this.diameter_ao_max, d_mid_max, half_length, this.viscosity);
    const res_open_pa = this.calc_conical_resistance(d_mid_max, this.diameter_pa_max, half_length, this.viscosity);
    const res_open_total = res_open_ao + res_open_pa;
    const res_total = res_ao + res_pa;
    const r_factor = res_open_total > 0 ? res_total / res_open_total : 1.0;
    this.el = this.el_base * Math.pow(r_factor, this.alpha);
    da.el_base = this.el;

    // ----- velocity outputs -----
    // Modified Bernoulli at the trans-ductal gradient:
    //   ΔP (mmHg) = 4 · v²   →   v_jet (m/s) = sign(ΔP) · √(|ΔP|/4)
    // The signed gradient (p_aa − p_pa) keeps the sign of all outputs consistent during flow
    // reversal (PHT / bidirectional shunting); using a local p_da would let the DA capacitance's
    // transient pressure swings flip the sign of one half independently of the other.
    const closed = aar_da.no_flow || da_pa.no_flow;
    let v_doppler = 0.0;
    if (!closed) {
      const p_aa = aar_da._comp_from?.pres ?? 0.0;
      const p_pa = da_pa._comp_to?.pres ?? 0.0;
      const dp = p_aa - p_pa;
      v_doppler = Math.sign(dp) * Math.sqrt(Math.abs(dp) / 4.0);
    }
    this.velocity_doppler = v_doppler;

    // Continuity (Q/A) bulk mean velocities at each end.
    // diameter is in mm; convert to m by *1e-3, then radius = d/2, area = π·r².
    const r_ao_m = d_ao * 0.0005;
    const r_pa_m = d_pa * 0.0005;
    const area_ao = Math.PI * r_ao_m * r_ao_m;
    const area_pa = Math.PI * r_pa_m * r_pa_m;
    // flow is L/s; multiply by 1e-3 to get m³/s so Q/A is in m/s.
    this.velocity_ao = area_ao > 0 ? (aar_da.flow * 0.001) / area_ao : 0.0;
    this.velocity_pa = area_pa > 0 ? (da_pa.flow * 0.001) / area_pa : 0.0;

    // Jet correction: amplify the smooth continuity waveform as the duct constricts.
    const jet_scale = Math.pow(r_factor, this.jet_exponent * 0.25);
    this.velocity_ao_jet = this.velocity_ao * jet_scale;
    this.velocity_pa_jet = this.velocity_pa * jet_scale;

    this.vol = da.vol;
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
