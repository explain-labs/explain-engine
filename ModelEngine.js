// This is a dedicated web worker instance for the physiological model engine
// Web workers run in a separate thread for performance reasons and have no access to the DOM nor the window object
// The scope is defined by self and communication with the main thread by a message channel
// https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#web_workers_api

// Communication with the script which spawned the web worker takes place through a communication channel
// Messages are received in the onmessage event and are sent by the _send function

// Explain request object :
/* {
  type:       <string> stating the type of message (REST (PUT/POST/GET/DELETE/PATCH))
  message:    <string> stating the component of the model for which the message is intended (p.e. 'datalogger'/'interventions')
  payload:    <object> containing data to pass to the action
}
*/



// import all models present in the model_index module
import * as models from "./ModelIndex";
import DataCollector from "./helpers/DataCollector";
import TaskScheduler from "./helpers/TaskScheduler";
import ModelScaler from "./helpers/ModelScaler";
import ChannelWriter from "./helpers/ChannelWriter";
import AnimationPacker from "./helpers/AnimationPacker";
import { RT_MSG } from "./helpers/RealtimeChannels";
import { calc_blood_composition } from "./component_models/BloodComposition";

// store all imported models in a list to be able to instantiate them dynamically
let available_models = [];
Object.values(models).forEach((model) => available_models.push(model));
const available_model_map = {};
for (let i = 0; i < available_models.length; i++) {
  const model_class = available_models[i];
  available_model_map[model_class.model_type] = model_class;
}
const model_types_cached = [...new Set(available_models.map((mt) => mt.model_type))];
const ENABLE_STEP_ERROR_GUARD = true;

const _get_data_collector = function () {
  return model?.DataCollector || null;
};

const _get_task_scheduler = function () {
  return model?.TaskScheduler || null;
};

const _normalize_payload = function (payload) {
  if (typeof payload === "string") {
    return JSON.parse(payload);
  }
  return payload;
};

// declare a model object holding the current model
let model = {
  models: {},
};

// declare the model initialization flag
let model_initialized = false;

// declare a model data object holding the high resolution model data
let model_data = {};

// declare a model data object holding the low resolution model data
let model_data_slow = {};

// set the realtime updateintervals
let rtInterval = 0.015;
let rtSlowInterval = 1.0;
let rtSlowCounter = 0.0;
let rtClock = null;

// realtime typed data-plane (chart ring + anim snapshot)
let channel_writer = null;
let animation_packer = null;
let build_counter = 0;

// set up the endpoints for requests from the main thread
self.onmessage = (e) => {
  try {
    switch (e.data.type) {
      case "GET": // retrieve a resource
        switch (e.data.message) {
          case "state":
            get_model_state();
            break;
          case "data":
            get_model_data();
            break;
          case "data_slow":
            get_model_data_slow();
            break;
          case "property_value":
            get_property(e.data.payload);
            break;
          case "model_props":
            get_model_props(e.data.payload);
            break;
          case "model_types":
              get_model_types(e.data.payload);
              break;
          case "blood_composition":
            get_blood_composition(e.data.payload);
            break;
        }
        break;
      case "PUT": // update a resource
        switch (e.data.message) {
          case "sample_interval":
            _get_data_collector()?.set_sample_interval(e.data.payload);
            break;
          case "sample_interval_slow":
            _get_data_collector()?.set_sample_interval_slow(e.data.payload);
            break;
          case "property_value":
            console.log("ModelEngine: task scheduler request: ", e.data.payload )
            set_property(_normalize_payload(e.data.payload));
            break;
          case "diagram_definition":
            update_diagram(_normalize_payload(e.data.payload));
            break;
        }
        break;
      case "POST": // create a new resource
        switch (e.data.message) {
          case "build":
            console.log("ModelEngine: received new model definition.")
            model_initialized = build(_normalize_payload(e.data.payload));
            break;
          case "start":
            console.log("ModelEngine: realtime model started.")
            start();
            break;
          case "stop":
            console.log("ModelEngine: realtime model stopped.")
            stop()
            break;
          case "calc":
            console.log(`ModelEngine: calculating ${e.data.payload} seconds.`)
            calculate(e.data.payload);
            break;
          case "call":
            console.log("ModelEngine: calling model a specific function", e.data.payload )
            call_function(_normalize_payload(e.data.payload));
            break;
          case "add":
            add_model_to_engine(e.data.payload);
            break;
          case "save":
            save_state();
            break;
          case "scale":
            scale_model(e.data.payload);
            break;
          case "watch":
            watch_props(e.data.payload);
            break;
          case "watch_slow":
            watch_props_slow(e.data.payload);
            break;
        }
        break;
      case "DELETE": // remove a resource
        switch (e.data.message) {
          case "remove":
            remove_model_from_engine(e.data.payload)
            break;
          case "watchlist":
            clear_watchlist();
            break;
          case "watchlist_slow":
            clear_watchlist_slow();
            break;
        }
        break;
      default:
        console.log(`ModelEngine: invalid API request ${e.data.type}`)
        break;
    }
  } catch (err) {
    console.error("ModelEngine: unhandled error in message handler:", err);
    _send_error(`Unhandled error processing ${e.data.type} ${e.data.message}: ${err.message}`, err);
  }
};

