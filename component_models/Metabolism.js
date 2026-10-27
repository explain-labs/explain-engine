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
    this.bat_site = "RUB"; // blood compartment that carries the brown-fat O2 cost (neck, interscapular, axillary: the upper body); "" spreads it over the beds

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
    const vo2_step = ((O2_MMOL_PER_ML * this.vo2 * this.vo2_factor * this.vo2_temp_factor * this._model_engine.weight) / 60.0) * this._t;
    // the brown-fat O2 cost (vo2_bat_factor, owned by Thermoregulation) is used where the brown fat is
    // (bat_site); without a usable site it is spread over the beds like the rest of the VO2
    const bat_step = vo2_step * (this.vo2_bat_factor - 1.0);
    const bat_comp = this.bat_site ? this._model_engine.models[this.bat_site] : null;
    const bat_local = bat_step !== 0.0 && !!bat_comp && bat_comp.vol > 0.0;

    // Iterate over each metabolic active model
    let deficit = 0.0;
    for (const [model, fvo2] of Object.entries(this.metabolic_active_models)) {
      deficit += this._use_o2(this._model_engine.models[model], (vo2_step + (bat_local ? 0.0 : bat_step)) * fvo2);
    }
    if (bat_local) deficit += this._use_o2(bat_comp, bat_step);
    this.o2_deficit = this._t > 0 ? deficit / this._t : 0.0;
  }

  // remove `demand` mmol O2 from a blood compartment (never more than it holds) and add the CO2 made
  // from what was used; returns the part of the demand that found no O2
  _use_o2(compartment, demand) {
    // skip if the compartment (or its capillary) is not present in this configuration, and an empty
    // compartment to avoid division by zero
    if (!compartment || compartment.vol <= 0.0) return 0.0;
    const vol = compartment.vol;
    const dto2 = Math.min(demand, Math.max(compartment.to2 * vol, 0.0));

    // CO2 produced from the O2 actually used (an exhausted compartment makes no aerobic CO2)
    const dtco2 = dto2 * this.resp_q;

    compartment.to2 = (compartment.to2 * vol - dto2) / vol;
    // Guard against negative values
    compartment.tco2 = Math.max((compartment.tco2 * vol + dtco2) / vol, 0.0);
    return demand - dto2;
  }
}
