# `custom_models/` — your own model classes

This directory is the home for model classes you write yourself (student projects,
experiments, work-in-progress physiology). Nothing here is part of the core engine:
the directory is empty on `main` apart from this README and `_ExampleModel.js`.

The point of this seam is that **you never edit a shared file**. Core models live in
`ModelIndex.js`; yours live here and are registered from `CustomModelIndex.js`, which
is empty on `main`. Your branch therefore only ever *adds* files and *appends* lines
to an otherwise-empty stub, so `git rebase origin/main` stays conflict-free.

## Adding a model — the short version

1. Copy `_ExampleModel.js` to `custom_models/<YourModel>.js` and rename the class.
2. Give it a `static model_type` that cannot collide with a built-in — prefix it, e.g.
   `"TimKidneyV2"` rather than `"Kidneys"`. A custom model whose `model_type` matches a
   built-in **replaces** that built-in engine-wide (the engine logs a `console.warn`).
   That is occasionally what you want; usually it is a typo.
3. Export it from `../CustomModelIndex.js`:
   ```js
   export { YourModel } from "./custom_models/YourModel";
   ```
   Forgetting this line is the usual cause of `ERROR: <type> model not found` at build.
4. Reference the `model_type` from a scenario in `model_definitions/`. Name your own
   scenarios `student_<name>_*.json` so they are obviously yours and never collide.
5. To get editable parameter fields in the web app, add an entry for your `model_type`
   to `src/model-interface/custom-registry.ts` in the **explain-ui** repo. Without it
   your model still runs — it just shows no fields in the editor.

## The class contract (same as any core model)

- Extend `BaseModelClass`, or an intermediate like `Capacitance` / `Resistor` /
  `TimeVaryingElastance` when you want their physics for free.
- Constructor `(model_ref, name = "")` — call `super(...)`, then declare independent
  (configurable) properties, dependent (computed read-out) properties, and `_`-prefixed
  local state, in that order.
- `init_model(args)` — call `super.init_model(args)` first (it applies the definition's
  key/value pairs onto `this`), then resolve cross-model references, e.g.
  `this._lv = this._model_engine.models["LV"];`. The build is two-pass — every model is
  constructed before any is initialized — so referencing another model here is safe.
- `calc_model()` — the physics, run once per step. Don't override `step_model()`; the
  base already gates on `is_enabled && _is_initialized`.
- The step size is `this._t` (seconds). Cycle counters (`ncc_ventricular`, …) live on
  the engine object, not on components: reach them via `this._model_engine`.

## The factor / effective-value convention

Core physics parameters are never used raw. Each tunable `p` combines three multiplier
layers additively against the base:

```
p_eff = p + (p_factor - 1) * p + (p_factor_ps - 1) * p + (p_factor_scaling[_ps] - 1) * p
```

`_factor` is non-persistent (reset to 1.0 every step — transient interventions),
`_factor_ps` is the persistent user/scenario layer, and the scaling layer belongs to
`ModelScaler` alone. Follow this for any parameter you want interventions and weight
scaling to compose with.

> The scaling suffix is **not uniform**: the capacitance / resistor / time-varying-elastance
> family uses `*_factor_scaling_ps`, while the diffusor / exchanger family uses
> `*_factor_scaling` (no `_ps`). Check the class you inherit from before copying.

## Testing without the browser

From the engine repo root:

```bash
node scripts/probe_vitals.mjs student_<name>_<scenario>
```

A build failure exits `1` — that is the check that proves your model registered.
Physiological numbers are printed as labelled verdicts and always exit `0`, so read
the table rather than trusting the exit code. See `docs/TESTING.md`.

Full workflow (branches, submodule, pulling updates, handing work in):
`STUDENT_WORKFLOW.md` in the explain-ui repo.
