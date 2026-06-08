import { BaseModelClass } from "./BaseModelClass";
import { calc_blood_composition } from "../component_models/BloodComposition"

export class GasExchanger extends BaseModelClass {
  // static properties
  static model_type = "GasExchanger";

  constructor(model_ref, name = "") {
    // call the parent constructor
    super(model_ref, name);

    // initialize independent properties
    this.comp_blood = ""; // name of the blood component
    this.comp_gas = ""; // name of the gas component
    this.dif_o2 = 0.0; // diffusion constant for oxygen (mmol/mmHg * s)
    this.dif_co2 = 0.0; // diffusion constant for carbon dioxide (mmol/mmHg * s)

    // non-persistent factors
    this.dif_o2_factor = 1.0; // factor modifying the oxygen diffusion constant
    this.dif_co2_factor = 1.0; // factor modifying the carbon diffusion constant

    // persistent factors
    this.dif_o2_factor_ps = 1.0; // factor modifying the oxygen diffusion constant
    this.dif_co2_factor_ps = 1.0; // factor modifying the carbon diffusion constant

    // scaling factor
    this.dif_o2_factor_scaling = 1.0; // scaling factor for the oxygen diffusion constant
    this.dif_co2_factor_scaling = 1.0; // scaling factor for the carbon diffusion constant
    
    // dependent properties
    this.flux_o2 = 0.0; // oxygen flux (mmol)
    this.flux_co2 = 0.0; // carbon dioxide flux (mmol)

    // local variables
    this._blood = null; // reference to the blood component
    this._gas = null; // reference to the gas component
    this.dif_o2_step = 0.0; // state variable for the o2 diffusion (mmol)
    this.dif_co2_step = 0.0; // state variable for the co2 diffusion (mmol)
  }

  calc_model() {
    // find the blood and gas components
    this._blood = this._model_engine.models[this.comp_blood];
    this._gas = this._model_engine.models[this.comp_gas];

    // set the blood composition of the blood component
    calc_blood_composition(this._blood);

    // get the partial pressures and gas concentrations from the components
    let po2_blood = this._blood.po2;
    let pco2_blood = this._blood.pco2;
    let to2_blood = this._blood.to2;
    let tco2_blood = this._blood.tco2;

    let co2_gas = this._gas.co2;
    let cco2_gas = this._gas.cco2;
    let po2_gas = this._gas.po2;
    let pco2_gas = this._gas.pco2;

    // guard against division by zero on either compartment (both volumes are used as denominators)
    if (this._blood.vol <= 0.0 || this._gas.vol <= 0.0) return;

    // incorporate the factors
    this.dif_o2_step = this.dif_o2 
        + (this.dif_o2_factor - 1) * this.dif_o2
        + (this.dif_o2_factor_ps - 1) * this.dif_o2
        + (this.dif_o2_factor_scaling - 1) * this.dif_o2; // apply scaling factor to the diffusion factor

    this.dif_co2_step = this.dif_co2 
        + (this.dif_co2_factor - 1) * this.dif_co2
        + (this.dif_co2_factor_ps - 1) * this.dif_co2
        + (this.dif_co2_factor_scaling - 1) * this.dif_co2; // apply scaling factor to the diffusion factor


    // calculate the O2 flux from the blood to the gas compartment
    this.flux_o2 = (po2_blood - po2_gas) * this.dif_o2_step * this._t;

    // calculate the new O2 concentrations of the gas and blood compartments
    let new_to2_blood = (to2_blood * this._blood.vol - this.flux_o2) / this._blood.vol;
    if (new_to2_blood < 0) new_to2_blood = 0.0;

    let new_co2_gas = (co2_gas * this._gas.vol + this.flux_o2) / this._gas.vol;
    if (new_co2_gas < 0) new_co2_gas = 0.0;

    // calculate the CO2 flux from the blood to the gas compartment
    this.flux_co2 = (pco2_blood - pco2_gas) * this.dif_co2_step * this._t;

    // calculate the new CO2 concentrations of the gas and blood compartments
    let new_tco2_blood = (tco2_blood * this._blood.vol - this.flux_co2) / this._blood.vol;
    if (new_tco2_blood < 0) new_tco2_blood = 0.0;

    let new_cco2_gas = (cco2_gas * this._gas.vol + this.flux_co2) / this._gas.vol;
    if (new_cco2_gas < 0) new_cco2_gas = 0.0;

    // transfer the new concentrations, guarding each compartment by fixed_composition so a fixed
    // (infinite-reservoir) compartment stays constant, mirroring BloodDiffusor/GasDiffusor
    if (!this._blood.fixed_composition) {
      this._blood.to2 = new_to2_blood;
      this._blood.tco2 = new_tco2_blood;
    }
    if (!this._gas.fixed_composition) {
      this._gas.co2 = new_co2_gas;
      this._gas.cco2 = new_cco2_gas;
    }

    // reset the non-persistent factors
    this.dif_o2_factor = 1.0;
    this.dif_co2_factor = 1.0;
  }
}
