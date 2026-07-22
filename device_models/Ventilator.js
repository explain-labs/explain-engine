import { BaseModelClass } from "../base_models/BaseModelClass";
import { calc_gas_composition } from "../component_models/GasComposition";

export class Ventilator extends BaseModelClass {
  // static properties
  static model_type = "Ventilator";

  /**
   * The Ventilator class models a mechanical ventilator.
   */
  constructor(model_ref, name = "") {
    super(model_ref, name);

    // Independent properties
    this.pres_atm = 760;
    this.fio2 = 0.205;
    this.humidity = 1.0;
    this.temp = 37;
    this.ettube_diameter = 4;
    this.ettube_length = 110;
    this.vent_mode = "PRVC";
    this.vent_rate = 40;
    this.tidal_volume = 0.015;
    this.insp_time = 0.4;
    this.insp_pause = 0.0;
    this.insp_flow = 12;
    this.exp_flow = 3;
    this.pip_cmh2o = 14;
    this.pip_cmh2o_max = 14;
    this.peep_cmh2o = 3;
    this.trigger_volume_perc = 6;
    this.synchronized = false;
    this.components = {}

    // Dependent properties
    this.pres = 0.0;
    this.flow = 0.0;
    this.vol = 0.0;
    this.exp_time = 1.0;
    this.trigger_volume = 0.0;
    this.minute_volume = 0.0;
    this.compliance = 0.0;
    this.compliance_dynamic = 0.0;
    this.compliance_static = 0.0;
    this.resistance = 0.0;
    this.p_peak = 0.0;
    this.p_plat = 0.0;
    this.exp_tidal_volume = 0.0;
    this.insp_tidal_volume = 0.0;
    this.tv_kg = 0.0;
    this.ncc_insp = 0.0;
    this.ncc_exp = 0.0;
    this.etco2 = 0.0;
    this.co2 = 0.0;
    this.triggered_breath = false;

    // Local properties
    this._vent_gasin = null;
    this._vent_gascircuit = null;
    this._vent_gasout = null;
    this._vent_insp_valve = null;
    this._vent_exp_valve = null;
    this._vent_ettube = null;
    this._ventilator_parts = [];
    this._ettube_length_ref = 110;
    this._min_exp_time = 0.1;
    this._pip = 0.0;
    this._pip_max = 0.0;
    this._peep = 0.0;
    this._a = 0.0;
    this._b = 0.0;
    this._insp_time_counter = 0.0;
    this._exp_time_counter = 0.0;
    this._insp_tidal_volume_counter = 0.0;
    this._exp_tidal_volume_counter = 0.0;
    this._trigger_volume_counter = 0.0;
    this._inspiration = false;
    this._expiration = true;
    this._pause = false;
    this._pause_counter = 0.0;
    this._had_pause = false;
    this._pip_meas = 0.0;
    this._insp_flow_at_pause = 0.0;
    this._tv_tolerance = 0.0005;
    this._vc_vol_target = 0.015;
    this._trigger_blocked = false;
    this._trigger_start = false;
    this._mandatory_breath = false;
    this._breath_interval_counter = 0.0;
    this._measured_rate = 0.0;
    this._breathing_model = null;
    this._peak_flow = 0.0;
    this._prev_et_tube_flow = 0.0;
    this._et_tube_resistance = 40.0;
  }

  init_model(args = {}) {
    // initialize the super class
    super.init_model(args);

    // get a reference to alle relevant models
    this._breathing_model = this._model_engine.models["Breathing"];
    this._vent_gasin = this._model_engine.models["VENT_GASIN"];
    this._vent_gascircuit = this._model_engine.models["VENT_GASCIRCUIT"];
    this._vent_gasout = this._model_engine.models["VENT_GASOUT"];
    this._vent_insp_valve = this._model_engine.models["VENT_INSP_VALVE"];
    this._vent_ettube = this._model_engine.models["VENT_ETTUBE"];
    this._vent_exp_valve = this._model_engine.models["VENT_EXP_VALVE"];

    // store the models inside a list for easy switching.
    this._ventilator_parts = [
      this._vent_gasin,
      this._vent_gascircuit,
      this._vent_gasout,
      this._vent_insp_valve,
      this._vent_ettube,
      this._vent_exp_valve,
    ];

    // calculate the gas composition of the ventilator circuits
    calc_gas_composition(this._vent_gasin, this.fio2, this.temp, this.humidity);
    calc_gas_composition(this._vent_gascircuit, this.fio2, this.temp, this.humidity);
    calc_gas_composition(this._vent_gasout, 0.205, 20.0, 0.5);

    // calculate the et-tube diameter and resistance
    this.set_ettube_diameter(this.ettube_diameter);
    this._et_tube_resistance = this.calc_ettube_resistance(this.flow);
  }

