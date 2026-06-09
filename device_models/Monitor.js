import { BaseModelClass } from "../base_models/BaseModelClass.js";

export class Monitor extends BaseModelClass {
  // static properties
  static model_type = "Monitor";

  constructor(model_ref, name = "") {
    super(model_ref, name);

    // Independent properties
    this.heart_rate = 0.0; // average heart rate over the last hr_avg_beats beats, in bpm
    this.resp_rate = 0.0; // average respiratory rate over the last rr_avg_time seconds, in breaths/min
    this.etco2 = 0.0; // end-tidal CO2, mirrored from the Ventilator
    this.temp = 0.0; // blood temperature (°C), mirrored from the ascending aorta (AA)
    this.sao2_pre = 0.0; // pre-ductal arterial O2 saturation, from the ascending aorta (AA)
    this.sao2_post = 0.0; // post-ductal arterial O2 saturation, from the descending aorta (AD)
    this.svo2 = 0.0; // venous O2 saturation, from the right atrium / IVC (RAIVCI)

    // JSON-configurable flow read-outs: a list of { name, model } where model is a "ModelName.prop"
    // dot-path (prop defaults to "flow"). Each is reported beat-averaged in L/min under flows[name].
    this.flow_targets = [];

    // JSON-configurable per-beat min/max read-outs: a list of { name, model } where model is a
    // compartment name. Each is reported as { pres_min, pres_max, vol_min, vol_max } under minmax[name].
    this.minmax_targets = [];

    // JSON-configurable raw-signal read-outs: a list of { name, model } where model is a
    // "ModelName.prop" dot-path. The raw value is published unprocessed every step under signals[name].
    this.signal_targets = [];

    // Dependent properties
    // flows
    this.flows = {}; // dictionary of beat-averaged flow read-outs in L/min, keyed by name (from flow_targets)

    // minmax
    this.minmax = {}; // dictionary of beat min/max read-outs, keyed by name_field (from minmax_targets)
    
    // signals
    this.signals = {}; // dictionary of JSON-configured raw signal read-outs, keyed by name

    // derived metrics (computed from the flows dict each flow-averaging window)
    this.fo_flow = 0.0; // foramen ovale flow = fo_ivci_flow + fo_svc_flow (L/min)
    this.do2_br = 0.0; // cerebral oxygen delivery from brain_flow × AA O2 content
    this.do2_lb = 0.0; // lower-body oxygen delivery from kid_flow × AD O2 content

    // monitor settings
    this.hr_avg_beats = 12;
    this.flow_avg_beats = 1;
    this.rr_avg_time = 20;
    this.sat_avg_time = 5;

    // local properties
    this._heart = null; // reference to the heart model, for tracking the cardiac cycle
    this._aa = null; // reference to the ascending aorta (O2 content for do2_br)
    this._ad = null; // reference to the descending aorta (O2 content for do2_lb)
    this._ra_ivci = null; // reference to the right atrium / IVC (venous O2 saturation)
    this._breathing = null; // reference to the spontaneous breathing model (breath events)
    this._ventilator = null; // reference to the mechanical ventilator model (breath events)
    this._rr_intervals = []; // rolling window of breath-to-breath intervals spanning ~rr_avg_time s
    this._rr_window_sum = 0.0; // running sum of _rr_intervals (s)
    this._resp_interval_counter = 0.0; // time since the previous breath; reset on each breath
    this._flow_targets = []; // resolved flow_targets: { name, _model, prop, counter }
    this._minmax_targets = []; // resolved minmax_targets: { name, _model, pres/vol running min/max }
    this._signal_targets = []; // resolved signal_targets: { name, _model, prop }
    this._hr_list = []; // rolling window of the last hr_avg_beats beat-to-beat heart rates
    this._hr_sum = 0.0; // running sum of _hr_list
    this._beats_counter = 0; // counts the number of beats since the last flow read-out
    this._beats_time = 0.0; // counts the time since the last flow read-out
    this._qrs_interval_counter = 0.0; // time since the previous beat (beat-to-beat interval); reset on each beat
  }

