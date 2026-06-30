# Model definitions (scenario files)

A scenario file is a single JSON document that describes one complete patient/experiment: the engine settings, every model instance with its parameters and current state, plus the UI metadata (diagram, animation, saved tabs/presets). They live in `public/model_definitions/*.json` and are served statically. `Model.load(name)` fetches `/model_definitions/<name>.json`, unwraps it, and hands the result to `build()`. The set of available scenarios is `public/model_definitions/index.json` — a flat JSON array of filename **stems** (no `.json`), each of which is a valid argument to `Model.load(name)`.

> The canonical, served copies are under `public/model_definitions/`. `explain/model_definitions/` and `explain/states/` hold separate dev copies; edit the served set unless you know you want the dev mirror.

## Top-level keys

Only `model_definition` (plus the diagram/animation blocks consumed by the worker `AnimationPacker`) reaches the engine. Everything else is UI/metadata that the Vue layer and stores read off `model.loadedFileData`.

| Key | Type | Consumed by | Meaning |
|---|---|---|---|
| `name` | string | UI / store | Scenario display name (`loadedFileData.name`). Not used by the engine. |
| `user` | string | metadata | Author tag. Not used by the engine. |
| `description` | string | metadata | Free-text description. Not used by the engine. |
| `diagram_definition` | object | worker (`AnimationPacker`) | Sprite-diagram layout `{ settings, components }`. Back-filled into `model_definition` by `load()` (see below). |
| `animation_definition` | object | worker (`AnimationPacker`) | Animation layout `{ settings, components }`. Back-filled into `model_definition` by `load()`. |
| `configuration` | object | UI / stores only | Dashboard state (tabs, presets, monitors, controllers, optional `events`). The engine **never** reads this in `build()`. |
| `model_definition` | object | **engine** (`build`) | The only block the engine instantiates from. See below. |

`Model.load()` does the unwrap and back-fill:

```js
const definition = jsonData.model_definition || jsonData;          // unwrap
if (jsonData.diagram_definition && definition.diagram_definition === undefined)
  definition.diagram_definition = jsonData.diagram_definition;     // back-fill only if nested key absent
if (jsonData.animation_definition && definition.animation_definition === undefined)
  definition.animation_definition = jsonData.animation_definition;
this.build(definition);
```