  calc_model() {
    // translate the pressures to mmHg
    this._pip = this.pip_cmh2o / 1.35951;
    this._pip_max = this.pip_cmh2o_max / 1.35951;
    this._peep = this.peep_cmh2o / 1.35951;

    if (this.synchronized && this.vent_mode !== "CPAP") {
      this.triggering();
    }

    // do the cycling and pressure/flow regulation
    if (this.vent_mode === "PC" || this.vent_mode === "PRVC") {
      this.time_cycling();
      this.pressure_control();
    }

    if (this.vent_mode === "VC") {
      this.time_cycling();
      this.volume_control();
    }

    if (this.vent_mode === "PS") {
      this.flow_cycling();
      this.pressure_control();
    }

    if (this.vent_mode === "CPAP") {
      this.cpap_control();
    }

    this.pres = (this._vent_gascircuit.pres - this.pres_atm) * 1.35951;
    this.flow = this._vent_ettube.flow * 60.0;
    this.vol += this._vent_ettube.flow * 1000 * this._t;
    this.co2 = this._model_engine.models["DS"]?.pco2 ?? this.co2;
    // CPAP reports a spontaneous minute volume from cpap_control (patient's own rate), so don't
    // overwrite it here with the mechanical vent_rate
    if (this.vent_mode !== "CPAP") {
      // PS is patient/backup-triggered, so its actual rate can differ from the set vent_rate;
      // report the measured rate there and the set rate for the mandatory time-cycled modes
      const rate = this.vent_mode === "PS" ? this._measured_rate : this.vent_rate;
      this.minute_volume = this.exp_tidal_volume * rate;
    }
    // compliance and resistance are measured per breath at end-expiration in
    // calc_measured_mechanics(); they are NOT recomputed here (and must not be clobbered to null
    // each step, or the per-breath measurement would never survive)
    this._breath_interval_counter += this._t;
    this._et_tube_resistance = this.calc_ettube_resistance(this.flow);
  }

  triggering() {
    this.trigger_volume =
      (this.tidal_volume / 100.0) * this.trigger_volume_perc;

    if (this._breathing_model?.ncc_insp === 1 && !this._trigger_blocked) {
      this._trigger_start = true;
    }

    if (this._trigger_start) {
      this._trigger_volume_counter += this._vent_ettube.flow * this._t;
    }

    if (this._trigger_volume_counter > this.trigger_volume) {
      this._trigger_volume_counter = 0.0;
      this._exp_time_counter = this.exp_time + 0.1;
      this._trigger_start = false;
      this.triggered_breath = true;
    }
  }

  flow_cycling() {
    // Pressure-support state machine: a patient-triggered, flow-cycled breath (terminates when
    // inspiratory flow decays below 30% of peak), with a time-cycled mandatory backup so the
    // ventilator still delivers breaths during apnea / when unsynchronized.
    this.exp_time = Math.max(
      60.0 / this.vent_rate - this.insp_time,
      this._min_exp_time
    );

    // start of a breath: patient trigger, or a time-cycled apnea backup that keeps the delivered
    // rate at vent_rate (timed breath-start to breath-start via _breath_interval_counter)
    if (this._expiration) {
      let start = false;
      if (this.triggered_breath && this._vent_ettube.flow > 0.0) {
        start = true;
        this._mandatory_breath = false;
      } else if (this._breath_interval_counter > 60.0 / this.vent_rate) {
        start = true;
        this._mandatory_breath = true;
        this.triggered_breath = true;
      }
      if (start) {
        this._start_inspiration();
        this._peak_flow = 0.0;
        this._prev_et_tube_flow = 0.0;
      }
    }

    if (this._inspiration) {
      this._insp_time_counter += this._t;
      this.ncc_insp += 1;
      this._trigger_blocked = true;

      if (this._vent_ettube.flow > this._peak_flow) {
        this._peak_flow = this._vent_ettube.flow;
      }
      const p = (this._vent_gascircuit.pres - this.pres_atm) * 1.35951;
      if (p > this._pip_meas) this._pip_meas = p;

      const flow_cycled =
        !this._mandatory_breath &&
        this._peak_flow > 0.0 &&
        this._vent_ettube.flow < 0.3 * this._peak_flow;
      const time_cycled =
        this._mandatory_breath && this._insp_time_counter > this.insp_time;

      if (flow_cycled || time_cycled) {
        this._end_inspiration();
      }

      this._prev_et_tube_flow = this._vent_ettube.flow;
    }

    if (this._expiration) {
      this.ncc_exp += 1;
      this._trigger_blocked = false;
    }
  }

