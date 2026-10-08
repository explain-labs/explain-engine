import { BaseModelClass } from "../base_models/BaseModelClass";

export class Breathing extends BaseModelClass {
  // static properties
  static model_type = "Breathing";

  /*
    Spontaneous breathing driver. The neural drive sets a target minute volume (reference x chemoreflex
    via mv_ans_factor), split into rate and tidal volume by the Mecklenburgh relation. Each breath the
    respiratory muscles lower the pleural (THORAX) pressure with an amplitude that follows the drive:

      pmus_max = rmp_gain * target_tidal_volume                         (mmHg)

    rmp_gain is a calibration constant: the effort the patient's own respiratory system needs per litre
    of tidal volume. It is calibrated once on the first breaths (or taken from the scenario when
    rmp_calibrated is set) and then frozen, so a change in load (stiffer lungs, airway resistance, CPAP,
    pressure support) changes the delivered tidal volume, and the chemoreflex, not the muscle gain,
    compensates. load_compensation (0-1) re-enables a per-breath trim towards the target tidal volume
    (1 = close to the old tidal-volume-defending behaviour).

    Tidal volume is measured at the lungs (Respiration.lungs), so it does not depend on the airway route
    (natural airway, ET tube, leak).
  */
  constructor(model_ref, name = "") {
    super(model_ref, name);

    // initialize independent properties
    this.breathing_enabled = true; // flag whether spontaneous breathing is enabled or not
    this.minute_volume_ref = 0.2; // reference minute volume (L/kg/min)
    this.minute_volume_ref_factor = 1.0; // factor influencing the reference minute volume
    this.minute_volume_ref_scaling_factor = 1.0; // scaling factor of the reference minute volume
    this.vt_rr_ratio = 0.0001212; // ratio between tidal volume and respiratory rate
    this.vt_rr_ratio_factor = 1.0; // factor influencing the ratio
    this.vt_rr_ratio_scaling_factor = 1.0; // scaling factor for vt-rr ratio
    this.rmp_gain_max = 100.0; // maximum pressure the respiratory muscles can exert (mmHg)
    this.ie_ratio = 0.3; // ratio of inspiratory and expiratory time
    this.mv_ans_factor = 1.0; // factor from the autonomic nervous system
    this.ans_activity_factor = 1.0; // global ANS activity factor
    this.load_compensation = 0.5; // 0-1, partial compensation of the effort for loads and support
    this.thorax = ["THORAX"]; // container the muscle pressure acts on

    // initialize dependent properties
    this.target_minute_volume = 0.0; // target minute volume (L/min)
    this.resp_rate = 36.0; // respiratory rate (breaths/min)
    this.resp_rate_measured = 36.0; // measured respiratory rate (breaths/min)
    this.target_tidal_volume = 0.0; // target tidal volume (L)
    this.minute_volume = 0.0; // minute volume (L/min)
    this.exp_tidal_volume = 0.0; // expiratory tidal volume of the last breath, at the lungs (L)
    this.insp_tidal_volume = 0.0; // inspiratory tidal volume of the last breath, at the lungs (L)
    this.resp_muscle_pressure = 0.0; // current muscle pressure on the thorax (mmHg, positive = effort)
    this.pmus_max = 0.0; // peak muscle pressure of the current breath (mmHg)
    this.ncc_insp = 0; // inspiratory step counter (1 on the first step of a spontaneous inspiration)
    this.ncc_exp = 0; // expiratory step counter
    this.insp_running = false; // true during the spontaneous (neural) inspiration
    this.exp_running = false; // true during the spontaneous expiration
    this.rmp_gain = 0.0; // effort per litre of target tidal volume (mmHg/L), calibrated
    this.rmp_calibrated = false; // rmp_gain holds a calibrated value (persisted in scenarios)
    this.load_factor = 1.0; // effort trim from load_compensation

    // local properties
    this._eMin4 = Math.pow(Math.E, -4); // constant for the expiratory relaxation
    this._ti = 0.4; // inspiration time of the current breath (s)
    this._te = 1.0; // expiration time of the current breath (s)
    this._breath_timer = 0.0; // time since the start of the current breath (s)
    this._breath_interval = 0.0; // duration of the current breath (s); 0 starts a breath at once
    this._target_vt_breath = 0.0; // target tidal volume latched for the current breath (L)
    this._v_start = 0.0; // lung volume at the start of the breath (L)
    this._v_max = 0.0; // highest lung volume during the breath (L)
    this._cal_breaths = 0; // breaths spent calibrating
    this._cal_ok = 0; // consecutive calibration breaths within tolerance
    this._was_enabled = true; // breathing_enabled on the previous step
    this._rr_counter = 0.0; // counter for measured resp rate
    this._rr_factor = 0.0; // factor for resp rate counting
    this._lung_models = [];
    this._thorax = null;
  }