// post the one-time realtime channel handshake: transport descriptor (+ SAB
// handles in shared mode) plus the chart and anim registries. Re-posted by the
// DataCollector callback whenever the chart layout/version changes.
const _post_rt_channels = function () {
  if (!channel_writer) return;
  postMessage({
    type: RT_MSG.CHANNELS,
    message: "",
    payload: {
      descriptor: channel_writer.descriptor(),
      chart: {
        version: model.DataCollector?.registry_version || 0,
        slots: model.DataCollector?.chart_slots || [],
      },
      anim: animation_packer ? animation_packer.registry() : null,
    },
  });
};

// Re-bind the sprite-diagram animation to an EDITED diagram definition without
// rebuilding the model — the live simulation (model objects, volumes, time)
// is left running. Swaps model.diagram_definition, rebuilds the AnimationPacker
// (component -> slot registry + direct model refs), re-acquires the anim
// snapshot at the new stride/version, and re-posts the rt_channels handshake so
// the main-thread reader and renderers rebind. Returns true on success.
const update_diagram = function (diagram_definition) {
  if (!model) return false;
  if (diagram_definition) model.diagram_definition = diagram_definition;
  if (!channel_writer) return false;
  try {
    build_counter += 1;
    animation_packer = new AnimationPacker(model, build_counter);
    channel_writer.acquireAnimSnapshot(
      animation_packer.stride || 0,
      animation_packer.version
    );
    _post_rt_channels();
    return true;
  } catch (e) {
    console.error("ModelEngine: diagram animation rebind failed:", e);
    return false;
  }
};