  time_cycling() {
    // guard against a non-positive expiratory time at high rate / long inspiratory time, which
    // would otherwise make _exp_time_counter > exp_time true every step (continuous inspiration)
    this.exp_time = Math.max(
      60.0 / this.vent_rate - this.insp_time,
      this._min_exp_time
    );
    // the inspiratory pause is carved OUT of insp_time (Ti = flow phase + pause), so for time-cycled
    // modes exp_time and the set I:E ratio are preserved. In VC the flow phase instead ends when the
    // volume target is met (so Ti = fill time + pause, generally shorter than insp_time).
    const flow_time = Math.max(0.0, this.insp_time - this.insp_pause);

    // end of the inspiratory FLOW phase (time reached, or the VC volume target is met)
    if (this._inspiration && !this._pause) {
      const vol_reached =
        this.vent_mode === "VC" &&
        this._insp_tidal_volume_counter >= this._vc_vol_target;
      if (this._insp_time_counter > flow_time || vol_reached) {
        if (this.insp_pause > 0.0) {
          // end-inspiratory hold of a bounded duration (not the remainder of insp_time, which would
          // let the circuit fully equilibrate into the lung and overshoot the target)
          this._pause = true;
          this._had_pause = true;
          this._pause_counter = 0.0;
        } else {
          this._end_inspiration();
        }
      }
    }

    // end of the inspiratory PAUSE: sample the equilibrated plateau pressure, then expire
    if (this._pause) {
      this._pause_counter += this._t;
      if (this._pause_counter > this.insp_pause) {
        this.p_plat = (this._vent_gascircuit.pres - this.pres_atm) * 1.35951;
        this._pause = false;
        this._end_inspiration();
      }
    }

    // end of EXPIRATION -> start a new mechanical breath
    if (this._exp_time_counter > this.exp_time) {
      this._exp_time_counter = 0.0;
      this._start_inspiration();

      if (this.vent_mode === "PRVC") {
        this.pressure_regulated_volume_control();
      }
      if (this.vent_mode === "VC") {
        this.volume_control_servo();
      }
    }

    if (this._inspiration) {
      this._insp_time_counter += this._t;
      this.ncc_insp += 1;
      this._trigger_blocked = true;
      this._trigger_volume_counter = 0.0;
      // track the peak circuit pressure during the flow phase only (the pause relaxes to plateau)
      if (!this._pause) {
        const p = (this._vent_gascircuit.pres - this.pres_atm) * 1.35951;
        if (p > this._pip_meas) this._pip_meas = p;
      }
    }

    if (this._expiration) {
      this._exp_time_counter += this._t;
      this.ncc_exp += 1;
      this._trigger_blocked = false;
    }
  }

  _start_inspiration() {
    // exp -> insp transition: closes out the breath just completed (measurements) and opens a new one
    this.ncc_insp = -1;
    this.vol = 0.0;
    this._insp_time_counter = 0.0;
    this._pause = false;
    this._inspiration = true;
    this._expiration = false;

    this.exp_tidal_volume = -this._exp_tidal_volume_counter;
    this.etco2 = this._model_engine.models["DS"]?.pco2 ?? this.etco2;
    const weight = this._model_engine.weight;
    this.tv_kg = weight > 0 ? (this.exp_tidal_volume * 1000.0) / weight : 0.0;

    this.calc_measured_mechanics();

    this._exp_tidal_volume_counter = 0.0;
    this._pip_meas = 0.0;
    this._had_pause = false;

    if (this._breath_interval_counter > 0.0) {
      this._measured_rate = 60.0 / this._breath_interval_counter;
    }
    this._breath_interval_counter = 0.0;
  }

