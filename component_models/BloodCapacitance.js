import { Capacitance } from "../base_models/Capacitance";
import { mix_blood_in } from "../helpers/BloodMixing";

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
  // mixes the incoming blood composition (see helpers/BloodMixing.js)
  volume_in(dvol, comp_from) {
    // call the parent method from the Capacitance class to update the volume
    super.volume_in(dvol, comp_from);

    // mix to2, tco2, solutes, drugs, temperature and viscosity by the incoming volume fraction
    mix_blood_in(this, dvol, comp_from);
  }
}
