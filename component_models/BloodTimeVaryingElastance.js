import { TimeVaryingElastance } from "../base_models/TimeVaryingElastance";

// This class represents a blood time-varying elastance model, which is a subclass of the TimeVaryingElastance class.
// This class adds functionality to handle blood-specific properties such as temperature, viscosity, solute and drug concentrations.
export class BloodTimeVaryingElastance extends TimeVaryingElastance {
  // static properties
  static model_type = "BloodTimeVaryingElastance";

  constructor(model_ref, name = "") {
    super(model_ref, name);

    // initialize independent properties unique to a BloodTimeVaryingElastance
    this.temp = 37.0; // blood temperature (dgs C)
    this.viscosity = 6.0; // blood viscosity (centiPoise = Pa * s)
    this.solutes = {}; // dictionary holding all solutes
    this.drugs = {}; // dictionary holding all drug concentrations

    // initialize dependent properties unique to a BloodTimeVaryingElastance
    this.to2 = 0.0; // total oxygen concentration (mmol/l)
    this.tco2 = 0.0; // total carbon dioxide concentration (mmol/l)
    this.ph = -1.0; // ph (unitless)
    this.pco2 = -1.0; // pco2 (mmHg)
    this.po2 = -1.0; // po2 (mmHg)
    this.so2 = -1.0; // o2 saturation
    this.hco3 = -1.0; // bicarbonate concentration (mmol/l)
    this.be = -1.0; // base excess (mmol/l)
  }


  // the method overrides the 'volume_in' method of the TimeVaryingElastance class and 
  // adds functionality to update the viscosity, temperature and to2, tco2, solutes and drug concentrations
  volume_in(dvol, comp_from) {
    // call the parent method from the TimeVaryingElastance class to update the volume
    super.volume_in(dvol, comp_from);

    // process the gases o2 and co2
    this.to2 += ((comp_from.to2 - this.to2) * dvol) / this.vol;
    this.tco2 += ((comp_from.tco2 - this.tco2) * dvol) / this.vol;

    // process the solutes
    Object.keys(this.solutes).forEach((solute) => {
      let solute_from = 0
      if (comp_from.solutes[solute]) {
        solute_from = comp_from.solutes[solute]
      }
      this.solutes[solute] += ((solute_from - this.solutes[solute]) * dvol) / this.vol;
    });

    // process the drug concentrations
    Object.keys(this.drugs).forEach((drug) => {
      let drug_from = 0.0
      if (comp_from.drugs[drug]) {
        drug_from = comp_from.drugs[drug]
      }
      this.drugs[drug] += ((drug_from - this.drugs[drug]) * dvol) / this.vol;
    });

    // process the temperature (treat it as a solute)
    this.temp += ((comp_from.temp - this.temp) * dvol) / this.vol;

    // process the viscosity (treat it as a solute)
    this.viscosity += ((comp_from.viscosity - this.viscosity) * dvol) / this.vol;
  }
}
