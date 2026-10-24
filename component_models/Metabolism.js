import { BaseModelClass } from "../base_models/BaseModelClass";
import { O2_MMOL_PER_ML } from "../helpers/Units";

export class Metabolism extends BaseModelClass {
  // static properties
  static model_type = "Metabolism";

  /*
    The Metabolism class models the oxygen use and carbon dioxide production in various blood-containing models.
    It calculates the changes in to2 and tco2 based on the oxygen use and respiratory quotient for metabolic activity.
    */
  constructor(model_ref, name = "") {
    super(model_ref, name);

    // Initialize independent properties
    this.met_active = true; // flag indicating if metabolism is active
    this.vo2 = 8.1; // oxygen use in ml/kg/min
    this.vo2_factor = 1.0; // persistent user/scenario multiplier on oxygen use (no model writes it)
    this.vo2_temp_factor = 1.0; // temperature (Q10) factor on oxygen use, owned by Thermoregulation (1.0 = 37 degC)
    this.vo2_bat_factor = 1.0; // brown-fat (non-shivering thermogenesis) O2 cost, owned by Thermoregulation (1.0 = none)
    this.resp_q = 0.8; // respiratory quotient for CO2 production
    this.metabolic_active_models = {}; // dictionary of models with fractional oxygen use

    // dependent properties
    this.o2_deficit = 0.0; // O2 demand that found no O2 in its compartment this step (mmol/s); 0 at rest
  }
  set_metabolic_active_model(site, new_fvo2) {
    this.metabolic_active_models[site] = new_fvo2;
  }
  calc_model() {
    if (!this.met_active) {
      // If metabolism is not active, do nothing
      return;
    }
    // Translate the VO2 in ml/kg/min (STPD) to VO2 in mmol for this step size.
    // vo2_temp_factor (Q10) is a persistent channel written by Thermoregulation; it is 1.0 at 37 degC / when that model is absent or disabled.
    const vo2_step =((O2_MMOL_PER_ML * this.vo2 * this.vo2_factor * this.vo2_temp_factor * this.vo2_bat_factor * this._model_engine.weight) / 60.0) * this._t;

    // Iterate over each metabolic active model
    let deficit = 0.0;
    for (const [model, fvo2] of Object.entries(this.metabolic_active_models)) {
      // Get the volume, tco2, and to2 from the blood compartment
      let compartment = this._model_engine.models[model];

      // skip if the compartment (or its capillary) is not present in this configuration
      if (!compartment) {
        continue;
      }

      const vol = compartment.vol;
      let to2 = compartment.to2;
      let tco2 = compartment.tco2;

      // skip an empty compartment to avoid division by zero. Use continue (not return) so the
      // remaining metabolic compartments are still processed this step.
      if (vol <= 0.0) {
        continue;
      }

      // O2 removed this step (mmol): the demand, but never more than the compartment holds
      const demand = vo2_step * fvo2;
      const dto2 = Math.min(demand, Math.max(to2 * vol, 0.0));
      deficit += demand - dto2;

      // Calculate the new oxygen concentration in blood
      const new_to2 = (to2 * vol - dto2) / vol;

      // CO2 produced from the O2 actually used (an exhausted compartment makes no aerobic CO2)
      const dtco2 = dto2 * this.resp_q;

      // Calculate the new CO2 concentration in blood
      let new_tco2 = (tco2 * vol + dtco2) / vol;

      // Guard against negative values
      if (new_tco2 < 0) {
        new_tco2 = 0;
      }

      // Store the new to2 and tco2 in the compartment
      compartment.to2 = new_to2;
      compartment.tco2 = new_tco2;
    }
    this.o2_deficit = this._t > 0 ? deficit / this._t : 0.0;
  }
}