// define the model functions
const build = function (model_definition) {
  console.log("ModelEngine: building model from model definition.")
  // set the error counter
  let errors = 0;

  // set model initializer to false
  model_initialized = false;

  // store the model definition
  model_definition = model_definition;

  // erase all data
  model_data = {};
  model_data_slow = {};

  // stop all timers
  clearInterval(rtClock);

  // clear the current model object
  model = {
    models: {},
    scaler_config: {},
    ncc_atrial: 0,
    ncc_ventricular: 0,
    ncc_breathing_insp: 0,
    ncc_breathing_exp: 0,
    ncc_ventilator_insp: 0,
    ncc_ventilator_exp: 0,
  };

  // initialize the model parameters, except the model components key which needs special processing
  for (const [key, value] of Object.entries(model_definition)) {
    if (key !== "models") {
      // copy model parameter to the model object
      model[key] = value;
    }
  }

  // initialize all sub models
  Object.values(model_definition.models).forEach((sub_model_def) => {
    const model_class = available_model_map[sub_model_def.model_type];

    // if the component model was found then instantiate a model
    if (model_class) {
      try {
        // instantiate the new component and give it a name, pass the model type and a reference to the whole model
        let new_sub_model = new model_class(
          model,
          sub_model_def.name,
          sub_model_def.model_type
        );
        // add the new component to the model object
        model.models[sub_model_def.name] = new_sub_model;
      } catch (e) {
        errors += 1;
        console.error("ModelEngine: model instantiation error: ", sub_model_def.name, e);
        _send({
          type: "status",
          message: "ERROR: failed to instantiate " + sub_model_def.name + " (" + sub_model_def.model_type + ")",
          payload: [],
        });
      }

    } else {
      errors += 1;
      console.log("Model type not found: ", sub_model_def.model_type);
      _send({
        type: "status",
        message: "ERROR: " + sub_model_def.model_type + " model not found",
        payload: [],
      });
    }
  });

  // initialize all sub models
  if (errors < 1) {
    // now initialize all the models with the correct properties stored in the model definition
    Object.values(model.models).forEach((model_comp) => {
      // // find the arguments for the model in the model definition
      let args = [];
      for (const [key, value] of Object.entries(model_definition.models[model_comp.name])) {
        args.push({ key, value });
      }
      // set the arguments
      try {
        model_comp.init_model(args);
      } catch (e) {
        console.log("ModelEngine: model initialization error: ", model_comp.name);
        console.log(e);
        errors += 1;
        _send({
          type: "status",
          message:
            "ERROR: " +
            model_comp.name +
            "(" +
            model_comp.model_type +
            ") configuration error.",
          payload: [],
        });
      }
    });

    // add a datacollector instance to the model object
    model["DataCollector"] = new DataCollector(model);

    // add a task scheduler instance to the model object
    model["TaskScheduler"] = new TaskScheduler(model);

    // add a model scaler instance to the model object
    model["ModelScaler"] = new ModelScaler(model, model.scaler_config);

    // freeze the JSON's weight as the allometric baseline; reset() and
    // scale_to_weight() use this so behavior is correct regardless of scenario
    model._baseline_weight = model.weight;

    // wire up the realtime typed data plane (chart ring + anim snapshot).
    // Attaching channels flips the DataCollector to the typed fast path and
    // (re)posts the rt_channels handshake through the registry callback.
    try {
      build_counter += 1;
      channel_writer = new ChannelWriter((m, transfer) =>
        postMessage(m, transfer || [])
      );
      animation_packer = new AnimationPacker(model, build_counter);
      channel_writer.acquireAnimSnapshot(
        animation_packer.stride || 0,
        animation_packer.version
      );
      model.DataCollector.set_channels(channel_writer, _post_rt_channels);
    } catch (e) {
      console.error("ModelEngine: realtime channel setup failed:", e);
      channel_writer = null;
      animation_packer = null;
    }
  }

  if (errors > 0) {
    console.log("ModelEngine: model build failed.")
    _send({
      type: "status",
      message: `ERROR: model build failed"`,
      payload: [],
    });
    return false;
  } else {
    console.log("ModelEngine: model build succesful.")
    _send({
      type: "model_ready",
      message: "",
      payload: [],
    });
    return true;
  }
};

const remove_model_from_engine = function (model_name) {
  try {
    delete model.models[model_name]
    console.log('Removed model from engine: ', model_name)
    _send({
      type: "status",
      message: `Removed submodel from the model. `,
      payload: [],
    });
  } catch {
    console.log('Error in removing model from engine: ', model_name)
    _send({
      type: "status",
      message: `Error removing submodel from model. `,
      payload: [],
    });

  }

}

const add_model_to_engine = function (new_model) {

  const base_model = available_models.find(item => item.model_type === new_model.model_type );
  // make a key value list of the args
  let arg_list = []
  Object.keys(new_model).forEach(arg => {
    let arg_object = { key: arg, value: new_model[arg]}
    arg_list.push(arg_object)
  })
  let new_sub_model = {}
  try {
    new_sub_model = new base_model(model, new_model.name);
    new_sub_model.init_model(arg_list)
    model.models[new_model.name] = new_sub_model
    console.log('Added model to engine: ', new_sub_model)
    _send({
      type: "status",
      message: `Submodel added to the model`,
      payload: [],
    });
  } catch {
    console.log('Failed to add model to engine: ')
    _send({
      type: "status",
      message: `ERROR: failed to add model`,
      payload: [],
    });
  }

}

