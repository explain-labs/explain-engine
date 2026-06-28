# Explain Model (`src/explain`)

This folder contains the in-browser physiological simulation engine used by the web app.
The model runs in a dedicated Web Worker (`ModelEngine.js`) and is controlled from the main thread through the `Model` wrapper (`Model.js`).

## High-level architecture


## Runtime lifecycle

1. UI constructs `new Model()` (see `src/composables/useExplain.ts`).
2. `Model` creates a worker from `ModelEngine.js`.
3. UI calls `build()` or `load(<definition_name>)`.
4. Worker `build()`:
   - copies top-level model settings,
   - instantiates each model component by `model_type` via `ModelIndex`,
   - calls `init_model(args)` on each component,
   - creates `DataCollector` and `TaskScheduler`.
5. UI can run:
   - **batch simulation** via `calculate(seconds)`, or
   - **real-time simulation** via `start()` / `stop()`.
6. Worker sends state/data/status events back to main thread.

## Worker message protocol

`Model` and `ModelEngine` communicate with message objects:

```js
{
  type: "GET" | "PUT" | "POST" | "DELETE",
  message: string,
  payload: any
}
```

### Inbound commands to worker (`ModelEngine`)


### Outbound events from worker

Important worker event types handled in `Model.receive()`:


These are re-emitted as `CustomEvent`s on `document` by `Model`.

## Public API (`Model.js`)

Core methods used by UI code:


## Data collection and scheduling

### `DataCollector`

  - `watch_list` (fast stream)
  - `watch_list_slow` (slow stream)

### `TaskScheduler`


## Model class contract

Most classes extend `BaseModelClass` and follow this pattern:

  - `model_type` (string identifier used at build time)
  - constructor defines independent/dependent/local fields
  - `init_model(args)` applies config and sets `_is_initialized`
  - `step_model()` checks `is_enabled && _is_initialized`
  - `calc_model()` performs actual calculations

The engine is pure physics: model classes carry **no UI metadata**. The
parameter-editing schema (formerly a `static model_interface` array on each
class) now lives in the UI layer at `src/model-interface/`, keyed by
`model_type`. The engine neither stores nor transports it.

## Composite model behavior

Some component models create additional internal models in `init_model`.

Example: `MicroVascularUnit` creates and configures internal `BloodVessel` components (arteriole/capillary/venule), then registers them in the engine model map. This allows a higher-level model to encapsulate a local network while still participating in global stepping.

## Adding a new model type

1. Create a class in `base_models/`, `component_models/`, or `device_models/`.
2. Extend `BaseModelClass` (or match required engine contract).
3. Define static `model_type`.
4. Implement `init_model` and/or `calc_model` as needed.
5. Export it from `ModelIndex.js`.
6. Reference the new `model_type` in model definition JSON.
7. If the parameters should be editable in the app, add a `model_type` entry to
   the UI schema at `src/model-interface/registry.ts`.

## Minimal usage example

```js
// In Vue components, get the engine wrapper from the composable:
import { useExplain } from "src/composables/useExplain";
const explain = useExplain().model; // the singleton Model instance

// Build from object (or call explain.load("definition_name"))
explain.build(modelDefinition);

// Observe selected variables
explain.watchModelProps([
  "Heart.heart_rate",
  "Heart.lv_sv",
  "Ventilator.vent_rate"
]);

// Run realtime
explain.start();

// Later...
explain.stop();
```

## Notes and caveats

## Student onboarding manual

### 1. Running the model

1. Start the Vite dev server (`npm run dev`) from this directory (Vue 3 + Vite + TypeScript app; production build via `npm run build`).
2. The explain engine bootstraps via `src/composables/useExplain.ts`, a singleton that instantiates `Model` (imported as `@explain/Model`) and loads the default definition.
3. Use UI buttons or call the engine wrapper returned by `useExplain()` (`model`) to `build`, `load`, `start`, `stop`, or `calculate(seconds)`.
4. Place custom definitions under `public/model_definitions` and run `explain.load("definition_name")` (omit `.json`).

### 2. Observing & tweaking data

- Fast telemetry: `explain.watchModelProps(["Heart.heart_rate", "Ventilator.peep"])`.
- Change parameters with easing: `explain.setPropValue("Ventilator.peep", 10, 5 /* seconds */, 0 /* delay */)`.
- Trigger functions: `explain.callModelFunction("Heart.resetBaro", [], 0.25)`.

### 3. Adding models

**Base models** (`src/explain/base_models`)
- Extend `BaseModelClass`, export static `model_type` + `model_interface`.
- Implement `init_model(config)` and `calc_model()`/`step_model()`.
- Import/export the class in `ModelIndex.js`.

**Component models** (`src/explain/component_models`)
- Compose multiple base models or encapsulate subsystems.
- Register internally created models on the engine `models` map so schedulers and collectors can target them.

**Device models** (`src/explain/device_models`)
- Represent external hardware; validate dependencies (e.g., lungs) in `init_model` and emit clear errors if missing.

**Helpers** (`src/explain/helpers`)
- Instantiate new helpers inside `ModelEngine` and keep their state serializable (strip private fields in `_processModelState`).

### 4. Editing definitions

1. Definitions live in `public/model_definitions/*.json`.
2. Each entry contains `{ name, model_type, settings, inputs }`.
3. Example block:

```json
{
  "name": "MyDevice",
  "model_type": "MyDevice",
  "settings": { "pressure": 18 },
  "inputs": { "Lung": "Lung" }
}
```

4. Reload via `explain.load("my_definition")` or rebuild in place with `explain.restart()`.

### 5. Debugging checklist

- Watch worker traffic in DevTools (console logs prefixed with `Model:`).
- Hook events: `document.addEventListener("status", (evt) => console.log(evt.detail))`.
- Snapshot: `explain.getModelState()`; inspect the payload emitted by the worker.
- Missing models usually mean `model_type` typos or missing exports in `ModelIndex`.

### 6. Cleanup

- When done (component unmount, hot reload), call `explain.dispose()` to terminate the worker and drop listeners.

