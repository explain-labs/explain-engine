

import { BaseModelClass } from "../base_models/BaseModelClass.js";
import { calc_gas_composition } from "../component_models/GasComposition"
import { calc_blood_composition } from "../component_models/BloodComposition";
import RealTimeMovingAverage from "../helpers/RealTimeMovingAverage";

export class Ecls extends BaseModelClass {
  // static properties
  static model_type = "Ecls";

  /*

    */

  constructor(model_ref, name = "") {
    // initialize the base model class setting all the general properties of the model which all models have in common
    
    // Average umbilical cord length at term          : – 55 cm
    // Mean luminal CSA per artery at 37–39 weeks     : – 0.147 cm² (overall mean across 300 normal pregnancies) DOI: http://dx.doi.org/10.18203/2320-1770.ijrcog20183851
    // Mean volume of umbilical artery                : 55 * 0.147 = 8.1 cm3 = 8.1 ml per artery => 16.2 ml for two arteries
    // Mean luminal CSA umbilical vein at 37-39 weeks : - 0.58 cm2
    // Mean volume of umbilical vein                  : 55 * 0.58 = 31.9 cm3 = 31.9 ml  Spurway J, Logan P, Pak S. The development, structure and blood flow within the umbilical cord with particular reference to the venous system. Australas J Ultrasound Med. 2012 Aug;15(3):97-102. doi: 10.1002/j.2205-0140.2012.tb00013.x. Epub 2015 Dec 31. PMID: 28191152; PMCID: PMC5025097.
    // Mean volume of fetal part of placenta          : 427 ml DOI: 10.7863/jum.2008.27.11.1583

    super(model_ref, name);
    // -----------------------------------------------
    // initialize independent parameters
    this.ecls_running = false;
    this.ecls_clamped = true; // flags whether the umbilical vessels are clamped or not
    
    
    this.drainage_res_factor = 1.0; // factor to adjust the drainage resistance
    this.return_res_factor = 1.0; // factor to adjust the return resistance
    this.tubing_res_factor = 1.0; // factor to adjust the tubing in resistance
    this.pump_res_factor = 1.0; // factor to adjust the pump resistance
    this.oxy_res_for = 1500; // resistance of the oxygenator (mmHg/(L/s))
    this.oxy_res_back = 1500; // resistance of the oxygenator (mmHg/(L/s))
    this.oxy_res_factor = 1.0; // factor to adjust the oxygenator resistance
    this.oxy_vol = 0.09; // volume of the oxygenator (L)
    this.gas_flow = 0.5; // gas flow rate through the oxygenator (L/min)
    this.gas_fio2 = 0.205; // fraction of inspired oxygen in the gas flow through the oxygenator
    this.gas_fico2 = 0.000392; // fraction of inspired carbon dioxide in the gas flow through the oxygenator
    this.gas_humidity = 0.5; // humidity of the gas flow through the oxygenator (fraction)
    this.gas_temp = 20.0; // temperature of the gas flow through the oxygenator (dgs C)
    this.dif_o2 = 0.0005; // diffusion constant for oxygen (mmol/mmHg * s)
    this.dif_co2 = 0.001; // diffusion constant for carbon dioxide (mmol/mmHg * s)
    this.pump_rpm = 1500.0; // pump speed in rotations per minute
    this.pump_mode = 0; // pump mode (0=centrifugal, 1=roller pump)
    this.pump_pressure =  0.0
    this.cannula_sizes_single = [6, 8, 10, 12]; // sizes of the drainage and return cannula in Fr
    this.cannula_size_double = [13, 14, 15]; // sizes of the drainage cannula in Fr for double lumen cannula (the return cannula is always 1 Fr larger than the drainage cannula in this case)
    
    this.drainage_site = "RA"; // site of drainage cannula insertion
    this.drainage_cannula_diameter = 0.0027; // diameter of the drainage cannula (m)
    this.drainage_cannula_length = 0.105; // length of the drainage cannula (m)

    this.return_site = "AAR"; // site of return cannula insertion
    this.return_cannula_diameter = 0.0027; // diameter of the return cannula (m)
    this.return_cannula_length = 0.105; // length of the return cannula (m)
    
    this.tubing_in_diameter = 0.00375; // diameter of the tubing (m)
    this.tubing_in_length = 1.0; // length of the tubing (m)

    this.tubing_out_diameter = 0.00375; // diameter of the tubing (m)
    this.tubing_out_length = 1.0; // length of the tubing (m)

    this.pump_res_for = 50; // resistance of the pump (mmHg/(L/s))
    this.pump_res_back = 50; // resistance of the pump (mmHg/(L/s))
    this.pump_vol = 0.031; // volume of the pump (L)


    this.return_cannulas = {
      "Bio-Medicus arterial 8 Fr": {
        "inner_diameter": 0.002, // m
        "length": 0.1, // m
        "resistance": 5500
      },
      "Bio-Medicus arterial 10 Fr": {
        "inner_diameter": 0.00267, // m
        "length": 0.105, // m
        "resistance": 1700
      },
      "Bio-Medicus arterial 12 Fr": {
        "inner_diameter": 0.0032, // m
        "length": 0.11, // m
        "resistance": 650
      },
       "Medtronic Crescent 13 Fr": {
        "inner_diameter": 0.0029, // m
        "length": 0.089, // m
        "resistance": 7000
      },
       "Medtronic Crescent 15 Fr": {
        "inner_diameter": 0.0029, // m
        "length": 0.097, // m
        "resistance": 2700
      },
    }

    this.drainage_cannulas = {
      "Bio-Medicus venous 8 Fr": {
        "inner_diameter": 0.0021, // m
        "length": 0.1, // m
        "resistance": 4600
      },
      "Bio-Medicus venous 10 Fr": {
        "inner_diameter": 0.0027, // m
        "length": 0.105, // m
        "resistance": 1500
      },
      "Bio-Medicus venous 12 Fr": {
        "inner_diameter": 0.0033, // m
        "length": 0.11, // m
        "resistance": 600
      },
      "Bio-Medicus venous 14 Fr": {
        "inner_diameter": 0.0039, // m
        "length": 0.115, // m
        "resistance": 260
      },
      "Medtronic Crescent 13 Fr": {
        "inner_diameter": 0.0028, // m
        "length": 0.089, // m
        "resistance": 2500,
      },
      "Medtronic Crescent 15 Fr": {
        "inner_diameter": 0.0028, // m
        "length": 0.097, // m
        "resistance": 1100,
      },
    }

    this.drainage_cannula_type = "Bio-Medicus venous 12 Fr";
    this.return_cannula_type = "Bio-Medicus arterial 10 Fr";

    if (this.drainage_cannulas[this.drainage_cannula_type]) {
      const selectedDrainageCannula = this.drainage_cannulas[this.drainage_cannula_type];
      this.drainage_cannula_diameter = selectedDrainageCannula.inner_diameter;
      this.drainage_cannula_length = selectedDrainageCannula.length;
    }
    if (this.return_cannulas[this.return_cannula_type]) {
      const selectedReturnCannula = this.return_cannulas[this.return_cannula_type];
      this.return_cannula_diameter = selectedReturnCannula.inner_diameter;
      this.return_cannula_length = selectedReturnCannula.length;
    }

    // -----------------------------------------------
    // initialize dependent parameters
    this.p_ven = 0.0; // filtered venous pressure (mmHg)
    this.p_int = 0.0; // filtered pressure at the interface between the drainage cannula and the tubing (mmHg)
    this.p_art = 0.0; // filtered arterial pressure (mmHg)
    this.flow = 0.0; // blood flow through the ECLS circuit (L/s)
    this.flow_avg = 0.0; // moving average of the blood flow through the ECLS circuit (L/s)
    this.sat_ven_o2 = 0.0; // venous oxygen saturation (%)
    this.sat_postoxy_o2 = 0.0; // post-oxygenator oxygen saturation (%)
    this.pco2_postoxy = 0.0; // post-oxygenator pCO2 (mmHg)
    this.tubing_in_res = 1000; // resistance of the tubing in (mmHg/(L/s))
    this.tubing_in_vol = 0.1; // volume of the tubing in (L)
    this.tubing_out_res = 1000; // resistance of the tubing out (mmHg/(L/s))
    this.tubing_out_vol = 0.1; // volume of the tubing out (L)
    this.drainage_res = this.drainage_cannulas[this.drainage_cannula_type]?.resistance || 1000; // resistance of the drainage cannula (mmHg/(L/s))
    this.return_res = this.return_cannulas[this.return_cannula_type]?.resistance || 1000; // resistance of the return cannula (mmHg/(L/s))

    // -----------------------------------------------
    // local parameters
    this.prev_fio2 = 0.0; // previous fio2 value to detect changes in fio2
    this.prev_fico2 = 0.0; // previous fico2 value to detect changes in fico2
    this.prev_gas_flow = 0.0; // previous gas flow value to detect changes in gas flow
    this.pressure_avg_window = 400; // number of samples used for real-time pressure moving averages
    this.flow_avg_window = 400; // number of samples used for the real-time flow moving average (~0.9 s at 0.015 s updates)
    this._update_interval = 0.015; // update interval of the placenta model (s)
    this._update_counter = 0.0; // counter of the update interval (s)
    this._blood_comp_interval = 1.0; // low-frequency blood composition update interval (s)
    this._blood_comp_counter = 0.0; // counter for low-frequency blood composition updates (s)
    this._flow_avg_calculator = new RealTimeMovingAverage(this.flow_avg_window);
    this._p_ven_avg_calculator = new RealTimeMovingAverage(this.pressure_avg_window);
    this._p_int_avg_calculator = new RealTimeMovingAverage(this.pressure_avg_window);
    this._p_art_avg_calculator = new RealTimeMovingAverage(this.pressure_avg_window);
    

    this._ecls_drainage = null; // reference to the drainage model instance
    this._ecls_tubing_in = null; // reference to the tubing in model instance
    this._ecls_pump = null; // reference to the pump model instance
    this._ecls_oxy = null; // reference to the oxygenator model instance
    this._ecls_tubing_out = null; // reference to the tubing out model instance
    this._ecls_return = null; // reference to the return model instance
    this._ecls_gas_source = null; // reference to the gas source model instance
    this._ecls_gas_oxy = null; // reference to the gas oxygenator model instance
    this._ecls_gas_out = null; // reference to the gas out model instance
    this._ecls_gas_insp_valve = null; // reference to the gas inspiration valve model instance
    this._ecls_gasexchanger = null; // reference to the gas exchanger model instance
  }

