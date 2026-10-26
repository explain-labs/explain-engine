# ModelScaler

`ModelScaler` (`helpers/ModelScaler.js`) is engine infrastructure, not a physiological model. It scales whole groups of components at once: blood volumes, systemic or pulmonary resistances and elastances, heart contractility and stiffness, lungs and airways, the thorax and pericardium, and the patient's weight. A factor of 1.0 means no change. Each group targets an explicit list of components from the scenario's `scaler_config`.

It is created once per build (`model.ModelScaler = new ModelScaler(model, model.scaler_config)`) and driven by `scaleModel(group, factor)` (main thread) → `POST "scale"` → `ModelEngine.scale_model`, which dispatches on the group name.

## Who uses it

- **The app's common tasks:** SVR (`systemic_resistances`), PVR (`pulmonary_resistances`), venous capacity (`systemic_u_vol`), contractility (`heart_el_max`), diastolic stiffness (`heart_el_min`), lung compliance (both lung-elastance groups), lower airway resistance (`airway_lower_resistances`), blood volume (`blood_volume`). They read the current factor from the state and multiply it.
- **The bot** (`op: "scale"`) and **lessons** (`scale` steps), with an absolute factor (1.0 = the scenario as loaded).
- **The scenario generators and the patient builder:** `weight_scale` sizes a patient from its source scenario, and the resistance and heart groups are calibration levers. They end with `incorporate`.
- The **Scaler panel** of the app (hidden as unfinished).

## Two kinds of groups

**Volume groups** change the stored volumes directly, by the ratio to the last factor (`_prev`):

| Group | Method | Components |
|---|---|---|
| `blood_volume`, `heart_volume`, `lung_volume`, `thorax_volume`, `pericardium_volume` | `scale_*_volume` | `vol` and `u_vol` of `config.blood.volume`, `config.heart.volume`, `config.lung.volume`, `config.thorax`, `config.pericardium` |

**Factor groups** set the scaling layer `*_factor_scaling_ps` of their components **absolutely** to the factor:

| Subsystem | Groups | Layer |
|---|---|---|
| Blood (all) | `blood_elastances`, `blood_resistances` | `el_base_…`, `r_…` |
| Systemic | `systemic_elastances`, `systemic_resistances`, `systemic_u_vol` | `el_base_…`, `r_…`, `u_vol_…` |
| Pulmonary | `pulmonary_elastances`, `pulmonary_resistances`, `pulmonary_u_vol` | same |
| Airway | `airway_elastances`, `airway_u_vol`, `airway_upper_resistances`, `airway_lower_resistances` | |
| Lungs | `left_/right_lung_elastances`, `_resistances`, `_u_vol` | |
| Heart | `heart_el_min`, `heart_el_max`, `heart_resistances` (valves); `left_/right_heart_el_min`, `_el_max`, `_u_vol` | `el_min_…`, `el_max_…`, `r_…`, `u_vol_…` |
| Containers | `thorax_elastances`, `pericardium_elastances` | `el_base_…` |

Each method skips a name the scenario lacks or a component without that property.

## Utility groups

| Group | Effect |
|---|---|
| `weight_scale` | `scale_to_weight(kg)`: the five volume groups by `kg / _baseline_weight`, then `model.weight = kg`. Volumes only: elastances, resistances, heart rate and VO2 are not scaled (the inverse-scaling lines are deliberately commented out); the generators calibrate those separately. The placenta is not in any group. |
| `weight` | Sets `model.weight` only. |
| `add_volume` | Adds litres to `IVCI.vol`. |
| `incorporate` | Bakes every scaling layer into the base values (below). |
| `reset` | Every group back to 1.0 and `model.weight = _baseline_weight`. |

## `incorporate()`: baking the layer

For every component named anywhere in `scaler_config`:
- `u_vol`, `el_base`, `el_min`, `el_max` are multiplied by their scaling factor;
- `r_for` and `r_back` by `r_factor_scaling_ps`;
- the layer returns to 1.0, and `_prev` to 1.0.

Three rules keep the baked model exactly as it was:
- **BloodVessel R→E coupling.** A vessel's elastance includes `r_total_factor^alpha`, so a baked resistance factor `f` also multiplies `el_base` by `f^alpha`.
- **HeartChamber `el_k`.** A chamber's diastolic modulation, which contains the `el_min` scaling, also scales its non-linear `el_k`, so `el_k` is multiplied by the `el_min` factor.
- **Additive models** (all but BloodVessel). Their persistent layer acts as a fraction of the base, so `*_factor_ps` becomes `1 + (ps − 1)/f` and keeps its absolute effect.

