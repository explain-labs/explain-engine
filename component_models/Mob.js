import { BaseModelClass } from "../base_models/BaseModelClass";
import { O2_MMOL_PER_ML } from "../helpers/Units";

export class Mob extends BaseModelClass {
  // static properties
  static model_type = "Mob";

  /*
  Mob — myocardial oxygen balance.

  Two physiologically explicit terms, both expressed natively in mmol O2 per
  gram of heart tissue:

    1. Basal MVO2:        bm_vo2 = bm_vo2_per_g · hw                [mmol/s]
    2. Stroke-work MVO2:  sw_vo2 = (SW_lv + SW_rv)[J] / (mech_efficiency · caloric_equiv_o2)
                                   · O2_MMOL_PER_ML / beat_interval    [mmol/s]
       where SW_* is the per-beat ventricular stroke work (P-V loop area, mmHg·L → J),
       computed as the area of the P-V loop via trapezoidal P·dV
       integration over the cardiac cycle.

  Per-step consumption is mob_vo2 · dt, taken from the COR (coronary blood pool) as far as COR
  holds the O2, with CO2 added at resp_q for the O2 actually used; the shortfall is o2_deficit.

  Owns the coronary sub-components (COR, AA_COR, COR_RAIVCI, COR_RASVC) declared
  under its `components` block in the model definition JSON.

  Drives hypoxia feedback to the Heart via hr_mob_factor, el_max_mob_factor,
  and ans_activity_factor.

  Coronary regulation: an integral controller on AA_COR.r_factor_ps holds the fractional O2 extraction
  at its resting value, so coronary flow rises as arterial O2 content falls or the heart's O2 use rises,
  until the dilation limit. Only past that limit does COR run out of O2 and the hypoxia effects start.
  */

  constructor(model_ref, name = "") {
    super(model_ref, name);

    // Independent properties
    this.mob_active = true;
    this.to2_min = 0.0002;
    this.to2_ref = 0.2;
    this.resp_q = 0.8; // myocardial respiratory quotient (CO2 produced / O2 consumed)

    // mmol O2 per gram heart tissue per second (basal myocardial VO2)
    this.bm_vo2_per_g = 3.7e-5;

    // external (stroke) work costs O2 through the myocardial work efficiency: O2 energy = work /
    // efficiency, at caloric_equiv_o2 J per mL O2 (STPD). This is the INCREMENTAL (contractile)
    // efficiency, ~0.35, since the basal term is counted separately; with basal included the
    // whole-heart efficiency comes out at the textbook ~15-20 %
    this.mech_efficiency = 0.35;
    this.caloric_equiv_o2 = 20.1; // J/mL O2

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
    this.ans_factor_max = 1;
    this.ans_factor_min = 0.01;
    this.ans_tc = 5;
    this.ans_activity_factor = 1;

    // coronary regulation: holds the fractional O2 extraction at cor_ext_ref through AA_COR.r_factor_ps
    this.cor_reg_enabled = true; // coronary regulation on/off
    this.cor_ext_ref = 0.0; // fractional O2 extraction held; <= 0 -> seeded after the warm-up
    this.cor_gain = 0.2; // 1/s per unit of extraction error: rate of change of ln(factor)
    this.cor_ext_tc = 2.0; // s - smoothing of the sensed extraction (averages out the beat)
    this.cor_factor_min = 0.12; // lowest factor on the inflow resistance (maximal dilation)
    this.cor_factor_max = 2.0; // highest factor on the inflow resistance (maximal constriction)
    this.cor_factor = 1.0; // applied factor on AA_COR.r_factor_ps (state, saved; 1 = neutral)
    this.cor_extraction = 0.0; // smoothed fractional O2 extraction across the coronary bed

    // hypoxia gains (rebuilt every step from the *_min/*_max bounds)
    this.hr_g = 0.0;
    this.cont_g = 0.0;
    this.ans_g = 0.0;

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
    this.beat_interval = 0.0; // s — measured time between the last two beats (amortises the stroke work)
    this.o2_deficit = 0.0; // mmol/s — myocardial O2 demand COR could not supply this step (0 at rest)

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
    this._cor_seed_timer = 0.0; // s since the build, for seeding cor_ext_ref
    this._sw_vo2_per_beat = 0.0;
    this._beat_timer = 0.0; // s since the last beat started
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
    if (!this.mob_active) {
      this.release_coronary_regulation();
      return;
    }

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
    if (!this._aa || !this._aa_cor || !this._cor || !this._heart || !this._lv || !this._rv) return;

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

    // Hypoxia-driven feedback to Heart
    this.calc_hypoxia_effects();

    // Coronary inflow resistance follows the O2 extraction
    this.calc_coronary_regulation(to2_cor);

    // Instantaneous oxygen balance reporter
    const o2_inflow = this._aa_cor.flow * this._aa.to2;
    const o2_use = this.mvo2_step / this._t;
    this.mob = o2_inflow - o2_use; // myocardial O2 balance (mmol/s): coronary O2 delivery minus use

    // Update coronary blood pool: take the demand as far as COR holds the O2, CO2 from the O2 used
    this.o2_deficit = 0.0;
    if (vol_cor > 0) {
      const used = Math.min(this.mvo2_step, Math.max(to2_cor * vol_cor, 0.0));
      this._cor.to2 = (to2_cor * vol_cor - used) / vol_cor;
      this._cor.tco2 = (tco2_cor * vol_cor + used * this.resp_q) / vol_cor;
      this.o2_deficit = (this.mvo2_step - used) / this._t;
    }
  }

