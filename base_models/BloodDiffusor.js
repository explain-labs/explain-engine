import { BaseModelClass } from "./BaseModelClass";
import { calc_blood_composition } from "../component_models/BloodComposition"

export class BloodDiffusor extends BaseModelClass {
  // static properties
  static model_type = "BloodDiffusor";

  constructor(model_ref, name = "") {
    // call the parent constructor
    super(model_ref, name);

    // initialize independent properties
    this.comp_blood1 = "PLF"; // name of the first blood-containing model
    this.comp_blood2 = "PLM"; // name of the second blood-containing model
    this.dif_o2 = 0.01; // diffusion constant for o2 (mmol/mmHg * s)
    this.dif_co2 = 0.01; // diffusion constant for co2 (mmol/mmHg * s)
    this.dif_solutes = {}; // diffusion constant for the different solutes (mmol/mmol * s)

     // non-persistent property factors. These factors reset to 1.0 after each model step
    this.dif_o2_factor = 1.0; // non-persistent diffusion factor for o2 (unitless)
    this.dif_co2_factor = 1.0; // non-persistent diffusion factor for co2 (unitless)
    this.dif_solutes_factor = 1.0; // non-persistent diffusion factor for solutes (unitless)

    // persistent property factors. These factors are persistent and do not reset
    this.dif_o2_factor_ps = 1.0; // persistent diffusion factor for o2 (unitless)
    this.dif_co2_factor_ps = 1.0; // persistent diffusion factor for co2 (unitless)
    this.dif_solutes_factor_ps = 1.0; // persistent diffusion factor for solutes (unitless)

    // scaling factors
    this.dif_o2_factor_scaling = 1.0; // scaling factor for the o2 diffusion factor (unitless)
    this.dif_co2_factor_scaling = 1.0; // scaling factor for the co2 diffusion factor (unitless)
    this.dif_solutes_factor_scaling = 1.0; // scaling factor for the solute diffusion factor (unitless)
  
    // dependent properties
    this.dif_o2_step = 0.0; // state variable for the o2 diffusion (mmol)
    this.dif_co2_step = 0.0; // state variable for the co2 diffusion (mmol)

    // local variables
    this._comp_blood1 = null; // reference to the first blood-containing model
    this._comp_blood2 = null; // reference to the second blood-containing model
  }

  calc_model() {
    // find the two blood-containing models and store references
    this._comp_blood1 = this._model_engine.models[this.comp_blood1];
    this._comp_blood2 = this._model_engine.models[this.comp_blood2];

    // calculate the blood composition of the blood components in this diffusor as we need the partial pressures for the gas diffusion
    calc_blood_composition(this._comp_blood1);
    calc_blood_composition(this._comp_blood2);

    // incorporate the factors
    this.dif_o2_step = this.dif_o2
        + (this.dif_o2_factor - 1) * this.dif_o2
        + (this.dif_o2_factor_ps - 1) * this.dif_o2
        + (this.dif_o2_factor_scaling - 1) * this.dif_o2;

    this.dif_co2_step = this.dif_co2
        + (this.dif_co2_factor - 1) * this.dif_co2
        + (this.dif_co2_factor_ps - 1) * this.dif_co2
        + (this.dif_co2_factor_scaling - 1) * this.dif_co2;

    let solutes_step = 1.0
        + (this.dif_solutes_factor - 1)
        + (this.dif_solutes_factor_ps - 1)
        + (this.dif_solutes_factor_scaling - 1);

    // diffuse the gases, where diffusion is partial pressure-driven
    let do2 = (this._comp_blood1.po2 - this._comp_blood2.po2) * this.dif_o2_step * this._t;

    // update the concentrations
    if (!this._comp_blood1.fixed_composition) {
      this._comp_blood1.to2 = (this._comp_blood1.to2 * this._comp_blood1.vol - do2) / this._comp_blood1.vol;
    }
    if (!this._comp_blood2.fixed_composition) {
      this._comp_blood2.to2 = (this._comp_blood2.to2 * this._comp_blood2.vol + do2) / this._comp_blood2.vol;
    }

    let dco2 = (this._comp_blood1.pco2 - this._comp_blood2.pco2) * this.dif_co2_step * this._t;
    // update the concentrations
    if (!this._comp_blood1.fixed_composition) {
      this._comp_blood1.tco2 = (this._comp_blood1.tco2 * this._comp_blood1.vol - dco2) / this._comp_blood1.vol;
    }
    if (!this._comp_blood2.fixed_composition) {
      this._comp_blood2.tco2 = (this._comp_blood2.tco2 * this._comp_blood2.vol + dco2) / this._comp_blood2.vol;
    }

    // diffuse the solutes, where the diffusion is concentration gradient-driven
    Object.keys(this.dif_solutes).forEach((sol) => {
      let dif = this.dif_solutes[sol] * solutes_step;
      let dsol = (this._comp_blood1.solutes[sol] - this._comp_blood2.solutes[sol]) * dif * this._t;
      // update the concentration
      if (!this._comp_blood1.fixed_composition) {
        this._comp_blood1.solutes[sol] = (this._comp_blood1.solutes[sol] * this._comp_blood1.vol - dsol) / this._comp_blood1.vol;
      }
      if (!this._comp_blood2.fixed_composition) {
        this._comp_blood2.solutes[sol] = (this._comp_blood2.solutes[sol] * this._comp_blood2.vol + dsol) / this._comp_blood2.vol;
      }
    });

    // reset the non-persistent factors
    this.dif_o2_factor = 1.0;
    this.dif_co2_factor = 1.0;
    this.dif_solutes_factor = 1.0;
  }
}
