import { BaseModelClass } from "../base_models/BaseModelClass.js";

/*
  The MaternalPlacenta class models the MATERNAL side of the placenta: the perfused intervillous
  space (PL_IVS), a low-resistance blood lake fed by the SPIRAL ARTERIES off the uterine arterial
  supply (UT_ART) and draining to the uterine veins (UT_VEN), in parallel with the non-placental
  uterine tissue (UT_CAP). Like Uterus/Placenta it is a controller/process model: it owns no blood
  itself but operates on the existing PL_IVS compartment that Circulation supplies.

  Scope (Part 5 — build the maternal placenta):
    - GROWTH WITH GESTATION: the spiral arteries dilate as pregnancy advances, so maternal placental
      blood flow grows from ~0 (non-pregnant: the placenta does not exist) to the DOMINANT share of
      uterine flow at term. Driven by the Uterus's pregnancy gestational age (preg_ga) — the single
      source of truth — scaling PL_IVS's resistance (the spiral-artery resistor IS PL_IVS's input
      resistor) via the persistent r_factor_scaling_ps layer.
    - GATING: when not pregnant the bed is held no_flow (zero perturbation to the calibrated uterine
      baseline). PL_IVS stays enabled but inert.
    - PLACENTAL METABOLISM: a dedicated placental VO2 applied to PL_IVS (same molar conversion as
      Metabolism: 0.039 mmol O2/mL), giving real O2 extraction across the intervillous space even
      before a fetus exists.
    - CONTRACTION COMPRESSION: the uterine intrauterine pressure (Uterus.iup) is applied as external
      pressure on PL_IVS, so contractions throttle placental perfusion (the contraction -> placental
      flow effect).
    - READ-OUTS: placental blood flow (mL/min), its share of uterine flow (%), DO2/VO2/O2ER/AVO2.

  NOT in this version: fetal coupling (PL_GASEX exchanging between PL_IVS and a fetal placental
  capillary) — needs a fetal circulation (combined mother+fetus scenario). The legacy fixed PL_MAT
  pool is left untouched.
*/

// O2 molar density at 37 C, 1 atm (mmol O2 per mL) — same constant Metabolism/Uterus use.
const O2_MMOL_PER_ML = 0.039;

export class MaternalPlacenta extends BaseModelClass {
  // static properties
  static model_type = "MaternalPlacenta";