  // legacy aliases: the phase flags used to be private
  get _insp_running() {
    return this.insp_running;
  }
  set _insp_running(v) {
    this.insp_running = v;
  }
  get _exp_running() {
    return this.exp_running;
  }
  set _exp_running(v) {
    this.exp_running = v;
  }

  init_model(args = []) {
    super.init_model(args);
    // a scenario saved before the redesign stores rmp_gain as an elastance gain: recalibrate
    if (!this.rmp_calibrated) this.rmp_gain = 0.0;
    this._breath_interval = 0.0;
    this._breath_timer = 0.0;
  }

  calc_model() {
    const _weight = this._model_engine.weight;

    // drive: target minute volume, split into rate and tidal volume
    const _minute_volume_ref = this.minute_volume_ref * this.minute_volume_ref_factor * this.minute_volume_ref_scaling_factor * _weight;
    this.target_minute_volume = (_minute_volume_ref + (this.mv_ans_factor - 1.0) * _minute_volume_ref) * this.ans_activity_factor;
    this.vt_rr_controller(_weight);

    const v_lung = this._lung_volume();
    this._v_max = Math.max(this._v_max, v_lung);

    // breath phases; the timing and the target of a breath are latched at its start. Switching
    // breathing back on (end of a central apnea, after CPR) starts a breath at once instead of waiting
    // out the interval latched while it was off
    const resumed = this.breathing_enabled && !this._was_enabled;
    this._was_enabled = this.breathing_enabled;
    if (this._breath_timer >= this._breath_interval || resumed) {
      this._end_breath(v_lung);
      this._breath_timer = 0.0;
      this._breath_interval = this.resp_rate > 0 ? 60.0 / this.resp_rate : 60.0;
      this._ti = this.ie_ratio * this._breath_interval;
      this._te = this._breath_interval - this._ti;
      this._target_vt_breath = this.target_tidal_volume;
      this.insp_running = true;
      this.exp_running = false;
      this.ncc_insp = 0;
      this._v_start = v_lung;
      this._v_max = v_lung;
    }

    if (this.insp_running && this._breath_timer > this._ti) {
      this.insp_running = false;
      this.exp_running = true;
      this.ncc_exp = 0;
      this.insp_tidal_volume = Math.max(this._v_max - this._v_start, 0.0);
    }

    this._breath_timer += this._t;
    if (this.insp_running) this.ncc_insp += 1;
    if (this.exp_running) this.ncc_exp += 1;

    this.resp_muscle_pressure = 0.0;
    if (this.breathing_enabled) {
      if (!(this.rmp_gain > 0.0)) this.rmp_gain = this._initial_gain();
      this.pmus_max = Math.min(this.rmp_gain * this.load_factor * this._target_vt_breath, this.rmp_gain_max);
      this.resp_muscle_pressure = this.calc_resp_muscle_pressure() * this.pmus_max;
    } else {
      this.resp_rate = 0.0;
      this.ncc_insp = 0.0;
      this.ncc_exp = 0.0;
      this.target_tidal_volume = 0.0;
      this.pmus_max = 0.0;
    }

    // measure the resp rate (start inspiration as starting point)
    if (this.ncc_insp == 1) {
      this.resp_rate_measured = 60 / this._rr_counter;
      this._rr_counter = 0.0;
      this._rr_factor = 1.0;
    }
    // update the resp frequency even when there's no respiration
    if (this._rr_counter > 4 * this._rr_factor) {
      this.resp_rate_measured = 60 / this._rr_counter;
      this._rr_factor += 1;
    }
    this._rr_counter += this._t;

    // the muscles lower the pleural (thorax) pressure; the thorax resets pres_ext every step
    const thorax = this._thorax_model();
    if (thorax) thorax.pres_ext -= this.resp_muscle_pressure;
  }

