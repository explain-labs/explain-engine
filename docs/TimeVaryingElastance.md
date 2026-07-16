# TimeVaryingElastance

A `TimeVaryingElastance` is a volume compartment whose stiffness **varies over the cardiac cycle** —
the base for contractile chambers (`HeartChamber`, `BloodTimeVaryingElastance`). Each step it
interpolates between a relaxed (diastolic) and a contracted (systolic) pressure–volume relation,
driven by an activation factor. It is the canonical implementation of the factor / effective-value
pattern for the dual-elastance case.

## Inheritance

```
BaseModelClass
  └── TimeVaryingElastance        (el_min/el_max, act_factor)
        ├── HeartChamber               (+ blood composition, ANS/MOB contractility)
        └── BloodTimeVaryingElastance  (+ blood composition)
```

See [BaseModelClass.md](./BaseModelClass.md) for the lifecycle contract and shared fields.

## What it models

A chamber whose recoil pressure swings between an end-diastolic curve (relaxed) and an end-systolic
curve (contracted) under an activation signal. With `act_factor = 0` it behaves like a passive
[`Capacitance`](./Capacitance.md) on its diastolic curve; with `act_factor = 1` it sits on its
systolic curve. This is the standard time-varying-elastance model of cardiac contraction.

## Properties

### Config / independent (set in the definition JSON)

| Property | Unit | Description |
|---|---|---|
| `u_vol` | L | Unstressed volume |
| `el_min` | mmHg/L | Minimal (end-diastolic) elastance — the EDPVR |
| `el_max` | mmHg/L | Maximal (end-systolic) elastance — the ESPVR |
| `el_k` | unitless | Non-linear elastance coefficient (diastolic curve only) |
| `pres_ext` | mmHg | External pressure applied this step (non-persistent; cleared each step) |
| `act_factor` | unitless | Activation factor (0 → 1), supplied by the `Heart` model |

Factor inputs (all default `1.0`) — see [Factor system](#factor-system):
`u_vol_factor`, `el_min_factor`, `el_max_factor`, `el_k_factor` (non-persistent);
`u_vol_factor_ps`, `el_min_factor_ps`, `el_max_factor_ps`, `el_k_factor_ps` (persistent);
`u_vol_factor_scaling_ps`, `el_min_factor_scaling_ps`, `el_max_factor_scaling_ps`,
`el_k_factor_scaling_ps` (scaling).

### Computed / dependent (engine outputs)

| Property | Unit | Description |
|---|---|---|
| `vol` | L | Current volume |
| `pres` | mmHg | Total pressure (`pres_in + pres_ext`) |
| `pres_in` | mmHg | Internal recoil pressure |
| `pres_tm` | mmHg | Transmural pressure (`pres_in − pres_ext`) |
| `el_min_eff` | mmHg/L | Effective minimal elastance after the factor layers |
| `el_max_eff` | mmHg/L | Effective maximal elastance after the factor layers |
| `u_vol_eff` | L | Effective unstressed volume after the factor layers |
| `el_k_eff` | unitless | Effective non-linear coefficient after the factor layers |

## Calculation cycle (`calc_model`)

Each step: `calc_elastances()` → `calc_volumes()` → `calc_pressure()`.

### `calc_elastances`

```
el_min_eff = el_min + (el_min_factor − 1)·el_min + (el_min_factor_ps − 1)·el_min + (el_min_factor_scaling_ps − 1)·el_min
el_max_eff = el_max + (el_max_factor − 1)·el_max + (el_max_factor_ps − 1)·el_max + (el_max_factor_scaling_ps − 1)·el_max
el_k_eff   = el_k   + (el_k_factor − 1)·el_k     + (el_k_factor_ps − 1)·el_k     + (el_k_factor_scaling_ps − 1)·el_k
```

It then clamps `el_max_eff` to be ≥ `el_min_eff`, and resets the non-persistent factors
`el_min_factor`, `el_max_factor`, `el_k_factor` to `1.0`.

### `calc_volumes`

```
u_vol_eff = u_vol + (u_vol_factor − 1)·u_vol + (u_vol_factor_ps − 1)·u_vol + (u_vol_factor_scaling_ps − 1)·u_vol
```

Then resets the non-persistent factor `u_vol_factor` to `1.0`.

### `calc_pressure`

```
p_ms = (vol − u_vol_eff) · el_max_eff                                  (end-systolic, linear)
p_ed = el_k_eff · (vol − u_vol_eff)² + el_min_eff · (vol − u_vol_eff)  (end-diastolic, non-linear)
pres_in = (p_ms − p_ed) · act_factor + p_ed
pres    = pres_in + pres_ext                                          (total)
pres_tm = pres_in − pres_ext                                          (transmural)
pres_ext := 0                                                         (external pressure is non-persistent)
```

`act_factor` runs `0 → 1` over a contraction: at 0 the chamber sits on its diastolic curve (`p_ed`), at
1 on its systolic curve (`p_ms`), interpolating linearly in between. The non-linear `el_k` term lives
only in the diastolic relation (the EDPVR stiffens at high filling), which is the physiologically
expected shape.

`act_factor` is supplied by the `Heart` model (the atrial/ventricular activation functions `aaf`/
`vaf`); see [HeartChamber.md](./HeartChamber.md) for the ANS/MOB contractility coupling layered on top
of `el_max`.

## Volume flow

`volume_in`/`volume_out` behave as in [Capacitance](./Capacitance.md): `volume_out` clamps at `0` and
returns the un-removed volume; subclasses extend `volume_in` to mix the incoming blood composition. The
`volume_out` negative-volume guard (`vol < 0 && vol < u_vol`) is functionally equivalent to `vol < 0`
for any non-negative `u_vol`. Heart chambers can fall below their unstressed volume during ejection
(ventricular suction), which the formula handles naturally.

## Factor system

Both elastances plus `el_k` and `u_vol` are **never used raw**. Each combines three multiplier layers
**additively against the base** into an `*_eff` value:

| Layer | Persistence | Set by |
|---|---|---|
| `<p>_factor` | reset to `1.0` every step | transient interventions |
| `<p>_factor_ps` | persistent | user / scenario / regulator models (ANS, MOB…) |
| `<p>_factor_scaling_ps` | persistent | `ModelScaler` (allometric/weight scaling) |

```
p_eff = p + (factor − 1)·p + (factor_ps − 1)·p + (factor_scaling_ps − 1)·p
```

Same pattern as [`Capacitance`](./Capacitance.md), applied to `el_min`, `el_max`, `el_k`, and `u_vol`.
Contractility interventions typically drive `el_max_factor_ps`.

## Example definition (JSON)

Plain `TimeVaryingElastance` is not instantiated directly in scenarios (the contractile subclasses are
used); a definition block carries the config fields below (factor fields default to `1.0` and are
usually omitted):

```json
{
  "name": "EXAMPLE_CHAMBER",
  "description": "contractile chamber",
  "model_type": "TimeVaryingElastance",
  "is_enabled": true,
  "vol": 0.015,
  "u_vol": 0.005,
  "el_min": 100,
  "el_max": 1500,
  "el_k": 0,
  "act_factor": 0
}
```

## Usage in the model

- The base for every contractile cardiac chamber: `HeartChamber` (LV/RV/LA/RA) and
  `BloodTimeVaryingElastance`.
- `el_max_factor_ps` is the primary contractility lever (used by ANS/MOB and scenario tuning);
  `el_min`/`el_min_factor_ps` set diastolic stiffness (e.g. for filling-pressure / CVP shaping).
- `act_factor` is written each step by the `Heart` model — do not set it statically.