  _end_inspiration() {
    // insp -> exp transition. During a pause the tidal-volume counter is frozen (valves shut), so
    // latching the delivered inspiratory volume here is correct for both the paused and no-pause path.
    this.insp_tidal_volume = this._insp_tidal_volume_counter;
    this._insp_tidal_volume_counter = 0.0;
    this._insp_time_counter = 0.0;
    this._inspiration = false;
    this._expiration = true;
    this._pause = false;
    this.triggered_breath = false;
    this._mandatory_breath = false;
    this.ncc_exp = -1;
  }

  calc_measured_mechanics() {
    // called at the end of a breath, on the quantities gathered over that breath
    const vt_ml = this.exp_tidal_volume * 1000.0; // L -> mL
    this.p_peak = this._pip_meas; // cmH2O

    // dynamic compliance is always available (measured PIP - PEEP)
    const drive_dyn = this.p_peak - this.peep_cmh2o; // cmH2O
    if (this.exp_tidal_volume > 0 && drive_dyn > 0) {
      this.compliance_dynamic = vt_ml / drive_dyn; // mL/cmH2O
      this.compliance = this.compliance_dynamic; // keep the legacy field = dynamic
    }

    // static compliance + airway resistance need a plateau, i.e. a real end-inspiratory hold
    if (this._had_pause && this.p_plat > 0) {
      const drive_stat = this.p_plat - this.peep_cmh2o; // cmH2O
      if (this.exp_tidal_volume > 0 && drive_stat > 0) {
        this.compliance_static = vt_ml / drive_stat; // mL/cmH2O
      }
      const flow_ls =
        this._insp_flow_at_pause > 0
          ? this._insp_flow_at_pause // L/s, the flow interrupted by the hold
          : this.insp_flow / 60.0; // fallback: the set flow
      if (flow_ls > 0) {
        this.resistance = (this.p_peak - this.p_plat) / flow_ls; // cmH2O/(L/s)
      }
    } else {
      // no plateau available -> report dynamic compliance only, resistance not measurable
      this.compliance_static = 0.0;
      this.resistance = null;
    }
  }

  pressure_control() {
    // during an inspiratory hold both valves are shut so the circuit equilibrates with the lung
    if (this._pause) {
      this._vent_insp_valve.no_flow = true;
      this._vent_exp_valve.no_flow = true;
      return;
    }

    if (this._inspiration) {
      this._vent_exp_valve.no_flow = true;
      this._vent_insp_valve.no_flow = false;
      this._vent_insp_valve.no_back_flow = true;
      this._vent_insp_valve.r_for =
        (this._vent_gasin.pres + this._pip - this.pres_atm - this._peep) /
        (this.insp_flow / 60.0);

      if (this._vent_gascircuit.pres > this._pip + this.pres_atm) {
        this._vent_insp_valve.no_flow = true;
      }

      if (this._vent_ettube.flow > 0) {
        this._insp_tidal_volume_counter += this._vent_ettube.flow * this._t;
      }
      // remember the flow at the end of the flow phase for the resistance measurement
      this._insp_flow_at_pause = this._vent_ettube.flow;
    }

    if (this._expiration) {
      this._vent_insp_valve.no_flow = true;
      this._vent_exp_valve.no_flow = false;
      this._vent_exp_valve.no_back_flow = true;
      this._vent_exp_valve.r_for = 10;
      this._vent_gasout.vol =
        this._peep / this._vent_gasout.el_base + this._vent_gasout.u_vol;

      if (this._vent_ettube.flow < 0) {
        this._exp_tidal_volume_counter += this._vent_ettube.flow * this._t;
      }
    }
  }