const start = function () {
  // start the model in realtime
  if (model_initialized) {
    // gate typed chart-ring writes to the realtime loop (offline calculate()
    // keeps using the object path)
    if (model.DataCollector) model.DataCollector.rt_active = true;
    // Re-post the channel handshake (chart + anim registries) now. The main-
    // thread RealtimeBus is created lazily after build, so it misses the
    // build-time handshake; re-posting on every start guarantees every renderer
    // (incl. the diagram's anim registry) is configured before frames flow.
    _post_rt_channels();
    // call the modelStep every rt_interval seconds
    clearInterval(rtClock);
    rtClock = setInterval(_model_step_rt, rtInterval * 1000.0);
    // send status update
    _send({
      type: "rt_start",
      message: ``,
      payload: [],
    });
    _send({
      type: "status",
      message: `realtime model started`,
      payload: [],
    });
  } else {
    _send({
      type: "status",
      message: `ERROR: model not initialized.`,
      payload: [],
    });
  }
};

const stop = function () {
  // stop the realtime model
  if (model_initialized) {
    if (model.DataCollector) model.DataCollector.rt_active = false;
    clearInterval(rtClock);
    rtClock = null;
    // signal that realtime model stopped
    _send({
      type: "rt_stop",
      message: ``,
      payload: [],
    });
    _send({
      type: "status",
      message: `realtime model stopped`,
      payload: [],
    });
  }
};

const calculate = function (time_to_calculate) {
  // calculate a number of seconds of the model
  if (model_initialized) {
    let noOfSteps = time_to_calculate / model.modeling_stepsize;
    _send({
      type: "status",
      message: `calculating ${time_to_calculate} s (${noOfSteps} steps)`,
      payload: [],
    });
    const start = performance.now();
    for (let i = 0; i < noOfSteps; i++) {
      _model_step();
    }
    const end = performance.now();
    const step_time = (end - start) / noOfSteps;

    _send({
      type: "status",
      message: `calculated in ${(end - start).toFixed(0)} ms (${step_time.toFixed(3)} ms/step)`,
      payload: [],
    });
    // get model data
    get_model_data();
    get_model_data_slow();
    get_model_state();
  } else {
    _send({
      type: "status",
      message: `ERROR: model not initialized.`,
      payload: [],
    });
  }

  // clean up the datacollector
  _get_data_collector()?.clean_up();
  _get_data_collector()?.clean_up_slow();
};

const set_property = function (new_prop_value) {
  _get_task_scheduler()?.add_task(new_prop_value);
};

const get_property = function (prop) {
  let p = prop.split(".");
  let v = {};
  switch (p.length) {
    case 2:
      v = model.models[p[0]][p[1]];
      break;
    case 3:
      v = model.models[p[0]][p[1]][p[2]];
      break;
  }
  _send({
    type: "prop_value",
    message: "",
    payload: { prop: prop, value: v },
  });
};

const get_model_props = function (model_name) {
  let modelStateCopy = { ...models };
  delete modelStateCopy["DataCollector"];
  delete modelStateCopy["TaskScheduler"];
  Object.values(modelStateCopy).forEach((m) => {
    for (const key in m) {
      if (key.startsWith("_")) {
        delete m[key];
      }
    }
  });
  _send({
    type: "model_props",
    message: "",
    payload: modelStateCopy,
  });

}

const get_model_types = function () {
  _send({
    type: "model_types",
    message: "",
    payload: model_types_cached,
  });

}

const call_function = function (new_function_call) {
  _get_task_scheduler()?.add_function_call(new_function_call);
};

const clear_watchlist = function () {
  _get_data_collector()?.clear_watchlist();
};

const clear_watchlist_slow = function () {
  _get_data_collector()?.clear_watchlist_slow();
};

const watch_props = function (args) {
  const data_collector = _get_data_collector();
  if (!data_collector) {
    return;
  }
  args.forEach((prop) => {
    data_collector.add_to_watchlist(prop);
  });
};

const watch_props_slow = function (args) {
  const data_collector = _get_data_collector();
  if (!data_collector) {
    return;
  }
  args.forEach((prop) => {
    data_collector.add_to_watchlist_slow(prop);
  });
};

const get_model_state = function () {
  // get the current whole model state
  postMessage({
    type: "state",
    message: "",
    payload: model,
  });
};

const get_model_data = function () {
  // get the realtime model data from the datacollector
  model_data = _get_data_collector()?.get_model_data() || [];

  // send data to the ui
  postMessage({
    type: "data",
    message: "",
    payload: model_data,
  });
};

