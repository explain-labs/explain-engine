# ModelRegistry

`helpers/ModelRegistry.js` is a two-function lookup table from `model_type` to model class. It lets `BaseModelClass` instantiate a sub-model by its `model_type`, built-in or custom, without importing the model barrels. Importing them would create an import cycle.

## API

| Function | Arguments | Returns | Description |
|---|---|---|---|
| `set_model_registry(model_map)` | `{ model_type: class }` | – | Replaces the table. `ModelEngine` calls it once at startup with the merged map: every `ModelIndex.js` export, then every `CustomModelIndex.js` export (a custom class with the same `model_type` replaces the built-in one, with a `console.warn`). |
| `get_model_class(model_type)` | string | class or `undefined` | Looks a class up. |

## Where it is used

`BaseModelClass.init_model` instantiates each entry of `this.components` that doesn't exist yet. It resolves the class as:

```js
get_model_class(model_type) ?? BuiltinModels[model_type]
```

The fallback is the `ModelIndex.js` namespace, keyed by export name. It only matters when the classes are used without `ModelEngine`, which is what fills the registry. Every built-in export name equals its `model_type` (all 46 checked), so the fallback finds the same class, but it doesn't know custom models.

Since `build()` pre-creates every declared sub-model from the same merged map (see [BaseModelClass](./BaseModelClass.md#composite-models-components)), this lookup only runs for models added at runtime (`add_model_to_engine`).

## Why it exists

Every model extends `BaseModelClass`. If `BaseModelClass` imported `CustomModelIndex.js` directly, then `CustomModelIndex → custom model → BaseModelClass` would be evaluated while `BaseModelClass` is still initializing, and the import would fail with "Cannot access 'BaseModelClass' before initialization". The registry breaks the cycle: `BaseModelClass` imports only this tiny module, and `ModelEngine`, which imports everything, fills it once the module graph is complete. The `ModelIndex.js` fallback import in `BaseModelClass` is safe because its bindings are only read lazily, inside `init_model`.

Don't replace it with a top-level import or spread of the barrels: both fail at module-evaluation time, not at build time.

## Notes

- The table is module state, one per worker. A second `set_model_registry` call replaces it entirely.
- Adding a custom model: see [`custom_models/README.md`](../custom_models/README.md) and [ARCHITECTURE §8](./ARCHITECTURE.md#8-how-to-add-a-new-model).
