import { BaseModelClass } from "../base_models/BaseModelClass";
import { calc_gas_composition } from "./GasComposition"

export class Gas extends BaseModelClass {
  // static properties
  static model_type = "Gas";

  constructor(model_ref, name = "") {
    super(model_ref, name);

    // initialize independent properties
    this.pres_atm = 760.0; // atmospheric pressure in mmHg
    this.fio2 = 0.21; // fractional O2 concentration
    this.temp = 20.0; // global gas temperature (dgs C)
    this.humidity = 0.5; // global gas humidity (fraction)
    this.humidity_settings = {}; // dictionary holding the initial humidity settings of gas containing models
    this.temp_settings = {}; // dictionary holding the initial temperature settings of gas containing models

    // wiring for the body-temperature coupling (resolved lazily; Thermoregulation may build later)
    this.thermoregulation_name = "Thermoregulation";

    // local properties
    this.gas_containing_modeltypes = ["GasCapacitance"];
    this._gas_components = [];
    // per-site thermal offset from the body set-point for the body-warmed (perfused) airway
    // compartments — see set_body_temperature. Captured at build so rest stays neutral.
    this._body_temp_delta = {};
  }

  init_model(args = {}) {
    // set the values of the independent properties
    args.forEach((arg) => {
      this[arg["key"]] = arg["value"];
    });

    this._gas_components = [];
    for (const model_name in this._model_engine.models) {
      const model = this._model_engine.models[model_name];
      if (this.gas_containing_modeltypes.includes(model.model_type)) {
        this._gas_components.push(model);
        model.pres_atm = this.pres_atm;
        model.temp = this.temp;
        model.target_temp = this.temp;
      }
    }

    // set the temperatures of the different gas containing components
    Object.keys(this.temp_settings).forEach((model_name) => {
      let temp = this.temp_settings[model_name];
      this._model_engine.models[model_name].temp = temp;
      this._model_engine.models[model_name].target_temp = temp;
    });

    // set the humidity of the different gas containing components
    Object.keys(this.humidity_settings).forEach((model_name) => {
      let humidity = this.humidity_settings[model_name];
      this._model_engine.models[model_name].humidity = humidity;
    });

    // calculate the gas composition of the gas containing model types.
    // only bootstrap composition for freshly-constructed compartments (no gas of any species). A
    // restored/loaded state already carries the per-compartment concentrations, so guarding on the
    // raw concentrations — rather than the derived ctotal, which may not be serialized — preserves
    // the restored composition even when ctotal is missing/0.
    this._gas_components.forEach((model) => {
      const total_gas = model.co2 + model.cco2 + model.cn2 + model.ch2o + model.cother;
      if (total_gas === 0) {
        calc_gas_composition(model, this.fio2, model.temp, model.humidity);
      }
    });

    // Reconcile water vapour with the temperature each compartment actually ended up at.
    //
    // A device (Ventilator/Ecls) may have bootstrapped its gas lines in its own init_model, which
    // runs before this one, at a different temperature than the one applied above — leaving a
    // water content that is supersaturated for the final temperature. add_watervapour would
    // normally condense that out, but it never gets the chance on a compartment belonging to a
    // switched-off device, since step_model gates on is_enabled. Without this pass an idle
    // ventilator circuit reports a physically impossible relative humidity. Only a supersaturated
    // compartment is rebuilt, and in practice that is just a circuit holding fresh gas, so
    // rebuilding its composition from fio2 costs nothing.
    this._gas_components.forEach((model) => {
      const ctotal = model.co2 + model.cco2 + model.cn2 + model.ch2o + model.cother;
      if (ctotal <= 0.0 || !(model.pres_atm > 0.0)) return;

      // work from the concentrations rather than the derived ph2o, which on a compartment that is
      // never stepped still reflects whatever temperature it was last bootstrapped at
      const p_h2o = (model.ch2o / ctotal) * model.pres_atm;
      const p_sat = Math.exp(20.386 - 5132 / (model.temp + 273.15));
      if (p_h2o <= p_sat) return;

      calc_gas_composition(model, this.fio2, model.temp, model.humidity);
    });

    // Capture the thermal offset of each body-warmed (perfused) airway compartment relative to the
    // body set-point, so set_body_temperature can ride core temperature while staying exactly
    // neutral at rest. Body-warmed = the non-fixed_composition members of temp_settings (DS, ALL,
    // ALR): the alveoli and dead space warmed by the airway wall. MOUTH is fixed_composition (the
    // inspired-air source, warmed by the environment not the body) so it is excluded, as are the
    // device gas lines, which are not in temp_settings.
    const thermo = this._model_engine.models[this.thermoregulation_name];
    const setpoint = thermo && thermo.setpoint_temp != null ? thermo.setpoint_temp : 37.0;
    this._body_temp_delta = {};
    Object.keys(this.temp_settings).forEach((model_name) => {
      const m = this._model_engine.models[model_name];
      if (!m || m.fixed_composition) return;
      this._body_temp_delta[model_name] = m.target_temp - setpoint;
    });

    // flag that the model is initialized
    this._is_initialized = true;
  }

