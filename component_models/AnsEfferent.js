
import { BaseModelClass } from "../base_models/BaseModelClass";

export class AnsEfferent extends BaseModelClass {
  // static properties
  static model_type = "AnsEfferent";
  /*
    The Efferent class models an autonomic nervous system efferent (effect) pathway.
    It calculates the average firing rate and translates it into an effect size on the target.
  */
  constructor(model_ref, name = "") {
    super(model_ref, name);

    // Initialize independent parameters
    this.target_model = ""; // name of the target using dot notation (e.g. Heart.hr_ans_factor)
    this.target_prop = ""; // name of the target using dot notation (e.g. Heart.hr_ans_factor)
    this.effect_at_max_firing_rate = 0.0; // effect size at average input firing rate of 1.0
    this.effect_at_min_firing_rate = 0.0; // effect size at average input firing rate of 0.0
    this.tc = 1.0; // time constant of the effect change (s)
    this.ans_active = true; // whether the efferent is active and can be influenced by the afferents

    // Initialize dependent parameters
    this.firing_rate = 0.0; // firing rate (unitless)
    this.effector = 1.0; // current effector size

    // Initialize local parameters
    this._update_interval = 0.015; // update interval of the effector (s)
    this._update_counter = 0.0; // update counter (s)
    this._cum_firing_rate = 0.0; // cumulative weighted firing-rate deviation since the last update
    this._cum_firing_rate_counter = 0.0; // number of afferent inputs accumulated since the last update
  }


  calc_model() {
    // Update every 15 ms instead of every step for performance reasons
    this._update_counter += this._t;
    if (this._update_counter >= this._update_interval) {
      this._update_counter = 0.0;

      // Determine the average firing rate. The accumulator holds the summed weighted deviations
      // from the 0.5 setpoint; add 0.5 AFTER averaging so the resting firing rate stays 0.5
      // regardless of how many afferents feed this efferent.
      this.firing_rate = 0.5;
      if (this._cum_firing_rate_counter > 0.0) {
        this.firing_rate = 0.5 + this._cum_firing_rate / this._cum_firing_rate_counter;
      }

      // Translate the average firing rate to the effect factor
      let effector;
      if (this.firing_rate >= 0.5) {
        effector = 1.0 + ((this.effect_at_max_firing_rate - 1.0) / 0.5) * (this.firing_rate - 0.5);
      } else {
        effector = this.effect_at_min_firing_rate + ((1.0 - this.effect_at_min_firing_rate) / 0.5) * this.firing_rate;
      }

      // If the ANS is not active, set the effector to 1.0 (no effect)
      if (!this.ans_active) {
        effector = 1.0;
        this.effector = 1.0;
      }

      // Incorporate the time constant for the effector change (guard tc == 0)
      if (this.tc > 0) {
        this.effector = this._update_interval * ((1.0 / this.tc) * (-this.effector + effector)) + this.effector;
      } else {
        this.effector = effector;
      }
      
      // Transfer the effect factor to the target model (skip if the target is not present)
      const _target = this._model_engine.models[this.target_model];
      if (_target) {
        _target[this.target_prop] = this.effector;
      }

      // Reset the accumulator for the next averaging window
      this._cum_firing_rate = 0.0;
      this._cum_firing_rate_counter = 0.0;
    }
  }

  // Update effector firing rate
  update_effector(new_firing_rate, weight) {
    // Increase the firing rate depending on the input and weight
    this._cum_firing_rate += (new_firing_rate - 0.5) * weight;
    this._cum_firing_rate_counter += 1.0;
  }
}