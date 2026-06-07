import { BaseModelClass } from "./BaseModelClass";

export class TimeVaryingElastance extends BaseModelClass {
  // static properties
  static model_type = "TimeVaryingElastance";

  constructor(model_ref, name = "") {
    // call the parent constructor
    super(model_ref, name);

    // initialize independent properties
    this.u_vol = 0.0; // unstressed volume UV (L)
    this.el_min = 0.0; // minimal elastance Emin (mmHg/L)
    this.el_max = 0.0; // maximal elastance emax(n) (mmHg/L)
    this.el_k = 0.0; // non-linear elastance coefficient K2 (unitless)
    this.pres_ext = 0.0; // non persistent external pressure p2(t) (mmHg)
    this.act_factor = 0.0; // activation factor from the heart model (unitless)

    // non-persistent property factors. These factors reset to 1.0 after each model step
    this.u_vol_factor = 1.0; // non-persistent unstressed volume factor step (unitless)
    this.el_min_factor = 1.0; // non-persistent minimal elastance factor step (unitless)
    this.el_max_factor = 1.0; // non-persistent maximal elastance factor step (unitless)
    this.el_k_factor = 1.0; // non-persistent elastance factor step (unitless)

    // persistent property factors. These factors are persistent and do not reset
    this.u_vol_factor_ps = 1.0; // persistent unstressed volume factor (unitless)
    this.el_min_factor_ps = 1.0; // persistent minimal elastance factor (unitless)
    this.el_max_factor_ps = 1.0; // persistent maximal elastance factor (unitless)
    this.el_k_factor_ps = 1.0; // persistent elastance factor (unitless)

    // scaling factors. These factors are persistent and do not reset
    this.u_vol_factor_scaling_ps = 1.0; // persistent scaling factor for the unstressed volume (unitless)
    this.el_min_factor_scaling_ps = 1.0; // persistent scaling factor for the minimal elastance (unitless)
    this.el_max_factor_scaling_ps = 1.0; // persistent scaling factor for the maximal elastance (unitless)
    this.el_k_factor_scaling_ps = 1.0; // persistent scaling factor for the elastance non-linearity (unitless)

    // initialize dependent properties
    this.vol = 0.0; // volume v(t) (L)
    this.pres = 0.0; // pressure p1(t) (mmHg)
    this.pres_in = 0.0; // recoil pressure of the elastance (mmHg)
    this.pres_tm = 0.0; // transmural pressure (mmHg)

    // local properties
    this.el_min_eff = 0.0; // calculated minimal elastance (mmHg/L)
    this.el_max_eff = 0.0; // calculated maximal elastance (mmHg/L)
    this.u_vol_eff = 0.0; // calculated unstressed volume (L)
    this.el_k_eff = 0.0; // calculated elastance non-linear k (unitless)
  }

  // this routine is called in every model step by the ModelEngine Class
  calc_model() {
    // calculate the elastances and volumes
    this.calc_elastances();
    this.calc_volumes();
    // calculate the pressure
    this.calc_pressure();
  }

  calc_elastances() {    
    // calculate the elastances and non-linear elastance incorparting the factors
    this.el_min_eff = this.el_min 
        + (this.el_min_factor - 1) * this.el_min
        + (this.el_min_factor_ps - 1) * this.el_min
        + (this.el_min_factor_scaling_ps - 1) * this.el_min; // apply scaling factor to the elastance factor
    
    this.el_max_eff = this.el_max 
        + (this.el_max_factor - 1) * this.el_max
        + (this.el_max_factor_ps - 1) * this.el_max
        + (this.el_max_factor_scaling_ps - 1) * this.el_max; // apply scaling factor to the elastance factor

    this.el_k_eff = this.el_k 
        + (this.el_k_factor - 1) * this.el_k
        + (this.el_k_factor_ps - 1) * this.el_k
        + (this.el_k_factor_scaling_ps - 1) * this.el_k; // apply scaling factor to the elastance factor

    // make sure that el_max is not smaller than el_min
    if (this.el_max_eff < this.el_min_eff) {
      this.el_max_eff = this.el_min_eff;
    }
    
    // reset the non persistent factors
    this.el_min_factor = 1.0;
    this.el_max_factor = 1.0;
    this.el_k_factor = 1.0;
  }

  calc_volumes() {
    // calculate the unstressed volume incorporating the factors
    this.u_vol_eff = this.u_vol 
        + (this.u_vol_factor - 1) * this.u_vol
        + (this.u_vol_factor_ps - 1) * this.u_vol
        + (this.u_vol_factor_scaling_ps - 1) * this.u_vol; // apply scaling factor to the unstressed volume

    // reset the non persistent factors
    this.u_vol_factor = 1.0;
  }

  calc_pressure() {
    // calculate the recoil pressure
    let p_ms = (this.vol - this.u_vol_eff) * this.el_max_eff;
    let p_ed = this.el_k_eff * Math.pow(this.vol - this.u_vol_eff, 2) + this.el_min_eff * (this.vol - this.u_vol_eff);

    // calculate the current recoil pressure
    this.pres_in = (p_ms - p_ed) * this.act_factor + p_ed;

    // calculate the total pressure by incorporating the external pressures
    this.pres = this.pres_in + this.pres_ext

    // calculate the transmural pressure
    this.pres_tm = this.pres_in - this.pres_ext;

    // reset the external pressure
    this.pres_ext = 0.0;
  }

  // override the volume_in method
  volume_in(dvol, comp_from) {
    // add volume to the capacitance
    this.vol += dvol;

    // return if the volume is zero or lower
    if (this.vol <= 0.0) return;
  }

  volume_out(dvol) {
    // remove volume from capacitance
    this.vol -= dvol;

    // if the volume is zero or lower, handle it
    if (this.vol < 0.0 && this.vol < this.u_vol) {
      let _vol_not_removed = -this.vol;
      // reset the volume to zero.
      this.vol = 0.0;
      // return the volume that was not removed
      return _vol_not_removed;
    }

    // return zero as all volume is removed
    return 0.0;
  }
}
