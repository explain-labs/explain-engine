import { BaseModelClass } from "./BaseModelClass";

export class Container extends BaseModelClass {
  // static properties
  static model_type = "Container";

  constructor(model_ref, name = "") {
    // call the constructor of the parent class
    super(model_ref, name);

    // initialize independent properties
    this.u_vol = 0.0; // unstressed volume UV (L)
    this.el_base = 0.0; // baseline elastance E (mmHg/L)
    this.el_k = 0.0; // non-linear elastance factor K2 (unitless)
    this.pres_ext = 0.0; // non persistent external pressure p2(t) (mmHg)
    this.vol_extra = 0.0; // additional volume of the container (L)
    this.contained_components = []; // list of names of models this Container contains

    // non-persistent property factors. These factors reset to 1.0 after each model step
    this.u_vol_factor = 1.0; // non-persistent unstressed volume factor step (unitless)
    this.el_base_factor = 1.0; // non-persistent elastance factor step (unitless)
    this.el_k_factor = 1.0; // non-persistent elastance factor step (unitless)

    // persistent property factors. These factors are persistent and do not reset
    this.u_vol_factor_ps = 1.0;  // persistent unstressed volume factor (unitless)
    this.el_base_factor_ps = 1.0; // persistent elastance factor (unitless)
    this.el_k_factor_ps = 1.0; // persistent elastance factor (unitless)

    // scaling factors. These factors are persistent and do not reset, but they also scale the effect of the other factors instead of being added to them
    this.u_vol_factor_scaling_ps = 1.0;
    this.el_base_factor_scaling_ps = 1.0;
    this.el_k_factor_scaling_ps = 1.0;

    // initialize dependent properties
    this.vol = 0.0; // volume v(t) (L)
    this.pres = 0.0; // pressure p1(t) (mmHg)
    this.pres_in = 0.0; // recoil pressure of the elastance (mmHg)
    this.pres_tm = 0.0; // transmural pressure (mmHg)

    // local variables
    this.el_eff = 0.0; // calculated elastance (mmHg/L)
    this.u_vol_eff = 0.0; // calculated unstressed volume (L)
    this.el_k_eff = 0.0; // calculated elastance non-linear k (unitless)
  }

  calc_model() {
    // first calculate the current elastances and volumes
    this.calc_elastances();
    this.calc_volumes();
    
    // then calculate the pressure
    this.calc_pressure();
  }

  calc_elastances() {
    // calculate the elastance and non-linear elastance incorparting the factors
    this.el_eff = this.el_base 
        + (this.el_base_factor - 1) * this.el_base
        + (this.el_base_factor_ps - 1) * this.el_base
        + (this.el_base_factor_scaling_ps - 1) * this.el_base;

    this.el_k_eff = this.el_k 
        + (this.el_k_factor - 1) * this.el_k
        + (this.el_k_factor_ps - 1) * this.el_k
        + (this.el_k_factor_scaling_ps - 1) * this.el_k;

    // reset the non persistent factors
    this.el_base_factor = 1.0;
    this.el_k_factor = 1.0;
  }

  calc_volumes() {
    // reset the starting volume to the additional volume of the container
    this.vol = this.vol_extra;

    // get the cumulative volume from all contained models and add it to the volume of the container
    this.contained_components.forEach((c) => {
      this.vol += this._model_engine.models[c].vol;
    });
    
    // calculate the unstressed volume incorporating the factors
    this.u_vol_eff = this.u_vol 
        + (this.u_vol_factor - 1) * this.u_vol
        + (this.u_vol_factor_ps - 1) * this.u_vol
        + (this.u_vol_factor_scaling_ps - 1) * this.u_vol;

    // reset the non persistent factors
    this.u_vol_factor = 1.0;
  }

  calc_pressure() {
    // calculate the recoil pressure
    this.pres_in = this.el_k_eff * Math.pow(this.vol - this.u_vol_eff, 2) + this.el_eff * (this.vol - this.u_vol_eff);

    // calculate the transmural pressure
    this.pres_tm = this.pres_in - this.pres_ext;

    // calculate the total pressure by incorporating the external pressures
    this.pres = this.pres_in + this.pres_ext;

    // transfer the container pressure to the contained components
    this.contained_components.forEach((c) => {
      this._model_engine.models[c].pres_ext += this.pres;
    });

    // reset the external pressure
    this.pres_ext = 0.0;
  }
}
