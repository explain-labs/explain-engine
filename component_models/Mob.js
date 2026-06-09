import { BaseModelClass } from "../base_models/BaseModelClass";

export class Mob2 extends BaseModelClass {
  // static properties
  static model_type = "Mob2";

  /*
  Mob2 — myocardial oxygen balance.

  Two physiologically explicit terms, both expressed natively in mmol O2 per
  gram of heart tissue:

    1. Basal MVO2:        bm_vo2 = bm_vo2_per_g · hw                [mmol/s]
    2. Stroke-work MVO2:  sw_vo2 = sw_vo2_per_g · hw · (SW_lv + SW_rv) / cycle_time
                                                                    [mmol/s]
       where SW_* is the per-beat ventricular stroke work (mmHg·mL),
       computed as the area of the P-V loop via trapezoidal P·dV
       integration over the cardiac cycle.

  Per-step consumption is mob_vo2 · dt, subtracted from the COR (coronary
  bloodpool) to2 with proportional CO2 added back via resp_q.

  Owns the coronary sub-components (COR, AA_COR, COR_RAIVCI, COR_RASVC) declared
  under its `components` block in the model definition JSON.

  Drives hypoxia feedback to the Heart via hr_mob_factor, el_max_mob_factor,
  and ans_activity_factor.
  */

  constructor(model_ref, name = "") {
    super(model_ref, name);

    // Independent properties
    this.mob_active = true;
    this.to2_min = 0.0002;
    this.to2_ref = 0.2;
    this.resp_q = 0.1;

    // mmol O2 per gram heart tissue per second (basal myocardial VO2)
    this.bm_vo2_per_g = 3.7e-5;

    // mmol O2 per gram heart tissue per (mmHg·mL of stroke work)
    this.sw_vo2_per_g = 2.0e-7;

    // hw [g] = hw_intercept + hw_slope · weight_kg · 1000
    this.hw_intercept = 7.799;
    this.hw_slope = 0.004296;

    this.hr_factor = 1;
    this.hr_factor_max = 1;
    this.hr_factor_min = 0.01;
    this.hr_tc = 5;
    this.cont_factor = 1;
    this.cont_factor_max = 1;
    this.cont_factor_min = 0.01;
    this.cont_tc = 5;
    this.ans_factor = 1;
    this.ans_factor_max = 1;
    this.ans_factor_min = 0.01;
    this.ans_tc = 5;
    this.ans_activity_factor = 1;

    // Dependent / output properties
    this.hw = 0.0;
    this.bm_vo2 = 0.0;
    this.sw_vo2 = 0.0;
    this.mob_vo2 = 0.0;
    this.mvo2_step = 0.0;
    this.stroke_work_lv = 0.0;
    this.stroke_work_rv = 0.0;
    this.stroke_work_total = 0.0;
    this.mob = 0.0;

    // Local references and integration state
    this._aa = null;
    this._aa_cor = null;
    this._cor = null;
    this._heart = null;
    this._lv = null;
    this._rv = null;
    this._a_to2 = 0.0;
    this._d_hr = 0.0;
    this._d_cont = 0.0;
    this._d_ans = 0.0;
    this._sw_vo2_per_beat = 0.0;
    this._prev_lv_vol = 0.0;
    this._prev_lv_pres = 0.0;
    this._prev_rv_vol = 0.0;
    this._prev_rv_pres = 0.0;
    this._pv_area_lv_inc = 0.0;
    this._pv_area_lv_dec = 0.0;
    this._pv_area_rv_inc = 0.0;
    this._pv_area_rv_dec = 0.0;
  }