  calc_model() {
    // no per-step work: Gas is an orchestrator. The gas physics run in the individual
    // GasCapacitance elements (pressure/volume) and GasComposition (fractions/partial
    // pressures) during their own step calls; Gas only owns build-time setup here.
  }

  // Push the body core temperature onto the body-warmed airway compartments, the gas counterpart to
  // Blood.set_temperature. Each compartment rides core with its build-time offset, so at rest
  // (core == set-point) the targets equal their build values and nothing changes; under
  // fever/hypothermia the alveoli track core and the dead space holds its ~5 degC deficit below it.
  // Thermoregulation drives this from its effector pass.
  set_body_temperature(core_temp) {
    Object.keys(this._body_temp_delta).forEach((model_name) => {
      const m = this._model_engine.models[model_name];
      if (m) m.target_temp = core_temp + this._body_temp_delta[model_name];
    });
  }

  set_atmospheric_pressure(new_pres_atm) {
    this.pres_atm = new_pres_atm;

    // set the atmospheric pressure in all gas containing models
    this._gas_components.forEach((model) => {
      model.pres_atm = this.pres_atm;
    });
  }

  set_temperature(new_temp, sites = ["OUT", "MOUTH"]) {
    // make sure sites is an array
    sites = Array.isArray(sites) ? sites : [sites];
    
    // adjust the temperature in components stored in the sites parameter
    sites.forEach((site) => {
      this.temp_settings[site] = parseFloat(new_temp);
    });

    // set the temperatures of the different gas containing components
    Object.keys(this.temp_settings).forEach((model_name) => {
      let temp = this.temp_settings[model_name];
      this._model_engine.models[model_name].temp = temp;
      this._model_engine.models[model_name].target_temp = temp;
    });
  }

  set_humidity(new_humidity, sites = ["OUT", "MOUTH"]) {
    
    // make sure sites is an array
    sites = Array.isArray(sites) ? sites : [sites];

    // adjust the humidity in components stored in the sites parameter
    sites.forEach((site) => {
      this.humidity_settings[site] = parseFloat(new_humidity);
    });

    // set the humidities of the different gas containing components
    Object.keys(this.humidity_settings).forEach((model_name) => {
      let m = this._model_engine.models[model_name];
      if (!m) return;
      m.humidity = this.humidity_settings[model_name];

      // humidity is a live evaporation target, so a normal compartment relaxes to it on its own.
      // a fixed-composition one is never touched by add_watervapour, so it needs an explicit
      // recompute. only do it there: calc_gas_composition rebuilds the whole composition from
      // fio2, which on an airway compartment would discard its accumulated CO2
      if (m.fixed_composition) {
        calc_gas_composition(m, this.fio2, m.temp, m.humidity);
      }
    });
  }

  set_fio2(new_fio2, sites = ["OUT", "MOUTH"]) {
    // parse to a number (UI values may arrive as strings) to avoid string concatenation in the
    // gas-fraction math (e.g. 1 - (fio2 + fico2)), which would otherwise produce NaN concentrations
    this.fio2 = parseFloat(new_fio2);

    // make sure sites is an array
    sites = Array.isArray(sites) ? sites : [sites];

    // calculate the gas composition for the gas containing models
    sites.forEach((site) => {
      let m = this._model_engine.models[site];
      calc_gas_composition(m, this.fio2, m.temp, m.humidity);
    });
  }
}
