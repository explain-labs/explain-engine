# HeartChamber

A HeartChamber represents a cardiac chamber (atrium or ventricle) with time-varying elastance, ANS-mediated contractility and relaxation, and blood composition tracking. It is the model used for LA, LV, RAIVCI, RASVC, and RV.

## Inheritance

```
BaseModelClass
  └── TimeVaryingElastance         (volume, time-varying elastance, pressure)
        └── HeartChamber           (ANS coupling, blood composition)
```

## Relationship to BloodTimeVaryingElastance

Both `HeartChamber` and `BloodTimeVaryingElastance` extend `TimeVaryingElastance` and add blood composition tracking. The key difference is that HeartChamber overrides `calc_elastances()` to incorporate autonomic nervous system effects on contractility and relaxation via beta-1 adrenergic receptor modeling.

## What it models

A cardiac chamber whose elastance cycles between `el_min` (diastole) and `el_max` (systole), driven by the `act_factor` provided by the `Heart` model. The ANS modulates both values:

- **Diastolic function (el_min)**: Beta-1 receptor activation produces a lusitropic effect -- it *decreases* el_min, improving relaxation. A lower el_min means better diastolic filling.
- **Systolic function (el_max)**: Beta-1 receptor activation produces a positive inotropic effect -- it *increases* el_max, strengthening contraction.

The `Heart` model also applies contractility (`cont_factor_left/right`) and relaxation (`relax_factor_left/right`) factors via the `el_max_factor_ps` and `el_min_factor_ps` persistent factors.

## Properties

### Inherited from TimeVaryingElastance

| Property | Unit | Description |
|---|---|---|
| `u_vol` | L | Unstressed volume |
| `el_min` | mmHg/L | Minimum elastance (diastolic stiffness) |
| `el_max` | mmHg/L | Maximum elastance (systolic stiffness / contractility) |
| `el_k` | unitless | Non-linear elastance coefficient |
| `act_factor` | 0-1 | Activation factor (set by Heart model: `aaf` for atria, `vaf` for ventricles) |
| `vol` | L | Current blood volume |
| `pres` | mmHg | Total pressure |
| `pres_in` | mmHg | Recoil pressure |
| `pres_tm` | mmHg | Transmural pressure |
| `pres_ext` | mmHg | External pressure (non-persistent, e.g., pericardial pressure) |

### ANS properties (unique to HeartChamber)

| Property | Unit | Description |
|---|---|---|
| `ans_sens` | 0-1 | Sensitivity to ANS activity. Set by the Heart model. |
| `ans_activity` | unitless | ANS activity level. 1.0 = baseline, >1 = sympathetic stimulation. Set by Heart model. |

### Blood composition

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
| `el_min_eff` | mmHg/L | Effective minimum elastance this step |
| `el_max_eff` | mmHg/L | Effective maximum elastance this step |
| `el_k_eff` | unitless | Effective non-linear elastance coefficient |
| `u_vol_eff` | L | Effective unstressed volume |

## ANS elastance modulation

HeartChamber overrides `calc_elastances()` to add ANS effects. The key difference from the parent class:

### Diastolic function (lusitropic effect)

ANS activation *decreases* el_min (better relaxation):

```
el_min_eff = el_min
  + (el_min_factor - 1) * el_min
  + (el_min_factor_ps - 1) * el_min
  + (el_min_factor_scaling_ps - 1) * el_min
  - (ans_activity - 1) * el_min * ans_sens    // note: SUBTRACTED
```

### Systolic function (inotropic effect)

ANS activation *increases* el_max (stronger contraction):

```
el_max_eff = el_max
  + (el_max_factor - 1) * el_max
  + (el_max_factor_ps - 1) * el_max
  + (el_max_factor_scaling_ps - 1) * el_max
  + (el_max_mob_factor - 1) * el_max          // myocardial-oxygen-balance (Mob)
  + (el_max_drug_factor - 1) * el_max         // inotropy (Drugs PK/PD)
  + (el_max_load_factor - 1) * el_max         // acute load-induced depression (HeartFunction)
  + (el_max_remodel_factor - 1) * el_max      // chronic remodeling (HeartFunction)
  + (ans_activity - 1) * el_max * ans_sens    // note: ADDED
```

