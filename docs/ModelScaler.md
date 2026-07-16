# ModelScaler

`ModelScaler` (`explain/helpers/ModelScaler.js`) is **engine infrastructure**, not a physiological model. It provides granular, factor-based scaling of model parameters by subsystem — blood, heart, lung, airways, and the thorax/pericardium containers — plus a single-call allometric weight scaler. A factor of `1.0` means no change, `0.5` halves the value, `2.0` doubles it. Each scaling group targets an explicit, predefined list of component names (read from a config object) rather than scanning every model by type, which keeps scaling predictable.

It is instantiated once per build in `ModelEngine.build()`:

```js
model["ModelScaler"] = new ModelScaler(model, model.scaler_config);
```

and driven from the public API via `scaleModel(group, factor)` (main thread) → `scale_model` message → the big `switch` in `ModelEngine.scale_model`. See [ARCHITECTURE](./ARCHITECTURE.md) for the build flow and the worker message wire protocol.

## Role in the engine

`ModelScaler` is the engine's mechanism for adjusting a whole patient's size or subsystem characteristics in one call, without editing the scenario JSON or rebuilding. It is the only component that writes the **`*_factor_scaling_ps` scaling layer** (the third tier of the factor/`_eff` pattern documented in [ARCHITECTURE](./ARCHITECTURE.md)) — it never touches the transient `*_factor` or the user/scenario `*_factor_ps` layers, so its scaling composes with interventions and live tuning instead of clobbering them. (Note: volume scaling and `add_volume` are the exception — they mutate raw `vol`/`u_vol` directly; see below.)

It is constructed with a reference to the whole engine `model` object and a `config`. All its group methods resolve component names against `this._model.models[name]` and silently skip names that are absent or lack the targeted property, so a config can list components that not every scenario contains.

## Key state / configuration it reads

- **`scaler_config`** — passed in as the constructor's second argument (defaults to `{}` in the engine's initial state, populated from the scenario's `scaler_config`). It is a nested map of group → property-role → list of component names, e.g. `config.blood.volume`, `config.blood.el_base`, `config.blood.resistance`, `config.blood_pulmonary.el_base`, `config.blood_systemic.resistance`, `config.airway.resistance_upper`, `config.left_lung.u_vol`, `config.heart.el_min`/`el_max`/`resistance`/`volume`, `config.heart_left`/`heart_right`, `config.thorax`, `config.pericardium`. Each group method reads the specific list it needs from this object.
- **`this._prev`** — an internal table of the last factor applied per group (`blood_vol`, `heart_el_min`, etc., all seeded to `1.0`). Volume scaling uses it to compute a **delta** (`factor / prev`) so repeated absolute factors are applied multiplicatively against the raw volume rather than re-multiplying from the original. `incorporate()` and `reset()` return these entries toward `1.0`.
- **`model._baseline_weight`** — read by `scale_to_weight`; frozen at build time. `reset` (in the engine) restores `model.weight = model._baseline_weight`.

## Key methods / exports

`ModelScaler` is a default-exported class. Its public surface is a large family of `scale_*` methods, each scaling one role on one subsystem, plus a few utilities. `scaleModel(group, factor)` does not call these directly — `ModelEngine.scale_model(payload)` switches on `payload.group` and dispatches to the matching method with `payload.factor`.

**Volume scaling** (mutates raw `vol` and `u_vol` by the computed delta):
`scale_blood_volume`, `scale_heart_volume`, `scale_lung_volume`, `scale_thorax_volume`, `scale_pericardium_volume`.

**Elastance / resistance / unstressed-volume scaling** (write the `*_factor_scaling_ps` layer):

| Subsystem | Methods |
|---|---|
| Blood (global) | `scale_blood_elastances`, `scale_blood_resistances` |
| Pulmonary | `scale_pulmonary_elastances`, `scale_pulmonary_resistances`, `scale_pulmonary_u_vol` |
| Systemic | `scale_systemic_elastances`, `scale_systemic_resistances`, `scale_systemic_u_vol` |
| Airway | `scale_airway_elastances`, `scale_airway_u_vol`, `scale_airway_upper_resistances`, `scale_airway_lower_resistances` |
| Left lung | `scale_left_lung_elastances`, `scale_left_lung_resistances`, `scale_left_lung_u_vol` |
| Right lung | `scale_right_lung_elastances`, `scale_right_lung_resistances`, `scale_right_lung_u_vol` |
| Heart (both) | `scale_heart_el_min`, `scale_heart_el_max`, `scale_heart_resistances` |
| Left heart | `scale_left_heart_el_min`, `scale_left_heart_el_max`, `scale_left_heart_u_vol` |
| Right heart | `scale_right_heart_el_min`, `scale_right_heart_el_max`, `scale_right_heart_u_vol` |
| Containers | `scale_thorax_elastances`, `scale_pericardium_elastances` |