  constructor(model_ref, name = "") {
    super(model_ref, name);

    // -----------------------------------------------
    // independent parameters (config)
    this.mp_running = true; // master gate (flow is additionally gated by pregnancy via the Uterus)
    this.pl_ivs_name = "PL_IVS"; // intervillous-space compartment (the blood lake)
    this.spiral_res_name = "UT_ART_PL_IVS"; // spiral-artery resistor (owned by PL_IVS; = its r_for_eff)
    this.drain_res_name = "PL_IVS_UT_VEN"; // drainage resistor (owned by UT_VEN)
    this.ut_art_name = "UT_ART"; // arterial source (for arterial O2 content read-outs)
    this.ut_in_res_name = "AD_UT_ART"; // total uterine inflow resistor (for the flow-share read-out)
    this.uterus_name = "Uterus"; // read preg_ga / pregnant / iup from here (single source of truth)

    // GA-scaled spiral-artery dilation: PL_IVS.r_factor_scaling_ps ramps from 1.0 (non-pregnant,
    // ~no flow) to spiral_res_term_factor at term, so placental flow grows through pregnancy.
    this.preg_ga_threshold = 4.0; // below this GA the placenta is treated as absent (no flow)
    this.preg_ga_term = 40.0; // GA anchor at which the term dilation is reached
    this.spiral_res_term_factor = 0.01; // PL_IVS resistance multiplier at term (small -> large flow)

    // placental metabolism — dedicated rate applied to PL_IVS (mirrors Uterus / Metabolism)
    this.met_active = true;
    this.mp_vo2 = 0.04; // placental oxygen use (mL O2/kg/min) — SCENARIO-CALIBRATED
    this.vo2_factor = 1.0; // non-persistent VO2 multiplier (reset each step)
    this.vo2_factor_ps = 1.0; // persistent VO2 multiplier
    this.resp_q = 0.8; // respiratory quotient

    // contraction compression: fraction of the uterine IUP applied as pres_ext on PL_IVS
    this.contraction_pres_gain = 0.6;

    // -----------------------------------------------
    // dependent parameters (read-outs)
    this.mp_blood_flow = 0.0; // maternal placental blood flow (mL/min)
    this.mp_flow_fraction = 0.0; // placental flow as % of total uterine inflow
    this.mp_do2 = 0.0; // oxygen delivery (mL O2/min)
    this.mp_vo2_ml = 0.0; // oxygen uptake (mL O2/min)
    this.mp_o2er = 0.0; // oxygen extraction ratio (%)
    this.mp_avo2 = 0.0; // arterio-venous O2 content difference (mmol/L)
    this.mp_active = false; // whether the placental bed is perfused (pregnant + running)

    // -----------------------------------------------
    // local references / state
    this._pl_ivs = null;
    this._spiral_res = null;
    this._drain_res = null;
    this._ut_art = null;
    this._ut_in_res = null;
    this._uterus = null;
    this._flow_ema = 0.0; // smoothed spiral-artery inflow (L/s)
    this._ut_in_ema = 0.0; // smoothed total uterine inflow (L/s) — for the flow-share read-out
    this._flow_tc = 5.0; // smoothing time constant (s)
  }

  init_model(args) {
    super.init_model(args);
    // PL_IVS, the spiral/drainage resistors and the Uterus are resolved lazily in calc_model() since
    // they may be instantiated after this controller in build order.
  }