  volume_control() {
    // Volume control: deliver a ~constant inspiratory flow by re-solving the insp valve resistance
    // each step (r_for = dP / q_target pins flow while the lung fills), until the set tidal volume
    // is reached; then hold (inspiratory pause, handled in time_cycling) and cycle to expiration.
    if (this._pause) {
      this._vent_insp_valve.no_flow = true;
      this._vent_exp_valve.no_flow = true;
      return;
    }

    if (this._inspiration) {
      this._vent_exp_valve.no_flow = true;
      this._vent_insp_valve.no_flow = false;
      this._vent_insp_valve.no_back_flow = true;

      const q = this.insp_flow / 60.0; // L/s target
      const dp = this._vent_gasin.pres - this._vent_gascircuit.pres; // mmHg
      if (dp > 0 && q > 0) {
        this._vent_insp_valve.r_for = dp / q; // pins flow ~ q as circuit pressure climbs
      } else {
        this._vent_insp_valve.no_flow = true; // supply can no longer drive flow in
      }

      // pressure safety limit (pop-off): hold once the circuit reaches the PIP ceiling
      if (this._vent_gascircuit.pres > this._pip_max + this.pres_atm) {
        this._vent_insp_valve.no_flow = true;
      }

      if (this._vent_ettube.flow > 0) {
        this._insp_tidal_volume_counter += this._vent_ettube.flow * this._t;
      }
      this._insp_flow_at_pause = this._vent_ettube.flow;
    }

    if (this._expiration) {
      this._vent_insp_valve.no_flow = true;
      this._vent_exp_valve.no_flow = false;
      this._vent_exp_valve.no_back_flow = true;
      this._vent_exp_valve.r_for = 10;
      this._vent_gasout.vol =
        this._peep / this._vent_gasout.el_base + this._vent_gasout.u_vol;

      if (this._vent_ettube.flow < 0) {
        this._exp_tidal_volume_counter += this._vent_ettube.flow * this._t;
      }
    }
  }

  cpap_control() {
    // Continuous positive airway pressure: hold the circuit at the CPAP level (= peep_cmh2o)
    // and let the patient breathe spontaneously through the ET tube. Both valves stay open.
    // NOTE: CPAP only ventilates a spontaneously breathing patient (Breathing.breathing_enabled);
    // with breathing off it holds pressure but delivers no tidal volume (as in reality).

    // inspiratory valve: feed fresh gas toward the CPAP target, shut off once at/above it
    this._vent_insp_valve.no_flow = false;
    this._vent_insp_valve.no_back_flow = true;
    this._vent_insp_valve.r_for =
      (this._vent_gasin.pres - this.pres_atm - this._peep) / (this.insp_flow / 60.0);
    if (this._vent_gascircuit.pres > this._peep + this.pres_atm) {
      this._vent_insp_valve.no_flow = true;
    }

    // expiratory valve: open, reservoir pinned at CPAP so the circuit floats at CPAP
    this._vent_exp_valve.no_flow = false;
    this._vent_exp_valve.no_back_flow = true;
    this._vent_exp_valve.r_for = 10;
    this._vent_gasout.vol =
      this._peep / this._vent_gasout.el_base + this._vent_gasout.u_vol;

    // spontaneous-breath monitoring: close out a breath at each spontaneous inspiration start
    // (Breathing.ncc_insp === 1 marks the first step of a new spontaneous inspiration)
    if (this._breathing_model?.ncc_insp === 1) {
      this.exp_tidal_volume = -this._exp_tidal_volume_counter;
      this.insp_tidal_volume = this._insp_tidal_volume_counter;
      this._exp_tidal_volume_counter = 0.0;
      this._insp_tidal_volume_counter = 0.0;
      this.vol = 0.0;
    }
    if (this._vent_ettube.flow > 0) {
      this._insp_tidal_volume_counter += this._vent_ettube.flow * this._t;
    } else {
      this._exp_tidal_volume_counter += this._vent_ettube.flow * this._t;
    }
    this.minute_volume = this.exp_tidal_volume * (this._breathing_model?.resp_rate ?? 0);
  }

  pressure_regulated_volume_control() {
    if (this.exp_tidal_volume < this.tidal_volume - this._tv_tolerance) {
      this.pip_cmh2o += 1.0;

      if (this.pip_cmh2o > this.pip_cmh2o_max) {
        this.pip_cmh2o = this.pip_cmh2o_max;
      }
    }

    if (this.exp_tidal_volume > this.tidal_volume + this._tv_tolerance) {
      this.pip_cmh2o -= 1.0;

      if (this.pip_cmh2o < this.peep_cmh2o + 2.0) {
        this.pip_cmh2o = this.peep_cmh2o + 2.0;
      }
    }
  }

