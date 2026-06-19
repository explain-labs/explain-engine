import { BaseModelClass } from "../base_models/BaseModelClass.js";

/*
  The Uterus class turns the (otherwise passive) uterine vascular bed
  (UT_ART -> UT_CAP -> UT_VEN) into a living organ. Like Kidneys/Placenta it is a
  controller/process model: it holds no blood itself but operates on the existing
  uterine capillary (UT_CAP) that Circulation supplies.

  Scope (Part 2):
    - Uterine OXYGEN CONSUMPTION / CO2 PRODUCTION: a dedicated uterine VO2 (ut_vo2,
      mL O2/kg/min) is applied directly to UT_CAP using the SAME molar conversion as the
      whole-body Metabolism model (0.039 mmol O2/mL at 37 C). It is deliberately NOT
      registered in Metabolism.metabolic_active_models, so the calibrated whole-body VO2
      map is left untouched and the uterus carries an independent, pregnancy-scalable O2
      demand of its own.
    - READ-OUTS: uterine blood flow (mL/min), O2 delivery (DO2), O2 uptake (VO2), O2
      extraction ratio (O2ER) and the arterio-venous O2 content difference.
    - A transient PERFUSION knob (perfusion_factor) modulates uterine inflow resistance.

  Part 3 (pregnancy adaptation): a pregnancy gestational age (preg_ga, weeks; distinct from the
  engine-level model.gestational_age which is the mother's OWN birth GA) scales the uterine bed and
  its O2 demand. As GA rises from a threshold to term, the bed resistance drops and its unstressed
  volume + VO2 rise (linear ramp between non-pregnant baseline and term anchors), expanding uterine
  blood flow from ~50 mL/min toward ~500-700 mL/min at term. Scaling is written to the persistent
  *_scaling_ps layers every step (idempotent — never mutate vol/r_for directly), which compose
  multiplicatively with the ANS, the SVR layer (r_factor_ps) and the transient perfusion_factor
  (r_factor). A maternal-placental coupling hook drives the (otherwise constant) maternal placenta
  pool PL_MAT from uterine arterial blood when enabled.

  Part 4 (uterine contractions / labor): a periodic intrauterine-pressure (IUP) waveform — a resting
  tone plus a smooth half-sine contraction recurring every contraction_period seconds — throttles the
  uterine bed by BOTH (1) physical compression, applying the IUP as external pressure (pres_ext) to
  UT_ART/CAP/VEN, which impedes arterial inflow and squeezes venous blood out (the "uterine pump"),
  and (2) a transient resistance rise on the bed (r_factor), giving controllable flow reduction. The
  read-outs (iup, contraction_active, montevideo_units) make the cycle clinically legible. Default
  off so the calibrated bed is untouched until labor is enabled.

  NOT in this version: a running/calibrated placental circuit (the coupling plumbing ships but the
  placenta stays disabled by default).
*/

// O2 molar density at 37 C, 1 atm (mmol O2 per mL) — same constant the Metabolism model uses, so
// the VO2 (mL/min) and DO2 (mL/min) read-outs share one unit system and O2ER is self-consistent.
const O2_MMOL_PER_ML = 0.039;

export class Uterus extends BaseModelClass {
  // static properties
  static model_type = "Uterus";

