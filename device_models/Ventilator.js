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
    this.ps_cmh2o = 10; // pressure support level ABOVE peep (PS mode only)
    this.rise_time = 0.1; // s, PEEP -> PIP ramp of the pressure target in PC/PRVC/PS (0 = fastest)
    this.hfo_map_cmh2o = 10; // HFOV mean airway pressure
    this.hfo_amplitude_cmh2o = 25; // HFOV peak-to-peak pressure swing at the circuit
    this.hfo_freq = 10; // HFOV frequency (Hz)
    this.hfo_insp_fraction = 0.33; // HFOV inspiratory fraction of the cycle (0.33 = I:E 1:2, 0.5 = 1:1)
    this.hfo_bias_flow = 10; // HFOV continuous fresh-gas (bias) flow (L/min)
    this.leak_size = 0.0; // mm, equivalent diameter of the gap around an uncuffed tube (0 = no leak)
    this.exp_valve_resistance = 0.0; // mmHg·s/L, expiratory limb + valve (0 = auto, by circuit size)
    this.volume_guarantee = false; // PC/PS: servo the working pressure to tidal_volume (limit pip_cmh2o_max)
    this.trigger_volume_perc = 6;
    this.trigger_mode = "volume"; // "volume": trigger_volume_perc of the set Vt during a patient effort; "flow": trigger_flow at the tube
    this.trigger_flow = 0.6; // L/min, flow-trigger threshold (inspiratory flow at the tube during expiration)
    this.term_sens_perc = 30; // %, a PS breath cycles off when inspiratory flow decays below this % of its peak
    this.backup_rate = 0; // /min, CPAP apnoea backup: a time-cycled breath at PIP/insp_time after 60/backup_rate s without an effort (0 = off)
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
    this.pip_delivered = 0.0; // cmH2O, the inspiratory pressure target actually in use
    this.pressure_limited = false; // volume-targeted: working pressure at pip_cmh2o_max, Vt below target
    this.leak_perc = 0.0; // %, per-breath leak (Vti - Vte) / Vti, as a ventilator reports it
    this.hfo_tidal_volume = 0.0; // L, HFOV volume delivered per oscillation (at the tube)
    this.hfo_dco2 = 0.0; // mL^2/s, HFOV gas transport coefficient f * Vt^2
    this.hfo_map_meas = 0.0; // cmH2O, measured mean circuit pressure in HFOV
    this.hfo_amplitude_meas = 0.0; // cmH2O, measured peak-to-peak circuit pressure in HFOV
    this.map_meas = 0.0; // cmH2O, mean circuit pressure over the last breath (or 3 s block without breaths)
    this.ti_meas = 0.0; // s, measured inspiratory time of the last ventilator breath
    this.te_meas = 0.0; // s, measured expiratory time before the last ventilator breath
    this.ie_ratio_meas = 0.0; // Te/Ti of the last breath (displayed as 1:x)
    this.rr_meas = 0.0; // /min, breath-averaged delivered rate (ventilator breaths)
    this.trig_per_min = 0; // patient-triggered ventilator breaths over the last 60 s
    this.r_dyn = 0.0; // cmH2O/(L/s), (peak pressure - PEEP) / peak expiratory flow of the last breath

    // Local properties
    this._vent_gasin = null;
    this._vent_gascircuit = null;
    this._vent_gasout = null;
    this._vent_insp_valve = null;
    this._vent_exp_valve = null;
    this._vent_ettube = null;
    this._vent_leak = null;
    this._leak_length = 20; // mm, length of the laryngeal leak channel
    this._ventilator_parts = [];
    this._ettube_length_ref = 110;
    this._min_exp_time = 0.1;
    this._pip = 0.0;
    this._pip_max = 0.0;
    this._peep = 0.0;
    this._ett_k1 = 0.0; // ET-tube Rohrer linear coefficient (mmHg*s/L) at the reference length
    this._ett_k2 = 0.0; // ET-tube Rohrer flow-dependent coefficient (mmHg*s^2/L^2) at the reference length
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
    this._rate_avg = 0.0;
    this._manual_breath = false;
    this._humidifier_applied = false;
    this._servo_gain = 0.8; // fraction of the circuit pressure error corrected per step
    this._pip_working = null; // cmH2O, volume-targeted working pressure (PRVC / volume guarantee)
    this._pip_working_mode = ""; // mode the working pressure was initialised for
    this._vt_gain = 0.5; // fraction of the tidal-volume error corrected per breath
    this._vt_max_step = 3.0; // cmH2O, max working-pressure change per breath
    this._vg_vt_limit = 1.3; // a VG breath ends once it delivers 130 % of the target volume
    this._hfo_phase = 0.0; // position in the current oscillation (0..1)
    this._hfo_p_max = -1e9;
    this._hfo_p_min = 1e9;
    this._hfo_p_sum = 0.0;
    this._hfo_n = 0;
    this._hfo_sink_margin = 10.0; // cmH2O, expiratory sink held this far below the trough
    this._breathing_model = null;
    this._peak_flow = 0.0;
    this._prev_et_tube_flow = 0.0;
    this._et_tube_resistance = 40.0;
    this._te_counter = 0.0; // s since the end of the last ventilator inspiration
    this._peak_exp_flow = 0.0; // L/s, peak expiratory flow at the tube in the current expiration
    this._map_sum = 0.0;
    this._map_time = 0.0;
    this._trig_times = []; // model times of patient-triggered breath starts (last 60 s)
    this._ps_breath = false; // SIMV: the breath in progress is a pressure-supported spontaneous breath
    this._simv_window_counter = 0.0; // SIMV: time into the current mandatory-breath window
    this._simv_breath_given = false; // SIMV: this window's mandatory (or synchronised) breath was delivered
    this._apnea_counter = 0.0; // CPAP: time since the last spontaneous effort or backup breath
  }

  init_model(args = {}) {
    // the tube leak is a ventilator-owned resistor from the airway (DS) to the mouth (MOUTH, the
    // atmospheric reservoir): the route gas takes around an uncuffed tube. Scenarios (and saved
    // states) that predate it don't declare it, so add its definition before the components are built
    const comps = args.find((a) => a.key === "components");
    if (comps && comps.value && !comps.value.VENT_LEAK) {
      comps.value.VENT_LEAK = {
        name: "VENT_LEAK",
        description: "gas resistor model of the leak around an uncuffed endotracheal tube",
        is_enabled: false,
        model_type: "Resistor",
        components: {},
        r_for: 1000000,
        r_back: 1000000,
        r_k: 0,
        comp_from: "DS",
        comp_to: "MOUTH",
        no_flow: true,
        no_back_flow: false,
      };
    }

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
    this._vent_leak = this._model_engine.models["VENT_LEAK"] ?? null;

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
    this._apply_humidifier();
    calc_gas_composition(this._vent_gasout, 0.205, 20.0, 0.5);

    // calculate the et-tube diameter and resistance
    this.set_ettube_diameter(this.ettube_diameter);
    this._et_tube_resistance = this.calc_ettube_resistance(this._vent_ettube.flow);
  }

  calc_model() {
    // Gas.init_model runs after this model and resets every gas compartment to the ambient
    // temperature, so the humidifier settings are (re)applied on the first step
    if (!this._humidifier_applied) this._apply_humidifier();

    // translate the pressures to mmHg. In PS the inspiratory target is set relative to PEEP; in the
    // volume-targeted modes (PRVC, volume guarantee) it is the breath-to-breath working pressure.
    let pip_cmh2o =
      this.vent_mode === "PS" ? this.peep_cmh2o + this.ps_cmh2o : this.pip_cmh2o;
    if (this._volume_targeted()) {
      if (this._pip_working === null || this._pip_working_mode !== this.vent_mode) {
        // start from the set pressure, inside the allowed band
        this._pip_working = this._clamp_working_pressure(pip_cmh2o);
        this._pip_working_mode = this.vent_mode;
      }
      pip_cmh2o = this._pip_working;
    }
    this.pip_delivered = pip_cmh2o;
    this._pip = pip_cmh2o / 1.35951;
    this._pip_max = this.pip_cmh2o_max / 1.35951;
    this._peep = this.peep_cmh2o / 1.35951;

    // patient-trigger detection: always in PS (pressure support is patient-triggered by
    // definition, its time-cycled backup only covers apnea), on request (`synchronized`) in the
    // time-cycled modes, never in CPAP (no mandatory breaths to trigger)
    if (
      this.vent_mode === "PS" ||
      this.vent_mode === "SIMV" ||
      (this.synchronized && this.vent_mode !== "CPAP" && this.vent_mode !== "HFOV")
    ) {
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

    if (this.vent_mode === "SIMV") {
      this.simv_cycling();
      if (this._ps_breath) {
        // a supported spontaneous breath: PS above PEEP, never above the mandatory pressure (with
        // volume guarantee the working pressure, so support can't out-ventilate the volume target)
        const ps = Math.min(this.peep_cmh2o + this.ps_cmh2o, pip_cmh2o);
        this.pip_delivered = ps;
        this._pip = ps / 1.35951;
      }
      this.pressure_control();
    }

    if (this.vent_mode === "CPAP") {
      this.cpap_cycling();
    }

    if (this.vent_mode === "HFOV") {
      this.hfov_control();
    }

    this.pres = (this._vent_gascircuit.pres - this.pres_atm) * 1.35951;
    this.flow = this._vent_ettube.flow * 60.0;
    this.vol += this._vent_ettube.flow * 1000 * this._t;
    this.co2 = this._model_engine.models["DS"]?.pco2 ?? this.co2;
    // CPAP reports a spontaneous minute volume from cpap_control (patient's own rate), so don't
    // overwrite it here with the mechanical vent_rate
    if (this.vent_mode !== "CPAP" && this.vent_mode !== "HFOV") {
      // whenever the patient can trigger (PS, or a synchronized time-cycled mode) the delivered
      // rate can differ from the set vent_rate, so report the (breath-averaged) measured rate
      // there and the set rate for the purely mandatory modes
      const triggerable =
        this.vent_mode === "PS" || this.vent_mode === "SIMV" || this.synchronized;
      const rate = triggerable ? this._rate_avg : this.vent_rate;
      this.minute_volume = this.exp_tidal_volume * rate;
    }
    // compliance and resistance are measured per breath at end-expiration in
    // calc_measured_mechanics(); they are NOT recomputed here (and must not be clobbered to null
    // each step, or the per-breath measurement would never survive)
    this._breath_interval_counter += this._t;
    this._et_tube_resistance = this.calc_ettube_resistance(this._vent_ettube.flow);
    this.calc_leak();
    this._set_tube_dead_space(true);
    this._calc_monitoring();
  }

  _calc_monitoring() {
    // generic monitored values a ventilator displays, gathered every step
    if (this._expiration) {
      this._te_counter += this._t;
      this._peak_exp_flow = Math.max(this._peak_exp_flow, -this._vent_ettube.flow);
    }
    // mean airway pressure per breath (closed at each breath start); without breaths (CPAP,
    // HFOV, apnoea) per 3 s block
    this._map_sum += this.pres * this._t;
    this._map_time += this._t;
    if (this._map_time >= 3.0) this._close_map_block();
    // in CPAP the patient sets the rate; backup breaths only come during apnoea
    const spont = this._breathing_model?.breathing_enabled ? this._breathing_model.resp_rate : 0.0;
    this.rr_meas = this.vent_mode === "CPAP" && spont > 0.0 ? spont : this._rate_avg;
    const now = this._model_engine.model_time_total ?? 0.0;
    while (this._trig_times.length && now - this._trig_times[0] > 60.0) this._trig_times.shift();
    this.trig_per_min = this._trig_times.length;
  }

  _close_map_block() {
    if (this._map_time > 0.0) this.map_meas = this._map_sum / this._map_time;
    this._map_sum = 0.0;
    this._map_time = 0.0;
  }

  _set_tube_dead_space(intubated) {
    // the ET-tube lumen is dead space in series with the airway; the dead-space compartment carries
    // it as rigid composition sub-tanks ahead of the tube port (only with series dead space on)
    const ds = this._vent_ettube?._comp_to;
    if (!ds || !("tube_volume" in ds)) return;
    const r = this.ettube_diameter / 2000.0; // m
    ds.tube_port_model = this._vent_gascircuit?.name ?? "";
    ds.tube_volume = intubated ? Math.PI * r * r * (this.ettube_length / 1000.0) * 1000.0 : 0.0; // L
  }

  calc_leak() {
    // the leak channel uses the ET-tube's Rohrer form for a short (laryngeal) channel of diameter
    // leak_size, so the leak grows with airway pressure (more in inspiration, a little at PEEP)
    const leak = this._vent_leak;
    if (!leak) return;
    if (!(this.leak_size > 0.0)) {
      leak.no_flow = true;
      return;
    }
    const d_ratio = 2.5 / this.leak_size;
    const k1 = 16.92 * Math.pow(d_ratio, 4.0);
    const k2 = 513.7 * Math.pow(d_ratio, 4.75);
    let res = (k1 + k2 * Math.abs(leak.flow)) * (this._leak_length / this._ettube_length_ref);
    // same explicit-integration floor as the ET tube (DS and MOUTH are the coupled compartments)
    const r_min = Math.max(
      this._t * ((leak._comp_from?.el_eff ?? 0.0) + (leak._comp_to?.el_eff ?? 0.0)),
      0.1
    );
    if (res < r_min) res = r_min;
    leak.is_enabled = true;
    leak.no_flow = false;
    leak.r_for = res;
    leak.r_back = res;
  }

  _calc_leak_perc() {
    // per-breath leak as a ventilator reports it, from the flow sensor at the tube
    this.leak_perc =
      this.insp_tidal_volume > 0.0
        ? Math.max(0.0, (100.0 * (this.insp_tidal_volume - this.exp_tidal_volume)) / this.insp_tidal_volume)
        : 0.0;
  }

  triggering() {
    if (this.trigger_mode === "flow") {
      this.flow_triggering();
      return;
    }
    this.trigger_volume =
      (this.tidal_volume / 100.0) * this.trigger_volume_perc;

    // arm on the onset of a patient effort, with a fresh counter: each effort gets its own trigger
    // window, so a missed effort (or the ventilator's own expiration) never carries over
    if (this._breathing_model?.ncc_insp === 1 && !this._trigger_blocked) {
      this._trigger_start = true;
      this._trigger_volume_counter = 0.0;
    }

    // disarm when the effort ends or a ventilator inspiration starts
    if (!this._breathing_model?.insp_running || this._trigger_blocked) {
      this._trigger_start = false;
      this._trigger_volume_counter = 0.0;
    }

    // count only inspiratory flow: the expiratory tail of the previous breath must not cancel it
    if (this._trigger_start) {
      this._trigger_volume_counter += Math.max(this._vent_ettube.flow, 0.0) * this._t;
    }

    if (this._trigger_volume_counter > this.trigger_volume) {
      this._trigger_volume_counter = 0.0;
      this._exp_time_counter = this.exp_time + 0.1;
      this._trigger_start = false;
      this.triggered_breath = true;
    }
  }

  flow_triggering() {
    // flow trigger, as on a ventilator with a proximal flow sensor: patient inspiratory flow at the
    // tube above trigger_flow (L/min) during expiration starts a breath. Armed once the minimal
    // expiratory time has passed, so the end of the previous breath can't re-trigger.
    if (this._trigger_blocked || !this._expiration || this._te_counter < this._min_exp_time) return;
    if (this._vent_ettube.flow * 60.0 > this.trigger_flow) {
      this._exp_time_counter = this.exp_time + 0.1;
      this.triggered_breath = true;
    }
  }

  simv_cycling() {
    // Synchronised intermittent mandatory ventilation. The mandatory rate divides time into
    // windows of 60/vent_rate. Each window opens with an assist window: the first patient trigger
    // gets a synchronised mandatory breath (PIP, insp_time) and closes it until the next window. If
    // no trigger comes by the mandatory breath point (window - insp_time) a mandatory breath is
    // delivered. Triggers after the window's breath get pressure support (ps_cmh2o above PEEP,
    // flow-cycled at term_sens_perc, Ti max insp_time), or none when ps_cmh2o is 0.
    const window = 60.0 / this.vent_rate;
    this.exp_time = Math.max(window - this.insp_time, this._min_exp_time);
    this._simv_window_counter += this._t;
    if (this._simv_window_counter >= window) {
      this._simv_window_counter -= window;
      this._simv_breath_given = false;
    }

    if (this._expiration) {
      let type = null;
      if (this._manual_breath_due()) {
        type = "mandatory";
      } else if (this.triggered_breath && this._vent_ettube.flow > 0.0) {
        if (!this._simv_breath_given) type = "sync";
        else if (this.ps_cmh2o > 0.0) type = "ps";
        else this.triggered_breath = false; // unsupported spontaneous breath on PEEP
      } else if (
        !this._simv_breath_given &&
        this._simv_window_counter >= window - this.insp_time
      ) {
        type = "mandatory";
      }
      if (type) {
        this._start_inspiration();
        this._ps_breath = type === "ps";
        this._mandatory_breath = type === "mandatory";
        if (type !== "ps") this._simv_breath_given = true;
        this._peak_flow = 0.0;
      }
    }

    if (this._inspiration) {
      this._insp_time_counter += this._t;
      this.ncc_insp += 1;
      this._trigger_blocked = true;
      if (this._vent_ettube.flow > this._peak_flow) this._peak_flow = this._vent_ettube.flow;
      const p = (this._vent_gascircuit.pres - this.pres_atm) * 1.35951;
      if (p > this._pip_meas) this._pip_meas = p;

      const flow_cycled =
        this._ps_breath &&
        this._peak_flow > 0.0 &&
        this._vent_ettube.flow < (this.term_sens_perc / 100.0) * this._peak_flow;
      const time_cycled = this._insp_time_counter > this.insp_time;
      const vol_limit = !this._ps_breath && this._vg_volume_limit_reached();
      if (flow_cycled || time_cycled || vol_limit) this._end_inspiration();
    }

    if (this._expiration) {
      this._exp_time_counter += this._t;
      this.ncc_exp += 1;
      this._trigger_blocked = false;
    }
  }

  cpap_cycling() {
    // CPAP with an optional apnoea backup: after 60/backup_rate s without a spontaneous effort (or
    // on a manual breath) a time-cycled breath at PIP for insp_time, then back to CPAP
    // the apnoea time runs from the start of the last breath, so backup breaths come at backup_rate
    this._apnea_counter += this._t;
    if (this._inspiration) {
      this._insp_time_counter += this._t;
      this.ncc_insp += 1;
      const p = (this._vent_gascircuit.pres - this.pres_atm) * 1.35951;
      if (p > this._pip_meas) this._pip_meas = p;
      if (this._insp_time_counter > this.insp_time) this._end_inspiration();
      this.pressure_control();
      return;
    }
    if (this._breathing_model?.ncc_insp === 1 && this._breathing_model?.breathing_enabled) {
      this._apnea_counter = 0.0;
    }
    const backup_due = this.backup_rate > 0.0 && this._apnea_counter > 60.0 / this.backup_rate;
    if (backup_due || this._manual_breath_due()) {
      this._apnea_counter = 0.0;
      this._start_inspiration();
      this._mandatory_breath = true;
      this.pressure_control();
      return;
    }
    this.cpap_control();
  }

  flow_cycling() {
    // Pressure-support state machine: a patient-triggered, flow-cycled breath (terminates when
    // inspiratory flow decays below term_sens_perc of peak), with a time-cycled mandatory backup so the
    // ventilator still delivers breaths during apnea. Triggering always runs in PS (calc_model).
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
      } else if (
        this._breath_interval_counter > 60.0 / this.vent_rate ||
        this._manual_breath_due()
      ) {
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

      // a patient breath cycles off on flow, but never runs past insp_time (Ti max — the safety
      // limit real PS modes carry for when flow never decays, e.g. with a leak or active effort)
      const flow_cycled =
        !this._mandatory_breath &&
        this._peak_flow > 0.0 &&
        this._vent_ettube.flow < (this.term_sens_perc / 100.0) * this._peak_flow;
      const time_cycled = this._insp_time_counter > this.insp_time;

      if (flow_cycled || time_cycled || this._vg_volume_limit_reached()) {
        this._end_inspiration();
      }

      this._prev_et_tube_flow = this._vent_ettube.flow;
    }

    if (this._expiration) {
      this._exp_time_counter += this._t;
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
        (this.vent_mode === "VC" &&
          this._insp_tidal_volume_counter >= this._vc_vol_target) ||
        this._vg_volume_limit_reached();
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

    // end of EXPIRATION -> start a new mechanical breath (time-cycled, patient trigger, or a
    // manual breath)
    if (this._exp_time_counter > this.exp_time || this._manual_breath_due()) {
      this._exp_time_counter = 0.0;
      this._start_inspiration();

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
    this._calc_leak_perc();
    // volume-targeted modes: trim the working pressure on the breath just completed (in SIMV only
    // on mandatory breaths: a supported spontaneous breath has its own, capped, pressure)
    if (this._volume_targeted() && !this._ps_breath) this.pressure_regulated_volume_control();
    this._ps_breath = false;

    // timing of the breath just completed, and the start of this one
    this.te_meas = this._te_counter;
    this.ie_ratio_meas = this.ti_meas > 0.0 ? this.te_meas / this.ti_meas : 0.0;
    this._close_map_block();
    if (this.triggered_breath && !this._mandatory_breath && !this._manual_breath) {
      this._trig_times.push(this._model_engine.model_time_total ?? 0.0);
    }

    this._exp_tidal_volume_counter = 0.0;
    this._pip_meas = 0.0;
    this._had_pause = false;

    if (this._breath_interval_counter > 0.0) {
      this._measured_rate = 60.0 / this._breath_interval_counter;
      // breath-averaged rate for the minute volume: average the breath INTERVALS (not the
      // instantaneous rates, which would over-weight short patient-triggered breaths)
      const interval_avg =
        this._rate_avg > 0.0
          ? 60.0 / this._rate_avg + 0.25 * (this._breath_interval_counter - 60.0 / this._rate_avg)
          : this._breath_interval_counter;
      this._rate_avg = 60.0 / interval_avg;
    }
    this._breath_interval_counter = 0.0;
    this._manual_breath = false;
  }

  _apply_humidifier() {
    // the heated humidifier: the fresh gas and the circuit carry their own temperature/humidity
    // targets (GasCapacitance relaxes toward them every step), so set those as well as the
    // composition — otherwise the circuit drifts back to the ambient target (as in set_temp)
    for (const gc of [this._vent_gasin, this._vent_gascircuit]) {
      gc.temp = this.temp;
      gc.target_temp = this.temp;
      gc.humidity = this.humidity;
      calc_gas_composition(gc, this.fio2, this.temp, this.humidity);
    }
    this._humidifier_applied = true;
  }

  _manual_breath_due() {
    // a manual breath (trigger_breath) waits out the minimal expiratory time so breaths are never
    // stacked back to back
    return (
      this._manual_breath &&
      this._expiration &&
      this._te_counter > this._min_exp_time
    );
  }

  _end_inspiration() {
    // insp -> exp transition. During a pause the tidal-volume counter is frozen (valves shut), so
    // latching the delivered inspiratory volume here is correct for both the paused and no-pause path.
    this.insp_tidal_volume = this._insp_tidal_volume_counter;
    this._insp_tidal_volume_counter = 0.0;
    this.ti_meas = this._insp_time_counter;
    this._te_counter = 0.0;
    this._peak_exp_flow = 0.0;
    this._insp_time_counter = 0.0;
    this._exp_time_counter = 0.0;
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

    // dynamic resistance as a neonatal ventilator reports it: the applied pressure change over the
    // peak expiratory flow (passive expiration drives that flow through the same pressure)
    if (this._peak_exp_flow > 0.0 && drive_dyn > 0) {
      this.r_dyn = drive_dyn / this._peak_exp_flow; // cmH2O/(L/s)
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
      // pressure target: PEEP -> PIP over rise_time, then held at PIP for the rest of the breath.
      // The servo meters whatever flow that takes (capped at insp_flow), so the pressure is
      // square and the flow decelerates as the lung fills — as on a real PC/PS ventilator.
      const ramp =
        this.rise_time > 0.0 ? Math.min(1.0, this._insp_time_counter / this.rise_time) : 1.0;
      this._pressure_servo(this._peep + (this._pip - this._peep) * ramp);

      if (this._vent_ettube.flow > 0) {
        this._insp_tidal_volume_counter += this._vent_ettube.flow * this._t;
      }
      // remember the flow at the end of the flow phase for the resistance measurement
      this._insp_flow_at_pause = this._vent_ettube.flow;
    }

    if (this._expiration) {
      // the expiratory valve opens to the PEEP reservoir and the demand valve holds PEEP, so a
      // spontaneously breathing patient can inhale between ventilator breaths (and trigger them).
      // While the patient exhales the circuit sits above PEEP and the servo stays shut.
      this._vent_exp_valve.no_flow = false;
      this._vent_exp_valve.no_back_flow = true;
      this._vent_exp_valve.r_for = this.calc_exp_valve_resistance();
      this._vent_gasout.vol =
        this._peep / this._vent_gasout.el_base + this._vent_gasout.u_vol;
      this._pressure_servo(this._peep);

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
      // the expiratory valve opens to the PEEP reservoir and the demand valve holds PEEP, so a
      // spontaneously breathing patient can inhale between ventilator breaths (and trigger them).
      // While the patient exhales the circuit sits above PEEP and the servo stays shut.
      this._vent_exp_valve.no_flow = false;
      this._vent_exp_valve.no_back_flow = true;
      this._vent_exp_valve.r_for = this.calc_exp_valve_resistance();
      this._vent_gasout.vol =
        this._peep / this._vent_gasout.el_base + this._vent_gasout.u_vol;
      this._pressure_servo(this._peep);

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

    // inspiratory valve: servo the circuit at the CPAP level, delivering the patient's
    // inspiratory demand (up to insp_flow) instead of letting the pressure dip
    this._pressure_servo(this._peep);

    // expiratory valve: open, reservoir pinned at CPAP so the circuit floats at CPAP
    this._vent_exp_valve.no_flow = false;
    this._vent_exp_valve.no_back_flow = true;
    this._vent_exp_valve.r_for = this.calc_exp_valve_resistance();
    this._vent_gasout.vol =
      this._peep / this._vent_gasout.el_base + this._vent_gasout.u_vol;

    // spontaneous-breath monitoring: close out a breath at each spontaneous inspiration start
    // (Breathing.ncc_insp === 1 marks the first step of a new spontaneous inspiration)
    if (this._breathing_model?.ncc_insp === 1) {
      this.exp_tidal_volume = -this._exp_tidal_volume_counter;
      this.insp_tidal_volume = this._insp_tidal_volume_counter;
      const weight = this._model_engine.weight;
      this.tv_kg = weight > 0 ? (this.exp_tidal_volume * 1000.0) / weight : 0.0;
      this.p_peak = this._pip_meas;
      this._pip_meas = 0.0;
      this._calc_leak_perc();
      this._exp_tidal_volume_counter = 0.0;
      this._insp_tidal_volume_counter = 0.0;
      this.vol = 0.0;
    }
    const p = (this._vent_gascircuit.pres - this.pres_atm) * 1.35951;
    if (p > this._pip_meas) this._pip_meas = p;
    if (this._vent_ettube.flow > 0) {
      this._insp_tidal_volume_counter += this._vent_ettube.flow * this._t;
    } else {
      this._exp_tidal_volume_counter += this._vent_ettube.flow * this._t;
    }
    this.minute_volume = this.exp_tidal_volume * (this._breathing_model?.resp_rate ?? 0);
  }

  _pressure_servo(target) {
    // Demand valve: meter fresh gas into the circuit so its pressure follows `target` (mmHg above
    // atmospheric). Needed flow = what leaves the circuit (ET tube + expiratory valve, last step)
    // plus a proportional correction of the pressure error through the circuit elastance, capped
    // at insp_flow (the valve's maximal flow) and never negative (it can't suck gas back). The
    // fresh-gas source is ~400 mmHg above the circuit, so the valve is close to an ideal flow
    // source and the one-step-old circuit pressure is good enough.
    const valve = this._vent_insp_valve;
    const circuit = this._vent_gascircuit;
    const q_max = this.insp_flow / 60.0; // L/s
    const p_err = this.pres_atm + target - circuit.pres; // mmHg
    const e_c = Math.max(circuit.el_eff, 1.0); // mmHg/L
    const q_out =
      this._vent_ettube.flow + (this._vent_exp_valve.no_flow ? 0.0 : this._vent_exp_valve.flow);
    const q = Math.min(q_max, q_out + (this._servo_gain * p_err) / (e_c * this._t));

    const dp_valve = this._vent_gasin.pres - circuit.pres;
    valve.no_back_flow = true;
    if (q > 1e-6 && dp_valve > 0.0) {
      valve.no_flow = false;
      valve.r_for = dp_valve / q;
    } else {
      valve.no_flow = true;
    }
  }

  hfov_control() {
    // High-frequency oscillation: the circuit pressure follows MAP plus an oscillation of
    // peak-to-peak hfo_amplitude_cmh2o at hfo_freq. The positive half-sine lasts hfo_insp_fraction of
    // the cycle with amplitude A*(1 - fi), the negative one the rest with amplitude A*fi, so the mean
    // is exactly MAP at any I:E. Expiration is ACTIVE (an oscillator pulls gas out): the expiratory
    // valve opens to a sink held below the trough, and a continuous bias flow washes the circuit.
    const f = Math.max(this.hfo_freq, 0.5);
    const fi = Math.min(Math.max(this.hfo_insp_fraction, 0.2), 0.8);
    const a = Math.max(this.hfo_amplitude_cmh2o, 0.0);

    this._hfo_phase += this._t * f;
    if (this._hfo_phase >= 1.0) {
      this._hfo_phase -= 1.0;
      this._hfo_cycle_end(f);
    }
    const th = this._hfo_phase;
    const w =
      th < fi
        ? a * (1.0 - fi) * Math.sin((Math.PI * th) / fi)
        : -a * fi * Math.sin((Math.PI * (th - fi)) / (1.0 - fi));
    const target = (this.hfo_map_cmh2o + w) / 1.35951; // mmHg above atmospheric
    this.pip_delivered = this.hfo_map_cmh2o + a * (1.0 - fi);

    // expiratory sink (the piston's pull), below the trough of the waveform
    const sink = (this.hfo_map_cmh2o - a * fi - this._hfo_sink_margin) / 1.35951;
    this._vent_gasout.vol = sink / this._vent_gasout.el_base + this._vent_gasout.u_vol;
    this._bidirectional_servo(target, this.pres_atm + sink, this.hfo_bias_flow / 60.0);

    // per-cycle measurements at the tube / circuit
    const q = this._vent_ettube.flow;
    if (q > 0) this._insp_tidal_volume_counter += q * this._t;
    else this._exp_tidal_volume_counter += q * this._t;
    const p = (this._vent_gascircuit.pres - this.pres_atm) * 1.35951;
    if (p > this._hfo_p_max) this._hfo_p_max = p;
    if (p < this._hfo_p_min) this._hfo_p_min = p;
    this._hfo_p_sum += p;
    this._hfo_n += 1;
  }

  _hfo_cycle_end(f) {
    this.insp_tidal_volume = this._insp_tidal_volume_counter;
    this.exp_tidal_volume = -this._exp_tidal_volume_counter;
    this.hfo_tidal_volume = this.insp_tidal_volume;
    const vt_ml = this.hfo_tidal_volume * 1000.0;
    this.hfo_dco2 = f * vt_ml * vt_ml;
    const weight = this._model_engine.weight;
    this.tv_kg = weight > 0 ? vt_ml / weight : 0.0;
    this.minute_volume = this.exp_tidal_volume * f * 60.0;
    if (this._hfo_n > 0) {
      this.hfo_map_meas = this._hfo_p_sum / this._hfo_n;
      this.hfo_amplitude_meas = this._hfo_p_max - this._hfo_p_min;
      this.p_peak = this._hfo_p_max;
    }
    this._insp_tidal_volume_counter = 0.0;
    this._exp_tidal_volume_counter = 0.0;
    // the volume trace restarts each oscillation, as it does at each breath in the other modes;
    // without it the bias-flow offset makes the integrated volume drift away
    this.vol = 0.0;
    this._hfo_p_max = -1e9;
    this._hfo_p_min = 1e9;
    this._hfo_p_sum = 0.0;
    this._hfo_n = 0;
  }

  _bidirectional_servo(target, sink_abs, q_bias) {
    // Two-sided pressure servo (HFOV): the net flow the circuit needs is what left it towards the
    // patient (last step) plus the proportional pressure correction. A positive need is pushed in
    // by the inspiratory valve, a negative one pulled out through the expiratory valve, and the
    // bias flow runs through both on top, so the net is unchanged.
    const circuit = this._vent_gascircuit;
    const p_err = this.pres_atm + target - circuit.pres; // mmHg
    const e_c = Math.max(circuit.el_eff, 1.0);
    const need = this._vent_ettube.flow + (this._servo_gain * p_err) / (e_c * this._t);
    const q_in = q_bias + Math.max(need, 0.0);
    const q_out = q_bias + Math.max(-need, 0.0);

    const insp = this._vent_insp_valve;
    const dp_in = this._vent_gasin.pres - circuit.pres;
    insp.no_back_flow = true;
    if (q_in > 1e-6 && dp_in > 0.0) {
      insp.no_flow = false;
      insp.r_for = dp_in / q_in;
    } else {
      insp.no_flow = true;
    }

    const exp = this._vent_exp_valve;
    const dp_out = circuit.pres - sink_abs;
    exp.no_back_flow = true;
    if (q_out > 1e-6 && dp_out > 0.0) {
      exp.no_flow = false;
      exp.r_for = dp_out / q_out;
    } else {
      exp.no_flow = true;
    }
  }

  pressure_regulated_volume_control() {
    // Breath-to-breath volume targeting (PRVC, and volume guarantee in PC/PS): move the working
    // pressure by the pressure the measured dynamic compliance says the volume error needs,
    // a fraction (_vt_gain) of it at a time and at most _vt_max_step per breath, within
    // [peep + 2, pip_cmh2o_max]. The user's pip_cmh2o is never touched — the working pressure is
    // reported as pip_delivered. (This replaced a fixed ±1 cmH2O step, which limit-cycled
    // between two pressures when 1 cmH2O moved Vt by more than the tolerance.)
    const err = this.tidal_volume - this.exp_tidal_volume; // L
    // the "Vt low / pressure limit reached" condition a real ventilator alarms on
    this.pressure_limited =
      err > this._tv_tolerance && this._pip_working >= this.pip_cmh2o_max - 1e-9;
    if (Math.abs(err) <= this._tv_tolerance || this.exp_tidal_volume <= 0.0) return;

    const c = this.compliance_dynamic; // mL/cmH2O, measured on this breath
    let step = c > 0.0 ? (this._vt_gain * err * 1000.0) / c : Math.sign(err);
    step = Math.max(-this._vt_max_step, Math.min(this._vt_max_step, step));
    this._pip_working = this._clamp_working_pressure(this._pip_working + step);
  }

  _volume_targeted() {
    return (
      this.vent_mode === "PRVC" ||
      (this.volume_guarantee &&
        (this.vent_mode === "PC" || this.vent_mode === "PS" || this.vent_mode === "SIMV"))
    );
  }

  _clamp_working_pressure(p) {
    return Math.max(this.peep_cmh2o + 2.0, Math.min(this.pip_cmh2o_max, p));
  }

  _vg_volume_limit_reached() {
    // volume guarantee's volutrauma guard: end the breath once it has delivered 130 % of the
    // target (e.g. after a sudden compliance rise), instead of waiting for the next breath's trim
    return (
      this.volume_guarantee &&
      (this.vent_mode === "PC" || this.vent_mode === "PS" || this.vent_mode === "SIMV") &&
      this._insp_tidal_volume_counter > this._vg_vt_limit * this.tidal_volume
    );
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
    this.pip_delivered = 0.0;
    this.pressure_limited = false;
    this.leak_perc = 0.0;
    this.hfo_tidal_volume = 0.0;
    this.hfo_dco2 = 0.0;
    this.hfo_map_meas = 0.0;
    this.hfo_amplitude_meas = 0.0;
    this.map_meas = 0.0;
    this.ti_meas = 0.0;
    this.te_meas = 0.0;
    this.ie_ratio_meas = 0.0;
    this.rr_meas = 0.0;
    this.trig_per_min = 0;
    this.r_dyn = 0.0;
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
    this._rate_avg = 0.0;
    this._manual_breath = false;
    this._pip_working = null;
    this._hfo_phase = 0.0;
    this._hfo_p_max = -1e9;
    this._hfo_p_min = 1e9;
    this._hfo_p_sum = 0.0;
    this._hfo_n = 0;
    this._vc_vol_target = this.tidal_volume;
    this._te_counter = 0.0;
    this._peak_exp_flow = 0.0;
    this._map_sum = 0.0;
    this._map_time = 0.0;
    this._trig_times = [];
    this._ps_breath = false;
    this._simv_window_counter = 0.0;
    this._simv_breath_given = false;
    this._apnea_counter = 0.0;
    this.vol = 0.0;
  }

  switch_ventilator(state) {
    this.is_enabled = state;
    this._reset_state();
    if (state) this._apply_humidifier();
    if (!state) this._set_tube_dead_space(false);
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

    // the leak only exists while intubated and with a gap set (calc_leak keeps it in step)
    if (this._vent_leak) {
      this._vent_leak.is_enabled = state && this.leak_size > 0.0;
      this._vent_leak.no_flow = !(state && this.leak_size > 0.0);
    }
  }

  calc_exp_valve_resistance() {
    // the expiratory limb and valve of the circuit. Auto (exp_valve_resistance 0) picks the circuit
    // that goes with the tube size: ISO 80601-2-12 allows at most 6 cmH2O expiratory pressure drop at
    // 5 L/min (neonatal), 30 L/min (paediatric) and 60 L/min (adult) circuits; real circuits sit well
    // below that, about 14, 5 and 3 cmH2O/(L/s). A single neonatal value for every patient
    // back-pressured adult exhalation (CPAP 0.5 rose to ~3 cmH2O in every expiration).
    let res = this.exp_valve_resistance;
    if (!(res > 0.0)) {
      if (this.ettube_diameter < 4.5) res = 10.0; // neonatal circuit, ~14 cmH2O/(L/s)
      else if (this.ettube_diameter < 6.0) res = 4.0; // paediatric, ~5 cmH2O/(L/s)
      else res = 2.0; // adult, ~3 cmH2O/(L/s)
    }
    // the same explicit-integration floor as the ET tube (circuit and PEEP reservoir are coupled)
    const r_min = Math.max(
      this._t * ((this._vent_gascircuit?.el_eff ?? 0.0) + (this._vent_gasout?.el_eff ?? 0.0)),
      0.1
    );
    return Math.max(res, r_min);
  }

  calc_ettube_resistance(flow) {
    // Rohrer form R = K1 + K2*|flow| (flow in L/s; the pressure drop K1*V + K2*V^2 is symmetric in
    // inspiration and expiration), scaled linearly with tube length
    let res =
      (this._ett_k1 + this._ett_k2 * Math.abs(flow)) *
      (this.ettube_length / this._ettube_length_ref);

    // numerical floor only: the flow across the tube is integrated explicitly, so it must not
    // equilibrate the circuit and the airway faster than one step (dt * (E_circuit + E_airway) / R
    // <= 1), or the airway pressure would oscillate. Only large (adult) tubes at low flow reach it.
    const e_sum =
      (this._vent_gascircuit?.el_eff ?? 0.0) +
      (this._vent_ettube?._comp_to?.el_eff ?? 0.0);
    const r_min = Math.max(this._t * e_sum, 0.1);
    if (res < r_min) {
      res = r_min;
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
      // Rohrer coefficients at the reference length (110 mm), anchored on an in-vitro 2.5 mm tube
      // (81 and 139 cmH2O/(L/s) at 5 and 10 L/min -> K1 23 cmH2O*s/L, K2 698 cmH2O*s^2/L^2) and
      // scaled to other diameters with the physical exponents: d^-4 for the laminar (Poiseuille)
      // term and d^-4.75 for the turbulent (Blasius) term. Valid ~2.5 (neonate) to 9 mm (adult).
      const d_ratio = 2.5 / new_diameter;
      this._ett_k1 = 16.92 * Math.pow(d_ratio, 4.0); // mmHg*s/L
      this._ett_k2 = 513.7 * Math.pow(d_ratio, 4.75); // mmHg*s^2/L^2
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
    // `pip` is the absolute peak pressure (kept for backward compatibility); the support level is
    // stored relative to PEEP so a later PEEP change keeps the same pressure support
    this.ps_cmh2o = Math.max(0.0, pip - peep);
    this.pip_cmh2o = pip;
    this.pip_cmh2o_max = pip;
    this.peep_cmh2o = peep;
    this.vent_rate = rate;
    this.insp_time = t_in;
    this.insp_flow = insp_flow;
    this.vent_mode = "PS";
  }

  set_simv(pip = 15.0, peep = 5.0, rate = 20.0, t_in = 0.4, ps = 0.0, insp_flow = 10.0) {
    // SIMV: mandatory breaths at `pip` and `rate`, spontaneous breaths between them supported by
    // `ps` above PEEP (0 = unsupported)
    this.pip_cmh2o = pip;
    this.pip_cmh2o_max = Math.max(this.pip_cmh2o_max, pip);
    this.peep_cmh2o = peep;
    this.vent_rate = rate;
    this.insp_time = t_in;
    this.ps_cmh2o = Math.max(0.0, ps);
    this.insp_flow = insp_flow;
    this._simv_window_counter = 0.0;
    this._simv_breath_given = false;
    this.vent_mode = "SIMV";
  }

  set_volume_guarantee(state = true, tv = null, pip_max = null) {
    // volume guarantee on top of PC (incl. synchronized A/C), PS or SIMV: tidal_volume (tv in mL) is the
    // target, pip_cmh2o_max the pressure limit; the working pressure is reported as pip_delivered
    this.volume_guarantee = state;
    if (tv !== null) this.tidal_volume = tv / 1000.0;
    if (pip_max !== null) this.pip_cmh2o_max = pip_max;
    this._pip_working = null; // restart from the set pressure
  }

  set_hfov(map = 10.0, amplitude = 25.0, freq = 10.0, insp_fraction = 0.33, bias_flow = 10.0) {
    this.hfo_map_cmh2o = map;
    this.hfo_amplitude_cmh2o = amplitude;
    this.hfo_freq = freq;
    this.hfo_insp_fraction = insp_fraction;
    this.hfo_bias_flow = bias_flow;
    this._hfo_phase = 0.0;
    this.vent_mode = "HFOV";
  }

  set_cpap(cpap = 5.0, insp_flow = 8.0, backup_rate = null) {
    // `backup_rate` (/min, 0 = off) delivers time-cycled breaths at pip_cmh2o/insp_time in apnoea;
    // left as it is when not given
    this.peep_cmh2o = cpap;
    this.insp_flow = insp_flow;
    if (backup_rate !== null) this.backup_rate = Math.max(0.0, backup_rate);
    this._apnea_counter = 0.0;
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
    // manual breath: ignored during inspiration (as on a real ventilator — it used to restart the
    // running breath), otherwise delivered once the minimal expiratory time has passed. Works in
    // every mode except CPAP.
    if (!this._inspiration) this._manual_breath = true;
  }
}
