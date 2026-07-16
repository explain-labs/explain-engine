# Capacitance

A `Capacitance` is the base **volume compartment** of the engine: it holds a volume and produces a
pressure from its elastance. It is the canonical implementation of the factor / effective-value
pattern for elastance-based elements. `BloodCapacitance`, `GasCapacitance` and (indirectly)
`BloodVessel` build on it.

## Inheritance

```
BaseModelClass
  └── Capacitance              (volume → elastance → pressure)
        ├── BloodCapacitance       (+ blood composition mixing)
        │     └── BloodVessel          (+ resistance, flow, ANS coupling)
        └── GasCapacitance         (+ gas composition, atmospheric/external pressures)
```

See [BaseModelClass.md](./BaseModelClass.md) for the lifecycle contract and shared fields, and
[BloodCapacitance.md](./BloodCapacitance.md) for the blood-tracking subclass.

## What it models

A passive elastic compartment. Volume flows in and out (driven by external [`Resistor`](./Resistor.md)
models that reference it via `comp_from`/`comp_to`), and the compartment converts the volume above its
unstressed volume into a recoil pressure through its elastance. It has no built-in resistance or flow
of its own.

## Properties

### Config / independent (set in the definition JSON)

| Property | Unit | Description |
|---|---|---|
| `u_vol` | L | Unstressed volume (volume at which recoil pressure is zero) |
| `el_base` | mmHg/L | Baseline (linear) elastance |
| `el_k` | unitless | Non-linear elastance coefficient (quadratic stiffening term) |
| `pres_ext` | mmHg | External pressure applied this step (non-persistent; cleared each step) |
| `fixed_composition` | bool | When true, `volume_in`/`volume_out` do not change `vol` (infinite reservoir) |

Factor inputs (all default `1.0`) — see [Factor system](#factor-system):
`u_vol_factor`, `el_base_factor`, `el_k_factor` (non-persistent);
`u_vol_factor_ps`, `el_base_factor_ps`, `el_k_factor_ps` (persistent);
`u_vol_factor_scaling_ps`, `el_base_factor_scaling_ps`, `el_k_factor_scaling_ps` (scaling).

### Computed / dependent (engine outputs)

| Property | Unit | Description |
|---|---|---|
| `vol` | L | Current volume |
| `pres` | mmHg | Total pressure (`pres_in + pres_ext`) |
| `pres_in` | mmHg | Internal recoil pressure of the elastance |
| `pres_tm` | mmHg | Transmural pressure (`pres_in − pres_ext`) |
| `el_eff` | mmHg/L | Effective elastance after the factor layers |
| `u_vol_eff` | L | Effective unstressed volume after the factor layers |
| `el_k_eff` | unitless | Effective non-linear coefficient after the factor layers |

## Calculation cycle (`calc_model`)

Each step runs, in order: `calc_elastances()` → `calc_volumes()` → `calc_pressure()`.

### `calc_elastances`

```
el_eff   = el_base + (el_base_factor − 1)·el_base + (el_base_factor_ps − 1)·el_base + (el_base_factor_scaling_ps − 1)·el_base
el_k_eff = el_k    + (el_k_factor − 1)·el_k       + (el_k_factor_ps − 1)·el_k       + (el_k_factor_scaling_ps − 1)·el_k
```

Then resets the non-persistent factors `el_base_factor` and `el_k_factor` to `1.0`.

### `calc_volumes`

```
u_vol_eff = u_vol + (u_vol_factor − 1)·u_vol + (u_vol_factor_ps − 1)·u_vol + (u_vol_factor_scaling_ps − 1)·u_vol
```

Then resets the non-persistent factor `u_vol_factor` to `1.0`.

### `calc_pressure`

```
pres_in = el_k_eff · (vol − u_vol_eff)² + el_eff · (vol − u_vol_eff)
pres_tm = pres_in − pres_ext                 (transmural)
pres    = pres_in + pres_ext                 (total)
pres_ext := 0                                (external pressure is non-persistent)
```

The `el_k_eff` term adds non-linear stiffening; because it uses `(vol − u_vol_eff)²` (sign-independent)
it also raises pressure *below* the unstressed volume — this is the engine convention, and `el_k` is
`0` for most compartments. `pres_ext` is an external pressure (e.g. from a [`Container`](./Container.md)
or chest compression) applied this step and then cleared.

## Volume flow

- **`volume_in(dvol)`** — adds `dvol` to `vol` (skipped when `fixed_composition`). Subclasses extend
  this to mix in the incoming composition.
- **`volume_out(dvol)`** — removes `dvol` from `vol` (skipped when `fixed_composition`); if the volume
  would go negative it is clamped to `0` and the **un-removed** amount is returned, so a `Resistor`
  never pulls volume that isn't there. A `fixed_composition` compartment therefore supplies volume
  without depleting (an infinite reservoir).

## Factor system

Core physics parameters (`el_base`, `u_vol`, `el_k`) are **never used raw**. Each has three multiplier
layers that combine **additively against the base** into an `*_eff` value:

| Layer | Persistence | Set by |
|---|---|---|
| `<p>_factor` | reset to `1.0` every step | transient interventions |
| `<p>_factor_ps` | persistent | user / scenario / regulator models (ANS, MOB, Circulation…) |
| `<p>_factor_scaling_ps` | persistent | `ModelScaler` (allometric/weight scaling) |

```
p_eff = p + (factor − 1)·p + (factor_ps − 1)·p + (factor_scaling_ps − 1)·p
```

A factor of `1.0` means "no effect"; simultaneous factors add their deltas. `calc_elastances` /
`calc_volumes` reset only the non-persistent `*_factor` layer each step. When you add a tunable
parameter, follow this convention so it composes with interventions and scaling.

## Example definition (JSON)

Plain `Capacitance` is rarely instantiated directly in scenarios (the blood/gas subclasses are used);
a definition block carries the config fields below (factor fields default to `1.0` and are usually
omitted):

```json
{
  "name": "EXAMPLE_COMP",
  "description": "passive elastic compartment",
  "model_type": "Capacitance",
  "is_enabled": true,
  "vol": 0.04,
  "u_vol": 0.038,
  "el_base": 3100,
  "el_k": 0,
  "fixed_composition": false
}
```

## Usage in the model

- The foundational elastance element; almost every volume-holding compartment is a `Capacitance`
  subclass.
- Use it (or a subclass) for any compartment that is a pure compliance with no built-in flow —
  flow is provided by separate [`Resistor`](./Resistor.md) models that reference it.
- `fixed_composition` turns it into an infinite reservoir (outside air, maternal blood,
  ventilator/ECLS gas sources).