  constructor(model_ref, name = "") {
    super(model_ref, name);

    // -----------------------------------------------
    // independent parameters (config)
    this.uterus_running = true; // master gate for uterine organ function
    this.ut_art_name = "UT_ART"; // arteriolar inflow vessel
    this.ut_cap_name = "UT_CAP"; // capillary (metabolism / gas-exchange site)
    this.ut_ven_name = "UT_VEN"; // venular outflow vessel
    this.ut_in_res_name = "AD_UT_ART"; // inflow resistor (uterine blood-flow source)
    this.ut_out_res_name = "UT_VEN_VLB"; // venular drainage resistor (owned by VLB; we scale it in pregnancy)

    // uterine metabolism — dedicated rate applied to UT_CAP (mirrors Metabolism.calc_model)
    this.met_active = true; // uterine O2 consumption on/off
    this.ut_vo2 = 0.04; // uterine oxygen use (mL O2/kg/min) — SCENARIO-CALIBRATED (~25% O2ER)
    this.vo2_factor = 1.0; // non-persistent VO2 multiplier (reset to 1.0 each step)
    this.vo2_factor_ps = 1.0; // persistent VO2 multiplier (interventions / pregnancy scaling)
    this.resp_q = 0.8; // respiratory quotient (CO2 produced / O2 consumed)

    // transient vaso-tone knob. Written to UT_ART.r_factor (the NON-persistent layer) every step
    // so it composes multiplicatively with Circulation's r_factor_ps without colliding with it.
    // <1 = vasodilation (more flow), >1 = vasoconstriction. The hook for contractions later.
    this.perfusion_factor = 1.0;

    // --- pregnancy adaptation ---
    this.pregnant = false; // master pregnancy gate (default off -> preserves the non-pregnant calibration)
    this.preg_ga = 0.0; // pregnancy gestational age, weeks (0 = non-pregnant ... 40 = term).
    // NOTE: distinct from model.gestational_age (the mother's own birth GA = 40).
    this.preg_ga_threshold = 4.0; // below this GA the bed is treated as non-pregnant (no scaling)
    this.preg_ga_term = 40.0; // GA anchor at which the term target multipliers below are reached
    this.preg_res_term_factor = 0.083; // bed-resistance multiplier at term (~1/12 -> ~12x flow)
    this.preg_vol_term_factor = 3.0; // bed unstressed-volume multiplier at term (engorgement)
    this.preg_vo2_term_factor = 8.0; // uterine/conceptus VO2 multiplier at term

    // maternal-placental coupling: when pregnant && couple_placenta, drive the maternal placenta
    // pool (PL_MAT) O2/CO2 content from uterine arterial blood instead of the Placenta's constant.
    this.couple_placenta = false;
    this.pl_mat_name = "PL_MAT";

    // --- uterine contractions (labor) ---
    this.contractions_running = false; // master gate for contractions (default off -> bed untouched)
    this.contraction_period = 180.0; // s between contraction onsets (active labor ~ every 3 min)
    this.contraction_duration = 60.0; // s duration of each contraction (rise + fall)
    this.resting_tone = 8.0; // baseline IUP between contractions (mmHg)
    this.contraction_amplitude = 50.0; // peak IUP above resting tone (mmHg)
    this.contraction_pres_gain = 0.6; // fraction of IUP applied as pres_ext to the bed (0..1)
    this.contraction_r_peak = 2.0; // bed resistance multiplier at peak contraction (>= 1)

    // -----------------------------------------------
    // dependent parameters (read-outs)
    this.ut_blood_flow = 0.0; // uterine blood flow (mL/min)
    this.ut_do2 = 0.0; // oxygen delivery (mL O2/min)
    this.ut_vo2_ml = 0.0; // oxygen uptake (mL O2/min)
    this.ut_o2er = 0.0; // oxygen extraction ratio (%)
    this.ut_avo2 = 0.0; // arterio-venous O2 content difference (mmol/L)
    this.iup = 0.0; // current intrauterine pressure (mmHg)
    this.contraction_active = false; // currently within a contraction
    this.montevideo_units = 0.0; // MVU = peak amplitude x contractions per 10 min (labor adequacy)

    // -----------------------------------------------
    // local references / state
    this._ut_art = null;
    this._ut_cap = null;
    this._ut_ven = null;
    this._ut_in_res = null;
    this._ut_out_res = null; // venular drainage resistor (UT_VEN -> VLB)
    this._pl_mat = null; // lazily-resolved maternal placental pool (for coupling)
    this._flow_ema = 0.0; // smoothed inflow (L/s) — tames the pulsatile resistor flow for the read-out
    this._flow_tc = 5.0; // smoothing time constant (s) — long enough to average several cardiac cycles
    this._contraction_timer = 0.0; // s elapsed within the current contraction cycle
  }

  init_model(args) {
    // base applies the args (the Uterus owns no components of its own)
    super.init_model(args);
    // UT_ART/UT_CAP/UT_VEN and the inflow resistor are Circulation components that may be
    // instantiated AFTER us in build order, so they are resolved lazily in calc_model().
  }

