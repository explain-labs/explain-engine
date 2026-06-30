# Explain Engine — Architecture

This is the **architecture entry point** for the Explain physiological simulation engine. Read it first if you are extending the engine; the 50+ per-class docs in this directory (e.g. [`BloodCapacitance.md`](./BloodCapacitance.md), [`Heart.md`](./Heart.md), [`Resistor.md`](./Resistor.md)) describe individual models and assume the cross-cutting patterns documented here.

The engine is a set of **framework-agnostic ES modules** that run inside a **Web Worker**. It has no dependency on Vue, the DOM, or the `window` object — the only thing crossing into it is the message protocol described below. The Vue app is just one possible host; the engine also runs headless in Node (see [`TESTING.md`](./TESTING.md)). Per-model parameter-edit metadata is **not** in the engine — it lives in the UI layer (`src/model-interface/`).

The scenario files the engine loads are documented separately in [`MODEL_DEFINITIONS.md`](./MODEL_DEFINITIONS.md); this doc covers how they are *consumed*.

---

## 1. Two-thread design

Two files, two threads, one wire protocol:

| File | Thread | Owns |
|---|---|---|
| [`Model.js`](../Model.js) | main thread | Public API surface, message send/receive, event re-emit. Extends `ModelEmitter` (pub/sub). |
| [`ModelEngine.js`](../ModelEngine.js) | Web Worker | The live `model` object, the build flow, the step loop, the message router. |

`Model.js`'s constructor spawns the worker with

```js
this.modelEngine = new Worker(new URL("./ModelEngine.js", import.meta.url), { type: "module" });
```

and immediately calls `this.receive()` so no early worker messages are missed. A separate `onerror` handler catches worker-level failures (syntax/import errors) and re-emits them as an `error` event.

**The live model lives only in the worker.** `ModelEngine.js` holds a module-scope `let model = { models: {}, … }`. The main thread never has a reference to it — it only receives serialized snapshots (`state` messages) and sampled data. `Model.js` keeps shadow copies (`modelState`, `modelData`, `modelDataSlow`, `savedState`) for UI consumption, but those are read-only echoes.

---

## 2. Message protocol

Every message in both directions is the same envelope:

```js
{ type: "GET" | "PUT" | "POST" | "DELETE", message: string, payload: any }
```

`Model.send(msg)` does `modelEngine.postMessage(msg)`; the worker replies via `postMessage` (wrapped as `_send`/`_send_error`). The worker router is the single `self.onmessage` switch in `ModelEngine.js`, dispatching first on `type`, then on `message`. The whole handler is wrapped in a try/catch that emits an `error` on any unhandled throw.

### Inbound commands (handled in the worker router)

| type | message | Handler |
|---|---|---|
| GET | `state` | `get_model_state()` |
| GET | `data` | `get_model_data()` |
| GET | `data_slow` | `get_model_data_slow()` |
| GET | `property_value` | `get_property(payload)` |
| GET | `model_props` | `get_model_props(payload)` |
| GET | `model_types` | `get_model_types()` |
| GET | `blood_composition` | `get_blood_composition(payload)` |
| PUT | `sample_interval` | `DataCollector.set_sample_interval(payload)` |
| PUT | `sample_interval_slow` | `DataCollector.set_sample_interval_slow(payload)` |
| PUT | `property_value` | `set_property(_normalize_payload(payload))` → TaskScheduler |
| PUT | `diagram_definition` | `update_diagram(...)` (live anim rebind, no rebuild) |
| POST | `build` | `build(_normalize_payload(payload))` |
| POST | `start` | `start()` |
| POST | `stop` | `stop()` |
| POST | `calc` | `calculate(payload)` |
| POST | `call` | `call_function(_normalize_payload(payload))` → TaskScheduler |
| POST | `add` | `add_model_to_engine(payload)` |
| POST | `save` | `save_state()` |
| POST | `scale` | `scale_model(payload)` |
| POST | `calibrate` | `tune_model(_normalize_payload(payload))` |
| POST | `watch` | `watch_props(payload)` |
| POST | `watch_slow` | `watch_props_slow(payload)` |
| DELETE | `remove` | `remove_model_from_engine(payload)` |
| DELETE | `watchlist` | `clear_watchlist()` |
| DELETE | `watchlist_slow` | `clear_watchlist_slow()` |

### Outbound events (mapped by `Model.receive()`)

The worker's outbound `type` strings are translated to `ModelEmitter` events you subscribe to with `explain.on(event, handler)`:

| Inbound `type` | Emitted event | Side effect on `Model.js` |
|---|---|---|
| `state` | `state` | stores `modelState` |
| `status` | `status` | stores `statusMessage` |
| `model_ready` | `model_ready` | (build succeeded) |
| `rt_start` | `rt_start` | — |
| `rt_stop` | `rt_stop` | — |
| `data` | `data` | stores `modelData` |
| `data_slow` | `data_slow` | stores `modelDataSlow` |
| `rtf` | `rtf` | stores `modelData` (realtime fast) |
| `rts` | `rts` | stores `modelDataSlow` (realtime slow) |
| `prop_value` | `prop_value` | — |
| `model_props` | `model_props` | — |
| `model_types` | `model_types` | — |
| `state_saved` | `state_saved` | stores sanitized `savedState` |
| `tuned` | `tuned` | stores `tuneResult` (`{converged, residuals, iters}`) |
| `error` | `error` | stores `error_message` |
| `RT_MSG.CHANNELS` / `CHART` / `ANIM` | — | consumed by the realtime data plane ([RealtimeBus](./RealtimeBus.md)), ignored by `receive()` |

**JSON boundary.** Payloads that are structured objects are JSON-stringified at the send site and re-parsed in the worker by `_normalize_payload` (a `JSON.parse` only when the payload is a string). This applies to `build`, `property_value` (PUT), `call`, `calibrate`, and `diagram_definition`. Simpler payloads (`scale`'s `{group, factor}`, `watch`'s string array, `calc`'s integer) are passed as plain structured-clone objects. State snapshots and sampled data flow back as plain objects via `postMessage` (structured clone), not stringified.

### Event emitter (`ModelEmitter`)

`Model` extends [`ModelEmitter`](../ModelEmitter.js) — a deliberately minimal pub/sub base class (no dependencies, **no `once`, no wildcards, no per-callback error guarding**):

| Method | Behaviour |
|---|---|
| `on(event, callback)` | Lazily creates the listener `Set` for `event` and adds `callback`. No unsubscribe handle is returned. |
| `off(event, callback)` | Removes `callback`; drops the map entry when its set empties. |
| `emit(event, ...args)` | Calls every callback registered for `event` with the spread args. |

Listeners are stored in an instance field `_listeners: Map<string, Set<Function>>`. `Model`'s worker `onmessage` handler maps each inbound worker `type` to an `emit(...)` (the table above), so host code subscribes purely with `explain.on(event, handler)`. The three `RT_MSG.*` data-plane types are **not** emitted here — they are consumed by [RealtimeBus](./RealtimeBus.md) on a second worker listener (see §10).

---

## 3. Public API (`Model.js`)

| Method | What it does |
|---|---|
| `load(definition_name)` | Fetches `/model_definitions/<name>.json`, unwraps `jsonData.model_definition \|\| jsonData`, forwards `diagram_definition`/`animation_definition`, then calls `build`. |
| `build(explain_definition)` | POST `build` with the stringified definition. |
| `restart()` | Re-POST `build` with the last `modelDefinition` snapshot. |
| `updateDiagram(diagram_definition)` | PUT `diagram_definition` — live sprite-anim rebind, no model rebuild. |
| `calculate(seconds)` | POST `calc` — synchronous offline run for `seconds` of sim time. |
| `start()` / `stop()` | POST `start` / `stop` — toggle the realtime `setInterval` loop. |
| `dispose()` | Detach `onmessage` and `terminate()` the worker (call on unmount/HMR). |
| `watchModelProps(args)` / `watchModelPropsSlow(args)` | POST `watch` / `watch_slow` with dot-path string(s) `"Model.prop[.subprop]"`. |
| `clearWatchList()` / `clearWatchListSlow()` | DELETE the fast / slow watchlist. |
| `getModelData()` / `getModelDataSlow()` | GET a one-shot data snapshot. |
| `setSampleInterval(s)` / `setSampleIntervalSlow(s)` | PUT new sampler intervals. |
| `getModelState()` | GET the full serialized engine `model`. |
| `saveModelState()` | POST `save` → `state_saved` event (sanitized snapshot). |
| `getModelProps(model_name)` | GET metadata for one instance. |
| `getModelTypes()` | GET the catalog of registered `model_type`s. |
| `getBloodComposition(model_name)` | GET — run `calc_blood_composition` on one instance. |
| `addNewModel(model_args)` / `deleteModel(model_name)` | POST `add` / DELETE `remove` an instance at runtime. |
| `getPropValue(property)` | GET the current value at a dot path. |
| `setPropValue(prop, value, it=1, at=0)` | PUT a scheduled property change. Splits `prop` into `model.prop1[.prop2]`; numeric targets **tween** over `it` s after an `at` s delay, others swap. |
| `callModelFunction(fn, args, at=0)` | POST `call` — schedule a method call after `at` s. |
| `scaleModel(group, factor=1.0)` | POST `scale` — allometric/manual scaling via ModelScaler. |
| `tune(targets, opts={})` | POST `calibrate` — live closed-loop tuning to target vitals; emits `tuned`. |

---

## 4. Build flow (`ModelEngine.build()`)

`build(model_definition)` runs synchronously and returns a boolean (`model_initialized`). Ordered steps:

1. **Reset.** `errors = 0`; `model_initialized = false`; clear `model_data`/`model_data_slow`; `clearInterval(rtClock)`.
2. **Fresh `model` object** with empty `models: {}`, empty `scaler_config`, and the six `ncc_*` counters zeroed (`ncc_atrial`, `ncc_ventricular`, `ncc_breathing_insp`, `ncc_breathing_exp`, `ncc_ventilator_insp`, `ncc_ventilator_exp`).
3. **Copy engine-level settings.** Every top-level key of the definition except `models` is copied onto `model` (`weight`, `modeling_stepsize`, `model_time_total`, `scaler_config`, …).
4. **Instantiate.** For each entry in `model_definition.models`, look up the class by `sub_model_def.model_type` in `available_model_map`. If found, `new model_class(model, name, model_type)` and store on `model.models[name]`. A missing type or a constructor throw increments `errors` and emits a `status` `ERROR:` message. (The constructor's 3rd `model_type` arg is ignored by the base class.)
5. **Initialize (only if `errors < 1`).** For each instance, build `args` as a `[{key, value}, …]` list from the definition entry and call `init_model(args)`. An init throw increments `errors` and emits a `status` `ERROR:`.
6. **Attach helpers.** `model.DataCollector = new DataCollector(model)`, `model.TaskScheduler = new TaskScheduler(model)`, `model.ModelScaler = new ModelScaler(model, model.scaler_config)`.
7. **Freeze baseline weight.** `model._baseline_weight = model.weight` (the allometric anchor `reset()`/`scale_to_weight()` use).
8. **Wire the realtime data plane.** Construct `ChannelWriter` and `AnimationPacker`, acquire the anim snapshot, and `DataCollector.set_channels(...)`. Failures here are caught and degrade to the legacy object path (they do **not** fail the build).
9. **Emit.** If `errors > 0`: `status` `ERROR: model build failed` and return `false`. Otherwise emit `model_ready` and return `true`.

Note the two-pass structure: **all** instances are constructed before **any** are initialized. This is what lets `init_model` resolve cross-model references (`this._lv = this._model_engine.models["LV"]`) — every sibling already exists by the time init runs.

---

## 5. Step loop

`_model_step()` is the single time step:

1. For each model in `model.models` **in insertion order**, call `step_model()`. When `ENABLE_STEP_ERROR_GUARD` (currently `true`) each call is wrapped in try/catch and a throw emits an `error` event but does not abort the loop — one bad model can't kill the simulation.
2. `DataCollector.collect_data(model.model_time_total)`.
3. `TaskScheduler.run_tasks()`.
4. `model.model_time_total += model.modeling_stepsize`.

Two ways to drive it:

- **`calculate(seconds)`** — synchronous offline run of `seconds / model.modeling_stepsize` steps in a tight `for` loop, then emits one `data`/`data_slow`/`state` snapshot and reports timing via `status`. The chart ring is bypassed (object data path).
- **`start()` → `_model_step_rt`** — `setInterval(_model_step_rt, rtInterval * 1000)` with `rtInterval = 0.015` s wall clock. Each tick runs `rtInterval / modeling_stepsize` model steps, then either writes typed chart rows + packs the animation frame through `ChannelWriter`/`AnimationPacker` (fast path) or falls back to the `rtf` object message. Slow data (`rts`) is emitted once per `rtSlowInterval = 1.0` s. A throw inside the realtime loop clears the interval and emits `rt_stop` so it fails safe. `stop()` clears the interval and flips `DataCollector.rt_active = false`.

---

## 6. The model-class contract

Every model lives in `base_models/`, `component_models/`, or `device_models/` and extends [`BaseModelClass`](./BaseModelClass.md) (directly or through an intermediate like `Capacitance`/`Resistor`/`TimeVaryingElastance`).

- **`static model_type`** — the string key used in `available_model_map` and in definition JSON. Model classes carry **no UI metadata**; the edit schema lives in `src/model-interface/registry.ts`.
- **`constructor(model_ref, name = "")`** — `model_ref` is the whole engine `model` object; the base stores it as `this._model_engine` and caches `this._t = model_ref.modeling_stepsize`. Initialize independent props (config), dependent props (computed outputs), and `_`-prefixed local refs here. (`build()` passes a 3rd `model_type` arg the base ignores.)
- **`init_model(args)`** — base impl maps each `{key, value}` in `args` onto `this[key]`, then instantiates and inits anything declared in `this.components` (registering each on `model.models`), and finally sets `this._is_initialized = true`. Override to resolve cross-model references, then call/replicate the base behaviour.
- **`step_model()`** — base impl runs `calc_model()` only when `is_enabled && _is_initialized`. Don't override unless you need custom gating.
- **`calc_model()`** — where the physics happens. Override this.

---

## 7. Cross-cutting patterns

These are documented once here; per-class docs should link back rather than restate them.

### 7a. The factor / effective-value pattern

Core physics params are never used raw. Each tunable has a base value plus three multiplier layers combined **additively** against the base into an `*_eff` (or `*_step`) value:

| Layer | Persistence | Set by |
|---|---|---|
| `<p>_factor` | **non-persistent** — reset to `1.0` at the end of each step | transient interventions (TaskScheduler type-0 tween targets, per-step effects) |
| `<p>_factor_ps` | **persistent** | user/scenario adjustments |
| scaling layer | **persistent** | `ModelScaler` only |

The formula (see `Capacitance.calc_elastances` / `Resistor.calc_resistance`):

```
p_eff = p + (factor-1)*p + (factor_ps-1)*p + (factor_scaling-1)*p
```

When adding a tunable param, follow this convention so it composes with interventions and scaling.

**⚠️ The scaling-layer suffix is NOT uniform across the engine.** Verify before you copy:

- The **capacitance / resistor / time-varying-elastance** family uses **`*_factor_scaling_ps`** (e.g. `el_base_factor_scaling_ps`, `u_vol_factor_scaling_ps`, `r_factor_scaling_ps` in [`Capacitance.js`](../base_models/Capacitance.js) / [`Resistor.js`](../base_models/Resistor.js)).
- The **diffusor / exchanger** family uses **`*_factor_scaling`** with **no `_ps`** (e.g. `dif_o2_factor_scaling`, `dif_co2_factor_scaling` in [`GasDiffusor.js`](../base_models/GasDiffusor.js); likewise `GasExchanger`, `BloodDiffusor`).

If you scale a diffusor through the `*_scaling_ps` name it will silently do nothing.

### 7b. `ncc_*` cycle counters live on the engine `model` object

The cardiac/breathing/ventilator timing counters are **not** component fields — they are initialized on `model` in `build()`: `model.ncc_atrial`, `model.ncc_ventricular`, `model.ncc_breathing_insp`, `model.ncc_breathing_exp`, `model.ncc_ventilator_insp`, `model.ncc_ventilator_exp`. The `Heart`, `Breathing`, and `Ventilator` models read/advance them through `this._model_engine`. The `DataCollector` **always** watches `Heart.ncc_ventricular` and `Heart.ncc_atrial` (pushed onto the watchlist in its constructor and on reset) so the ECG is available regardless of the user watchlist.

### 7c. Blood/gas composition propagation

There is no global solver moving solutes around — composition rides the flow. `Resistor.calc_flow` moves volume by calling `comp_from.volume_out(flow*dt)` then `comp_to.volume_in(...)`. `BloodCapacitance.volume_in(dvol, comp_from)` mixes the incoming substances by the incoming volume fraction:

```
concentration += ((concentration_from - concentration) * dvol) / vol
```

applied to `to2`, `tco2`, every entry in `solutes` and `drugs`, plus `temp` and `viscosity` (treated as solutes). This dilution is how blood gases, solutes, drugs, and temperature propagate through the circuit. Gas compartments propagate analogously through `GasDiffusor`/`GasExchanger` partial-pressure-driven diffusion. See [`BloodCapacitance.md`](./BloodCapacitance.md).

### 7d. ModelScaler touches only the scaling layer

[`ModelScaler`](./ModelScaler.md) writes **only** the `*_factor_scaling_ps` layer (and direct volume adjustments) — never the base param or the `_ps` user layer — so allometric scaling composes cleanly with user/scenario adjustments. `scaleModel(group, factor)` routes through the big `switch` in `ModelEngine.scale_model` to the many `scale_*` methods (`scale_blood_volume`, `scale_systemic_resistances`, `scale_to_weight`, …). `reset` calls `ModelScaler.reset()` and restores `model.weight = model._baseline_weight`.

---

## 8. How to add a new model

1. **Create the class** in `base_models/`, `component_models/`, or `device_models/`, extending `BaseModelClass` (or a suitable intermediate).
2. **Give it a `static model_type`** string — the key used at build and in definition JSON.
3. **Implement `init_model(args)`** (resolve cross-model refs, set `_is_initialized`) and **`calc_model()`** (the physics).
4. **Follow the factor convention** (§7a) for any tunable param so it composes with interventions and scaling — and use the **correct scaling suffix** for the family you're modelling.
5. **Export it from [`ModelIndex.js`](../ModelIndex.js).** The engine builds `available_model_map` from everything `ModelIndex` exports. **Forgetting this export is the usual cause of "model type not found" at build.**
6. **Reference the `model_type`** in your `model_definitions/*.json` `models` map.
7. **Add a `model_type` entry to `src/model-interface/registry.ts`** so the parameters become editable in the app (the engine ships no UI metadata).
8. **Write a doc** in `explain/docs/` following the template in §10.

---

## 9. The house doc template

Every per-class doc in `explain/docs/` should follow this structure (the canonical exemplar is [`BloodCapacitance.md`](./BloodCapacitance.md)):

1. **Title + one-paragraph summary** — what the model is, in plain terms.
2. **Inheritance** — an ASCII tree showing the chain up to `BaseModelClass`, and which classes extend this one.
3. **What it models** — the physiological/engineering role.
4. **Properties** — tables split into inherited vs. unique, with `Property | Unit | Description` columns. Mark sentinel values (e.g. `-1 = not calculated`).
5. **Calc / math sections** — the equations and the order `calc_model()` runs them, referencing the actual method names.
6. **Factor system** — the three-tier table for this model's tunables (link to §7a here rather than re-deriving it).
7. **Example definition (JSON)** — a real, minimal `models` entry.
8. **Usage in the model** — how it's wired into scenarios and which models reference it.

---

## 10. Helpers

One line each; follow the link for detail.

- **[DataCollector](./DataCollector.md)** — fast (`watch_list`, default `sample_interval` 0.005 s) and slow (`watch_list_slow`, 1.0 s) watchlists of dot-path props; `collect_data()` buffers, `get_model_data()` drains, `clean_up()` drops disabled-model entries. Always watches `Heart.ncc_*`.
- **[TaskScheduler](./TaskScheduler.md)** — deferred mutations every `_task_interval` (0.015 s): numeric tweens (type 0), instant boolean/string swaps (type 1), scheduled method calls (type 2). Writes directly to model props (usually a `*_factor_ps` or base param).
- **[ModelScaler](./ModelScaler.md)** — allometric/manual scaling; touches only the `*_factor_scaling_ps` layer; routed via `ModelEngine.scale_model`.
- **[Calibrator](./Calibrator.md)** — shared closed-loop secant calibration (`buildLiveControllers`/`runCalibration`/`measureWindow`); backs both offline patient-building and the live `tune_model` path.
- **[ChannelWriter](./ChannelWriter.md)** — typed realtime data-plane writer (chart ring + anim snapshot); flushed each realtime tick.
- **[RealtimeChannels](./RealtimeChannels.md)** — the `RT_MSG` message constants and channel/transport descriptors for the typed data plane.
- **[AnimationPacker](./AnimationPacker.md)** — builds the component→slot registry and packs per-frame sprite animation data from the live model.
- **[RealTimeMovingAverage](./RealTimeMovingAverage.md)** — moving-average helper used for smoothing realtime-derived signals.

### Realtime read side (`explain/realtime/`, main thread)

The mirror of the `ChannelWriter`/`AnimationPacker` write side, running on the **main thread** — separate from the control-plane `ModelEmitter` events:

- **[RealtimeBus](./RealtimeBus.md)** — single `requestAnimationFrame` loop that drains a `ChannelReader` and pushes frames to renderer adapters (`onRegistry`/`onFrame`). Listens on a **second** worker `message` listener for the `RT_MSG.*` types that `Model.receive()` ignores.
- **[ChannelReader](./ChannelReader.md)** — decodes the shared-memory (`Atomics`/seqlock) or transferable transport; `drainChart()` returns every new row in order, `readAnim()` returns the latest frame only.

## 11. Other references

- **[MODEL_DEFINITIONS](./MODEL_DEFINITIONS.md)** — the scenario / model-definition JSON format (the file `load()` consumes).
- **[TESTING](./TESTING.md)** — running the engine headlessly in Node (the harness + `probe_*` scripts).
- **[README](./README.md)** — the full per-class documentation index.
