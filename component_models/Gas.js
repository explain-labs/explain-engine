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

    // local properties
    this.gas_containing_modeltypes = ["GasCapacitance"];
    this._gas_components = [];
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

    // flag that the model is initialized
    this._is_initialized = true;
  }

  calc_model() {
    // no per-step work: Gas is an orchestrator. The gas physics run in the individual
    // GasCapacitance elements (pressure/volume) and GasComposition (fractions/partial
    // pressures) during their own step calls; Gas only owns build-time setup here.
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
      let humidity = this.humidity_settings[model_name];
      this._model_engine.models[model_name].humidity = humidity;
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
