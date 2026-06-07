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
    this.lungs.forEach(lung_name => {
      // get a reference to the model
      let m = this._model_engine.models[lung_name]
      // get the current persistent el_base factor from the model
      let f_ps = m.el_base_factor_ps;
      // as this is a presistent factor which cumulates all effects from different models we can't just add the new factor
      // we have to add the difference 
      let delta = new_factor - this._prev_el_lungs_factor;
      // add the increase/decrease in factor
      f_ps += delta;
      // guard against negative values
      if (f_ps < 0) {
        new_factor = -f_ps
        f_ps = 0;
      }
      // transfer the factor
      m.el_base_factor_ps = f_ps
      // store the new factor
      this.el_lungs_factor = new_factor
    })
  }

    set_el_thorax_factor(new_factor) {
      this.thorax.forEach(thorax_name => {
        // get a reference to the model
        let m = this._model_engine.models[thorax_name]
        // get the current persistent el_base factor from the model
        let f_ps = m.el_base_factor_ps;
        // as this is a presistent factor which cumulates all effects from different models we can't just add the new factor
        // we have to add the difference 
        let delta = new_factor - this._prev_el_thorax_factor;
        // add the increase/decrease in factor
        f_ps += delta;
        // guard against negative values
        if (f_ps < 0) {
          new_factor = -f_ps
          f_ps = 0;
        }
        // transfer the factor
        m.el_base_factor_ps = f_ps
        // store the new factor
        this.el_thorax_factor = new_factor
      })
  }

  set_upper_airway_resistance(new_factor) {
    this.upper_airways.forEach(uaw_name => {
      // get a reference to the model
      let m = this._model_engine.models[uaw_name]
      // get the current persistent el_base factor from the model
      let f_ps = m.r_factor_ps;
      // as this is a presistent factor which cumulates all effects from different models we can't just add the new factor
      // we have to add the difference 
      let delta = new_factor - this._prev_res_upper_airways_factor;
      // add the increase/decrease in factor
      f_ps += delta;
      // guard against negative values
      if (f_ps < 0) {
        new_factor = -f_ps
        f_ps = 0;
      }
      // transfer the factor
      m.r_factor_ps = f_ps
      // store the new factor
      this.res_upper_airways_factor = new_factor
    })
  }

  set_lower_airway_resistance(new_factor) {
    this.lower_airways.forEach(law_name => {
      // get a reference to the model
      let m = this._model_engine.models[law_name]
      // get the current persistent el_base factor from the model
      let f_ps = m.r_factor_ps;
      // as this is a presistent factor which cumulates all effects from different models we can't just add the new factor
      // we have to add the difference 
      let delta = new_factor - this._prev_res_lower_airways_factor;
      // add the increase/decrease in factor
      f_ps += delta;
      // guard against negative values
      if (f_ps < 0) {
        new_factor = -f_ps
        f_ps = 0;
      }
      // transfer the factor
      m.r_factor_ps = f_ps
      // store the new factor
      this.res_lower_airways_factor = new_factor
    })

  }

  set_gasexchange(new_factor) {
    this.gas_echangers.forEach(gex_name => {
      // get a reference to the model
      let m = this._model_engine.models[gex_name]
      // get the current persistent el_base factor from the model
      let f_ps_o2 = m.dif_o2_factor_ps;
      let f_ps_co2 = m.dif_co2_factor_ps;
      // as this is a presistent factor which cumulates all effects from different models we can't just add the new factor
      // we have to add the difference 
      let delta = new_factor - this._prev_gex_factor;
      // add the increase/decrease in factor
      f_ps_o2 += delta;
      f_ps_co2 += delta;
      // guard against negative values
      if (f_ps_o2 < 0) {
        new_factor = -f_ps_o2
        f_ps_o2 = 0;
        f_ps_co2 = 0;
      }
      // transfer the factor
      m.dif_o2_factor_ps = f_ps_o2;
      m.dif_co2_factor_ps = f_ps_co2;
      // store the new factor
      this.gex_factor = new_factor
    })
  }

}