  volume_control_servo() {
    // Volume-control breath-to-breath trim: the volume that actually reaches the patient differs
    // from the flow-phase cut-off because the compliant circuit stores compression volume that
    // dumps into the lung. Nudge the internal flow-phase target so the measured expiratory tidal
    // volume converges on the set tidal_volume (proportional, clamped to [0.1*Vt, Vt]).
    const err = this.tidal_volume - this.exp_tidal_volume; // L
    this._vc_vol_target += 0.5 * err;
    const lo = 0.1 * this.tidal_volume;
    if (this._vc_vol_target < lo) this._vc_vol_target = lo;
    if (this._vc_vol_target > this.tidal_volume) {
      this._vc_vol_target = this.tidal_volume;
    }
  }

  reset_dependent_properties() {
    this.pres = 0.0;
    this.flow = 0.0;
    this.vol = 0.0;
    this.exp_time = 1.0;
    this.trigger_volume = 0.0;
    this.minute_volume = 0.0;
    this.compliance = 0.0;
    this.compliance_dynamic = 0.0;
    this.compliance_static = 0.0;
    this.resistance = 0.0;
    this.p_peak = 0.0;
    this.p_plat = 0.0;
    this.exp_tidal_volume = 0.0;
    this.insp_tidal_volume = 0.0;
    this.tv_kg = 0.0;
    this.ncc_insp = 0.0;
    this.ncc_exp = 0.0;
    this.etco2 = 0.0;
    this.co2 = 0.0;
    this.triggered_breath = false;
  }

  _reset_state() {
    // reset the internal state machine so a re-enabled ventilator starts a clean breath instead of
    // resuming mid-cycle with stale counters
    this._inspiration = false;
    this._expiration = true;
    this._pause = false;
    this._pause_counter = 0.0;
    this._had_pause = false;
    this._mandatory_breath = false;
    this._insp_time_counter = 0.0;
    this._exp_time_counter = 0.0;
    this._insp_tidal_volume_counter = 0.0;
    this._exp_tidal_volume_counter = 0.0;
    this._trigger_volume_counter = 0.0;
    this._trigger_start = false;
    this._trigger_blocked = false;
    this._prev_et_tube_flow = 0.0;
    this._peak_flow = 0.0;
    this._pip_meas = 0.0;
    this._insp_flow_at_pause = 0.0;
    this._breath_interval_counter = 0.0;
    this._measured_rate = 0.0;
    this._vc_vol_target = this.tidal_volume;
    this.vol = 0.0;
  }

  switch_ventilator(state) {
    this.is_enabled = state;
    this._reset_state();
    if (!state) {
      this.reset_dependent_properties();
    }

    for (const vp of this._ventilator_parts) {
      vp.is_enabled = state;

      if ("no_flow" in vp) {
        vp.no_flow = !state;
      }
    }

    const mouth_ds = this._model_engine.models["MOUTH_DS"];
    if (mouth_ds) mouth_ds.no_flow = state;
  }

  calc_ettube_resistance(flow) {
    let res =
      (this._a * flow + this._b) * (this.ettube_length / this._ettube_length_ref);
    if (res < 15.0) {
      res = 15;
    }

    this._vent_ettube.r_for = res;
    this._vent_ettube.r_back = res;

    return res;
  }

  set_ettube_length(new_length) {
    if (new_length >= 50) {
      this.ettube_length = new_length;
    }
  }

  set_ettube_diameter(new_diameter) {
    if (new_diameter > 1.5) {
      this.ettube_diameter = new_diameter;
      this._a = -2.375 * new_diameter + 11.9375;
      this._b = -14.375 * new_diameter + 65.9374;
    }
  }

  set_fio2(new_fio2) {
    // accept either a fraction (0..1) or a percentage (>1, e.g. 21..100)
    this.fio2 = new_fio2 > 1.0 ? new_fio2 / 100.0 : new_fio2;

    calc_gas_composition(
      this._vent_gasin,
      this.fio2,
      this._vent_gasin.temp,
      this._vent_gasin.humidity
    );
  }

