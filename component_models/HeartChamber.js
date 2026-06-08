import { TimeVaryingElastance } from "../base_models/TimeVaryingElastance";

// This class represents a blood time-varying elastance model, which is a subclass of the TimeVaryingElastance class.
// This class adds functionality to handle blood-specific properties such as temperature, viscosity, solute and drug concentrations.
export class HeartChamber extends TimeVaryingElastance {
  // static properties
  static model_type = "HeartChamber";

  constructor(model_ref, name = "") {
    super(model_ref, name);

    // initialize independent properties unique to a HeartChamber
    this.temp = 37.0; // blood temperature (dgs C)
    this.viscosity = 6.0; // blood viscosity (centiPoise = Pa * s)
    this.solutes = {}; // dictionary holding all solutes
    this.drugs = {}; // dictionary holding all drug concentrations
    this.ans_sens = 1.0; // sensitivity of this blood time varying elastance for autonomic control. 0.0 is no effect, 1.0 is full effect
    this.ans_activity = 1.0; // activiaty of the ans 

    // initialize dependent properties unique to a HeartChamber
    this.to2 = 0.0; // total oxygen concentration (mmol/l)
    this.tco2 = 0.0; // total carbon dioxide concentration (mmol/l)
    this.ph = -1.0; // ph (unitless)
    this.pco2 = -1.0; // pco2 (mmHg)
    this.po2 = -1.0; // po2 (mmHg)
    this.so2 = -1.0; // o2 saturation
    this.hco3 = -1.0; // bicarbonate concentration (mmol/l)
    this.be = -1.0; // base excess (mmol/l)
    this.el = 0.0;

    this.elmin_calc = 0.0
    this.elmax_calc = 0.9
  }
  // this method overrides the calc_elastances method of the 
  calc_elastances() {    
    // calculate the elastances and non-linear elastance incorporating the factors
    //  β-adrenergic receptors dominate in the myocardium
    
    // ans influences ANS diastolic function B1 receptor activation -> lusitropic effect
    this.el_min_eff = this.el_min
        + (this.el_min_factor - 1) * this.el_min
        + (this.el_min_factor_ps - 1) * this.el_min
        + (this.el_min_factor_scaling_ps - 1) * this.el_min
        - (this.ans_activity - 1) * this.el_min * this.ans_sens

    // ans influences ANS systolic function B1 receptor activation -> positive intropic effect
    this.el_max_eff = this.el_max
        + (this.el_max_factor - 1) * this.el_max
        + (this.el_max_factor_ps - 1) * this.el_max
        + (this.el_max_factor_scaling_ps - 1) * this.el_max
        + (this.ans_activity - 1) * this.el_max * this.ans_sens

    this.el_k_eff = this.el_k
        + (this.el_k_factor - 1) * this.el_k
        + (this.el_k_factor_ps - 1) * this.el_k
        + (this.el_k_factor_scaling_ps - 1) * this.el_k

    // make sure that el_max is not smaller than el_min
    if (this.el_max_eff < this.el_min_eff) {
      this.el_max_eff = this.el_min_eff;
    }

    // reset the non persistent factors
    this.el_min_factor = 1.0;
    this.el_max_factor = 1.0;
    this.el_k_factor = 1.0;
  }

  // the method overrides the 'volume_in' method of the TimeVaryingElastance class and 
  // adds functionality to update the viscosity, temperature and to2, tco2, solutes and drug concentrations
  volume_in(dvol, comp_from) {
    // call the parent method from the TimeVaryingElastance class to update the volume
    super.volume_in(dvol, comp_from);

    // a fixed-composition compartment is an infinite reservoir: hold its composition
    // (and temperature/viscosity) constant
    if (this.fixed_composition) return;

    // guard against division by zero on an empty compartment (would produce NaN concentrations)
    if (this.vol <= 0.0) return;

    // process the gases o2 and co2
    this.to2 += ((comp_from.to2 - this.to2) * dvol) / this.vol;
    this.tco2 += ((comp_from.tco2 - this.tco2) * dvol) / this.vol;

    // process the solutes (default to 0 if the source lacks the solute, to avoid NaN)
    Object.keys(this.solutes).forEach((solute) => {
      let solute_from = 0;
      if (comp_from.solutes[solute]) {
        solute_from = comp_from.solutes[solute];
      }
      this.solutes[solute] += ((solute_from - this.solutes[solute]) * dvol) / this.vol;
    });

    // process the temperature (treat it as a solute)
    this.temp += ((comp_from.temp - this.temp) * dvol) / this.vol;

    // process the viscosity (treat it as a solute)
    this.viscosity += ((comp_from.viscosity - this.viscosity) * dvol) / this.vol;

    // process the drug concentrations (default to 0 if the source lacks the drug, to avoid NaN)
    Object.keys(this.drugs).forEach((drug) => {
      let drug_from = 0.0;
      if (comp_from.drugs[drug]) {
        drug_from = comp_from.drugs[drug];
      }
      this.drugs[drug] += ((drug_from - this.drugs[drug]) * dvol) / this.vol;
    });
  }
}
