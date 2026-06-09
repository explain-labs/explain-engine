# Respiration

`Respiration` is a **coordinator**, not a physical compartment (the same pattern as `Circulation`). It
groups the models of the respiratory tract by name and applies whole-system adjustments to their
elastance, resistance and gas-exchange factors. It owns no volume, pressure or flow of its own.

It is the *mechanical/structural* counterpart to `Breathing`: `Breathing` generates the breath effort,
while `Respiration` sets the lung/thorax stiffness, airway resistance and gas-exchange efficiency that
the breath acts against.

## What it groups

The model definition fills lists of model **names**:

| List | Default members | Role |
|---|---|---|
| `upper_airways` | `MOUTH_DS` | mouth → dead-space resistor |
| `lower_airways` (`_left`/`_right`) | `DS_ALL`, `DS_ALR` | dead-space → alveolar resistors |
| `dead_space` | `DS` | conducting-airway gas compartment |
| `thorax` | `THORAX` | chest-wall container |
| `lungs` (`left_lung`/`right_lung`) | `ALL`, `ALR` | alveolar gas compartments |
| `gas_echangers` (`_left`/`_right`) | `GASEX_LL`, `GASEX_RL` | blood↔gas exchangers |
| `pleural_space_*`, `intrapulmonary_shunt` | — | reserved (declared, not yet driven) |

> Note: `gas_echangers` is a (consistent) misspelling of "exchangers" — both the property and the
> definition key use it, so it is left as-is.

## Calculation cycle (`calc_model`)

One throttled loop (every 0.015 s) that applies each factor **only when it changed** (guarded by a
`_prev_*` comparison):

| Input | Method | Drives |
|---|---|---|
| `el_lungs_factor` | `set_el_lung_factor` | `el_base_factor_ps` on the lungs |
| `el_thorax_factor` | `set_el_thorax_factor` | `el_base_factor_ps` on the thorax |
| `res_upper_airways_factor` | `set_upper_airway_resistance` | `r_factor_ps` on the upper airways |
| `res_lower_airways_factor` | `set_lower_airway_resistance` | `r_factor_ps` on the lower airways |
| `gex_factor` | `set_gasexchange` | `dif_o2_factor_ps` and `dif_co2_factor_ps` on the gas exchangers |

## The `set_*` methods — delta application

Every target is a **persistent** factor (`*_factor_ps`) that accumulates contributions from several
models, so `Respiration` applies the **delta** since its last call, not the absolute value:

```
delta = new_factor − prev_factor
for each model in the group:  factor_ps += delta   (clamped at 0)
prev_factor := new_factor          (stored by calc_model after the call)
```

The delta is computed **once** so every model in the group gets the same change, and each factor is
clamped at 0 (negative elastance/resistance/diffusion factors are non-physical). `set_gasexchange`
applies the delta to both the O₂ and CO₂ diffusion factors, clamping each independently.

## Configuration (model-definition fields)

| Field | Meaning |
|---|---|
| group lists (`upper_airways`, `lungs`, `thorax`, …) | model names by anatomical role |
| `el_lungs_factor`, `el_thorax_factor` | lung / chest-wall stiffness multipliers |
| `res_upper_airways_factor`, `res_lower_airways_factor` | airway resistance multipliers |
| `gex_factor` | gas-exchange (O₂ + CO₂ diffusion) efficiency multiplier |

All default to 1.0 (no effect). Disease scenarios raise lung/airway factors (e.g. RDS → stiff lungs,
bronchospasm → high lower-airway resistance) or lower `gex_factor` (impaired diffusion).

## Notes & caveats

- **Factors are cumulative and shared.** `*_factor_ps` is written by several models; `Respiration`
  only adds its delta. A factor driven to the 0 clamp stops tracking further decreases until the
  target rises again — inherent to the per-model persistent-factor scheme.
- **Side- and space-specific lists are reserved.** `pleural_space_left/right`,
  `intrapulmonary_shunt`, and the `_left`/`_right` airway/lung/exchanger lists are declared but not
  yet used by any method — hooks for future per-side control.
- **Group membership is name-based** — a model is only affected if its name is in the relevant list.
