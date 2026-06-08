import { Capacitance } from "../base_models/Capacitance";

// This class represents a blood capacitance model, which is a subclass of the Capacitance class.
// This class adds functionality to handle blood-specific properties such as temperature, viscosity, solute and drug concentrations.
export class BloodCapacitance extends Capacitance {
  // static properties
  static model_type = "BloodCapacitance";

  constructor(model_ref, name = "") {
    // call the parent constructor
    super(model_ref, name);

    // initialize independent properties unique to a BloodCapacitance
    this.temp = 37.0; // blood temperature (dgs C)
    this.viscosity = 6.0; // blood viscosity (centiPoise = Pa * s)
    this.solutes = {}; // dictionary holding all solutes
    this.drugs = {}; // dictionary holding all drug concentrations

    // initialize dependent properties unique to a BloodCapacitance
    this.to2 = 0.0; // total oxygen concentration (mmol/l)
    this.tco2 = 0.0; // total carbon dioxide concentration (mmol/l)
    this.ph = -1.0; // ph (unitless)
    this.pco2 = -1.0; // pco2 (mmHg)
    this.po2 = -1.0; // po2 (mmHg)
    this.so2 = -1.0; // o2 saturation
    this.hco3 = -1.0; // bicarbonate concentration (mmol/l)
    this.be = -1.0; // base excess (mmol/l)
  }
  
  // the method overrides the 'volume_in' method of the Capacitance class and 
  // adds functionality to update the viscosity, temperature and to2, tco2, solutes and drug concentrations
  volume_in(dvol, comp_from) {
    // call the parent method from the Capacitance class to update the volume
    super.volume_in(dvol, comp_from);

    // a fixed-composition compartment is an infinite reservoir: hold its composition
    // (and temperature/viscosity) constant, just as the parent already holds its volume constant
    if (this.fixed_composition) return;

    // guard against division by zero on an empty compartment (would produce NaN concentrations)
    if (this.vol <= 0.0) return;

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