A safety check ensures `el_max_eff` never falls below `el_min_eff`.

`el_k_eff` likewise adds a chronic remodeling term (`el_k_remodel_factor`, diastolic stiffening from
HeartFunction) alongside its three factor tiers, and `calc_volumes()` is overridden to add the
eccentric-dilation term (`u_vol_remodel_factor`, HeartFunction) to `u_vol_eff`. All four of these
extra factors default to `1.0` (no effect) and are *not* reset each step — see
[HeartFunction.md](./HeartFunction.md) and the Mob/Drugs models.

## Three-tier factor system

| Tier | Factors | Purpose |
|---|---|---|
| Non-persistent | `u_vol_factor`, `el_min_factor`, `el_max_factor`, `el_k_factor` | Transient effects, reset each step |
| Persistent (`_ps`) | `u_vol_factor_ps`, `el_min_factor_ps`, `el_max_factor_ps`, `el_k_factor_ps` | Heart model contractility/relaxation factors |
| Scaling (`_scaling_ps`) | `u_vol_factor_scaling_ps`, `el_min_factor_scaling_ps`, `el_max_factor_scaling_ps`, `el_k_factor_scaling_ps` | ModelScaler weight/manual scaling |

The persistent factors are the primary mechanism by which the `Heart` model controls chamber function:
- `el_max_factor_ps` is adjusted by `Heart.set_contractillity()` via `cont_factor_left/right`
- `el_min_factor_ps` is adjusted by `Heart.set_relaxation()` via `relax_factor_left/right`

## Pressure calculation

Inherited from `TimeVaryingElastance`:

```
p_ms = (vol - u_vol_eff) * el_max_eff
p_ed = el_k_eff * (vol - u_vol_eff)^2 + el_min_eff * (vol - u_vol_eff)
pres_in = (p_ms - p_ed) * act_factor + p_ed
```

During diastole (`act_factor = 0`), pressure is determined by `el_min_eff` (and `el_k_eff` for non-linear behavior). During systole (`act_factor` approaches peak), pressure is dominated by `el_max_eff`.

## Mixing logic (`volume_in`)

Overrides `volume_in` to perform composition mixing when blood flows in:

```
concentration += ((concentration_from - concentration) * dvol) / vol
```

Applied to: `to2`, `tco2`, all `solutes`, all `drugs`, `temp`, `viscosity`.

## Calculation cycle

1. `calc_elastances()` -- compute el_min_eff, el_max_eff, el_k_eff with ANS modulation (overridden)
2. `calc_volumes()` -- compute u_vol_eff including the `u_vol_remodel_factor` term (overridden)
3. `calc_pressure()` -- compute time-varying pressure (inherited from TimeVaryingElastance)

## Interaction with the Heart model

The `Heart` model orchestrates all HeartChamber instances:

1. Sets `act_factor` each step: `aaf` (atrial activation function) for LA, RAIVCI, RASVC; `vaf` (ventricular activation function) for LV, RV
2. Sets `ans_activity` and `ans_sens` for ANS coupling
3. Adjusts `el_max_factor_ps` via `set_contractillity()` (systolic function control)
4. Adjusts `el_min_factor_ps` via `set_relaxation()` (diastolic function control)

Flow between chambers is handled by separate `Resistor` models (e.g., `LA_LV` for the mitral valve, `LV_AA` for the aortic valve).

## Example definition (JSON)

```json
{
  "name": "LV",
  "description": "left ventricle",
  "model_type": "HeartChamber",
  "is_enabled": true,
  "vol": 0.0267,
  "u_vol": 0.003,
  "el_min": 133,
  "el_max": 5800,
  "el_k": 0
}
```

## Instances in the model

| Name | Chamber | Activation |
|---|---|---|
| `LA` | Left atrium | Atrial (aaf) |
| `LV` | Left ventricle | Ventricular (vaf) |
| `RAIVCI` | Right atrium (IVC portion) | Atrial (aaf) |
| `RASVC` | Right atrium (SVC portion) | Atrial (aaf) |
| `RV` | Right ventricle | Ventricular (vaf) |