So a scenario may hold the diagram/animation either at the top level **or** nested inside `model_definition`; the top-level copy is only used when the nested key is `undefined`. (The save path keeps the diagram/animation at the top level and strips the nested duplicate so an edit isn't shadowed — see `_processModelState`.)

## The `model_definition` block

This is the object the engine builds from. `build()` copies every key **except `models`** straight onto the live engine `model` object, then instantiates and initializes the `models` map.

| Key | Type | Meaning |
|---|---|---|
| `weight` | number (kg) | Patient weight. Frozen at build into `model._baseline_weight` (the allometric anchor for `reset()` / `scale_to_weight()`). |
| `height` | number (m) | Patient height. Engine-stored; used by models that need it. |
| `gestational_age` | number (weeks) | Gestational age. |
| `age` | number | Postnatal age. |
| `modeling_stepsize` | number (s) | Integration step. `calculate(sec)` runs `sec / modeling_stepsize` steps; the realtime loop batches `rtInterval / modeling_stepsize` steps per tick. |
| `model_time_total` | number (s) | Accumulated simulation time. **Non-zero in saved scenarios** — the file is a mid-run snapshot, not a fresh state (see below). |
| `_baseline_weight` | number (kg) | Persisted allometric baseline. Note `build()` overwrites this from `weight` regardless, so the two normally match. |
| `scaler_config` | object | Named lists of component names per scaling group, read by `ModelScaler`. See [`scaler_config`](#scaler_config). |
| `models` | object | `name → entry` map of every model instance. The heart of the file. See below. |
| `diagram_definition` | object | Optional nested copy of the sprite diagram (else back-filled from top level). |
| `animation_definition` | object | Optional nested copy of the animation layout (else back-filled from top level). |

## `models` entry shape

`models` is a map keyed by instance name. Each entry is one model instance. The reference `term_neonate.json` has 68 top-level entries (1 each of the high-level systems — `Heart`, `Breathing`, `Ans`, `Circulation`, `Respiration`, `Blood`, `Gas`, `Metabolism`, `Pda`, `Shunts`, devices, …) plus 43 `Resistor` entries wiring compartments together. Composite models (e.g. `Circulation`) carry their own sub-network under `components`.

### Envelope keys (every entry)

| Key | Type | Meaning |
|---|---|---|
| `name` | string | Instance key. Must match its key in the `models` map; used for `comp_from`/`comp_to` wiring. |
| `model_type` | string | Class selector. Looked up in `available_model_map` (built from everything `ModelIndex.js` exports). A missing type aborts the build (see below). |
| `is_enabled` | boolean | Gate for `step_model()` — a disabled model does not compute. |
| `components` | object | Optional sub-models a composite owns; base `init_model` instantiates each into `model.models` and inits it. `{}` when none. |

Everything else in an entry is the model's own config and **state**.

### The three multiplier layers

Core physics params (`el_base`, `u_vol`, `el_k`, `r_for`, `r_back`, `r_k`, …) carry three multiplier layers that combine additively against the base into an `*_eff` value (see `Capacitance.calc_elastances` / `Resistor.calc_resistance`):

| Suffix | Persistence | Written by |
|---|---|---|
| `<p>_factor` | non-persistent — reset to `1.0` every step | transient interventions |
| `<p>_factor_ps` | persistent across steps | user / scenario / event adjustments |
| `<p>_factor_scaling_ps` | persistent | **only** `ModelScaler` (allometric/manual scaling) |

`p_eff = p + (factor-1)*p + (factor_ps-1)*p + (factor_scaling_ps-1)*p`.

### Entries are full state snapshots, not pure config

This is the most important thing to understand about the format. A `models` entry is **not** a clean config block — it is a serialized dump of the live object, including computed outputs: `*_eff` effective values, `vol`, `pres`/`pres_in`/`pres_tm`, `flow`/`flow_forward`/`flow_backward`, and the full blood composition (`to2`, `tco2`, `ph`, `pco2`, `po2`, `so2`, `hco3`, `be`, `solutes`, `drugs`, `temp`, `viscosity`). `init_model` re-seeds these computed fields straight from the entry, which is why `model_time_total` is non-zero and a loaded scenario **resumes mid-run** at a settled steady state rather than starting from a transient. Authoring a scenario by hand means setting these consistently (or accepting a startup transient); the normal workflow is to let the engine settle, then save the snapshot.

### Example — a `Resistor` entry (verbatim from `term_neonate.json`)

```json
{
  "name": "PA_PAAL",
  "description": "input connector for PAAL",
  "is_enabled": true,
  "model_type": "Resistor",
  "components": {},
  "r_for": 1493.6012345069396,
  "r_back": 1493.6012345069396,
  "r_k": 0,
  "comp_from": "PA",
  "comp_to": "PAAL",
  "no_flow": false,
  "no_back_flow": false,
  "p1_ext": 0,
  "p2_ext": 0,
  "fixed_composition": false,
  "is_externally_managed": false,
  "r_factor": 1,
  "r_k_factor": 1,
  "r_factor_ps": 1,
  "r_k_factor_ps": 1,
  "r_factor_scaling_ps": 1,
  "r_k_factor_scaling_ps": 1,
  "flow": 0.007321647238428716,
  "r_for_eff": 1493.6013356657224,
  "r_back_eff": 1493.6013356657224,
  "r_k_eff": 0
}
```

`comp_from` / `comp_to` are the names of the compartments this resistor moves volume between; `flow` and the `*_eff` values are the snapshotted outputs. See [Resistor](./Resistor.md).

### Example — a blood compartment (abbreviated, `Circulation.components.AA`)

In `term_neonate.json` the blood compartments are `BloodVessel` (a `BloodCapacitance` subclass that adds resistance/flow) living inside `Circulation.components`; a standalone `BloodCapacitance` has the same capacitance + composition shape minus the resistor fields. Abbreviated:

```json
{
  "name": "AA",
  "description": "capacitance model of the ascending aorta",
  "is_enabled": true,
  "model_type": "BloodVessel",
  "u_vol": 0.0033,
  "el_base": 21000,
  "el_k": 0,
  "pres_ext": -2.418,
  "fixed_composition": false,

  "u_vol_factor": 1, "el_base_factor": 1, "el_k_factor": 1,
  "u_vol_factor_ps": 1, "el_base_factor_ps": 1, "el_k_factor_ps": 1,
  "u_vol_factor_scaling_ps": 1, "el_base_factor_scaling_ps": 1, "el_k_factor_scaling_ps": 1,

  "vol": 0.006732, "pres": 68.105, "pres_in": 70.524, "pres_tm": 72.942,
  "el_eff": 20547.20, "u_vol_eff": 0.0033, "el_k_eff": 0,

  "temp": 37, "viscosity": 6,
  "solutes": { "na": 138.13, "k": 3.47, "hemoglobin": 10.02, "...": "..." },
  "drugs": { "adrenaline": 0, "noradrenaline": 0 },
  "to2": 8.454, "tco2": 23.593, "ph": 7.361, "pco2": 39.84,
  "po2": 74.88, "so2": 96.92, "hco3": 22.30, "be": -3.07,

  "r_for": 55, "r_back": 55, "no_back_flow": true, "alpha": 0.5,
  "flow": 0, "r_for_eff": 52.654, "r_back_eff": 52.654
}
```

The `vol`/`pres*`/`*_eff` block and the gas/solute/drug block are the persisted computed state. See [BloodCapacitance](./BloodCapacitance.md).

## How the engine consumes it

The load → build path, in brief (full step-by-step in [ARCHITECTURE](./ARCHITECTURE.md)):

1. `Model.load(name)` fetches the JSON, unwraps `model_definition`, back-fills diagram/animation, and posts a `POST build` envelope (payload JSON-stringified) to the worker.
2. `ModelEngine.build()` resets the live `model` object (fresh `models: {}` and the `ncc_*` counters), then copies every `model_definition` key **except `models`** onto it.
3. For each entry in `models`, it looks the class up by `model_type` in `available_model_map` and instantiates `new Class(model, name, model_type)`.
4. It then calls `init_model(args)` on every instance, where `args = [{ key, value }, …]` is each entry's own key/value pairs.
5. It attaches the `DataCollector`, `TaskScheduler`, `ModelScaler` helpers, freezes `model._baseline_weight = model.weight`, and emits `model_ready`.

**Missing `model_type` → ERROR.** If `available_model_map[model_type]` is undefined (usually a class that was never `export`ed from `ModelIndex.js`), `build()` increments the error counter, emits a `status` message `"ERROR: <type> model not found"`, and aborts — no `model_ready`. An exception thrown from a constructor or `init_model` aborts the build the same way.

## `scaler_config`

`scaler_config` is engine-consumed, but only via `ModelScaler` — it is never read by `build()` itself beyond being copied onto the live `model`. Its shape is `group → { param → [componentNames] }` (or, for the container groups, `group → [componentNames]`). The group keys present in `term_neonate.json`:

```
blood, blood_pulmonary, blood_systemic,
heart, heart_left, heart_right,
lung, airway, left_lung, right_lung,
thorax, pericardium
```

Each group lists the component names that a given `scale_*` method touches, and the param sub-keys name which property gets scaled — e.g. `blood.volume`, `blood.el_base`, `blood.resistance`; `heart.el_min` / `heart.el_max`. `ModelScaler` writes **only** the `*_factor_scaling_ps` layer (`el_base_factor_scaling_ps`, `r_factor_scaling_ps`, `u_vol_factor_scaling_ps`, `el_min_/el_max_factor_scaling_ps`), except the volume groups which scale `vol`/`u_vol` directly. `scaleModel(group, factor)` in the API routes to these methods. See [ModelScaler](./ModelScaler.md).

## `configuration` and events

`configuration` is **UI/store-only state** — the engine never reads it in `build()`. In `term_neonate.json` it holds `diagram_speed`, `diagram_scale`, `chart_hires`, `default_tabs`, `tabs`, `presets`, `monitors`, `controllers`.

It may also carry an optional `configuration.events` array (absent in `term_neonate.json`). Events are named, reusable bundles of timed property changes. They reach the engine **only** indirectly: the events store mirrors `configuration.events` in memory and, when an event fires, pushes each change through `Model.setPropValue` / `callModelFunction`, which the engine's [TaskScheduler](./TaskScheduler.md) applies. The shapes (`src/stores/events.ts`):

```ts
interface ScheduledEvent {
  id: string;
  name: string;
  changes: EventChange[];
  fire_at: number | null;   // absolute model_time_total (s) for auto-fire
  armed: boolean;
}

interface EventChange {
  model: string;            // model instance name, e.g. "Heart"
  target: string;           // raw engine prop, e.g. "heart_rate"
  type: "number" | "boolean" | "list";
  value: number | boolean | string;  // RAW engine value (no display factor)
  it: number;               // ramp duration (s); ignored for boolean/list (applied instantly)
  at: number;               // delay (s) before the change starts
}
```

## `diagram_definition` / `animation_definition`

Both are `{ settings, components }` objects. `settings` holds canvas-level options (background, grid, scaling, `max_to2`, …); `components` maps each diagram element to its picto/sprite layout and the engine model name(s) it binds to. These are consumed worker-side by the `AnimationPacker`, which builds the typed sprite-data contract for the renderers. Full structure is documented in [AnimationPacker](./AnimationPacker.md).

## `index.json`

A flat JSON array of scenario filename stems, e.g.:

```json
["adult_female", "term_neonate", "term_fetus", "preterm_28wk", "..."]
```

Each entry `X` maps to `public/model_definitions/X.json` and is a valid argument to `Model.load("X")`. Add a scenario here to make it selectable in the app.