  calc_model() {
    if (!this.mob_active) return;

    // Heart weight (g) from body weight (kg)
    this.hw = this.hw_intercept + this.hw_slope * this._model_engine.weight * 1000.0;

    // Hypoxia gains (rebuilt each step so changes to *_min/*_max take effect live)
    this.hr_g = (this.hr_factor_max - this.hr_factor_min) / (this.to2_ref - this.to2_min);
    this.cont_g = (this.cont_factor_max - this.cont_factor_min) / (this.to2_ref - this.to2_min);
    this.ans_g = (this.ans_factor_max - this.ans_factor_min) / (this.to2_ref - this.to2_min);

    // Cache model references
    this._aa = this._model_engine.models["AA"];
    this._aa_cor = this._model_engine.models["AA_COR"];
    this._cor = this._model_engine.models["COR"];
    this._heart = this._model_engine.models["Heart"];
    this._lv = this._model_engine.models["LV"];
    this._rv = this._model_engine.models["RV"];

    const to2_cor = this._cor.to2;
    const tco2_cor = this._cor.tco2;
    const vol_cor = this._cor.vol;

    // Hypoxia activation + first-order smoothing
    this._a_to2 = this.activation_function(to2_cor, this.to2_ref, this.to2_ref, this.to2_min);
    this._d_hr = this._t * ((1 / this.hr_tc) * (-this._d_hr + this._a_to2)) + this._d_hr;
    this._d_cont = this._t * ((1 / this.cont_tc) * (-this._d_cont + this._a_to2)) + this._d_cont;
    this._d_ans = this._t * ((1 / this.ans_tc) * (-this._d_ans + this._a_to2)) + this._d_ans;

    // Component MVO2 rates [mmol/s]
    this.bm_vo2 = this.bm_vo2_per_g * this.hw;
    this.sw_vo2 = this.calc_sw_vo2();

    this.mob_vo2 = this.bm_vo2 + this.sw_vo2;

    // Per-step consumption [mmol]
    this.mvo2_step = this.mob_vo2 * this._t;
    const co2_production = this.mvo2_step * this.resp_q;

    // Hypoxia-driven feedback to Heart
    this.calc_hypoxia_effects();

    // Instantaneous oxygen balance reporter
    const o2_inflow = this._aa_cor.flow * this._aa.to2;
    const o2_use = this.mvo2_step / this._t;
    this.mob = o2_inflow - o2_use + to2_cor;

    // Update coronary blood pool
    if (vol_cor > 0) {
      const new_to2_cor = (to2_cor * vol_cor - this.mvo2_step) / vol_cor;
      const new_tco2_cor = (tco2_cor * vol_cor + co2_production) / vol_cor;
      if (new_to2_cor >= 0) {
        this._cor.to2 = new_to2_cor;
        this._cor.tco2 = new_tco2_cor;
      }
    }
  }

  calc_sw_vo2() {
    // Capture stroke work at the rising edge of cardiac_cycle_running
    if (
      this._heart.cardiac_cycle_running &&
      !this._heart._prev_cardiac_cycle_running
    ) {
      this.stroke_work_lv = this._pv_area_lv_dec - this._pv_area_lv_inc;
      this.stroke_work_rv = this._pv_area_rv_dec - this._pv_area_rv_inc;
      this.stroke_work_total = this.stroke_work_lv + this.stroke_work_rv;

      // O2 cost of this beat's stroke work [mmol]
      this._sw_vo2_per_beat = this.sw_vo2_per_g * this.hw * this.stroke_work_total;

      this._pv_area_lv_inc = 0.0;
      this._pv_area_lv_dec = 0.0;
      this._pv_area_rv_inc = 0.0;
      this._pv_area_rv_dec = 0.0;
    }

    // Trapezoidal P·dV integration this step
    const _dV_lv = this._lv.vol - this._prev_lv_vol;
    if (_dV_lv > 0) {
      this._pv_area_lv_inc +=
        _dV_lv * this._prev_lv_pres +
        (_dV_lv * (this._lv.pres - this._prev_lv_pres)) / 2.0;
    } else {
      this._pv_area_lv_dec +=
        -_dV_lv * this._prev_lv_pres +
        (-_dV_lv * (this._lv.pres - this._prev_lv_pres)) / 2.0;
    }

    const _dV_rv = this._rv.vol - this._prev_rv_vol;
    if (_dV_rv > 0) {
      this._pv_area_rv_inc +=
        _dV_rv * this._prev_rv_pres +
        (_dV_rv * (this._rv.pres - this._prev_rv_pres)) / 2.0;
    } else {
      this._pv_area_rv_dec +=
        -_dV_rv * this._prev_rv_pres +
        (-_dV_rv * (this._rv.pres - this._prev_rv_pres)) / 2.0;
    }

    this._prev_lv_vol = this._lv.vol;
    this._prev_lv_pres = this._lv.pres;
    this._prev_rv_vol = this._rv.vol;
    this._prev_rv_pres = this._rv.pres;

    // Amortize per-beat O2 cost across the current cycle duration
    const cc_time = this._heart.cardiac_cycle_time;
    return cc_time > 0 ? this._sw_vo2_per_beat / cc_time : 0.0;
  }

  calc_hypoxia_effects() {
    this.ans_activity_factor = 1.0 + this.ans_g * this._d_ans;
    this._heart.ans_activity_factor = this.ans_activity_factor;

    this.hr_factor = 1.0 + this.hr_g * this._d_hr;
    this._heart.hr_mob_factor = this.hr_factor;

    this.cont_factor = 1.0 + this.cont_g * this._d_cont;
    this._heart._lv.el_max_mob_factor = this.cont_factor;
    this._heart._rv.el_max_mob_factor = this.cont_factor;
    this._heart._la.el_max_mob_factor = this.cont_factor;
    if (this._heart._raivci) this._heart._raivci.el_max_mob_factor = this.cont_factor;
    if (this._heart._rasvc) this._heart._rasvc.el_max_mob_factor = this.cont_factor;
  }

  activation_function(value, max, setpoint, min) {
    if (value >= max) return max - setpoint;
    if (value <= min) return min - setpoint;
    return value - setpoint;
  }
}