  calc_model() {
    // lazy reference resolution (build-order independent)
    if (!this._ut_art) this._ut_art = this._model_engine.models[this.ut_art_name] ?? null;
    if (!this._ut_cap) this._ut_cap = this._model_engine.models[this.ut_cap_name] ?? null;
    if (!this._ut_ven) this._ut_ven = this._model_engine.models[this.ut_ven_name] ?? null;
    if (!this._ut_in_res) this._ut_in_res = this._model_engine.models[this.ut_in_res_name] ?? null;
    if (!this._ut_out_res) this._ut_out_res = this._model_engine.models[this.ut_out_res_name] ?? null;

    // gating + wiring guards
    if (!this.uterus_running) {
      // restore the pregnancy scaling layers we own so disabling the organ doesn't strand them
      this._reset_preg_scaling();
      this._zero_outputs();
      return;
    }
    if (!this._ut_art || !this._ut_cap || !this._ut_ven) return;
    if (this._ut_cap.vol <= 0.0) {
      this._zero_outputs();
      return;
    }

    // --- pregnancy bed scaling ---
    // Linear ramp of GA -> term multipliers. Written to the persistent *_scaling_ps layers every
    // step: that is IDEMPOTENT (the engine recomputes *_eff from the base each step), whereas
    // mutating vol/u_vol/r_for directly would compound. These layers are disjoint from the ANS
    // (ans_*), the SVR layer (r_factor_ps) and the transient perfusion_factor (r_factor), and
    // BloodVessel composes them multiplicatively, so they stack cleanly. When non-pregnant frac=0
    // and all factors are 1.0, so this is a true no-op that also auto-resets when GA drops.
    const frac = this._preg_frac();
    const res_factor = 1.0 + frac * (this.preg_res_term_factor - 1.0);
    const vol_factor = 1.0 + frac * (this.preg_vol_term_factor - 1.0);

    this._ut_art.r_factor_scaling_ps = res_factor;
    this._ut_cap.r_factor_scaling_ps = res_factor;
    this._ut_ven.r_factor_scaling_ps = res_factor;
    this._ut_art.u_vol_factor_scaling_ps = vol_factor;
    this._ut_cap.u_vol_factor_scaling_ps = vol_factor;
    this._ut_ven.u_vol_factor_scaling_ps = vol_factor;
    // The UT_VEN -> VLB drainage resistor is owned by VLB (it re-asserts its base r_for each step),
    // but its r_factor_scaling_ps layer is free, so we scale it here too. Without this the unscaled
    // drainage resistance becomes the dominant series resistor at term and caps flow at ~385 mL/min
    // (and pins UT_VEN pressure high). It is a separate resistor per organ, so only uterine drainage
    // is affected. Reads the value VLB set last step; idempotent at steady state regardless of order.
    if (this._ut_out_res) this._ut_out_res.r_factor_scaling_ps = res_factor;

    // VO2 expansion tracks the FLOW expansion (~1/res_factor), not GA linearly. Flow is convex in GA
    // (flow ~ 1/R, R linear in GA) so a GA-linear VO2 would outpace perfusion at mid-gestation and
    // drive O2ER unphysiologically high. Tying VO2 to the flow factor keeps O2ER physiologic across
    // gestation, reaching preg_vo2_term_factor exactly when flow reaches its term expansion.
    const flow_factor = 1.0 / res_factor; // uterine flow expansion vs non-pregnant baseline
    const flow_factor_term = 1.0 / this.preg_res_term_factor;
    const preg_vo2 = flow_factor_term > 1.0
      ? 1.0 + ((flow_factor - 1.0) / (flow_factor_term - 1.0)) * (this.preg_vo2_term_factor - 1.0)
      : 1.0;

    // --- uterine contractions ---
    // Advance the cycle timer and derive the current IUP from a smooth half-sine contraction
    // (intensity 0..1 over the contraction window, flat between contractions). The IUP is applied
    // both as external pressure on the bed (pres_ext, re-asserted each step since the compartment
    // resets it) and as a transient resistance rise (contraction_r_factor on r_factor).
    let contraction_r_factor = 1.0;
    if (this.contractions_running) {
      this._contraction_timer += this._t;
      if (this._contraction_timer >= this.contraction_period) {
        this._contraction_timer -= this.contraction_period;
      }
      let intensity = 0.0; // 0..1
      if (this._contraction_timer < this.contraction_duration) {
        intensity = Math.sin(Math.PI * this._contraction_timer / this.contraction_duration);
      }
      this.contraction_active = intensity > 0.0;
      this.iup = this.resting_tone + this.contraction_amplitude * intensity;

      // physical compression: IUP as external pressure on each uterine compartment
      const pe = this.iup * this.contraction_pres_gain;
      this._ut_art.pres_ext += pe;
      this._ut_cap.pres_ext += pe;
      this._ut_ven.pres_ext += pe;

      // controllable flow reduction: bed resistance rises with contraction intensity
      contraction_r_factor = 1.0 + intensity * (this.contraction_r_peak - 1.0);

      // labor adequacy: Montevideo units = peak amplitude x contractions per 10 min
      this.montevideo_units = this.contraction_amplitude * (600.0 / this.contraction_period);
    } else {
      this._contraction_timer = 0.0;
      this.contraction_active = false;
      this.iup = 0.0;
      this.montevideo_units = 0.0;
    }

    // transient perfusion knob + contraction resistance -> non-persistent r_factor layer (the
    // vessels reset r_factor to 1.0 each step, so we re-assert it every step). perfusion_factor is
    // the user/scenario vaso-tone knob (UT_ART); the contraction factor compresses the whole bed.
    this._ut_art.r_factor = this.perfusion_factor * contraction_r_factor;
    this._ut_cap.r_factor = contraction_r_factor;
    this._ut_ven.r_factor = contraction_r_factor;

    // uterine O2 consumption / CO2 production on UT_CAP (same molar conversion as Metabolism)
    if (this.met_active) {
      const vo2_eff = this.ut_vo2 * this.vo2_factor * this.vo2_factor_ps * preg_vo2; // mL O2/kg/min
      const vo2_step = ((O2_MMOL_PER_ML * vo2_eff * this._model_engine.weight) / 60.0) * this._t; // mmol/step
      const vol = this._ut_cap.vol;

      let new_to2 = (this._ut_cap.to2 * vol - vo2_step) / vol;
      if (new_to2 < 0) new_to2 = 0;
      let new_tco2 = (this._ut_cap.tco2 * vol + vo2_step * this.resp_q) / vol;
      if (new_tco2 < 0) new_tco2 = 0;
      this._ut_cap.to2 = new_to2;
      this._ut_cap.tco2 = new_tco2;

      // O2 uptake read-out as a rate (mL O2/min): vo2_eff (mL/kg/min) * body weight (kg)
      this.ut_vo2_ml = vo2_eff * this._model_engine.weight;
    } else {
      this.ut_vo2_ml = 0.0;
    }
    this.vo2_factor = 1.0; // reset the non-persistent layer

    // smoothed uterine blood flow from the inflow resistor (L/s), then -> mL/min
    if (this._ut_in_res) {
      const alpha = this._t / (this._flow_tc + this._t);
      this._flow_ema += (this._ut_in_res.flow - this._flow_ema) * alpha;
    }
    this.ut_blood_flow = this._flow_ema * 60000.0; // L/s -> mL/min

    // oxygen delivery / extraction read-outs. O2 content (mL O2/L) = to2 (mmol/L) / O2_MMOL_PER_ML.
    const flow_l_min = this._flow_ema * 60.0; // L/s -> L/min
    this.ut_do2 = (flow_l_min * this._ut_art.to2) / O2_MMOL_PER_ML; // mL O2/min
    this.ut_avo2 = this._ut_art.to2 - this._ut_ven.to2; // mmol/L
    this.ut_o2er = this.ut_do2 > 0.0 ? (this.ut_vo2_ml / this.ut_do2) * 100.0 : 0.0; // %

    // --- maternal-placental coupling ---
    // Drive the maternal placenta pool (PL_MAT) gas content from uterine arterial blood so the
    // placental maternal supply tracks uterine perfusion. Placenta is the OTHER writer of PL_MAT;
    // its skip_mat_gas_write flag must be set so exactly one model is authoritative per step.
    if (this.pregnant && this.couple_placenta) {
      if (!this._pl_mat) this._pl_mat = this._model_engine.models[this.pl_mat_name] ?? null;
      if (this._pl_mat) {
        this._pl_mat.to2 = this._ut_art.to2;
        this._pl_mat.tco2 = this._ut_art.tco2;
      }
    }
  }

  // normalized pregnancy progress in [0, 1]: 0 at/below threshold, 1 at/above term
  _preg_frac() {
    if (!this.pregnant || this.preg_ga <= this.preg_ga_threshold) return 0.0;
    const f = (this.preg_ga - this.preg_ga_threshold) / (this.preg_ga_term - this.preg_ga_threshold);
    return f > 1.0 ? 1.0 : f;
  }

  // restore the pregnancy scaling layers this model owns back to 1.0 (used when the organ is gated off)
  _reset_preg_scaling() {
    for (const v of [this._ut_art, this._ut_cap, this._ut_ven]) {
      if (!v) continue;
      v.r_factor_scaling_ps = 1.0;
      v.u_vol_factor_scaling_ps = 1.0;
    }
    if (this._ut_out_res) this._ut_out_res.r_factor_scaling_ps = 1.0;
  }

  _zero_outputs() {
    this.ut_blood_flow = 0.0;
    this.ut_do2 = 0.0;
    this.ut_vo2_ml = 0.0;
    this.ut_o2er = 0.0;
    this.ut_avo2 = 0.0;
    this.iup = 0.0;
    this.contraction_active = false;
    this.montevideo_units = 0.0;
  }
}