The properties written are `el_base_factor_scaling_ps`, `r_factor_scaling_ps`, `u_vol_factor_scaling_ps`, `el_min_factor_scaling_ps`, and `el_max_factor_scaling_ps`. (The `*_u_vol` heart methods write `u_vol_factor_scaling_ps` onto the components listed in the heart's `el_min` group.)

**Utility / lifecycle:**

- `scale_to_weight(new_weight)` — allometric scaling from a single new weight. Computes `vol_factor = new_weight / baseline` and `inv_factor = baseline / new_weight`, scales the five volume groups linearly with weight, and sets `this._model.weight = new_weight`. The elastance/resistance/unstressed-volume inverse-scaling calls are present but currently commented out, so by default only volumes (and `model.weight`) change. No-ops if `_baseline_weight` or `new_weight` is missing/≤0. Reached via the `weight_scale` group.
- `add_volume(vol_liters)` — adds liters directly to the `IVCI` compartment's `vol` (a bolus/bleed lever). Reached via the `add_volume` group.
- `incorporate()` — **bakes** every accumulated `*_factor_scaling_ps` (and the resistance `r_for`/`r_back`) into the corresponding base property, then resets that factor to `1.0` and clears `this._prev`. Use to make current scaling permanent. Reached via the `incorporate` group.
- `reset()` — calls every `scale_*` method with `1.0`, returning all scaling factors and volumes to baseline. The engine's `reset` case additionally restores `model.weight = model._baseline_weight`.

The engine's `weight` group is handled inline (`model.weight = factor`) and does not call a `ModelScaler` method.

## The scaling layer

Core physics parameters are never used raw; each has three multiplier tiers that combine additively into an `*_eff` value (see [ARCHITECTURE](./ARCHITECTURE.md) for the full factor/`_eff` derivation):

- `<p>_factor` — transient, reset to `1.0` every step.
- `<p>_factor_ps` — persistent user/scenario adjustments.
- `<p>_factor_scaling_ps` — persistent **scaling** layer.

`ModelScaler` writes **only** the `*_factor_scaling_ps` tier (via its `_apply(names, prop, factor)` helper, which sets the property absolutely on each named component). It never reads or writes `_factor` or `_factor_ps`. That separation is deliberate: allometric/size scaling stays in its own lane so a loaded patient's baked scaling and any live user interventions or `tune` levers (which use `*_factor_ps`) remain independent and composable. The one place this layering is left behind is volume: `_scale_vol` and `add_volume` change raw `vol`/`u_vol` (and `incorporate`/`_bake_resistance` fold scaling into the raw base params), because those represent actual fluid quantities rather than a multiplier.

Because `_apply` **sets** the scaling layer to an absolute value, calling a scaling group overwrites whatever scaling was already there. This is why the live `tune_model` path (see [Calibrator](./Calibrator.md)) deliberately avoids `ModelScaler` groups and uses `*_factor_ps` levers instead — so it composes with a preterm patient's baked SVR/PVR scaling rather than clobbering it.

## Notes / caveats

- **Volume groups bypass the scaling layer.** `scale_*_volume` and `add_volume` mutate raw `vol`/`u_vol`; only the elastance/resistance/u_vol-factor groups touch `*_factor_scaling_ps`. Volume groups also use the `_prev` delta so repeated absolute factors behave multiplicatively.
- **Names are config-driven and skipped if missing.** A group only affects components listed in `scaler_config`; absent components or undefined target properties are silently ignored. An empty `scaler_config` (the engine default) means most groups are no-ops until a scenario supplies lists.
- **`scale_to_weight` is volume-only by default.** Its elastance/resistance inverse-scaling lines are commented out in the source; do not assume pressures are held constant across body sizes without re-enabling them.
- **`incorporate()` is destructive and irreversible** — once factors are baked into base params, `reset()` cannot recover the pre-bake values (it only zeroes the now-`1.0` factors).
- **`_prev` is internal bookkeeping**, not persisted to scenario state; a rebuild creates a fresh `ModelScaler` with all `_prev` at `1.0`.