const get_model_data_slow = function () {
  // get the slow update model data from the datacollector
  model_data_slow = _get_data_collector()?.get_model_data_slow() || [];

  // send data to the ui
  postMessage({
    type: "data_slow",
    message: "",
    payload: model_data_slow,
  });
};

const get_blood_composition = function (model_name) {
  console.log("ModelEngine: calculating blood composition.")
  const m = model.models[model_name];
  if (!m) {
    _send({
      type: "status",
      message: `ERROR: blood composition model not found (${model_name})`,
      payload: [],
    });
    return;
  }

  try {
    calc_blood_composition(m);
    _send({
      type: "status",
      message: `blood composition calculated for ${model_name}`,
      payload: [],
    });
  } catch (e) {
    console.log("ModelEngine: blood composition calculation failed.", e);
    _send({
      type: "status",
      message: `ERROR: blood composition calculation failed for ${model_name}`,
      payload: [],
    });
  }
}

const scale_model = function (payload) {
  if (!model_initialized || !model.ModelScaler) {
    _send({
      type: "status",
      message: "ERROR: model not initialized.",
      payload: [],
    });
    return;
  }
  try {
    const { group, factor } = payload;
    console.log(`ModelEngine: scaling ${group} by factor ${factor}`);
    switch (group) {
      // volume scaling (scales actual vol + u_vol_factor_scaling)
      case "blood_volume":
        model.ModelScaler.scale_blood_volume(factor);
        break;
      case "heart_volume":
        model.ModelScaler.scale_heart_volume(factor);
        break;
      case "lung_volume":
        model.ModelScaler.scale_lung_volume(factor);
        break;
      case "thorax_volume":
        model.ModelScaler.scale_thorax_volume(factor);
        break;
      case "pericardium_volume":
        model.ModelScaler.scale_pericardium_volume(factor);
        break;
      // blood
      case "blood_elastances":
        model.ModelScaler.scale_blood_elastances(factor);
        break;
      case "blood_resistances":
        model.ModelScaler.scale_blood_resistances(factor);
        break;
      // pulmonary
      case "pulmonary_elastances":
        model.ModelScaler.scale_pulmonary_elastances(factor);
        break;
      case "pulmonary_resistances":
        model.ModelScaler.scale_pulmonary_resistances(factor);
        break;
      case "pulmonary_u_vol":
        model.ModelScaler.scale_pulmonary_u_vol(factor);
        break;
      // systemic
      case "systemic_elastances":
        model.ModelScaler.scale_systemic_elastances(factor);
        break;
      case "systemic_resistances":
        model.ModelScaler.scale_systemic_resistances(factor);
        break;
      case "systemic_u_vol":
        model.ModelScaler.scale_systemic_u_vol(factor);
        break;
      // airway (dead space + conducting airways)
      case "airway_elastances":
        model.ModelScaler.scale_airway_elastances(factor);
        break;
      case "airway_u_vol":
        model.ModelScaler.scale_airway_u_vol(factor);
        break;
      case "airway_upper_resistances":
        model.ModelScaler.scale_airway_upper_resistances(factor);
        break;
      case "airway_lower_resistances":
        model.ModelScaler.scale_airway_lower_resistances(factor);
        break;
      // left lung
      case "left_lung_elastances":
        model.ModelScaler.scale_left_lung_elastances(factor);
        break;
      case "left_lung_resistances":
        model.ModelScaler.scale_left_lung_resistances(factor);
        break;
      case "left_lung_u_vol":
        model.ModelScaler.scale_left_lung_u_vol(factor);
        break;
      // right lung
      case "right_lung_elastances":
        model.ModelScaler.scale_right_lung_elastances(factor);
        break;
      case "right_lung_resistances":
        model.ModelScaler.scale_right_lung_resistances(factor);
        break;
      case "right_lung_u_vol":
        model.ModelScaler.scale_right_lung_u_vol(factor);
        break;
      // heart
      case "heart_el_min":
        model.ModelScaler.scale_heart_el_min(factor);
        break;
      case "heart_el_max":
        model.ModelScaler.scale_heart_el_max(factor);
        break;
      case "left_heart_el_min":
        model.ModelScaler.scale_left_heart_el_min(factor);
        break;
      case "left_heart_el_max":
        model.ModelScaler.scale_left_heart_el_max(factor);
        break;
      case "left_heart_u_vol":
        model.ModelScaler.scale_left_heart_u_vol(factor);
        break;
      case "right_heart_el_min":
        model.ModelScaler.scale_right_heart_el_min(factor);
        break;
      case "right_heart_el_max":
        model.ModelScaler.scale_right_heart_el_max(factor);
        break;
      case "right_heart_u_vol":
        model.ModelScaler.scale_right_heart_u_vol(factor);
        break;
      case "heart_resistances":
        model.ModelScaler.scale_heart_resistances(factor);
        break;
      // containers
      case "thorax_elastances":
        model.ModelScaler.scale_thorax_elastances(factor);
        break;
      case "pericardium_elastances":
        model.ModelScaler.scale_pericardium_elastances(factor);
        break;
      // utility
      case "weight":
        model.weight = factor;
        break;
      case "weight_scale":
        model.ModelScaler.scale_to_weight(factor);
        break;
      case "add_volume":
        model.ModelScaler.add_volume(factor);
        break;
      case "incorporate":
        model.ModelScaler.incorporate();
        break;
      case "reset":
        model.ModelScaler.reset();
        model.weight = model._baseline_weight;
        break;
    }
    get_model_state();
    _send({
      type: "status",
      message: `${group} scaled by factor ${factor}`,
      payload: [],
    });
  } catch (e) {
    console.error("ModelEngine: scaling error:", e);
    _send_error(`Scaling error: ${e.message}`, e);
  }
};