  calc_model() {
    // lazy reference resolution (build-order independent)
    if (!this._pl_ivs) this._pl_ivs = this._model_engine.models[this.pl_ivs_name] ?? null;
    if (!this._spiral_res) this._spiral_res = this._model_engine.models[this.spiral_res_name] ?? null;
    if (!this._drain_res) this._drain_res = this._model_engine.models[this.drain_res_name] ?? null;
    if (!this._ut_art) this._ut_art = this._model_engine.models[this.ut_art_name] ?? null;
    if (!this._ut_in_res) this._ut_in_res = this._model_engine.models[this.ut_in_res_name] ?? null;
    if (!this._uterus) this._uterus = this._model_engine.models[this.uterus_name] ?? null;

    if (!this._pl_ivs) return;

    // pregnancy progress from the Uterus (single source of truth)
    const ga = this._uterus ? this._uterus.preg_ga : 0.0;
    const pregnant = this._uterus ? this._uterus.pregnant : false;
    let frac = 0.0;
    if (pregnant && ga > this.preg_ga_threshold) {
      frac = (ga - this.preg_ga_threshold) / (this.preg_ga_term - this.preg_ga_threshold);
      if (frac > 1.0) frac = 1.0;
    }
    const active = this.mp_running && frac > 0.0;
    this.mp_active = active;

    // gate flow on/off via no_flow on BOTH the spiral inflow and the drainage so a non-pregnant
    // (or stopped) placenta is perfectly inert and does not perturb the uterine baseline. PL_IVS
    // stays enabled (an inert pool) so it still has a defined pressure. Re-asserted every step.
    this._pl_ivs.no_flow = !active;
    if (this._drain_res) this._drain_res.no_flow = !active;

    if (!active) {
      this._pl_ivs.r_factor_scaling_ps = 1.0; // restore the layer we own
      this._zero_outputs();
      return;
    }

    // spiral-artery dilation: scale PL_IVS resistance down with GA (-> placental flow grows). Written
    // every step (idempotent — engine recomputes r_for_eff from base each step). BloodVessel composes
    // r_factor_scaling_ps multiplicatively, disjoint from the layers anything else writes.
    const res_factor = 1.0 + frac * (this.spiral_res_term_factor - 1.0);
    this._pl_ivs.r_factor_scaling_ps = res_factor;

    // contraction compression: apply the uterine IUP as external pressure on the intervillous space
    // (re-asserted each step; the compartment resets pres_ext after use)
    const iup = this._uterus ? this._uterus.iup : 0.0;
    this._pl_ivs.pres_ext += iup * this.contraction_pres_gain;

    // placental O2 consumption / CO2 production on PL_IVS (same molar conversion as Metabolism).
    // VO2 scales with placental PERFUSION (flow ~ spiral_res_term_factor/res_factor: ~1 at term,
    // ~0 early) so a small early-gestation placenta with little flow consumes little O2 and the
    // placental O2ER stays physiologic across gestation (a full-strength VO2 on a tiny early flow
    // would drive O2ER far above 100%).
    if (this.met_active && this._pl_ivs.vol > 0.0) {
      const flow_ratio = res_factor > 0.0 ? this.spiral_res_term_factor / res_factor : 0.0; // 0..1
      const vo2_eff = this.mp_vo2 * this.vo2_factor * this.vo2_factor_ps * flow_ratio; // mL O2/kg/min
      const vo2_step = ((O2_MMOL_PER_ML * vo2_eff * this._model_engine.weight) / 60.0) * this._t; // mmol/step
      const vol = this._pl_ivs.vol;
      let new_to2 = (this._pl_ivs.to2 * vol - vo2_step) / vol;
      if (new_to2 < 0) new_to2 = 0;
      let new_tco2 = (this._pl_ivs.tco2 * vol + vo2_step * this.resp_q) / vol;
      if (new_tco2 < 0) new_tco2 = 0;
      this._pl_ivs.to2 = new_to2;
      this._pl_ivs.tco2 = new_tco2;
      this.mp_vo2_ml = vo2_eff * this._model_engine.weight;
    } else {
      this.mp_vo2_ml = 0.0;
    }
    this.vo2_factor = 1.0; // reset the non-persistent layer

    // smoothed placental blood flow from the spiral-artery resistor (L/s -> mL/min)
    if (this._spiral_res) {
      const alpha = this._t / (this._flow_tc + this._t);
      this._flow_ema += (this._spiral_res.flow - this._flow_ema) * alpha;
    }
    this.mp_blood_flow = this._flow_ema * 60000.0;

    // share of total uterine inflow (placental / [placental + non-placental uterine]). Both the
    // numerator and denominator are EMA-smoothed so the ratio isn't polluted by pulsatile sampling.
    if (this._ut_in_res) {
      const alpha = this._t / (this._flow_tc + this._t);
      this._ut_in_ema += (this._ut_in_res.flow - this._ut_in_ema) * alpha;
    }
    this.mp_flow_fraction = this._ut_in_ema > 0.0 ? (this._flow_ema / this._ut_in_ema) * 100.0 : 0.0;

    // oxygen delivery / extraction read-outs. Arterial content = UT_ART; venous = PL_IVS.
    const art_to2 = this._ut_art ? this._ut_art.to2 : this._pl_ivs.to2;
    const flow_l_min = this._flow_ema * 60.0;
    this.mp_do2 = (flow_l_min * art_to2) / O2_MMOL_PER_ML; // mL O2/min
    this.mp_avo2 = art_to2 - this._pl_ivs.to2; // mmol/L
    this.mp_o2er = this.mp_do2 > 0.0 ? (this.mp_vo2_ml / this.mp_do2) * 100.0 : 0.0; // %
  }

  _zero_outputs() {
    this.mp_blood_flow = 0.0;
    this.mp_flow_fraction = 0.0;
    this.mp_do2 = 0.0;
    this.mp_vo2_ml = 0.0;
    this.mp_o2er = 0.0;
    this.mp_avo2 = 0.0;
  }
}
