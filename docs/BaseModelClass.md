# BaseModelClass

`BaseModelClass` is the root class every model in the engine extends. It defines the lifecycle (construct → `init_model` → `step_model` → `calc_model`), the shared fields the engine relies on, and the `components` mechanism through which a model owns sub-models. It has no `model_type` of its own and is never instantiated directly.

## Physiology

None. This class is the contract that makes something a "model" the engine can build, step, record and scale. All physiology lives in the subclasses.

## Inheritance

```
BaseModelClass
  ├── Capacitance
  │     ├── BloodCapacitance
  │     │     └── BloodVessel
  │     └── GasCapacitance
  ├── TimeVaryingElastance
  │     ├── BloodTimeVaryingElastance
  │     └── HeartChamber
  ├── Resistor
  │     └── HeartValve
  ├── Container
  ├── BloodDiffusor, GasExchanger
  ├── Ventilator
  │     └── Sle6000
  └── every other component and device model (Heart, Circulation, Blood, Gas, Ans, Kidneys, Ecls, Monitor, …)
```

The base classes live in `base_models/`, the component models in `component_models/` and the devices in `device_models/`.

## Properties

### Config (set in the definition JSON)

| Property | Unit | Default | Description |
|---|---|---|---|
| `name` | – | constructor argument | Unique model name, and its key in `model.models`. |
| `description` | – | `""` | Free text, for documentation and the UI only. |
| `is_enabled` | boolean | `false` | When `false`, `step_model` skips the model. Every definition sets it explicitly. |
| `model_type` | – | `""` | Class key, used at build time to pick the class. Set from the definition (the class's static `model_type` holds the same string). |
| `components` | object | `{}` | Sub-models this model owns: `{ name: definition }`. See [Composite models](#composite-models-components). |

### Internal

| Property | Unit | Default | Description |
|---|---|---|---|
| `_model_engine` | – | constructor argument | Reference to the whole engine `model` object (other models, `weight`, `modeling_stepsize`, …). |
| `_t` | s | `modeling_stepsize` | Step size, copied once at construction. |
| `_is_initialized` | boolean | `false` | Set `true` at the end of `init_model`. Gates stepping. |

## Calculation (lifecycle)

1. **`constructor(model_ref, name = "")`**: stores the engine reference, copies the step size into `_t`, and sets the defaults above. `build()` passes a third `model_type` argument, which the base ignores. A subclass calls `super(model_ref, name)` first, then declares its own config props, outputs and `_`-prefixed locals.
2. **`init_model(args)`**: `args` is the definition as a list of `{key, value}` pairs.
   1. Each pair is copied onto the instance (`this[key] = value`), including `components`.
   2. For each entry in `this.components`, a sub-model is instantiated into `model.models`, **unless a model with that name already exists**. `build()` has already created all declared sub-models (see below), so in a normal build this step only matters for models added at runtime.
   3. Each sub-model is initialized with its own definition as args, so its sub-models are handled the same way, recursively.
   4. `_is_initialized` is set `true`.
3. **`step_model()`**: called every step by the engine. Runs `calc_model()` only when `is_enabled && _is_initialized`. Override it only to change that gate.
4. **`calc_model()`**: empty here. Subclasses put their per-step calculation in it.

A subclass that overrides `init_model` to resolve references to other models (e.g. `this._lv = this._model_engine.models["LV"]`) calls `super.init_model(args)`, or applies the args and sets `_is_initialized = true` itself.

### Composite models (`components`)

A model can own a local sub-network by listing sub-models in `components`. The sub-models are full members of `model.models`: they are stepped, recorded by the `DataCollector` and scaled like any other model. In the shipped scenarios 11 models own sub-models: Heart, Circulation (most vessels), Mob (the coronaries), Ans, Respiration, Ventilator, Ecls, Placenta, Pda, Shunts and Kidneys. Some sub-models own sub-models of their own.

**Build order.** `ModelEngine.build()`:
1. instantiates every model in the definition, in definition order;
2. instantiates every declared sub-model, recursively, before any `init_model` runs;
3. calls `init_model` on the top-level models, in definition order. Each owner initializes its own sub-models from its `init_model`.

So when any `init_model` runs, every model of the scenario already exists, and a lookup by name finds it regardless of where its owner sits in the file. A model found that way may not be initialized yet; its definition values are applied when its owner's `init_model` runs.

**Step order.** The step loop runs models in insertion order: the top-level models in definition order, then the sub-models, each owner's direct sub-models first, then theirs.

## Factor system

None. The factor/effective-value layers start at [`Capacitance`](./Capacitance.md), [`Resistor`](./Resistor.md) and [`TimeVaryingElastance`](./TimeVaryingElastance.md). See [ARCHITECTURE §7a](./ARCHITECTURE.md#7a-the-factor--effective-value-pattern).

## Inputs and outputs

- **Reads:** `model_ref.modeling_stepsize` at construction.
- **Written by:** `ModelEngine.build()` (construction, `init_model`); `TaskScheduler` and the UI (`setPropValue`), which can write any prop including `is_enabled`.
- **Read by:** `ModelEngine` (`step_model` every step), `DataCollector` (watched props), `ModelScaler`, and every model that resolves a reference to another model by name.

## Assumptions and limitations

- **Unknown args are kept, not rejected.** `init_model` copies every key onto the instance, so a typo or a key left over from an older class becomes a stray property instead of a build error. `scripts/doc_audit.mjs` lists such keys per class ("scenario keys unknown to the class").
- **`_t` is a snapshot.** It is copied at construction. No runtime setter changes `modeling_stepsize`, so this is safe today. A future runtime step-size change would have to refresh `_t` on every model (and on `TaskScheduler`).
- **A sub-model whose name is already a top-level model is not replaced.** The owner initializes the existing model again with the sub-model's definition, so the later values win.
- **Models added at runtime** (`add_model_to_engine`) create their sub-models in their own `init_model`. Models that collect compartments at build time (`Blood`, `Gas`) don't see them.

## Example definition (JSON)

`BaseModelClass` has no definition of its own. Every definition carries its shared fields next to the class's own parameters. From `term_neonate_72h.json`, `models.PA_PAAL` (trimmed):

```json
{
  "name": "PA_PAAL",
  "description": "input connector for PAAL",
  "model_type": "Resistor",
  "is_enabled": true,
  "components": {}
}
```

## Usage in the scenarios

Every model extends it, directly or through `Capacitance`, `Resistor`, `TimeVaryingElastance` or another intermediate class. To add a model, see [ARCHITECTURE §8](./ARCHITECTURE.md#8-how-to-add-a-new-model).

## References

None: this is software structure, not physiology.
