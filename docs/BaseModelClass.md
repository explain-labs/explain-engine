# BaseModelClass

`BaseModelClass` is the abstract root every model in the engine extends. It defines the common
**lifecycle** (construct → init → step → calc) and the shared fields the engine relies on; subclasses
add the actual physics in `calc_model()`. It has **no `model_type`** of its own and is never
instantiated directly, and it carries **no factor system** — the factor / effective-value pattern is
introduced by the elastance/resistance subclasses ([`Capacitance`](./Capacitance.md),
[`Resistor`](./Resistor.md), [`TimeVaryingElastance`](./TimeVaryingElastance.md)).

## Inheritance

```
BaseModelClass                       (abstract root — lifecycle + shared fields)
  ├── Capacitance                        → BloodCapacitance → BloodVessel, GasCapacitance
  ├── Resistor                           → HeartValve
  ├── TimeVaryingElastance               → HeartChamber, BloodTimeVaryingElastance
  ├── Container
  └── … every component & device model (Heart, Breathing, Ans, Ventilator, …)
```

## What it models

Nothing physiological on its own — it is the contract that makes a class a "model" the engine can
build, step, collect from and scale. Every component lives in `explain/base_models/`,
`explain/component_models/`, or `explain/device_models/` and ultimately extends this class.

## Properties

### Shared fields (independent / config)

| Property | Description |
|---|---|
| `name` | Unique model name (its key in `model.models`) |
| `description` | Free-text description (documentation only) |
| `is_enabled` | When false the model is skipped in the step loop; defaults to `false` |
| `model_type` | The class key used at build time and in the definition JSON (set by subclasses) |
| `components` | Dictionary of sub-models this model owns (composite-model mechanism) |

### Local / internal fields

| Property | Description |
|---|---|
| `_model_engine` | Reference to the whole engine `model` object (shared state, counters, other models) |
| `_t` | The modeling step size, **captured at construction** from `model_engine.modeling_stepsize` |
| `_is_initialized` | Set `true` at the end of `init_model`; gates stepping |

## Lifecycle

1. **Construct** `(model_ref, name = "")` — store the engine reference as `_model_engine`, snapshot
   the step size into `_t`, and set the shared-field defaults. (`build()` passes a 3rd `model_type`
   argument that the base constructor ignores.)
2. **`init_model(args)`** — apply the definition's `{key, value}` args onto the instance
   (`this[arg.key] = arg.value`); then for each entry in `this.components`: instantiate the sub-model
   into `model.models` (only if a model of that name does not already exist) and call `init_model` on
   it with its own args. Finally set `_is_initialized = true`.
3. **`step_model()`** — called every step by the engine; runs `calc_model()` **only when
   `is_enabled && _is_initialized`**. Don't override unless you need custom gating.
4. **`calc_model()`** — empty here; **overridden by almost every subclass** to do the per-step
   calculation. This is where the physics lives.

## Composite models (`components`)

A model can own a local sub-network by declaring sub-models in `components`. `init_model` instantiates
each into the global `model.models` map (skipping any name that already exists) and initializes it, so
the children still participate in the global step loop, data collection and scaling. `Pda`,
`Placenta`, `Ecls` and the `Ventilator` use this to own their internal circuits.

## Subclass contract

- Declare a static `model_type` string (the key used at build time and in the definition JSON), and
  add an `export` line in `explain/ModelIndex.js` so the engine's `available_model_map` can find it.
- In the constructor, call `super(model_ref, name)`, then initialize independent (config) props,
  dependent (computed) props, and `_`-prefixed local refs.
- Override `init_model` only to resolve cross-model references (e.g.
  `this._lv = this._model_engine.models["LV"]`); call `super.init_model(args)` (or set
  `_is_initialized = true` yourself) so stepping is enabled.
- Override `calc_model()` with the per-step physics.

## Example definition (JSON)

`BaseModelClass` is abstract — there is no definition block for it. Every concrete model's definition,
however, carries the shared fields it defines (`name`, `description`, `is_enabled`, `model_type`,
`components`) alongside that model's own parameters:

```json
{
  "name": "PA_PAAL",
  "description": "input connector for PAAL",
  "model_type": "Resistor",
  "is_enabled": true,
  "components": {}
}
```

## Usage in the model

- The foundational contract for every model; you extend it (directly or via an intermediate like
  `Capacitance` / `Resistor` / `TimeVaryingElastance`) to add a new model.
- The engine's build/step machinery (`ModelEngine`), `DataCollector` and `ModelScaler` all rely on
  these shared fields and the `is_enabled && _is_initialized` gate.

## Notes

- **`_t` is a snapshot.** It is read once at construction. There is no runtime setter for
  `modeling_stepsize`, and the build sets it before any model is constructed, so `_t` is always correct
  in practice — but a future runtime step-size change would need `_t` refreshed on every model (and on
  `TaskScheduler`).
- The base `init_model` does **not** error on unknown args — it assigns any `{key, value}` straight
  onto the instance, so definition typos become stray properties rather than build failures.
