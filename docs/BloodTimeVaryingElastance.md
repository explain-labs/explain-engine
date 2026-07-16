# BloodTimeVaryingElastance

A BloodTimeVaryingElastance is a volume compartment with a time-varying elastance (cyclically changing stiffness) that holds blood with tracked composition. It is used for compartments that contract and relax cyclically but are not heart chambers -- for example, a pulsatile vessel segment driven by an external activation signal.

## Inheritance

```
BaseModelClass
  └── TimeVaryingElastance         (volume, time-varying elastance, pressure)
        └── BloodTimeVaryingElastance  (blood composition tracking)
```

## Relationship to HeartChamber

Both `BloodTimeVaryingElastance` and `HeartChamber` extend `TimeVaryingElastance`. The difference is that `HeartChamber` adds ANS-mediated modulation of contractility (el_max) and relaxation (el_min) via beta-adrenergic receptor modeling. `BloodTimeVaryingElastance` does not have ANS coupling -- it uses the parent's `calc_elastances()` directly.

## What it models

A compartment whose elastance varies over time between a minimum (`el_min`) and maximum (`el_max`) value, driven by an external activation factor (`act_factor`). This produces pulsatile pressure changes. The compartment also tracks blood composition (gases, solutes, drugs, temperature, viscosity) using the same mixing logic as `BloodCapacitance`.

## Properties

### Inherited from TimeVaryingElastance

| Property | Unit | Description |
|---|---|---|
| `u_vol` | L | Unstressed volume |
| `el_min` | mmHg/L | Minimum elastance (during relaxation/diastole) |
| `el_max` | mmHg/L | Maximum elastance (during contraction/systole) |
| `el_k` | unitless | Non-linear elastance coefficient |
| `act_factor` | 0-1 | Activation factor (set externally, e.g., by Heart model) |
| `vol` | L | Current volume |
| `pres` | mmHg | Total pressure |
| `pres_in` | mmHg | Recoil pressure |
| `pres_tm` | mmHg | Transmural pressure |
| `pres_ext` | mmHg | External pressure (non-persistent, resets each step) |

### Blood composition (unique to BloodTimeVaryingElastance)

| Property | Unit | Description |
|---|---|---|
| `temp` | degC | Blood temperature |
| `viscosity` | cP | Blood viscosity |
| `to2` | mmol/L | Total oxygen concentration |
| `tco2` | mmol/L | Total carbon dioxide concentration |
| `ph` | unitless | Blood pH (-1 = not calculated) |
| `pco2` | mmHg | Partial pressure of CO2 (-1 = not calculated) |
| `po2` | mmHg | Partial pressure of O2 (-1 = not calculated) |
| `so2` | unitless | Oxygen saturation (-1 = not calculated) |
| `hco3` | mmol/L | Bicarbonate concentration (-1 = not calculated) |
| `be` | mmol/L | Base excess (-1 = not calculated) |
| `solutes` | object | Dictionary of solute concentrations |
| `drugs` | object | Dictionary of drug concentrations |

### Calculated intermediates

| Property | Unit | Description |
|---|---|---|
| `el_min_eff` | mmHg/L | Effective minimum elastance this step (after all factors) |
| `el_max_eff` | mmHg/L | Effective maximum elastance this step |
| `el_k_eff` | unitless | Effective non-linear elastance coefficient |
| `u_vol_eff` | L | Effective unstressed volume |

## Three-tier factor system

| Tier | Factors | Purpose |
|---|---|---|
| Non-persistent | `u_vol_factor`, `el_min_factor`, `el_max_factor`, `el_k_factor` | Transient effects, reset each step |
| Persistent (`_ps`) | `u_vol_factor_ps`, `el_min_factor_ps`, `el_max_factor_ps`, `el_k_factor_ps` | Ongoing physiological modulation |
| Scaling (`_scaling_ps`) | `u_vol_factor_scaling_ps`, `el_min_factor_scaling_ps`, `el_max_factor_scaling_ps`, `el_k_factor_scaling_ps` | ModelScaler weight/manual scaling |

Each effective value is computed additively:

```
el_min_eff = el_min
  + (el_min_factor - 1) * el_min
  + (el_min_factor_ps - 1) * el_min
  + (el_min_factor_scaling_ps - 1) * el_min
```

Note: `el_max_eff` is clamped to never fall below `el_min_eff`.

## Pressure calculation

The time-varying elastance produces a pressure that interpolates between end-diastolic and maximum systolic pressure based on the activation factor:

```
p_ms = (vol - u_vol_eff) * el_max_eff
p_ed = el_k_eff * (vol - u_vol_eff)^2 + el_min_eff * (vol - u_vol_eff)
pres_in = (p_ms - p_ed) * act_factor + p_ed
```

When `act_factor = 0` (diastole), pressure equals `p_ed`. When `act_factor = 1` (peak systole), pressure equals `p_ms`.

## Mixing logic (`volume_in`)

Overrides `volume_in` to perform composition mixing when blood flows in, identical to `BloodCapacitance`:

```
concentration += ((concentration_from - concentration) * dvol) / vol
```

Applied to: `to2`, `tco2`, all `solutes`, all `drugs`, `temp`, `viscosity`.

## Calculation cycle

Inherits from `TimeVaryingElastance`:

1. `calc_elastances()` -- compute el_min_eff, el_max_eff, el_k_eff from base values + all factor tiers
2. `calc_volumes()` -- compute u_vol_eff from base + all factor tiers
3. `calc_pressure()` -- compute time-varying recoil pressure from activation factor

## Externally managed mode

When `is_externally_managed = true`, all three tiers of factors are reset to 1.0 every step. The parent model sets base properties directly.

## Example definition (JSON)

```json
{
  "name": "COR",
  "description": "coronary circulation",
  "model_type": "BloodTimeVaryingElastance",
  "is_enabled": true,
  "vol": 0.005,
  "u_vol": 0.004,
  "el_min": 5000,
  "el_max": 15000,
  "el_k": 0
}
```

## Usage in the model

- Used for compartments that exhibit pulsatile behavior driven by an external activation signal but do not need the ANS-mediated contractility/relaxation modulation of HeartChamber
- The coronary circulation (COR) is a typical example -- it is compressed during systole by ventricular contraction via the `act_factor` set by the Heart model
