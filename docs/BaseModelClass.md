# BaseModelClass

`BaseModelClass` is the blueprint every model in the engine extends. It provides the common
lifecycle (construct → init → step) and the shared properties the engine relies on; subclasses add
the actual physics in `calc_model()`.

## Common properties

| Property | Meaning |
|---|---|
| `name` | unique model name (its key in `model.models`) |
| `description` | free-text description |
| `is_enabled` | when false the model is skipped in the step loop |
| `model_type` | the class key used at build time and in the definition JSON |
| `components` | dictionary of sub-models this model owns (composite-model mechanism) |
| `_model_engine` | reference to the whole engine `model` object (shared state, counters, other models) |
| `_t` | the modeling step size, **captured at construction** from `model_engine.modeling_stepsize` |
| `_is_initialized` | set true at the end of `init_model`; gates stepping |

## Lifecycle

1. **Construct** `(model_ref, name)` — store the engine reference and step size, set defaults.
2. **`init_model(args)`** — apply the definition's `{key, value}` args onto the instance, then for
   each entry in `this.components`: instantiate the sub-model into `model.models` (unless it already
   exists) and init it. Finally set `_is_initialized = true`.
3. **`step_model()`** — called every step by the engine; runs `calc_model()` only when
   `is_enabled && _is_initialized`.
4. **`calc_model()`** — empty here; **overridden by almost every subclass** to do the per-step
   calculation.

## Composite models (`components`)

A model can own a local sub-network by declaring sub-models in `components`. `init_model` instantiates
each into the global `model.models` map and initializes it, so the children still participate in the
global step loop, data collection and scaling. `Pda`, `Placenta`, `Ecls` and the `Ventilator` use
this to own their internal circuits.

## Notes

- **`_t` is a snapshot.** It is read once at construction. There is no runtime setter for
  `modeling_stepsize`, and the build sets it before any model is constructed, so `_t` is always
  correct in practice — but a future runtime step-size change would need `_t` refreshed on every model
  (and on `TaskScheduler`).
- Subclasses that override `init_model` should call `super.init_model(args)` (or set
  `_is_initialized = true` themselves) and resolve any cross-model references there.
