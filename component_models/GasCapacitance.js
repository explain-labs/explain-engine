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
    this.h2o_tc = 0.2; // water vapour equilibration time constant (s)
    this.temp_tc = 1.0; // thermal equilibration time constant (s)

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
    this.humidity = 1.0; // target relative humidity (fraction) the gas equilibrates toward
   
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

    // Gas is compressible, so a parcel crossing a pressure gradient expands (or is compressed):
    // the same molecules occupy a different volume here than they did in comp_from, and their
    // molar density scales by P_here / P_there. Mixing raw concentrations is only valid between
    // compartments at the same pressure — without this correction a pressurised source injects its
    // own molar density downstream, e.g. the 1160 mmHg ventilator supply driving the alveoli to
    // ~63 mmol/l where 760 mmHg at 37 C allows only ~40.
    //
    // Temperature is deliberately NOT folded in here: the parcel arrives at comp_from's
    // temperature, and add_heat performs the thermal expansion (and matching dilution) once the
    // compartment relaxes toward target_temp. Doing it here as well would double-count.
    //
    // This is a no-op (k = 1) between compartments at equal pressure, which is every pairing in
    // the model except the pressurised supplies. Those are all fixed_composition reservoirs whose
    // volume_out is a no-op, so no donor-side amount is contradicted by rescaling here.
    let k = 1.0;
    if (comp_from.pres > 0.0 && this.pres > 0.0) k = this.pres / comp_from.pres;

    // every species scales by the same k, so the gas FRACTIONS delivered are unchanged — this
    // corrects molar density only, never composition
    const in_co2 = comp_from.co2 * k;
    const in_cco2 = comp_from.cco2 * k;
    const in_cn2 = comp_from.cn2 * k;
    const in_ch2o = comp_from.ch2o * k;
    const in_cother = comp_from.cother * k;

    // process the changes in gas composition
    this.co2 = (this.co2 * this.vol + (in_co2 - this.co2) * dvol) / this.vol;
    this.cco2 = (this.cco2 * this.vol + (in_cco2 - this.cco2) * dvol) / this.vol;
    this.cn2 = (this.cn2 * this.vol + (in_cn2 - this.cn2) * dvol) / this.vol;
    this.ch2o = (this.ch2o * this.vol + (in_ch2o - this.ch2o) * dvol) / this.vol;
    this.cother = (this.cother * this.vol + (in_cother - this.cother) * dvol) / this.vol;

    // adjust temperature due to gas influx
    this.temp = (this.temp * this.vol + (comp_from.temp - this.temp) * dvol) / this.vol;
  }

  add_heat() {
    // a fixed-composition compartment is an infinite reservoir: it holds its temperature, just as
    // volume_in already holds its composition and temperature against advective mixing. without
    // this a heated gas supply would silently decay back to the ambient target it was built with
    if (this.fixed_composition) return;

    // relax the temperature toward the target over temp_tc seconds. the fraction is clamped so a
    // stepsize larger than the time constant can not overshoot into oscillation
    let frac = this.temp_tc > 0.0 ? Math.min(1.0, this._t / this.temp_tc) : 1.0;
    let dT = (this.target_temp - this.temp) * frac;
    // add heat to the gas
    this.temp += dT;

    // expand (or contract) the gas for the temperature change via the ideal gas law. ctotal is
    // mmol/l, so ctotal * vol / 1000 is the amount in mol
    if (this.pres > 0.0) {
      let v0 = this.vol;
      let dV = (((this.ctotal * v0) / 1000.0) * this._gas_constant * dT) / this.pres;
      let v1 = v0 + dV;
      if (v1 > 0.0) {
        // heating moves no molecules in or out, so every concentration dilutes by v0/v1. without
        // this the compartment keeps its concentrations while growing, which creates gas from
        // nothing and leaves ctotal inconsistent with the ideal gas law
        let s = v0 / v1;
        this.co2 *= s;
        this.cco2 *= s;
        this.cn2 *= s;
        this.cother *= s;
        this.ch2o *= s;
        this.vol = v1;
      }
    }

    // ensure the volume does not go below zero
    if (this.vol < 0) this.vol = 0;
  }

  // Relax the water vapour content toward what this compartment's wall can sustain.
  //
  // Two distinct mechanisms, so the target is asymmetric:
  //   - EVAPORATION can raise ph2o up to humidity * pH2Ot. Here `humidity` is how wet the wall
  //     is: airway mucosa is 1.0, a dry medical gas line is 0.0.
  //   - CONDENSATION can lower ph2o, but only out of genuine supersaturation, and only down to
  //     pH2Ot. The condensate is discarded — there is no liquid reservoir in this model.
  // Between the two the wall is neither source nor sink, so nothing happens. That dead band is
  // what stops a dry gas line from acting as a dehumidifier on wet gas that flows into it. For a
  // saturated wall (humidity 1.0) the band has zero width and this reduces to "track saturation".
  add_watervapour() {
    // a fixed-composition compartment is an infinite reservoir, so hold its water content
    if (this.fixed_composition || this.vol <= 0.0 || !(this.pres > 0.0)) return;

    let pH2Ot = this.calc_watervapour_pressure();
    let p_evap = pH2Ot * Math.min(1.0, Math.max(0.0, this.humidity));

    let p_target;
    if (this.ph2o > pH2Ot) p_target = pH2Ot; // supersaturated -> condense
    else if (this.ph2o < p_evap) p_target = p_evap; // subsaturated -> evaporate
    else return; // dead band

    // a saturation pressure at or above the total pressure means the gas is boiling, where the
    // partial-pressure formulation breaks down
    if (p_target >= this.pres) return;

    // the water concentration that yields p_target against the current dry gas load, solved
    // directly rather than iterated: ch2o / (c_dry + ch2o) * pres == p_target
    let c_dry = this.co2 + this.cco2 + this.cn2 + this.cother;
    if (c_dry <= 0.0) return;
    let ch2o_target = (c_dry * p_target) / (this.pres - p_target);

    // relax over h2o_tc seconds. targeting a concentration rather than an absolute amount is what
    // makes the time constant independent of compartment size; the clamp keeps it stable when the
    // stepsize exceeds the time constant
    let frac = this.h2o_tc > 0.0 ? Math.min(1.0, this._t / this.h2o_tc) : 1.0;
    let dc = (ch2o_target - this.ch2o) * frac;

    // the evaporated (or condensed) water takes up volume
    let v0 = this.vol;
    let n_h2o = dc * v0; // mmol of water added, or removed when condensing
    let dV = ((this._gas_constant * (273.15 + this.temp)) / this.pres) * (n_h2o / 1000.0);
    let v1 = v0 + dV;
    if (v1 <= 0.0) return;

    // only water crosses the wall, so the dry species keep their molecules and simply dilute into
    // the new volume. condensing gives n_h2o < 0 and v1 < v0, concentrating them instead
    let s = v0 / v1;
    this.co2 *= s;
    this.cco2 *= s;
    this.cn2 *= s;
    this.cother *= s;
    this.ch2o = (this.ch2o * v0 + n_h2o) / v1;
    this.vol = v1;
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