What the bake cannot preserve exactly is the heart chambers' ANS term, which is additive as a fraction of the base. Once baked it acts on the actual contractility rather than the unscaled base, so after a bake the sympathetic inotropy and lusitropy are proportional.

**Why the shipped scenarios are baked.** The factor groups write the layer absolutely, so a calibration left in it is overwritten by the first `scale` command. Before v1.0 the non-term scenarios carried their size calibration there (preterm_25wk: systemic resistances ×2–3.96, `el_max` ×4.86, lung elastance ×7.1). As a result:
- "scale systemic_resistances 1.2" *lowered* its MAP (36.7 → 31.5 mmHg);
- `reset` dropped it to 30 mmHg.

`scripts/_bake_scaling.py` baked the nine non-term scenarios; the same command now raises MAP (35.6 → 37.5) and `reset` is a no-op. The generators and `build_patient.mjs` end with `incorporate`.

## Methods

Each group `<g>` calls `scale_<g>(factor)`, apart from the utility groups. The methods: `scale_blood_volume`, `scale_heart_volume`, `scale_lung_volume`, `scale_thorax_volume`, `scale_pericardium_volume`, `scale_blood_elastances`, `scale_blood_resistances`, `scale_pulmonary_elastances`, `scale_pulmonary_resistances`, `scale_pulmonary_u_vol`, `scale_systemic_elastances`, `scale_systemic_resistances`, `scale_systemic_u_vol`, `scale_airway_elastances`, `scale_airway_u_vol`, `scale_airway_upper_resistances`, `scale_airway_lower_resistances`, `scale_left_lung_elastances`, `scale_left_lung_resistances`, `scale_left_lung_u_vol`, `scale_right_lung_elastances`, `scale_right_lung_resistances`, `scale_right_lung_u_vol`, `scale_heart_el_min`, `scale_heart_el_max`, `scale_left_heart_el_min`, `scale_left_heart_el_max`, `scale_left_heart_u_vol`, `scale_right_heart_el_min`, `scale_right_heart_el_max`, `scale_right_heart_u_vol`, `scale_heart_resistances`, `scale_thorax_elastances`, `scale_pericardium_elastances`, `scale_to_weight`; `incorporate`, `reset`, `add_volume`.

Private helpers:
- `_apply(names, prop, factor)` sets a layer on a list of components;
- `_scale_vol(names, delta)` multiplies `vol` and `u_vol`;
- `_bake(names, base, layer)` and `_bake_resistance(names)` implement `incorporate`.

## Factor system

ModelScaler owns the `*_factor_scaling_ps` layer of the components in `scaler_config`. Other writers of that layer:
- **the Calibrator:** `IPSL`/`IPSR` `r_factor_scaling_ps`;
- **the archived Uterus and MaternalPlacenta:** pregnancy.

Volume scaling and `add_volume` change the base volumes instead.

## Assumptions and limitations

- **Absolute factor groups, delta-based volume groups.** `_prev` is not saved, so after a reload the volume groups start again from 1.0 (the loaded volumes); the factor groups read their state from the components.
- **Weight scaling is linear and volume-only.**
- **Groups are fixed lists per scenario** (`scaler_config`); components outside them are never scaled.

## Example definition (JSON)

From `term_neonate_72h.json`, `model_definition.scaler_config` (trimmed):

```json
{
  "blood_systemic": {
    "el_base": ["AA", "AAR", "AD", "INT_ART", "KID_ART", "..."],
    "resistance": ["AA", "AAR", "AD", "INT_ART", "KID_ART", "..."]
  },
  "heart": {
    "volume": ["LA", "LV", "RAIVCI", "RASVC", "RV", "COR"],
    "el_min": ["LA", "LV", "RAIVCI", "RASVC", "RV", "COR"],
    "el_max": ["LA", "LV", "RAIVCI", "RASVC", "RV", "COR"],
    "resistance": ["LA_LV", "LV_AA", "RV_PA", "RAIVCI_RV", "RASVC_RV", "LV_PA", "RV_AA", "COR_RAIVCI", "COR_RASVC"]
  },
  "thorax": ["THORAX"],
  "pericardium": ["PERICARDIUM"]
}
```

## References

None; engine infrastructure.