  calc_model() {
    if (!this.ecls_running) {
      this.flow = 0.0;
      this.flow_avg = 0.0;
      this.p_ven = 0.0;
      this.p_int = 0.0;
      this.p_art = 0.0;
      this._flow_avg_calculator.reset();
      this._p_ven_avg_calculator.reset();
      this._p_int_avg_calculator.reset();
      this._p_art_avg_calculator.reset();
      this._blood_comp_counter = 0.0;

      // disable the circuit sub-models so a stopped ECLS no longer conducts (refs are cached once the
      // circuit has run; they are null before the first run, when the sub-models are already disabled)
      [this._ecls_drainage, this._ecls_tubing_in, this._ecls_pump, this._ecls_oxy,
       this._ecls_tubing_out, this._ecls_return, this._ecls_gas_source, this._ecls_gas_oxy,
       this._ecls_gas_out, this._ecls_gas_insp_valve, this._ecls_gasex].forEach((m) => {
        if (m) m.is_enabled = false;
      });
      return;
    }

    this._blood_comp_counter += this._t;
    this._update_counter += this._t;
    if (this._update_counter > this._update_interval) {
        this._update_counter = 0.0;

        const newWindow = Math.max(1, Math.trunc(this.flow_avg_window));
        if (newWindow !== this._flow_avg_calculator.windowSize) {
          this._flow_avg_calculator = new RealTimeMovingAverage(newWindow);
        }

        const newPressureWindow = Math.max(1, Math.trunc(this.pressure_avg_window));
        if (newPressureWindow !== this._p_ven_avg_calculator.windowSize) {
          this._p_ven_avg_calculator = new RealTimeMovingAverage(newPressureWindow);
          this._p_int_avg_calculator = new RealTimeMovingAverage(newPressureWindow);
          this._p_art_avg_calculator = new RealTimeMovingAverage(newPressureWindow);
        }

        // get a reference to the associated models
        this._ecls_drainage = this._model_engine.models["ECLS_DRAINAGE"];
        this._ecls_tubing_in = this._model_engine.models["ECLS_TUBING_IN"];
        this._ecls_pump = this._model_engine.models["ECLS_PUMP"];
        this._ecls_oxy = this._model_engine.models["ECLS_OXY"];
        this._ecls_tubing_out = this._model_engine.models["ECLS_TUBING_OUT"];
        this._ecls_return = this._model_engine.models["ECLS_RETURN"];
        this._ecls_gas_source = this._model_engine.models["ECLS_GAS_SOURCE"];
        this._ecls_gas_oxy = this._model_engine.models["ECLS_GAS_OXY"];
        this._ecls_gas_out = this._model_engine.models["ECLS_GAS_OUT"];
        this._ecls_gas_insp_valve = this._model_engine.models["ECLS_GAS_INSP_VALVE"];
        this._ecls_gasex = this._model_engine.models["ECLS_GASEX"];

        // skip this tick if the circuit wiring is incomplete (any sub-model missing) rather than
        // dereferencing undefined below
        if (!this._ecls_drainage || !this._ecls_tubing_in || !this._ecls_pump || !this._ecls_oxy ||
            !this._ecls_tubing_out || !this._ecls_return || !this._ecls_gas_source ||
            !this._ecls_gas_oxy || !this._ecls_gas_out || !this._ecls_gas_insp_valve ||
            !this._ecls_gasex) {
          return;
        }

        // set the drainage and return sites
        this._ecls_drainage.comp_from = this.drainage_site;
        this._ecls_return.comp_to = this.return_site;

        const selectedDrainageCannula = this.drainage_cannulas[this.drainage_cannula_type];
        if (selectedDrainageCannula) {
          this.drainage_res = selectedDrainageCannula.resistance;
          this.drainage_cannula_diameter = selectedDrainageCannula.inner_diameter;
          this.drainage_cannula_length = selectedDrainageCannula.length;
        }

        const selectedReturnCannula = this.return_cannulas[this.return_cannula_type];
        if (selectedReturnCannula) {
          this.return_res = selectedReturnCannula.resistance;
          this.return_cannula_diameter = selectedReturnCannula.inner_diameter;
          this.return_cannula_length = selectedReturnCannula.length;
        }

        // make sure all the associated models are in the same enabled/disabled state as the placenta model
        this._ecls_drainage.is_enabled = this.ecls_running;
        this._ecls_tubing_in.is_enabled = this.ecls_running;
        this._ecls_pump.is_enabled = this.ecls_running;
        this._ecls_oxy.is_enabled = this.ecls_running;
        this._ecls_tubing_out.is_enabled = this.ecls_running;
        this._ecls_return.is_enabled = this.ecls_running;
        this._ecls_gas_source.is_enabled = this.ecls_running;
        this._ecls_gas_oxy.is_enabled = this.ecls_running;
        this._ecls_gas_out.is_enabled = this.ecls_running;
        this._ecls_gas_insp_valve.is_enabled = this.ecls_running;
        this._ecls_gasex.is_enabled = this.ecls_running;

        // clamp umbilical vessels if set to clamped
        this._ecls_drainage.no_flow = this.ecls_clamped;
        this._ecls_tubing_in.no_flow = this.ecls_clamped;
        this._ecls_pump.no_flow = this.ecls_clamped;
        this._ecls_oxy.no_flow = this.ecls_clamped;
        this._ecls_tubing_out.no_flow = this.ecls_clamped;
        this._ecls_return.no_flow = this.ecls_clamped;
        this._ecls_gasex.is_enabled = !this.ecls_clamped;

        // set the resistances of the associated models
        this._ecls_drainage.r_for = this.drainage_res * this.drainage_res_factor; // set the drainage resistance to a high value to simulate the umbilical artery resistance
        this._ecls_drainage.r_back = this.drainage_res * this.drainage_res_factor; // set the drainage resistance to a high value to simulate the umbilical artery resistance
        this._ecls_tubing_in.r_for = this.tubing_in_res * this.tubing_res_factor; // set the tubing resistance to a low value to simulate the tubing resistance
        this._ecls_tubing_in.r_back = this.tubing_in_res * this.tubing_res_factor; // set the tubing resistance to a low value to simulate the tubing resistance
        this._ecls_pump.r_for = this.pump_res_for * this.pump_res_factor; // set the pump resistance to a low value to simulate the pump resistance
        this._ecls_pump.r_back = this.pump_res_back * this.pump_res_factor; // set the pump resistance to a low value to simulate the pump resistance
        this._ecls_oxy.r_for = this.oxy_res_for * this.oxy_res_factor; // set the oxygenator resistance to a medium value to simulate the oxygenator resistance
        this._ecls_oxy.r_back = this.oxy_res_back * this.oxy_res_factor; // set the oxygenator resistance to a medium value to simulate the oxygenator resistance
        this._ecls_tubing_out.r_for = this.tubing_out_res * this.tubing_res_factor; // set the tubing resistance to a low value to simulate the tubing resistance
        this._ecls_tubing_out.r_back = this.tubing_out_res * this.tubing_res_factor; // set the tubing resistance to a low value to simulate the tubing resistance
        this._ecls_return.r_for = this.return_res * this.return_res_factor; // set the return resistance to a high value to simulate the umbilical vein resistance
        this._ecls_return.r_back = this.return_res * this.return_res_factor; // set the return resistance to a high value to simulate the umbilical vein resistance

        // update the gas composition in the gas source model if fio2 or fico2 has changed
        if (this.prev_fio2 !== this.gas_fio2 || this.prev_fico2 !== this.gas_fico2) {
          calc_gas_composition(this._ecls_gas_source, this.gas_fio2, this.gas_temp, this.gas_humidity, this.gas_fico2);
          this.prev_fio2 = this.gas_fio2;
          this.prev_fico2 = this.gas_fico2;
        }

        // update the inspiratory valve position
        if (this.prev_gas_flow !== this.gas_flow) {
          // calculate the resistance of the inspiratory valve. 
          // flow = pressure / resistance => resistance = pressure / flow. Assuming a maximum pressure of 100 mmHg and a maximum flow of 10 L/min, the maximum resistance would be 100 / 10 = 10 mmHg/(L/min). We can then set the opening of the valve based on the gas flow as a fraction of the maximum flow.
          // resistance = pressure / flow => opening = flow / max_flow
          let res = (this._ecls_gas_source.pres - this._ecls_gas_out.pres) / (this.gas_flow / 60.0); // calculate the resistance of the inspiratory valve based on the current pressure and gas flow
          if (res > 60) {
            this._ecls_gas_insp_valve.r_for = res - 50; 
          }
          this.prev_gas_flow = this.gas_flow;
        }

        // update the gasexchanger diffusion constants
        this._ecls_gasex.dif_o2 = this.dif_o2;
        this._ecls_gasex.dif_co2 = this.dif_co2;

        // calculate the pump pressure and apply the pump pressures to the connected resistors
        this.pump_pressure = -this.pump_rpm / 25.0;
        this._ecls_pump.pump_rpm = this.pump_rpm;
        if (this.pump_mode === 0) {
          this._ecls_pump.p1_ext = 0.0;
          this._ecls_pump.p2_ext = this.pump_pressure;
        } else {
          this._ecls_oxy.p1_ext = this.pump_pressure;
          this._ecls_oxy.p2_ext = 0.0;
        }

        // get the measured pressures and flow from the associated models
        const p_ven_raw = this._ecls_tubing_in.pres; // pressure at inlet of drainage cannula
        const p_int_raw = this._ecls_pump.pres; // pressure at pump interface
        const p_art_raw = this._ecls_tubing_out.pres; // pressure at outlet of return cannula
        this.p_ven = this._p_ven_avg_calculator.addValue(p_ven_raw);
        this.p_int = this._p_int_avg_calculator.addValue(p_int_raw);
        this.p_art = this._p_art_avg_calculator.addValue(p_art_raw);
        this.flow = this._ecls_return.flow * 60.0; // blood flow through the ECLS circuit is the flow through the drainage cannula
        this.flow_avg = this._flow_avg_calculator.addValue(this.flow);

        if (this._blood_comp_counter >= this._blood_comp_interval) {
          this._blood_comp_counter -= this._blood_comp_interval;
          calc_blood_composition(this._ecls_tubing_in);
          calc_blood_composition(this._ecls_tubing_out);
          this.sat_ven_o2 = this._ecls_tubing_in.so2;
          this.sat_postoxy_o2 = this._ecls_tubing_out.so2;
          this.pco2_postoxy = this._ecls_tubing_out.pco2;
        }
      }
  }
}