  _end_breath(v_lung) {
    // close out the breath that just ended: its tidal volumes at the lungs, then calibration / trim
    if (!this.insp_running && !this.exp_running) return;
    this.exp_tidal_volume = Math.max(this._v_max - v_lung, 0.0);
    this.minute_volume = this.exp_tidal_volume * this.resp_rate;
    if (!this.breathing_enabled || !(this._target_vt_breath > 0.0)) return;

    // the exhaled volume: the inspiratory swing misses the tail of the previous expiration that runs
    // on into the start of the effort
    const vt = Math.max(this.exp_tidal_volume, 1e-6);
    const ratio = Math.min(Math.max(this._target_vt_breath / vt, 0.5), 2.0);

    if (!this.rmp_calibrated) {
      // calibrate the effort gain on the patient's own mechanics, then freeze it
      this.rmp_gain *= Math.pow(ratio, 0.8);
      this._cal_breaths += 1;
      this._cal_ok = Math.abs(ratio - 1.0) < 0.02 ? this._cal_ok + 1 : 0;
      if (this._cal_ok >= 3 || this._cal_breaths >= 40) this.rmp_calibrated = true;
      return;
    }

    // partial load compensation (volume-related reflexes, intrinsic muscle properties): a proportional
    // trim of the effort with a pull back to 1, so at steady state
    //   load_factor - 1 = lc / (1 - lc) * (target / Vt - 1)
    // lc = 0 is a pure pressure generator, lc -> 1 defends the target tidal volume (the old behaviour)
    const lc = Math.min(Math.max(this.load_compensation, 0.0), 0.95);
    this.load_factor += 0.2 * ((ratio - 1.0) * lc - (this.load_factor - 1.0) * (1.0 - lc));
    this.load_factor = Math.min(Math.max(this.load_factor, 0.25), 4.0);
  }

  _initial_gain() {
    // first estimate before calibration: the elastic pressure of a litre on the lungs and thorax in
    // series, doubled for the resistive part and the ramp; calibration refines it within a few breaths
    let c_lungs = 0.0;
    for (const l of this._lung_models) c_lungs += 1.0 / Math.max(l.el_base_eff ?? l.el_base, 1e-6);
    const e_lungs = c_lungs > 0 ? 1.0 / c_lungs : 0.0;
    const thorax = this._thorax_model();
    const e_thorax = thorax ? (thorax.el_base_eff ?? thorax.el_base ?? 0.0) : 0.0;
    return Math.max(2.0 * (e_lungs + e_thorax), 1.0);
  }

  _lung_volume() {
    if (this._lung_models.length === 0) {
      const names = this._model_engine.models["Respiration"]?.lungs ?? ["ALL", "ALR"];
      this._lung_models = names.map((n) => this._model_engine.models[n]).filter(Boolean);
    }
    let v = 0.0;
    for (const m of this._lung_models) v += m.vol;
    return v;
  }

  _thorax_model() {
    if (!this._thorax) {
      const name = Array.isArray(this.thorax) ? this.thorax[0] : this.thorax;
      this._thorax = this._model_engine.models[name] ?? null;
    }
    return this._thorax;
  }

  vt_rr_controller(_weight) {
    if (!this.breathing_enabled) {
      this.resp_rate = 0.0;
      return;
    }
    // guard the Mecklenburgh inversion against a non-positive denominator or target minute volume
    // (would otherwise yield Infinity/NaN resp_rate and a zero breath interval)
    const _denom = this.vt_rr_ratio * this.vt_rr_ratio_factor * this.vt_rr_ratio_scaling_factor * _weight;
    if (_denom > 0 && this.target_minute_volume > 0) {
      this.resp_rate = Math.sqrt(this.target_minute_volume / _denom);
      this.target_tidal_volume = this.target_minute_volume / this.resp_rate;
    } else {
      this.resp_rate = 0.0;
    }
  }

  calc_resp_muscle_pressure() {
    // normalized muscle pressure (0-1): a linear ramp over inspiration, then an exponential
    // relaxation over expiration
    if (this.insp_running) {
      return Math.min(this._breath_timer / Math.max(this._ti, 1e-6), 1.0);
    }
    if (this.exp_running) {
      const x = (this._breath_timer - this._ti) / Math.max(this._te, 1e-6);
      return Math.max((Math.exp(-4.0 * x) - this._eMin4) / (1.0 - this._eMin4), 0.0);
    }
    return 0.0;
  }

  switch_breathing(state) {
    this.breathing_enabled = state;
  }
}