  init_model(args = {}) {
    // set the values of the independent properties
    args.forEach((arg) => {
      this[arg["key"]] = arg["value"];
    });

    // resolve the JSON-configured flow targets to { name, model ref, prop, counter }, dropping any
    // whose model does not resolve
    this._flow_targets = (Array.isArray(this.flow_targets) ? this.flow_targets : [])
      .map((t) => {
        const path = String(t.model ?? "");
        const dot = path.indexOf(".");
        const model_name = dot >= 0 ? path.slice(0, dot) : path;
        const prop = dot >= 0 ? path.slice(dot + 1) : "flow";
        return { name: t.name, _model: this._model_engine.models[model_name] ?? null, prop, counter: 0.0 };
      })
      .filter((t) => t.name && t._model);

    // seed the output dictionary so the watch paths (Monitor.flows.<name>) exist from the start
    this._flow_targets.forEach((t) => { this.flows[t.name] = 0.0; });

    // resolve the JSON-configured min/max targets (per-beat min/max of pres and vol)
    this._minmax_targets = (Array.isArray(this.minmax_targets) ? this.minmax_targets : [])
      .map((t) => ({
        name: t.name,
        _model: this._model_engine.models[String(t.model ?? "").split(".")[0]] ?? null,
        pres_min: 1000.0, pres_max: -1000.0, vol_min: 1000.0, vol_max: -1000.0,
      }))
      .filter((t) => t.name && t._model);
    // flat keys (name_field) so the watch paths stay 3 levels deep — Monitor.minmax.<name>_<field>
    // (the DataCollector resolves at most model.prop1.prop2)
    this._minmax_targets.forEach((t) => {
      this.minmax[t.name + "_pres_min"] = 0.0;
      this.minmax[t.name + "_pres_max"] = 0.0;
      this.minmax[t.name + "_pres_mean"] = 0.0;
      this.minmax[t.name + "_vol_min"] = 0.0;
      this.minmax[t.name + "_vol_max"] = 0.0;
    });

    // resolve the JSON-configured raw-signal targets (instantaneous "ModelName.prop" reads)
    this._signal_targets = (Array.isArray(this.signal_targets) ? this.signal_targets : [])
      .map((t) => {
        const path = String(t.model ?? "");
        const dot = path.indexOf(".");
        return {
          name: t.name,
          _model: dot >= 0 ? this._model_engine.models[path.slice(0, dot)] ?? null : null,
          prop: dot >= 0 ? path.slice(dot + 1) : "",
        };
      })
      .filter((t) => t.name && t._model && t.prop);
    this._signal_targets.forEach((t) => { this.signals[t.name] = 0.0; });

    // reference the dependency on the heart model for tracking the cardiac cycle (for the per-beat min/max read-outs)
    this._heart = this._model_engine.models["Heart"] ?? null;

    // reference the aortas for the oxygen-delivery derived metrics (do2_br / do2_lb) and the
    // pre-/post-ductal saturations, plus the right atrium / IVC for the venous saturation
    this._aa = this._model_engine.models["AA"] ?? null;
    this._ad = this._model_engine.models["AD"] ?? null;
    this._ra_ivci = this._model_engine.models["RAIVCI"] ?? null;

    // reference the breathing sources for the respiratory-rate read-out (either may be absent)
    this._breathing = this._model_engine.models["Breathing"] ?? null;
    this._ventilator = this._model_engine.models["Ventilator"] ?? null;

    // flag that the model is initialized
    this._is_initialized = true;
  }