  calc_coronary_regulation(to2_cor) {
    const to2_art = this._aa.to2;
    const ext = to2_art > 0.0 ? 1.0 - Math.max(to2_cor, 0.0) / to2_art : 1.0;
    this.cor_extraction = this.cor_extraction > 0.0 ? this.cor_extraction + (this._t / this.cor_ext_tc) * (ext - this.cor_extraction) : ext;

    if (!(this.cor_ext_ref > 0.0)) {
      // no stored reference: take the extraction once the circuit has settled
      this._cor_seed_timer += this._t;
      if (this._cor_seed_timer >= 30.0) this.cor_ext_ref = this.cor_extraction;
      return;
    }
    if (!this.cor_reg_enabled) {
      this.release_coronary_regulation();
      return;
    }
    // extraction above the reference dilates; integrating ln(factor) makes the gain proportional
    const f = this.cor_factor * Math.exp(-this.cor_gain * (this.cor_extraction - this.cor_ext_ref) * this._t);
    this.cor_factor = Math.min(Math.max(f, this.cor_factor_min), this.cor_factor_max);
    this._aa_cor.r_factor_ps = this.cor_factor;
  }

  release_coronary_regulation() {
    if (this.cor_factor === 1.0) return;
    this.cor_factor = 1.0;
    const aa_cor = this._model_engine.models["AA_COR"];
    if (aa_cor) aa_cor.r_factor_ps = 1.0;
  }

  calc_sw_vo2() {
    // Capture stroke work at the rising edge of cardiac_cycle_running
    this._beat_timer += this._t;
    if (
      this._heart.cardiac_cycle_running &&
      !this._heart.prev_cardiac_cycle_running
    ) {
      this.beat_interval = this._beat_timer;
      this._beat_timer = 0.0;
      this.stroke_work_lv = this._pv_area_lv_dec - this._pv_area_lv_inc;
      this.stroke_work_rv = this._pv_area_rv_dec - this._pv_area_rv_inc;
      this.stroke_work_total = this.stroke_work_lv + this.stroke_work_rv;

      // O2 cost of this beat's stroke work [mmol]: mmHg·L → J (× 0.133322), then work / efficiency
      const sw_joule = Math.max(this.stroke_work_total, 0.0) * 0.133322;
      const eff = this.mech_efficiency > 0.0 ? this.mech_efficiency : 1.0;
      this._sw_vo2_per_beat = (sw_joule / (eff * this.caloric_equiv_o2)) * O2_MMOL_PER_ML;

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

    // Amortise the per-beat O2 cost over the beat interval (RR), not the contraction: the work is paid
    // for over the whole cycle. Before the first full beat after a build or load, the set rate gives
    // the interval; a pause longer than the last interval stretches it, so an arrested heart stops
    // paying for its last beat
    let interval = this.beat_interval > 0.0 ? this.beat_interval : (this._heart.heart_rate > 0.0 ? 60.0 / this._heart.heart_rate : 0.0);
    if (this._beat_timer > interval) interval = this._beat_timer;
    return interval > 0.0 ? this._sw_vo2_per_beat / interval : 0.0;
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
