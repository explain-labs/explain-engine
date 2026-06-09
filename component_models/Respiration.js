import { BaseModelClass } from "../base_models/BaseModelClass";

/*
compliance of the chestwall 4.2 ml/cmH2O/kg => 0.00544 L/mmHg/kg => 0.01904 L/mmHg
-> elastance = 52.5 mmHg/L
*/
export class Respiration extends BaseModelClass {
  // static properties
  static model_type = "Respiration";

  /*
    The Respiration class is not a model but houses methods that influence groups of models. 
    These groups contain models related to the respiratory tract. For example, the method 
    `change_lower_airway_resistance` influences the resistance of the lower airways by 
    setting the `r_factor` of the `DS_ALL` and `DS_ALR` gas resistors stored in a list 
    called `lower_airways`.
    */
  constructor(model_ref, name = "") {
    super(model_ref, name);

    // -----------------------------------------------
    // independent properties
    // -----------------------------------------------
    this.upper_airways = ["MOUTH_DS"]
    this.lower_airways = ["DS_ALL", "DS_ALR"]
    this.lower_airways_left = ["DS_ALL"]
    this.lower_airways_right = ["DS_ALR"]
    this.dead_space = ["DS"]
    this.thorax = ["THORAX"]
    this.pleural_space_left = []
    this.pleural_space_right = []
    this.lungs = ["ALL", "ALR"]
    this.left_lung = ["ALL"]
    this.right_lung = ["ALR"]
    this.gas_echangers = ["GASEX_LL", "GASEX_RL"]
    this.gas_exchanger_left_lung = ["GASEX_LL"]
    this.gas_exchanger_right_lung = ["GASEX_RL"]
    this.intrapulmonary_shunt = ["IPS"]

    this.el_lungs_factor = 1.0;
    this.el_thorax_factor = 1.0;
    
    this.res_upper_airways_factor = 1.0;
    this.res_lower_airways_factor = 1.0;

    this.gex_factor = 1.0


    // -----------------------------------------------
    // dependent properties
    // -----------------------------------------------


    // local properties
    this._update_interval = 0.015; // update interval (s)
    this._update_counter = 0.0; // update interval counter (s)
    this._prev_el_lungs_factor = 1.0;
    this._prev_el_thorax_factor = 1.0;
    this._prev_gex_factor = 1.0;
    this._prev_res_upper_airways_factor = 1.0;
    this._prev_res_lower_airways_factor = 1.0;
  }

  calc_model() {
    this._update_counter += this._t;
    if (this._update_counter > this._update_interval) {
      this._update_counter = 0.0;

      if (this._prev_el_lungs_factor !== this.el_lungs_factor) {
        // update the model
        this.set_el_lung_factor(this.el_lungs_factor)
        // store the current value
        this._prev_el_lungs_factor = this.el_lungs_factor
      }

      if (this._prev_el_thorax_factor !== this.el_thorax_factor) {
        // update the model
        this.set_el_thorax_factor(this.el_thorax_factor)
        // store the current value
        this._prev_el_thorax_factor = this.el_thorax_factor
      }

      if (this._prev_res_upper_airways_factor !== this.res_upper_airways_factor) {
        this.set_upper_airway_resistance(this.res_upper_airways_factor)
        this._prev_res_upper_airways_factor = this.res_upper_airways_factor
      }

      if (this._prev_res_lower_airways_factor !== this.res_lower_airways_factor) {
        this.set_lower_airway_resistance(this.res_lower_airways_factor)
        this._prev_res_lower_airways_factor = this.res_lower_airways_factor
      }

      if (this._prev_gex_factor !== this.gex_factor) {
        this.set_gasexchange(this.gex_factor);
        this._prev_gex_factor = this.gex_factor;
      }
    }
  }

  set_el_lung_factor(new_factor) {
    // el_base_factor_ps is a persistent factor accumulating effects from several models, so apply the
    // delta (not the absolute value). Compute it once so every lung gets the same change.
    const delta = new_factor - this._prev_el_lungs_factor;
    this.lungs.forEach(lung_name => {
      const m = this._model_engine.models[lung_name];
      if (!m) return;
      let f_ps = m.el_base_factor_ps + delta;
      if (f_ps < 0) f_ps = 0;
      m.el_base_factor_ps = f_ps;
    });
    this.el_lungs_factor = new_factor;
  }

  set_el_thorax_factor(new_factor) {
    const delta = new_factor - this._prev_el_thorax_factor;
    this.thorax.forEach(thorax_name => {
      const m = this._model_engine.models[thorax_name];
      if (!m) return;
      let f_ps = m.el_base_factor_ps + delta;
      if (f_ps < 0) f_ps = 0;
      m.el_base_factor_ps = f_ps;
    });
    this.el_thorax_factor = new_factor;
  }

  set_upper_airway_resistance(new_factor) {
    const delta = new_factor - this._prev_res_upper_airways_factor;
    this.upper_airways.forEach(uaw_name => {
      const m = this._model_engine.models[uaw_name];
      if (!m) return;
      let f_ps = m.r_factor_ps + delta;
      if (f_ps < 0) f_ps = 0;
      m.r_factor_ps = f_ps;
    });
    this.res_upper_airways_factor = new_factor;
  }

  set_lower_airway_resistance(new_factor) {
    const delta = new_factor - this._prev_res_lower_airways_factor;
    this.lower_airways.forEach(law_name => {
      const m = this._model_engine.models[law_name];
      if (!m) return;
      let f_ps = m.r_factor_ps + delta;
      if (f_ps < 0) f_ps = 0;
      m.r_factor_ps = f_ps;
    });
    this.res_lower_airways_factor = new_factor;
  }

  set_gasexchange(new_factor) {
    const delta = new_factor - this._prev_gex_factor;
    this.gas_echangers.forEach(gex_name => {
      const m = this._model_engine.models[gex_name];
      if (!m) return;
      // the O2 and CO2 diffusion factors track the same target; clamp each at 0 independently
      let f_ps_o2 = m.dif_o2_factor_ps + delta;
      let f_ps_co2 = m.dif_co2_factor_ps + delta;
      if (f_ps_o2 < 0) f_ps_o2 = 0;
      if (f_ps_co2 < 0) f_ps_co2 = 0;
      m.dif_o2_factor_ps = f_ps_o2;
      m.dif_co2_factor_ps = f_ps_co2;
    });
    this.gex_factor = new_factor;
  }

}
