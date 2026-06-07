export default class Datacollector {
  constructor(model) {
    // store a reference to the model instance
    this.model = model;

    // define the watch list
    this.watch_list = [];
    this.watch_list_labels = new Set();

    // define the watch list
    this.watch_list_slow = [];
    this.watch_list_slow_labels = new Set();

    // define the data sample interval
    this.sample_interval = 0.005;
    this.sample_interval_slow = 1.0;

    this._interval_counter = 0;
    this._interval_counter_slow = 0;


    // get the modeling stepsize from the model
    this.modeling_stepsize = this.model.modeling_stepsize;

    // try to add two always-needed ecg properties to the watchlist
    this.ncc_ventricular = {
      label: "Heart.ncc_ventricular",
      model: this.model.models["Heart"],
      prop1: "ncc_ventricular",
      prop2: null,
    };
    this.ncc_atrial = {
      label: "Heart.ncc_atrial",
      model: this.model.models["Heart"],
      prop1: "ncc_atrial",
      prop2: null,
    };

    // add the two always there
    this.watch_list.push(this.ncc_atrial);
    this.watch_list.push(this.ncc_ventricular);
    this.watch_list_labels.add(this.ncc_atrial.label);
    this.watch_list_labels.add(this.ncc_ventricular.label);

    // define the data list
    this.collected_data = [];
    this.collected_data_slow = [];

    // --- realtime typed data-plane (the chart channel) ---
    // When legacy_mode is true the fast stream is collected into the object
    // arrays above (original behavior). When a ChannelWriter is attached via
    // set_channels(), the fast stream is instead packed into a Float64 ring —
    // but only while rt_active (the realtime loop); offline calculate() keeps
    // using the object path so getModelData() still returns rows.
    this.legacy_mode = true;
    this.rt_active = false;
    // _channels (a ChannelWriter, which holds a postMessage function) and
    // _on_chart_registry (a callback) are function-bearing and must NOT be
    // structured-cloned. get_model_state posts the whole model graph, which
    // reaches here via every component's _model_engine back-reference, so these
    // are declared non-enumerable to keep that clone working.
    Object.defineProperty(this, "_channels", { value: null, writable: true, enumerable: false });
    Object.defineProperty(this, "_on_chart_registry", { value: null, writable: true, enumerable: false });
    this.registry_version = 0;
    this.chart_slots = []; // ["time", ...watch_list labels in registry order]
    this._chart_row = null; // reusable Float64 scratch row (no per-sample alloc)
  }

  /**
   * Attach the realtime typed transport. Switches the fast stream off the
   * object path and builds the initial chart signal index.
   * @param {Object} writer ChannelWriter instance
   * @param {Function} on_registry called whenever the chart layout/version changes
   */
  set_channels(writer, on_registry) {
    this._channels = writer;
    this._on_chart_registry = on_registry || null;
    this.legacy_mode = false;
    this._rebuild_chart_index();
  }

  /**
   * Rebuild the fixed slot map (index <-> dot-path) after any watchlist change,
   * bump the registry version, (re)allocate the chart ring, and notify so the
   * handshake is re-posted. No-op without an attached writer.
   */
  _rebuild_chart_index() {
    if (!this._channels) return;
    this.registry_version += 1;
    this.chart_slots = ["time", ...this.watch_list.map((w) => w.label)];
    const stride = this.chart_slots.length;
    this._chart_row = new Float64Array(stride);
    this._channels.acquireChartRing(stride, this.registry_version);
    if (this._on_chart_registry) this._on_chart_registry();
  }

  clear_data() {
    this.collected_data = [];
  }

  clear_data_slow() {
    this.collected_data_slow = [];
  }

  clear_watchlist() {
    // first clear all data
    this.clear_data();

    // empty the watch list
    this.watch_list = [];
    this.watch_list_labels.clear();

    // add the two always present
    this.watch_list.push(this.ncc_atrial);
    this.watch_list.push(this.ncc_ventricular);
    this.watch_list_labels.add(this.ncc_atrial.label);
    this.watch_list_labels.add(this.ncc_ventricular.label);

    if (!this.legacy_mode) this._rebuild_chart_index();
  }

  clear_watchlist_slow() {
    // first clear all data
    this.clear_data_slow();

    // empty the watch list
    this.watch_list_slow = [];
    this.watch_list_slow_labels.clear();
  }

  get_model_data() {
    let data = this.collected_data;
    // clear the current collection
    this.collected_data = [];
    // return the data object
    return data;
  }

  get_model_data_slow() {
    let data = this.collected_data_slow;
    // clear the current collection
    this.collected_data_slow = [];
    // return the data object
    return data;
  }

  set_sample_interval(new_interval = 0.005) {
    this.sample_interval = new_interval;
  }

  set_sample_interval_slow(new_interval = 0.005) {
    this.sample_interval_slow = new_interval;
  }

  add_to_watchlist(properties) {
    // define a return object
    let success = true;

    // first clear all data
    this.clear_data();

    // check whether property is a string
    if (typeof properties === "string") {
      // convert string to a list
      properties = [properties];
    }

    for (let i = 0; i < properties.length; i++) {
      const prop = properties[i];

      if (!this.watch_list_labels.has(prop)) {
        const processed_prop = this._find_model_prop(prop);

        if (processed_prop !== null) {
          this.watch_list.push(processed_prop);
          this.watch_list_labels.add(prop);
        } else {
          success = false;
        }
      }
    }

    if (!this.legacy_mode) this._rebuild_chart_index();

    return success;
  }

  add_to_watchlist_slow(properties) {
    // define a return object
    let success = true;

    // first clear all data
    this.clear_data_slow();

    // check whether property is a string
    if (typeof properties === "string") {
      // convert string to a list
      properties = [properties];
    }

    for (let i = 0; i < properties.length; i++) {
      const prop = properties[i];

      if (!this.watch_list_slow_labels.has(prop)) {
        const processed_prop = this._find_model_prop(prop);

        if (processed_prop !== null) {
          this.watch_list_slow.push(processed_prop);
          this.watch_list_slow_labels.add(prop);
        } else {
          success = false;
        }
      }
    }

    return success;
  }

  clean_up() {
    this.watch_list = this.watch_list.filter((dc_item) => dc_item.model.is_enabled);
    this.watch_list_labels = new Set(this.watch_list.map((item) => item.label));
    if (!this.legacy_mode) this._rebuild_chart_index();
  }

  clean_up_slow() {
    this.watch_list_slow = this.watch_list_slow.filter((dc_item) => dc_item.model.is_enabled);
    this.watch_list_slow_labels = new Set(this.watch_list_slow.map((item) => item.label));

  }

  collect_data(model_clock) {

    // collect data at specific intervals set by the sample_interval
    if (this._interval_counter >= this.sample_interval) {
      // reset the interval counter
      this._interval_counter = 0;

      const t = Math.round(model_clock * 10000) / 10000;

      if (!this.legacy_mode && this.rt_active && this._channels && this._chart_row) {
        // typed path: pack one fixed-stride row into the chart ring. Every slot
        // is written (0 for disabled models) so columns stay aligned.
        const row = this._chart_row;
        row[0] = t;
        for (let i = 0; i < this.watch_list.length; i++) {
          const parameter = this.watch_list[i];
          let value = 0;
          if (parameter.model.is_enabled) {
            let v = parameter.model[parameter.prop1];
            if (parameter.prop2 !== null) {
              v = v ? v[parameter.prop2] || 0 : 0;
            }
            value = typeof v === "number" ? v : 0;
          }
          row[i + 1] = value;
        }
        this._channels.appendChartRow(row);
      } else {
        // legacy object path (original behavior; also used by offline calculate)
        const data_object = { time: t };
        for (let i = 0; i < this.watch_list.length; i++) {
          const parameter = this.watch_list[i];
          if (parameter.model.is_enabled) {
            let value = parameter.model[parameter.prop1];
            if (parameter.prop2 !== null) {
              value = value[parameter.prop2] || 0;
            }
            data_object[parameter.label] = value;
          }
        }
        this.collected_data.push(data_object);
      }
    }

    if (this._interval_counter_slow >= this.sample_interval_slow) {
      // reset the interval counter
      this._interval_counter_slow = 0;

      // declare a data object holding the current model time
      const data_object_slow = { time: Math.round(model_clock * 10000) / 10000 };

      // process the watch_list
      for (let i = 0; i < this.watch_list_slow.length; i++) {
        const parameter = this.watch_list_slow[i];
        // get the value of the model variable as stated in the watchlist
        let value = parameter.model[parameter.prop1];
        if (parameter.prop2 !== null) {
          value = value[parameter.prop2] || 0;
        }

        // add the value to the data object
        data_object_slow[parameter.label] = value;
      }

      // add the data object to the collected data list
      this.collected_data_slow.push(data_object_slow);
    }

    // increase the interval counter
    this._interval_counter += this.modeling_stepsize;
    this._interval_counter_slow += this.modeling_stepsize;
  }

  _find_model_prop(prop) {
    // split the model from the prop
    const t = prop.split(".");

    // if only 1 property is present
    if (t.length === 2) {
      // try to find the parameter in the model
      if (t[0] in this.model.models) {
        if (t[1] in this.model.models[t[0]]) {
          const r = this.model.models[t[0]][t[1]];
          return {
            label: prop,
            model: this.model.models[t[0]],
            prop1: t[1],
            prop2: null,
            ref: r,
          };
        }
      }
    }

    // if 2 properties are present
    if (t.length === 3) {
      // try to find the parameter in the model
      if (t[0] in this.model.models) {
        if (t[1] in this.model.models[t[0]]) {
          return {
            label: prop,
            model: this.model.models[t[0]],
            prop1: t[1],
            prop2: t[2],
          };
        }
      }
    }

    return null;
  }
}