  calc_model() {
    // collect the pressure
    this.collect_pressures();

    // collect flows
    this.collect_flows();

    // collect signals
    this.collect_signals();

    // average respiratory rate
    this.calc_resp_rate();

    // mirror the end-tidal CO2 from the ventilator (last value kept if no ventilator is present)
    this.etco2 = this._ventilator ? this._ventilator.etco2 : this.etco2;

    // mirror the blood temperature from the ascending aorta (last value kept if AA is absent)
    this.temp = this._aa ? this._aa.temp : this.temp;

    // mirror the oxygen saturations (pre-/post-ductal arterial and venous); last value kept if absent
    this.sao2_pre = this._aa ? this._aa.so2 : this.sao2_pre;
    this.sao2_post = this._ad ? this._ad.so2 : this.sao2_post;
    this.svo2 = this._ra_ivci ? this._ra_ivci.so2 : this.svo2;

    // determine the begin of the cardiac cycle, this is where the min and max values are latched
    // only do this when _heart is non-null and has the ncc_ventricular property (to avoid hard dependencies on specific heart models)
    if (this._heart && this._heart.ncc_ventricular === 1) {
      // add 1 beat
      this._beats_counter += 1;

      // rolling average heart rate over the last hr_avg_beats beats. The beat-to-beat rate is
      // derived from the interval since the previous beat; keep a moving window and average it,
      // so heart_rate updates every beat.
      const btb_hr = this._qrs_interval_counter > 0 ? 60.0 / this._qrs_interval_counter : 0.0;
      this._qrs_interval_counter = 0.0;
      this._hr_list.push(btb_hr);
      this._hr_sum += btb_hr;
      while (this._hr_list.length > this.hr_avg_beats) {
        this._hr_sum -= this._hr_list.shift();
      }
      this.heart_rate = this._hr_list.length > 0 ? this._hr_sum / this._hr_list.length : 0.0;

      // latch the JSON-configured per-beat min/max read-outs as flat keys (pressure in mmHg,
      // volume in mL) — Monitor.minmax.<name>_pres_max etc.
      this._minmax_targets.forEach((t) => {
        this.minmax[t.name + "_pres_min"] = t.pres_min;
        this.minmax[t.name + "_pres_max"] = t.pres_max;
        this.minmax[t.name + "_pres_mean"] = (2 * t.pres_min + t.pres_max) / 3.0;
        this.minmax[t.name + "_vol_min"] = t.vol_min * 1000.0;
        this.minmax[t.name + "_vol_max"] = t.vol_max * 1000.0;
        t.pres_min = 1000.0; t.pres_max = -1000.0;
        t.vol_min = 1000.0; t.vol_max = -1000.0;
      });
    }

    // determine the end of the beat-averaging window for the flow read-outs, and if so calculate the beat-averaged flows
    if (this._beats_counter > this.flow_avg_beats) {

      // report the JSON-configured flow targets, beat-averaged in L/min
      this._flow_targets.forEach((t) => {
        this.flows[t.name] = this._beats_time > 0 ? (t.counter / this._beats_time) * 60.0 : 0.0;
        t.counter = 0.0;
      });

      // derived metrics read from the configurable flows dict (require flow_targets named
      // brain_flow / kid_flow / fo_ivci_flow / fo_svc_flow)
      this.fo_flow = (this.flows["fo_ivci_flow"] || 0) + (this.flows["fo_svc_flow"] || 0);
      this.do2_br = this._aa ? (this.flows["brain_flow"] || 0) * this._aa.to2 * 22.4 : this.do2_br;
      this.do2_lb = this._ad ? (this.flows["kid_flow"] || 0) * 4 * this._ad.to2 * 22.4 : this.do2_lb;

      // reset the counters
      this._beats_counter = 0;
      this._beats_time = 0.0;
    }
    
    // increase the timers
    this._qrs_interval_counter += this._t;
    this._beats_time += this._t;

  }
  calc_resp_rate() {
    // a breath starts when an ACTIVE breathing source reaches the start of inspiration
    // (ncc_insp === 1); both the spontaneous and the ventilator source are considered
    const spont = this._breathing && this._breathing.breathing_enabled && this._breathing.ncc_insp === 1;
    const vent = this._ventilator && this._ventilator.is_enabled && this._ventilator.ncc_insp === 1;

    if (spont || vent) {
      const interval = this._resp_interval_counter;
      this._resp_interval_counter = 0.0;
      if (interval > 0) {
        // rolling window of breath-to-breath intervals spanning ~rr_avg_time seconds
        this._rr_intervals.push(interval);
        this._rr_window_sum += interval;
        while (this._rr_window_sum > this.rr_avg_time && this._rr_intervals.length > 1) {
          this._rr_window_sum -= this._rr_intervals.shift();
        }
        // average respiratory rate = breaths in window / window time × 60
        this.resp_rate = this._rr_window_sum > 0 ? (this._rr_intervals.length / this._rr_window_sum) * 60.0 : 0.0;
      }
    }

    this._resp_interval_counter += this._t;
  }

  collect_signals() {
    // raw, unprocessed JSON-configured signals (instantaneous, read every step)
    this._signal_targets.forEach((t) => {
      const v = t._model[t.prop];
      if (v !== undefined) this.signals[t.name] = v;
    });
  }

  collect_pressures() {
    // track per-beat min/max of pressure and volume for the JSON-configured targets
    this._minmax_targets.forEach((t) => {
      const p = t._model.pres;
      const v = t._model.vol;
      if (typeof p === "number") { t.pres_max = Math.max(t.pres_max, p); t.pres_min = Math.min(t.pres_min, p); }
      if (typeof v === "number") { t.vol_max = Math.max(t.vol_max, v); t.vol_min = Math.min(t.vol_min, v); }
    });
  }

  collect_flows() {
    // accumulate the JSON-configured flow targets (volume = flow · dt)
    this._flow_targets.forEach((t) => {
      t.counter += (t._model[t.prop] ?? 0.0) * this._t;
    });
  }
}

