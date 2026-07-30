import { BaseModelClass } from "../base_models/BaseModelClass";

/*
  Template for a custom model — copy this file, rename the class and the model_type, and
  export it from ../CustomModelIndex.js. The leading underscore marks it as internal, and
  it is deliberately NOT exported on main, so it never shows up in the model list.

  What it does (a deliberately small but complete example): it watches the pressure in one
  blood compartment and, when that pressure drops below a threshold, squeezes the compartment
  by raising the elastance of a target compartment through the persistent factor layer. It is
  neutral while the pressure stays above the threshold, so dropping it into a scenario changes
  nothing until the condition is met.

  It demonstrates every piece of the contract you will need:
    - static model_type + prefixed naming
    - independent (config) / dependent (read-out) / _local property blocks
    - lazy cross-model reference resolution in init_model
    - writing through the *_factor_ps layer instead of the raw parameter
    - running a slow controller on its own interval rather than every step
*/

export class _ExampleModel extends BaseModelClass {
  // static properties — this string is what a model definition puts in "model_type".
  // Prefix it so it can never shadow a built-in model (e.g. "TimBaroreflexV2").
  static model_type = "_ExampleModel";

  constructor(model_ref, name = "") {
    super(model_ref, name);

    // -----------------------------------------------
    // independent properties (set from the model definition)
    this.sensor_name = "AA"; // compartment whose pressure is watched
    this.target_name = "AA"; // compartment whose elastance is adjusted
    this.pres_threshold = 40.0; // mmHg — below this the response engages
    this.max_response = 1.5; // el_base_factor_ps at full response
    this.gain = 1.0; // overall scaler, handy for clinical tuning

    // -----------------------------------------------
    // dependent properties (read-outs — watch these in the UI or a probe)
    this.activation = 0.0; // 0..1, how strongly the response is engaged
    this.applied_factor = 1.0; // the factor currently written to the target

    // -----------------------------------------------
    // local properties (never part of the definition)
    this._update_interval = 0.5; // controller cadence (s) — slow processes don't need every step
    this._update_counter = 0.0;
    this._sensor = null;
    this._target = null;
  }

  init_model(args) {
    // the base implementation applies the {key, value} pairs from the definition onto `this`
    // and instantiates anything declared in this.components
    super.init_model(args);

    // resolve cross-model references — safe here because build() constructs every model
    // before initializing any of them
    this._sensor = this._model_engine.models[this.sensor_name] ?? null;
    this._target = this._model_engine.models[this.target_name] ?? null;
  }

  calc_model() {
    // run the controller on its own interval instead of every model step
    this._update_counter += this._t;
    if (this._update_counter < this._update_interval) return;
    this._update_counter = 0.0;

    if (!this._sensor || !this._target) return;

    // how far below threshold are we, as a 0..1 activation (the standard clamp idiom)
    const deficit = (this.pres_threshold - this._sensor.pres) / this.pres_threshold;
    this.activation = this._clamp(deficit, 0.0, 1.0) * this.gain;

    // write through the PERSISTENT factor layer, never the raw parameter: el_base stays the
    // scenario's value, and this contribution composes with interventions and weight scaling
    this.applied_factor = 1.0 + this.activation * (this.max_response - 1.0);
    this._target.el_base_factor_ps = this.applied_factor;
  }

  _clamp(v, lo, hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }
}
