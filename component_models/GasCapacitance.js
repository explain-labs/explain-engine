import { Capacitance } from "../base_models/Capacitance";

// This class represents a gas capacitance model, which is a subclass of the Capacitance class.
// This class adds functionality to handle gas-specific properties such as temperature, humidity ans gas concentrations.

export class GasCapacitance extends Capacitance {
  // static properties
  static model_type = "GasCapacitance";

  constructor(model_ref, name = "") {
    // call the parent constructor
    super(model_ref, name);

    // initialize independent properties unique to a GasCapacitance
    this.pres_atm = 760; // atmospheric pressure (mmHg)
    this.pres_cc = 0.0; // external pressure (mmHg)
    this.pres_mus = 0.0; // muscle pressure (mmHg)
    this.fixed_composition = false; // flag for fixed gas composition
    this.target_temp = 0.0; // target temperature (dgs C)

    // initialize dependent properties unique to a GasCapacitance
    this.ctotal = 0.0; // total gas molecule concentration (mmol/l)
    this.co2 = 0.0; // oxygen concentration (mmol/l)
    this.cco2 = 0.0; // carbon dioxide concentration (mmol/l)
    this.cn2 = 0.0; // nitrogen concentration (mmol/l)
    this.cother = 0.0; // other gases concentration (mmol/l)
    this.ch2o = 0.0; // water vapor concentration (mmol/l)
    this.pres_rel = 0.0; // pressure relative to atmospheric (mmHg)
    this.po2 = 0.0; // partial pressure of oxygen (mmHg)
    this.pco2 = 0.0; // partial pressure of carbon dioxide (mmHg)
    this.pn2 = 0.0; // partial pressure of nitrogen (mmHg)
    this.pother = 0.0; // partial pressure of other gases (mmHg)
    this.ph2o = 0.0; // partial pressure of water vapor (mmHg)
    this.fo2 = 0.0; // fraction of oxygen of total gas volume
    this.fco2 = 0.0; // fraction of carbon dioxide of total gas volume
    this.fn2 = 0.0; // fraction of nitrogen of total gas volume
    this.fother = 0.0; // fraction of other gases of total gas volume
    this.fh2o = 0.0; // fraction of water vapor of total gas volume
    this.temp = 0.0; // gas temperature (dgs C)
    this.humidity = 0.0; // humidity (fraction)
   
    // local properties
    this._gas_constant = 62.36367; // ideal gas law constant (L·mmHg/(mol·K))
  }

  // override the calc_model method from the Capoacitance class
  calc_model() {
    // add heat to the gas
    this.add_heat();
    // add water vapor to the gas
    this.add_watervapour();
    // calculate the elastance and volumes
    this.calc_elastances();
    this.calc_volumes();
    
    // calculate the pressure
    this.calc_pressure();

    // update the gas composition
    this.calc_gas_composition();
  }

  calc_pressure() {
    // call parent method to calculate the elastance
    super.calc_pressure();

    // incorporate the external pressures and atmospheric pressure
    this.pres = this.pres + this.pres_cc + this.pres_mus + this.pres_atm;
    this.pres_rel = this.pres - this.pres_atm

    // reset the external pressure
    this.pres_cc = 0.0;
    this.pres_mus = 0.0;
  }

  // the method overrides the 'volume_in' method of the Capacitance class and 
  volume_in(dvol, comp_from) {
    // call the parent method from the Capacitance class to update the volume
    super.volume_in(dvol, comp_from);

    // a fixed-composition compartment is an infinite reservoir: hold its composition
    // (and temperature) constant, just as the parent already holds its volume constant
    if (this.fixed_composition) return;

    // guard against division by zero on an empty compartment (would produce NaN concentrations)
    if (this.vol <= 0.0) return;

    // process the changes in gas composition
    this.co2 = (this.co2 * this.vol + (comp_from.co2 - this.co2) * dvol) / this.vol;
    this.cco2 = (this.cco2 * this.vol + (comp_from.cco2 - this.cco2) * dvol) / this.vol;
    this.cn2 = (this.cn2 * this.vol + (comp_from.cn2 - this.cn2) * dvol) / this.vol;
    this.ch2o = (this.ch2o * this.vol + (comp_from.ch2o - this.ch2o) * dvol) / this.vol;
    this.cother = (this.cother * this.vol + (comp_from.cother - this.cother) * dvol) / this.vol;

    // adjust temperature due to gas influx
    this.temp = (this.temp * this.vol + (comp_from.temp - this.temp) * dvol) / this.vol;
  }

  add_heat() {
    // calculate the change in temperature based on the target temperature 
    let dT = (this.target_temp - this.temp) * 0.0005;
    // add heat to the gas
    this.temp += dT;

    // calculate the change in volume based on the ideal gas law
    if (this.pres !== 0.0 && !this.fixed_composition) {
      let dV = (this.ctotal * this.vol * this._gas_constant * dT) / this.pres;
      this.vol += dV / 1000.0;
    }

    // ensure the volume does not go below zero
    if (this.vol < 0) this.vol = 0;
  }

  add_watervapour() {
    // calculate the water vapor pressure based on the temperature and pressure
    let pH2Ot = this.calc_watervapour_pressure();

    // calculate the change in water vapor concentration
    let dH2O = 0.00001 * (pH2Ot - this.ph2o) * this._t;

    // calculate the change in water vapor concentration based on the temperature and pressure
    // (skip for a fixed-composition compartment so its water vapor stays constant)
    if (this.vol > 0.0 && !this.fixed_composition) {
      this.ch2o = (this.ch2o * this.vol + dH2O) / this.vol;
    }

    // calculate the change in volume based on the change in water vapor concentration
    if (this.pres !== 0.0 && !this.fixed_composition) {
      this.vol += ((this._gas_constant * (273.15 + this.temp)) / this.pres) * (dH2O / 1000.0);
    }
  }

  calc_watervapour_pressure() {
    // calculate the water vapor pressure based on the temperature
    return Math.exp(20.386 - 5132 / (this.temp + 273.15));
  }

  calc_gas_composition() {
    // calculate the total gas concentration
    this.ctotal = this.ch2o + this.co2 + this.cco2 + this.cn2 + this.cother;

    // calculate the partial pressures and fractions of each gas
    // check if the total gas concentration is zero to avoid division by zero
    if (this.ctotal === 0.0) return;

    // calculate the partial pressures
    this.ph2o = (this.ch2o / this.ctotal) * this.pres;
    this.po2 = (this.co2 / this.ctotal) * this.pres;
    this.pco2 = (this.cco2 / this.ctotal) * this.pres;
    this.pn2 = (this.cn2 / this.ctotal) * this.pres;
    this.pother = (this.cother / this.ctotal) * this.pres;

    // calculate the fractions of each gas
    this.fh2o = this.ch2o / this.ctotal;
    this.fo2 = this.co2 / this.ctotal;
    this.fco2 = this.cco2 / this.ctotal;
    this.fn2 = this.cn2 / this.ctotal;
    this.fother = this.cother / this.ctotal;
  }
}