  set_humidity(new_humidity) {
    if (new_humidity >= 0 && new_humidity <= 1.0) {
      this.humidity = new_humidity;
      // the compartments carry their own humidity target, so write it there too or the next
      // set_fio2/set_temp call reads the stale value back and reverts this one
      this._vent_gasin.humidity = this.humidity;
      this._vent_gascircuit.humidity = this.humidity;
      calc_gas_composition(
        this._vent_gasin,
        this.fio2,
        this._vent_gasin.temp,
        this.humidity
      );
      // recompute the circuit composition too, matching init_model — otherwise the circuit keeps a
      // stale gas mix until something else recomputes it
      calc_gas_composition(
        this._vent_gascircuit,
        this.fio2,
        this._vent_gascircuit.temp,
        this.humidity
      );
    }
  }

  set_temp(new_temp) {
    this.temp = new_temp;
    // set target_temp as well, otherwise add_heat relaxes the compartment straight back to the
    // old target and the composition computed below no longer matches its temperature
    this._vent_gasin.temp = this.temp;
    this._vent_gasin.target_temp = this.temp;
    this._vent_gascircuit.target_temp = this.temp;
    calc_gas_composition(
      this._vent_gasin,
      this.fio2,
      this.temp,
      this._vent_gasin.humidity
    );
  }

  set_pc(pip = 14.0, peep = 4.0, rate = 40.0, t_in = 0.4, insp_flow = 10.0) {
    this.pip_cmh2o = pip;
    this.pip_cmh2o_max = pip;
    this.peep_cmh2o = peep;
    this.vent_rate = rate;
    this.insp_time = t_in;
    this.insp_flow = insp_flow;
    this.vent_mode = "PC";
  }

  set_prvc(
    pip_max = 18.0,
    peep = 4.0,
    rate = 40.0,
    tv = 15.0,
    t_in = 0.4,
    insp_flow = 10.0
  ) {
    this.pip_cmh2o_max = pip_max;
    this.peep_cmh2o = peep;
    this.vent_rate = rate;
    this.insp_time = t_in;
    this.tidal_volume = tv / 1000.0;
    this.insp_flow = insp_flow;
    this.vent_mode = "PRVC";
  }

  set_vc(
    peep = 4.0,
    rate = 40.0,
    tv = 15.0,
    t_in = 0.4,
    insp_flow = 10.0,
    pip_max = 30.0,
    insp_pause = 0.0
  ) {
    this.peep_cmh2o = peep;
    this.vent_rate = rate;
    this.tidal_volume = tv / 1000.0;
    this._vc_vol_target = this.tidal_volume; // servo starts from the set volume
    this.insp_time = t_in;
    this.insp_flow = insp_flow;
    this.pip_cmh2o_max = pip_max; // safety ceiling only; VC does not target a PIP
    // keep the pause strictly inside inspiration so the flow phase always delivers some gas
    this.insp_pause = Math.min(Math.max(0.0, insp_pause), Math.max(0.0, t_in - 0.02));
    this.vent_mode = "VC";
  }

  set_psv(pip = 14.0, peep = 4.0, rate = 40.0, t_in = 0.4, insp_flow = 10.0) {
    this.pip_cmh2o = pip;
    this.pip_cmh2o_max = pip;
    this.peep_cmh2o = peep;
    this.vent_rate = rate;
    this.insp_time = t_in;
    this.insp_flow = insp_flow;
    this.vent_mode = "PS";
  }

  set_cpap(cpap = 5.0, insp_flow = 8.0) {
    this.peep_cmh2o = cpap;
    this.insp_flow = insp_flow;
    this.vent_mode = "CPAP";
  }

  set_pause(seconds = 0.0) {
    // end-inspiratory hold, kept strictly inside inspiration (see set_vc)
    this.insp_pause = Math.min(
      Math.max(0.0, seconds),
      Math.max(0.0, this.insp_time - 0.02)
    );
  }

  trigger_breath() {
    // force the current breath to expire so a new mechanical breath starts next step
    this._exp_time_counter = this.exp_time + 0.1;
  }
}