const _model_step = function () {
  // iterate over all models
  for (const model_name in model.models) {
    const model_component = model.models[model_name];
    if (ENABLE_STEP_ERROR_GUARD) {
      try {
        model_component.step_model();
      } catch(e) {
        console.error("Step model error: ", model_component.name, e);
        _send_error(`step_model error in ${model_component.name}: ${e.message}`, e);
      }
    } else {
      model_component.step_model();
    }

  }

  // call the datacollector
  _get_data_collector()?.collect_data(model.model_time_total);

  // do the tasks
  _get_task_scheduler()?.run_tasks();

  // increase the model clock
  model.model_time_total += model.modeling_stepsize;
};

const save_state = function() {
  postMessage({
    type: "state_saved",
    message: "",
    payload: model,
  });
  
}

// define the local model functions
const _model_step_rt = function () {
  try {
    // so the rt_interval determines how often the model is calculated
    const noOfSteps = rtInterval / model.modeling_stepsize;
    for (let i = 0; i < noOfSteps; i++) {
      _model_step();
    }

    // fast stream
    if (channel_writer && model.DataCollector && !model.DataCollector.legacy_mode) {
      // chart rows were written into the ring inside collect_data; here we pack
      // the latest anim frame and flush (flush is a no-op in shared mode).
      if (animation_packer) {
        animation_packer.pack_and_write(channel_writer, model.model_time_total);
      }
      channel_writer.flush();
    } else {
      // legacy object path
      _get_model_data_rt();
    }

    // get slow model data
    if (rtSlowCounter > rtSlowInterval) {
      rtSlowCounter = 0;
      _get_model_data_rt_slow();
    }
    rtSlowCounter += rtInterval;
  } catch (err) {
    // Stop the realtime loop to prevent repeated failures
    clearInterval(rtClock);
    rtClock = null;
    console.error("ModelEngine: fatal error in realtime loop:", err);
    _send_error(`Fatal error in realtime loop: ${err.message}`, err);
    _send({ type: "rt_stop", message: "", payload: [] });
  }
};

const _get_model_data_rt = function () {
  // get the realtime model data from the datacollector
  model_data = _get_data_collector()?.get_model_data() || [];

  // send data to the ui
  postMessage({
    type: "rtf",
    message: "",
    payload: model_data,
  });
};

const _get_model_data_rt_slow = function () {
  // get the realtime slow model data from the datacollector
  model_data = _get_data_collector()?.get_model_data_slow() || [];

  // send data to the ui
  postMessage({
    type: "rts",
    message: "",
    payload: model_data,
  });
};

const _send = function (message) {
  postMessage(message);
};

const _send_error = function (message, err) {
  postMessage({
    type: "error",
    message: message,
    payload: {
      error: err?.message || String(err),
      stack: err?.stack || null,
    },
  });
};
