import { BaseModelClass } from "./BaseModelClass";

export class GasDiffusor extends BaseModelClass {
  // static properties
  static model_type = "GasDiffusor";

  constructor(model_ref, name = "") {
    // call the parent constructor
    super(model_ref, name);

    // initialize independent properties
    this.comp_gas1 = ""; // name of the first gas-containing model
    this.comp_gas2 = ""; // name of the second gas-containing model
    this.dif_o2 = 0.01; // diffusion constant for o2 (mmol/mmHg * s)
    this.dif_co2 = 0.01; // diffusion constant for co2 (mmol/mmHg * s)
    this.dif_n2 = 0.01; // diffusion constant for n2 (mmol/mmHg * s)
    this.dif_other = 0.01; // diffusion constant for n2 (mmol/mmHg * s)

    // non-persistent property factors. These factors reset to 1.0 after each model step
    this.dif_o2_factor = 1.0; // non-persistent diffusion factor for o2 (unitless)
    this.dif_co2_factor = 1.0; // non-persistent diffusion factor for co2 (unitless)
    this.dif_n2_factor = 1.0; // non-persistent diffusion factor for n2 (unitless)
    this.dif_other_factor = 1.0; // non-persistent diffusion factor for other gasses (unitless)

    // persistent property factors. These factors are persistent and do not reset
    this.dif_o2_factor_ps = 1.0; // persistent diffusion factor for o2 (unitless)
    this.dif_co2_factor_ps = 1.0; // persistent diffusion factor for co2 (unitless)
    this.dif_n2_factor_ps = 1.0; // persistent diffusion factor for n2 (unitless)
    this.dif_other_factor_ps = 1.0; // persistent diffusion factor for other gasses (unitless)

    // scaling factors. These factors are persistent and do not reset, but they are applied as scaling factors to the diffusion factors, meaning that they apply to the total diffusion factor after applying the non-persistent and persistent factors
    this.dif_o2_factor_scaling = 1.0;
    this.dif_co2_factor_scaling = 1.0;
    this.dif_n2_factor_scaling = 1.0;
    this.dif_other_factor_scaling = 1.0;

    // local variables
    this._comp_gas1 = null; // reference to the first gas-containing model
    this._comp_gas2 = null; // reference to the second gas-containing model
    this.dif_o2_step = 0.0; // state variable for the o2 diffusion (mmol)
    this.dif_co2_step = 0.0; // state variable for the co2 diffusion (mmol)
    this.dif_n2_step = 0.0; // state variable for the n2 diffusion (mmol)
    this.dif_other_step = 0.0; // state variable for the other gasses diffusion (mmol)
  }

  calc_model() {
    // find the two gas-containing models and store references
    this._comp_gas1 = this._model_engine.models[this.comp_gas1];
    this._comp_gas2 = this._model_engine.models[this.comp_gas2];

    // refresh the partial pressures of both gas compartments from their current concentrations,
    // as we need the partial pressures for the gas diffusion. Use the GasCapacitance method (which
    // derives partials from the actual concentrations) — NOT the standalone calc_gas_composition
    // initializer, which would reset both compartments to a fixed (room-air) composition.
    this._comp_gas1.calc_gas_composition();
    this._comp_gas2.calc_gas_composition();

    // incorporate the factors
    this.dif_o2_step = this.dif_o2
        + (this.dif_o2_factor - 1) * this.dif_o2
        + (this.dif_o2_factor_ps - 1) * this.dif_o2
        + (this.dif_o2_factor_scaling - 1) * this.dif_o2;

    this.dif_co2_step = this.dif_co2
        + (this.dif_co2_factor - 1) * this.dif_co2
        + (this.dif_co2_factor_ps - 1) * this.dif_co2
        + (this.dif_co2_factor_scaling - 1) * this.dif_co2;

    this.dif_n2_step = this.dif_n2
        + (this.dif_n2_factor - 1) * this.dif_n2
        + (this.dif_n2_factor_ps - 1) * this.dif_n2
        + (this.dif_n2_factor_scaling - 1) * this.dif_n2;

    this.dif_other_step = this.dif_other
        + (this.dif_other_factor - 1) * this.dif_other
        + (this.dif_other_factor_ps - 1) * this.dif_other
        + (this.dif_other_factor_scaling - 1) * this.dif_other;

    // diffuse the gases, where diffusion is partial pressure-driven. Each concentration write is
    // guarded by fixed_composition so a fixed (infinite-reservoir) compartment stays constant,
    // mirroring BloodDiffusor.
    let do2 = (this._comp_gas1.po2 - this._comp_gas2.po2) * this.dif_o2_step * this._t;
    if (!this._comp_gas1.fixed_composition && this._comp_gas1.vol > 0.0) {
      this._comp_gas1.co2 = (this._comp_gas1.co2 * this._comp_gas1.vol - do2) / this._comp_gas1.vol;
    }
    if (!this._comp_gas2.fixed_composition && this._comp_gas2.vol > 0.0) {
      this._comp_gas2.co2 = (this._comp_gas2.co2 * this._comp_gas2.vol + do2) / this._comp_gas2.vol;
    }

    let dco2 = (this._comp_gas1.pco2 - this._comp_gas2.pco2) * this.dif_co2_step * this._t;
    if (!this._comp_gas1.fixed_composition && this._comp_gas1.vol > 0.0) {
      this._comp_gas1.cco2 = (this._comp_gas1.cco2 * this._comp_gas1.vol - dco2) / this._comp_gas1.vol;
    }
    if (!this._comp_gas2.fixed_composition && this._comp_gas2.vol > 0.0) {
      this._comp_gas2.cco2 = (this._comp_gas2.cco2 * this._comp_gas2.vol + dco2) / this._comp_gas2.vol;
    }

    let dn2 = (this._comp_gas1.pn2 - this._comp_gas2.pn2) * this.dif_n2_step * this._t;
    if (!this._comp_gas1.fixed_composition && this._comp_gas1.vol > 0.0) {
      this._comp_gas1.cn2 = (this._comp_gas1.cn2 * this._comp_gas1.vol - dn2) / this._comp_gas1.vol;
    }
    if (!this._comp_gas2.fixed_composition && this._comp_gas2.vol > 0.0) {
      this._comp_gas2.cn2 = (this._comp_gas2.cn2 * this._comp_gas2.vol + dn2) / this._comp_gas2.vol;
    }

    let dother = (this._comp_gas1.pother - this._comp_gas2.pother) * this.dif_other_step * this._t;
    if (!this._comp_gas1.fixed_composition && this._comp_gas1.vol > 0.0) {
      this._comp_gas1.cother = (this._comp_gas1.cother * this._comp_gas1.vol - dother) / this._comp_gas1.vol;
    }
    if (!this._comp_gas2.fixed_composition && this._comp_gas2.vol > 0.0) {
      this._comp_gas2.cother = (this._comp_gas2.cother * this._comp_gas2.vol + dother) / this._comp_gas2.vol;
    }

    // reset the non-persistent factors
    this.dif_o2_factor = 1.0;
    this.dif_co2_factor = 1.0;
    this.dif_n2_factor = 1.0;
    this.dif_other_factor = 1.0;

  }
}
