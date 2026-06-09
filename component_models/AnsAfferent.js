import { BaseModelClass } from "../base_models/BaseModelClass";

export class AnsAfferent extends BaseModelClass {
  // static properties
  static model_type = "AnsAfferent";

  constructor(model_ref, name = "") {
    super(model_ref, name);

    // Initialize independent properties
    this.input_model = ""; // name of the input model
    this.input_prop = ""; // name of the input prop
    this.efferents = []; // list of efferents that are connected to this afferent
    this.effect_weight = 1.0; // weight of the effect of this afferent on the efferents
    this.min_value = 0.0; // minimum of the input (firing rate is 0.0)
    this.set_value = 0.0; // setpoint of the input (firing rate is 0.5)
    this.max_value = 0.0; // maximum of the input (firing rate is 1.0)
    this.tc = 1.0; // time constant of the firing rate change (s)
    this.ans_active = true; // whether the afferent is active and can influence the efferents
    
    // Initialize dependent properties
    this.input_value = 0.0; // input value
    this.firing_rate = 0.0; // normalized receptor firing rate (0 - 1)

    // Initialize local properties
    this._update_interval = 0.015; // update interval of the receptor (s)
    this._update_counter = 0.0; // counter of the update interval (s)
    this._max_firing_rate = 1.0; // maximum normalized firing rate 1.0
    this._set_firing_rate = 0.5; // setpoint normalized firing rate 0.5
    this._min_firing_rate = 0.0; // minimum normalized firing rate 0.0
    this._gain = 0.0; // gain of the firing rate
  }

  calc_model() {
    // Update every 15 ms instead of every step for performance reasons
    this._update_counter += this._t;
    if (this._update_counter >= this._update_interval) {
      this._update_counter = 0.0;

      // Get the input value (skip this update if the input model is not present)
      const _input = this._model_engine.models[this.input_model];
      if (!_input) return;
      this.input_value = _input[this.input_prop];

      // Calculate the activation value
      let _activation = 0;
      if (this.input_value > this.max_value) {
        _activation = this.max_value - this.set_value;
      } else if (this.input_value < this.min_value) {
        _activation = this.min_value - this.set_value;
      } else {
        _activation = this.input_value - this.set_value;
      }

      // Calculate the gain (guard against zero-range input windows)
      if (_activation > 0) {
        const _pos_range = this.max_value - this.set_value;
        this._gain = _pos_range !== 0
          ? (this._max_firing_rate - this._set_firing_rate) / _pos_range
          : 0.0;
      } else {
        const _neg_range = this.set_value - this.min_value;
        this._gain = _neg_range !== 0
          ? (this._set_firing_rate - this._min_firing_rate) / _neg_range
          : 0.0;
      }

      // Calculate the new firing rate
      const _new_firing_rate = this._set_firing_rate + this._gain * _activation;

      // Incorporate the time constant to calculate the firing rate (guard tc == 0)
      if (this.tc > 0) {
        this.firing_rate = this._update_interval * ((1.0 / this.tc) * (-this.firing_rate + _new_firing_rate)) + this.firing_rate;
      } else {
        this.firing_rate = _new_firing_rate;
      }

      // apply the firing rate to each effector that resolves to a model with an update_effector hook
      this.efferents.forEach((effector) => {
        const _eff = this._model_engine.models[effector];
        if (_eff && typeof _eff.update_effector === "function") {
          // Update the effector with the firing rate and effect weight
          _eff.update_effector(this.firing_rate, this.effect_weight);
        }
      });
      
      
    }
  }
}
