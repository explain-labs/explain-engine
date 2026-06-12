import ModelEmitter from "./ModelEmitter";
import { RT_MSG } from "./helpers/RealtimeChannels.js";

/**
 * Model manages lifecycle, messaging, and state synchronization between the UI
 * layer and the ModelEngine worker. It wraps all wire protocols (GET/POST/PUT/DELETE)
 * exposed by the engine and re-emits results via the ModelEmitter pub/sub system.
 * Components subscribe with explain.on(event, handler) / explain.off(event, handler).
 */
export default class Model extends ModelEmitter {
  // declare an object holding the worker thread which does the heavy llifting
  modelEngine = {};

  // declare an object holding the model definition as loaded from the server
  modelDefinition = {};

  // declare an object holding the model data
  modelData = {};
  modelDataSlow = {};

  // declare an object holding the model state
  modelState = {};

  // declare an object holding a saved model state
  savedState = {}

  // declare object holding the generated messages
  info_message = "";
  error_message = "";
  statusMessage = "";
  script_message = "";

  // declare a message log
  message_log = [];
  no_logs = 25;


  /**
   * Spin up the ModelEngine worker and attach message listeners immediately so
   * no early responses are missed.
   */
  constructor() {
    super();
    // spin up a new model engine worker thread
    this.modelEngine = new Worker(new URL("./ModelEngine.js", import.meta.url), { type: "module" });

    // catch unhandled worker errors (syntax errors, import failures, etc.)
    this.modelEngine.onerror = (event) => {
      const message = event.message || "Unknown worker error";
      console.error("Model worker error:", message, event);
      this.error_message = message;
      this.emit("error", { message, error: message, stack: null });
    };

    // set up a listener for messages from the model engine
    this.receive();
  }

