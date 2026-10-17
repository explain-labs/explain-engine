/**
 * TaskScheduler coordinates deferred mutations on model instances.
 * It supports gradual numeric transitions, immediate primitive swaps,
 * and arbitrary function executions tied to the modeling timestep.
 */
export default class TaskScheduler {
  /**
   * @param {Object} model_ref Reference to the model engine exposing models and modeling_stepsize.
   */
  constructor(model_ref) {
    this._model_engine = model_ref; // object holding a reference to the model engine
    this._t = model_ref.modeling_stepsize; // setting the modeling stepsize
    this._is_initialized = false; // flag whether the model is initialized or not
    this.is_enabled = true; // flag to enable or disable the task scheduler

    // local properties
    this._tasks = {}; // dictionary holding the current tasks
    this._task_interval = 0.015; // interval at which tasks are evaluated
    this._task_interval_counter = 0.0; // counter
  }
  /**
   * Registers a task that simply invokes a model function after the delay.
   * @param {Object} new_function_call { func: "Model.method", args: [...], at: seconds }
   * @returns {string|null} an error message when the target can't be resolved, else null
   */
  add_function_call(new_function_call) {
    // keep the model and method NAMES, not references: the task list is part of the model state
    // the worker posts to the UI, and a function can't be structured-cloned, so a pending call
    // would make every GET state fail until it ran. The method is looked up when the task runs.
    const [model_name, func] = String(new_function_call.func ?? "").split(".");
    const m = this._model_engine.models[model_name];
    if (!m) return `TaskScheduler: model '${model_name}' not found (${new_function_call.func})`;
    if (typeof m[func] !== "function") return `TaskScheduler: '${new_function_call.func}' is not a function`;

    const id = this._new_id();
    new_function_call.id = id;
    new_function_call.running = false;
    new_function_call.completed = false;
    new_function_call.type = 2;
    new_function_call.stepsize = 0.0;
    new_function_call.model = model_name;
    new_function_call.func = func;

    // add the function call to the task list
    this._tasks[id] = new_function_call;
    return null;
  }

  /**
   * Registers a property mutation task. Numeric properties tween, primitives swap instantly.
   * @param {Object} new_task { model, prop1, prop2, t, it, at, ... }
   * @returns {string|null} an error message when the target can't be resolved, else null
   */
  add_task(new_task) {
    const label = `${new_task.model}.${new_task.prop1}${new_task.prop2 != null ? "." + new_task.prop2 : ""}`;
    const model = this._model_engine.models[new_task.model];
    if (!model) return `TaskScheduler: model '${new_task.model}' not found (${label})`;
    if (new_task.prop2 === undefined) new_task.prop2 = null;
    // only existing properties can be set: a typo must not silently create a new one
    const holder = new_task.prop2 === null ? model : model[new_task.prop1];
    const key = new_task.prop2 === null ? new_task.prop1 : new_task.prop2;
    if (holder === null || typeof holder !== "object" || !(key in holder)) {
      return `TaskScheduler: property '${label}' not found`;
    }

    const current_value = holder[key];
    const id = this._new_id();
    new_task.id = id;
    new_task.running = false;
    new_task.completed = false;
    new_task.model = model;
    new_task.current_value = current_value;
    new_task.stepsize = 0.0;

    // numbers tween over `it` seconds (type 0); everything else, and a number with it <= 0, is set
    // at once (type 1). The tween's start value and step are taken when it STARTS (after `at`), so a
    // property that changed in the meantime doesn't jump back to its value at scheduling time
    if (typeof current_value === "number" && typeof new_task.t === "number" && new_task.it > 0) {
      new_task.type = 0;
    } else if (typeof current_value === "number" && typeof new_task.t !== "number") {
      return `TaskScheduler: '${label}' is a number, got ${typeof new_task.t}`;
    } else {
      new_task.type = 1;
    }

    this._tasks[id] = new_task;
    return null;
  }

  // unique task id (a random id could collide and overwrite a pending task)
  _new_id() {
    this._id_counter = (this._id_counter ?? 0) + 1;
    return "task_" + this._id_counter;
  }

  /**
   * Advances internal timers based on the modeling timestep and executes ready tasks.
   */
  run_tasks() {
    if (this._task_interval_counter > this._task_interval) {
      // reset the counter
      this._task_interval_counter = 0.0;

      // run the tasks
      for (const id in this._tasks) {
        const task = this._tasks[id];
        let remove_task = false;

        // check if the task should be executed
        if (task.at < this._task_interval && !task.running) {
          task.at = 0;
          
          switch (task.type) {
            case 0:
              // start the tween from the property's value NOW
              task.current_value = task.prop2 === null ? task.model[task.prop1] : task.model[task.prop1][task.prop2];
              task.stepsize = (task.t - task.current_value) / (task.it / this._task_interval);
              task.running = true;
              break
            case 1:
              // boolean or string type
              task.current_value = task.t;
              this._set_value(task);
              task.completed = true;
              remove_task = true;
              break;
            case 2:
              {
                const m = this._model_engine.models[task.model];
                if (typeof m?.[task.func] === "function") m[task.func].apply(m, task.args ?? []);
              }
              task.completed = true;
              remove_task = true;
              break;
          }

        } else {
          // decrease the time remaining
          task.at -= this._task_interval;
        }

        // for numerical tasks, adjust the value incrementally
        if (task.type < 1 && task.running) {
          if (Math.abs(task.current_value - task.t) <= Math.abs(task.stepsize)) {
            task.current_value = task.t;
            this._set_value(task);
            task.stepsize = 0;
            task.completed = true;
            remove_task = true;
          } else {
            task.current_value += task.stepsize;
            this._set_value(task);
          }
        }

        if (remove_task) {
          delete this._tasks[id];
        }
      }
    }

    if (this.is_enabled) {
      this._task_interval_counter += this._t;
    }
  }

  /**
   * Writes the task's current value to the target model property.
   * @param {Object} task Resolved task descriptor.
   * @private
   */
  _set_value(task) {
    if (task.prop2 === null) {
      task.model[task.prop1] = task.current_value;
    } else {
      task.model[task.prop1][task.prop2] = task.current_value;
    }
  }
}
