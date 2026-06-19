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

  NOT in this version: contractility / intra-uterine pressure, pregnancy / placental
  coupling, gestational scaling. perfusion_factor and ut_vo2 are the hooks for those.
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

    // -----------------------------------------------
    // dependent parameters (read-outs)
    this.ut_blood_flow = 0.0; // uterine blood flow (mL/min)
    this.ut_do2 = 0.0; // oxygen delivery (mL O2/min)
    this.ut_vo2_ml = 0.0; // oxygen uptake (mL O2/min)
    this.ut_o2er = 0.0; // oxygen extraction ratio (%)
    this.ut_avo2 = 0.0; // arterio-venous O2 content difference (mmol/L)

    // -----------------------------------------------
    // local references / state
    this._ut_art = null;
    this._ut_cap = null;
    this._ut_ven = null;
    this._ut_in_res = null;
    this._flow_ema = 0.0; // smoothed inflow (L/s) — tames the pulsatile resistor flow for the read-out
    this._flow_tc = 5.0; // smoothing time constant (s) — long enough to average several cardiac cycles
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

    // gating + wiring guards
    if (!this.uterus_running) {
      this._zero_outputs();
      return;
    }
    if (!this._ut_art || !this._ut_cap || !this._ut_ven) return;
    if (this._ut_cap.vol <= 0.0) {
      this._zero_outputs();
      return;
    }

    // transient perfusion knob -> UT_ART non-persistent resistance layer (the vessel resets
    // r_factor to 1.0 each step, so we re-assert it every step)
    this._ut_art.r_factor = this.perfusion_factor;

    // uterine O2 consumption / CO2 production on UT_CAP (same molar conversion as Metabolism)
    if (this.met_active) {
      const vo2_eff = this.ut_vo2 * this.vo2_factor * this.vo2_factor_ps; // mL O2/kg/min
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
  }

  _zero_outputs() {
    this.ut_blood_flow = 0.0;
    this.ut_do2 = 0.0;
    this.ut_vo2_ml = 0.0;
    this.ut_o2er = 0.0;
    this.ut_avo2 = 0.0;
  }
}
