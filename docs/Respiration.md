# Respiration

`Respiration` is a **coordinator**, not a physical compartment (the same pattern as
[Circulation](./Circulation.md)). It groups the models of the respiratory tract by name and applies
whole-system adjustments to their elastance, resistance and gas-exchange factors. It owns no volume,
pressure or flow of its own.

It is the *mechanical/structural* counterpart to [Breathing](./Breathing.md): `Breathing` generates
the breath effort, while `Respiration` sets the lung/thorax stiffness, airway resistance and
gas-exchange efficiency that the breath acts against.

## Inheritance

```
BaseModelClass
  └── Respiration   (group coordinator — no physics of its own)
```

Extends `BaseModelClass` directly; `calc_model()` iterates over named members and writes onto their
persistent factor layers rather than computing any physics itself.

## What it models

A single set of system-wide multipliers over the respiratory tree:

- **Lung / chest-wall stiffness** — `el_lungs_factor`, `el_thorax_factor`.
- **Airway resistance** — `res_upper_airways_factor`, `res_lower_airways_factor`.
- **Gas-exchange efficiency** — `gex_factor` (drives both O₂ and CO₂ diffusion).

Each multiplier is translated into a **delta** on the corresponding `*_factor_ps` of the grouped
models, so it composes additively with other writers of that persistent layer.

## Properties

### Group lists (set in the model definition)

| List | Default members | Role |
|---|---|---|
| `upper_airways` | `["MOUTH_DS"]` | mouth → dead-space resistor |
| `lower_airways` (`_left`/`_right`) | `["DS_ALL", "DS_ALR"]` | dead-space → alveolar resistors |
| `dead_space` | `["DS"]` | conducting-airway gas compartment |
| `thorax` | `["THORAX"]` | chest-wall container |
| `lungs` (`left_lung`/`right_lung`) | `["ALL", "ALR"]` | alveolar gas compartments |
| `gas_echangers` (`_left`/`_right`) | `["GASEX_LL", "GASEX_RL"]` | blood↔gas exchangers |
| `pleural_space_left`/`_right` | `[]` | reserved (declared, not driven) |
| `intrapulmonary_shunt` | `["IPS"]` (scenarios override, e.g. `["IPSL","IPSR"]`) | reserved (declared, not driven) |

> Note: `gas_echangers` is a (consistent) misspelling of "exchangers" — both the property and the
> definition key use it, so it is left as-is. Some definitions also carry a correctly-spelled
> `gas_exchangers` field; the source reads only `gas_echangers`.

### Factor inputs (set in the model definition)

| Property | Default | Method | Drives |
|---|---|---|---|
| `el_lungs_factor` | `1.0` | `set_el_lung_factor` | `el_base_factor_ps` on the lungs |
| `el_thorax_factor` | `1.0` | `set_el_thorax_factor` | `el_base_factor_ps` on the thorax |
| `res_upper_airways_factor` | `1.0` | `set_upper_airway_resistance` | `r_factor_ps` on the upper airways |
| `res_lower_airways_factor` | `1.0` | `set_lower_airway_resistance` | `r_factor_ps` on the lower airways |
| `gex_factor` | `1.0` | `set_gasexchange` | `dif_o2_factor_ps` **and** `dif_co2_factor_ps` on the exchangers |

### Local (internal)

`_update_interval` (0.015 s) / `_update_counter` throttle the loop; `_prev_*` shadow each factor so a
change can be detected and applied as a delta.

## Calculation cycle (`calc_model`)

One throttled loop (every 0.015 s) that applies each factor **only when it changed** (guarded by a
`_prev_*` comparison). Each changed input calls its `set_*` method, then stores the new value into
`_prev_*`.

## The `set_*` methods — delta application

Every target is a **persistent** factor (`*_factor_ps`) that accumulates contributions from several
models, so `Respiration` applies the **delta** since its last call, not the absolute value:

```
delta = new_factor − prev_factor
for each model in the group:  factor_ps += delta   (clamped at 0)
this.<factor> := new_factor          (prev_factor stored by calc_model after the call)
```

The delta is computed **once** so every model in the group gets the same change, and each factor is
clamped at 0 (negative elastance/resistance/diffusion factors are non-physical). `set_gasexchange`
applies the delta to both the O₂ and CO₂ diffusion factors, clamping each independently.

## Factor system

`Respiration` does not itself carry the three-tier `_factor`/`_factor_ps`/`_factor_scaling_ps` pattern
(it has no base physics param). Instead it is one of the *writers* of the **persistent** `*_factor_ps`
tier on the grouped models: `el_base_factor_ps` (lungs/thorax), `r_factor_ps` (airways) and
`dif_o2/co2_factor_ps` (exchangers). It never touches the non-persistent (`_factor`) or scaling
(`_factor_scaling_ps`) tiers — those belong to transient interventions and `ModelScaler` respectively.

All factor inputs default to 1.0 (no effect). Disease scenarios raise lung/airway factors (e.g. RDS →
stiff lungs, bronchospasm → high lower-airway resistance) or lower `gex_factor` (impaired diffusion).

## Example definition (JSON)

From `term_neonate.json`:

```json
{
  "name": "Respiration",
  "description": "high level respiration model",
  "model_type": "Respiration",
  "is_enabled": true,
  "upper_airways": ["MOUTH_DS"],
  "lower_airways": ["DS_ALL", "DS_ALR"],
  "lower_airways_left": ["DS_ALL"],
  "lower_airways_right": ["DS_ALR"],
  "dead_space": ["DS"],
  "thorax": ["THORAX"],
  "lungs": ["ALL", "ALR"],
  "left_lung": ["ALL"],
  "right_lung": ["ALR"],
  "gas_echangers": ["GASEX_LL", "GASEX_RL"],
  "intrapulmonary_shunt": ["IPSL", "IPSR"],
  "el_lungs_factor": 1.0,
  "el_thorax_factor": 1.0,
  "res_upper_airways_factor": 1.0,
  "res_lower_airways_factor": 1.0,
  "gex_factor": 1.0
}
```

## Usage in the model

- Disease models (RDS / surfactant, CDH, bronchospasm) set `el_lungs_factor`,
  `res_lower_airways_factor` or `gex_factor` to impose stiff lungs, narrowed airways or impaired
  diffusion without touching the individual compartment definitions.
- Because the targets are the shared `*_factor_ps` layer, Respiration composes with whatever the
  surfactant/recruitment model or `ModelScaler` is doing to the same compartments.
- It is the structural partner of [Breathing](./Breathing.md) (effort generator) and the respiratory
  analogue of [Circulation](./Circulation.md) (vascular-tree coordinator).

## Notes & caveats

- **Factors are cumulative and shared.** `*_factor_ps` is written by several models; `Respiration`
  only adds its delta. A factor driven to the 0 clamp stops tracking further decreases until the
  target rises again — inherent to the per-model persistent-factor scheme.
- **Side- and space-specific lists are reserved.** `pleural_space_left/right`, `intrapulmonary_shunt`,
  and the `_left`/`_right` airway/lung/exchanger lists are declared but **not** used by any method —
  hooks for future per-side control.
- **Group membership is name-based** — a model is only affected if its name is in the relevant list.
