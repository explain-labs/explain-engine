import { BaseModelClass } from "../base_models/BaseModelClass";

export class HeadUpTilt extends BaseModelClass {
  // static properties
  static model_type = "HeadUpTilt";

  constructor(model_ref, name = "") {
    super(model_ref, name);

    this.is_active = false;
    this.tilt_angle = 0.0;
    this.body_density = 1.06;
    this.g = 980.0;
    this.upper_column_cm = 25.0;
    this.lower_column_cm = 50.0;
    this.upper_body_container = "UPPER_BODY";
    this.lower_body_container = "LOWER_BODY";
  }

  set_tilt_angle(angle) {
    this.tilt_angle = Math.max(0, Math.min(90, angle));
  }

  calc_model() {
    if (!this.is_active) {
      return;
    }

    const sin_a = Math.sin((this.tilt_angle * Math.PI) / 180);
    // ρ·g·h gives dyn/cm^2; divide by 1333.22 to convert to mmHg
    const k = (this.body_density * this.g * sin_a) / 1333.22;

    const upper = this._model_engine.models[this.upper_body_container];
    const lower = this._model_engine.models[this.lower_body_container];

    // Capacitance computes pres = pres_in + pres_ext, and Resistor flow uses
    // this `pres`. Positive pres_ext raises a compartment's apparent pressure
    // and reduces inflow — the opposite of gravitational pooling. So the lower
    // body gets NEGATIVE pres_ext (more inflow, less outflow → blood pools)
    // and the upper body gets POSITIVE pres_ext (drainage).
    if (upper) {
      upper.pres_ext += k * this.upper_column_cm;
    }
    if (lower) {
      lower.pres_ext += -k * this.lower_column_cm;
    }
  }
}