  /**
   * Fetch a JSON model definition by name and push it into the engine once retrieved.
   * @param {string} definition_name File stem inside /model_definitions.
   */
  load(definition_name) {
    console.log(`Model: Loading modeling definition: '${definition_name}'.`)
    const url = "/model_definitions/" + definition_name + ".json";

    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            "Uh oh! could not get the baseline_neonate from the server!"
          );
        }
        return response.json();
      })
      .then((jsonData) => {
        // store the full file data for the state store to pick up
        this.loadedFileData = jsonData;
        // unwrap model_definition if the file has that wrapper
        const definition = jsonData.model_definition || jsonData;
        // forward the diagram/animation definitions into the engine so the
        // worker-side AnimationPacker can build the sprite data contract.
        if (jsonData.diagram_definition && definition.diagram_definition === undefined) {
          definition.diagram_definition = jsonData.diagram_definition;
        }
        if (jsonData.animation_definition && definition.animation_definition === undefined) {
          definition.animation_definition = jsonData.animation_definition;
        }
        this.build(definition);
      })
      .catch((error) => {
        console.error("Error: ", error);
      });
  }

  /**
   * Proxy helper that posts raw messages to the worker if available.
   * @param {Object} message Envelope containing type/message/payload.
   */
  send(message) {
    if (this.modelEngine) {
      this.modelEngine.postMessage(message);
    }
  }

  /**
   * Attach the onmessage handler that translates engine responses into
   * local state mutations and emitter callbacks.
   */
  receive() {
    // set up a listener for messages from the model engine
    this.modelEngine.onmessage = (e) => {
      switch (e.data.type) {
        case "state":
          this.modelState = e.data.payload;
          this.emit("state");
          break;
        case "status":
          this.statusMessage = e.data.message;
          this.emit("status");
          break;
        case "model_ready":
          this.emit("model_ready", e.data.payload);
          break;
        case "rt_start":
          this.emit("rt_start");
          break;
        case "rt_stop":
          this.emit("rt_stop");
          break;
        case "data":
          this.modelData = e.data.payload;
          this.emit("data");
          break;
        case "data_slow":
          this.modelDataSlow = e.data.payload;
          this.emit("data_slow");
          break;
        case "rtf":
          this.modelData = e.data.payload;
          this.emit("rtf");
          break;
        case "rts":
          this.modelDataSlow = e.data.payload;
          this.emit("rts");
          break;
        case "prop_value":
          this.emit("prop_value", e.data.payload);
          break;
        case "model_props":
          this.emit("model_props", e.data.payload);
          break;
        case "model_types":
          this.emit("model_types", e.data.payload);
          break;
        case "state_saved":
          this.savedState = this._processModelState({...e.data.payload});
          this.emit("state_saved");
          break;
        case "error":
          this.error_message = e.data.message;
          console.error("Model engine error:", e.data.message, e.data.payload);
          this.emit("error", { message: e.data.message, ...e.data.payload });
          break;
        case RT_MSG.CHANNELS:
        case RT_MSG.CHART:
        case RT_MSG.ANIM:
          // realtime data plane — consumed by RealtimeBus, ignored here
          break;
        default:
          console.log("Unknown message type received from model engine");
          console.log(e.data);
          break;
      }
    };
  }

  // API CALLS
  /**
   * Inject a new explain definition into the engine.
   * @param {Object} explain_definition Parsed JSON definition.
   */
  build(explain_definition) {
    console.log("Model: Injecting the model definition into the ModelEngine.")
    this.modelDefinition = { ...explain_definition };
    this.send({
      type: "POST",
      message: "build",
      payload: JSON.stringify(explain_definition),
    });
  }

  /**
   * Re-bind the sprite diagram's animation to an edited diagram definition
   * WITHOUT rebuilding the model — the running simulation (model objects,
   * volumes, time) is preserved. Pass the diagram_definition object (the
   * `{ settings, components }` shape). The worker rebuilds its AnimationPacker
   * and re-posts the realtime channel registry so renderers rebind live.
   * @param {Object} diagram_definition
   */
  updateDiagram(diagram_definition) {
    this.send({
      type: "PUT",
      message: "diagram_definition",
      payload: JSON.stringify(diagram_definition),
    });
  }

  /**
   * Rebuild the engine using the last loaded definition snapshot.
   */
  restart() {
    this.send({
      type: "POST",
      message: "build",
      payload: JSON.stringify(this.modelDefinition),
    });
  }

  /**
   * Request an offline calculation run for a fixed number of seconds.
   * @param {number} time_to_calculate Simulation horizon in seconds.
   */
  calculate(time_to_calculate) {
    this.send({
      type: "POST",
      message: "calc",
      payload: parseInt(time_to_calculate),
    });
  }

  /**
   * Start the realtime loop inside the model engine.
   */
  start() {
    this.send({
      type: "POST",
      message: "start",
      payload: [],
    });
  }

  /**
   * Halt the realtime loop without clearing state.
   */
  stop() {
    this.send({
      type: "POST",
      message: "stop",
      payload: [],
    });
  }

  /**
   * Terminate the underlying worker and detach listeners to avoid leaks when
   * the owning component unmounts or hot reloads.
   */
  dispose() {
    if (this.modelEngine) {
      this.modelEngine.onmessage = null;
      this.modelEngine.terminate();
      this.modelEngine = null;
    }
  }

  /**
   * Remove every fast-sample watch entry.
   */
  clearWatchList() {
    this.send({
      type: "DELETE",
      message: "watchlist",
      payload: [],
    });
  }

  /**
   * Remove every slow-sample watch entry.
   */
  clearWatchListSlow() {
    this.send({
      type: "DELETE",
      message: "watchlist_slow",
      payload: [],
    });
  }

  /**
   * Subscribe to realtime values for given properties (model.prop1.prop2 strings).
   * @param {string|string[]} args Property path or array of paths.
   */
  watchModelProps(args) {
    // args is an array of strings with format model.prop1.prop2
    if (typeof args === "string") {
      args = [args];
    }
    this.send({
      type: "POST",
      message: "watch",
      payload: args,
    });
  }

  /**
   * Subscribe to slow-sampled values for given properties.
   * @param {string|string[]} args Property path or array of paths.
   */
  watchModelPropsSlow(args) {
    // args is an array of strings with format model.prop1.prop2
    if (typeof args === "string") {
      args = [args];
    }
    this.send({
      type: "POST",
      message: "watch_slow",
      payload: args,
    });
  }

  /**
   * Pull the latest fast-sampled model data snapshot.
   */
  getModelData() {
    this.send({
      type: "GET",
      message: "data",
      payload: [],
    });
  }

  /**
   * Pull the latest slow-sampled model data snapshot.
   */
  getModelDataSlow() {
    this.send({
      type: "GET",
      message: "data_slow",
      payload: [],
    });
  }

  /**
   * Update the fast sampler interval inside the engine.
   * @param {number} new_interval Interval in seconds.
   */
  setSampleInterval(new_interval) {
    this.send({
      type: "PUT",
      message: "sample_interval",
      payload: new_interval,
    });
  }

  /**
   * Update the slow sampler interval inside the engine.
   * @param {number} new_interval Interval in seconds.
   */
  setSampleIntervalSlow(new_interval) {
    this.send({
      type: "PUT",
      message: "sample_interval_slow",
      payload: new_interval,
    });
  }

  /**
   * Request the entire serialized engine state.
   */
  getModelState() {
    this.send({
      type: "GET",
      message: "state",
      payload: [],
    });
  }

  /**
   * Ask the engine to persist the current state as a saved snapshot.
   */
  saveModelState() {
    this.send({
      type: "POST",
      message: "save",
      payload: [],
    });
  }

  /**
   * Retrieve metadata about a specific model instance.
   * @param {string} model_name Name of the model instance in state.
   */
  getModelProps(model_name) {
    // get the properties of a specific model
    this.send({
      type: "GET",
      message: "model_props",
      payload: model_name,
    });
  }

  /**
   * Request the catalog of model types supported by the engine.
   */
  getModelTypes() {
    // get all the model types
    this.send({
      type: "GET",
      message: "model_types",
      payload: {},
    });
  }

  /**
   * Fetch a blood composition report for the given model instance.
   * @param {string} model_name Instance key inside modelState.
   */
  getBloodComposition(model_name) {
    // get the interface of a specific model
    this.send({
      type: "GET",
      message: "blood_composition",
      payload: model_name,
    });
  }


  /**
   * Create a brand-new model instance via the engine API.
   * @param {Object} model_args Arguments required by the engine to instantiate.
   */
  addNewModel(model_args) {
    // get the interface of a specific model
    this.send({
      type: "POST",
      message: "add",
      payload: model_args,
    });
  }

  /**
   * Remove a model instance from the engine.
   * @param {string} model_name Instance key inside modelState.
   */
  deleteModel(model_name) {
    // get the interface of a specific model
    this.send({
      type: "DELETE",
      message: "remove",
      payload: model_name,
    });
  }

  /**
   * Query the current value for a dot-delimited property path.
   * @param {string} property model.prop1.prop2 path.
   */
  getPropValue(property) {
    // get the value of a specific property with string format model.prop1.prop2
    this.send({
      type: "GET",
      message: "property_value",
      payload: property,
    });
  }

  /**
   * Schedule a property change with optional tweening parameters.
   * @param {string} prop model.prop1.prop2 path.
   * @param {number|string|boolean} new_value Target value.
   * @param {number} it Interpolation time in seconds (>= 0).
   * @param {number} at Delay before starting the interpolation.
   */
  setPropValue(prop, new_value, it = 1, at = 0) {
    // make sure the it is not zero
    if (it < 0) {
      it = 0;
    }
    let result = prop.split(".");
    let model = result[0];
    let prop1 = result[1];
    let prop2 = null;
    if (result.length > 2) {
      prop2 = result[2];
    }
    // set the property of a model with format {prop: model.prop1.prop2, v: value, at: time, it: time, type: task_type}
    this.send({
      type: "PUT",
      message: "property_value",
      payload: JSON.stringify({
        model: model,
        prop1: prop1,
        prop2: prop2,
        t: new_value,
        it: it,
        at: at,
        type: typeof new_value,
      }),
    });
  }

  /**
   * Ask the engine to execute a method on a model after an optional delay.
   * @param {string} model_function Dot path Model.method.
   * @param {Array} args Arguments to forward to the method.
   * @param {number} at Delay before invocation in seconds.
   */
  callModelFunction(model_function, args, at = 0) {
    this.send({
      type: "POST",
      message: "call",
      payload: JSON.stringify({
        func: model_function,
        args: args,
        it: 0,
        at: at,
        type: "function",
      }),
    });
  }

  /**
   * Scale a specific parameter group by a factor.
   * @param {string} group One of: "volumes", "unstressed_volumes", "elastances", "resistances", "reset"
   * @param {number} factor Scale factor (1.0 = no change, 0.5 = half, 2.0 = double)
   */
  scaleModel(group, factor = 1.0) {
    this.send({
      type: "POST",
      message: "scale",
      payload: { group, factor },
    });
  }

  /**
   * Remove transient helpers and local-only objects from a model state snapshot
   * so that it can be serialized or displayed cleanly.
   * @param {Object} model_state Raw state object returned by the engine.
   * @returns {Object} Sanitized model_state reference.
   */
  _processModelState(model_state) {
    // transfrom the modelstate object to a serializable object by removing the helper objects
    delete model_state["DataCollector"];
    delete model_state["TaskScheduler"];
    delete model_state["ModelScaler"];
    // remove the ncc counters
    for (const key in model_state) {
      if (key.startsWith("ncc")) {
        delete model_state[key];
      }
    }
    // iterate over all model and delete the local attributes
    Object.values(model_state.models).forEach((m) => {
      for (const key in m) {
        if (key.startsWith("_")) {
          delete m[key];
        }
        if (key === 'components') {
          if (Object.keys(m[key]).length > 0) {
            // build name array of keys
            let key_names = [] 
            Object.keys(m[key]).forEach(k => {
              key_names.push(k)
            })
            // replace
            key_names.forEach( key_name => {
              m['components'][key_name] = model_state.models[key_name]
              delete model_state.models[key_name]
            })
          }

        }
      }
    });
    return model_state;
  }
}
