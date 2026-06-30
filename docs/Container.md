# Container

A `Container` is an enclosing compartment that **wraps other compartments** and squeezes them with its
own recoil pressure — the model of the thorax and the pericardium. Its volume is the sum of what it
contains, and its pressure is transmitted to those contents. It reuses the elastance machinery of
[`Capacitance`](./Capacitance.md) but holds no flow of its own.

## Inheritance

```
BaseModelClass
  └── Container          (sum contained volume → elastance → broadcast pressure)
```

`Container` extends `BaseModelClass` directly (it does not derive from `Capacitance`), but implements
the same `el_base`/`u_vol`/`el_k` factor pattern and the same `calc_pressure` recoil formula. See
[BaseModelClass.md](./BaseModelClass.md) for the lifecycle contract.

## What it models

```
THORAX (Container) ── contains ──► PERICARDIUM (Container) ── contains ──► LV, RV, LA, RA, COR
        ── also contains ──► lungs (ALL, ALR), great vessels, …
```

`THORAX` holds the lungs, heart and intrathoracic vessels; `PERICARDIUM` (inside the thorax) holds the
heart chambers. Containers nest, so pressure propagates inward (thorax → pericardium → chambers). A
container's own volume is derived from its members, so it does not store fluid itself and is never a
flow endpoint.

## Properties

### Config / independent (set in the definition JSON)

| Property | Unit | Description |
|---|---|---|
| `u_vol` | L | Unstressed volume of the container |
| `el_base` | mmHg/L | Baseline (linear) elastance |
| `el_k` | unitless | Non-linear elastance coefficient |
| `pres_ext` | mmHg | External pressure applied this step (non-persistent; cleared each step) |
| `vol_extra` | L | Additional fixed volume added to the contained sum |
| `contained_components` | string[] | Names of the models this container encloses |

Factor inputs (all default `1.0`) — see [Factor system](#factor-system):
`u_vol_factor`, `el_base_factor`, `el_k_factor` (non-persistent);
`u_vol_factor_ps`, `el_base_factor_ps`, `el_k_factor_ps` (persistent);
`u_vol_factor_scaling_ps`, `el_base_factor_scaling_ps`, `el_k_factor_scaling_ps` (scaling).

### Computed / dependent (engine outputs)

| Property | Unit | Description |
|---|---|---|
| `vol` | L | Container volume (`vol_extra + Σ contained.vol`) |
| `pres` | mmHg | Total pressure (`pres_in + pres_ext`) |
| `pres_in` | mmHg | Internal recoil pressure |
| `pres_tm` | mmHg | Transmural pressure (`pres_in − pres_ext`) |
| `el_eff` | mmHg/L | Effective elastance after the factor layers |
| `u_vol_eff` | L | Effective unstressed volume after the factor layers |
| `el_k_eff` | unitless | Effective non-linear coefficient after the factor layers |

## Calculation cycle (`calc_model`)

Each step: `calc_elastances()` → `calc_volumes()` → `calc_pressure()`.

### `calc_elastances`

Composes `el_eff` and `el_k_eff` from the base values and the three factor layers (identical to
[`Capacitance`](./Capacitance.md)), then resets the non-persistent `el_base_factor` / `el_k_factor`
to `1.0`.

### `calc_volumes`

```
vol = vol_extra + Σ contained.vol          (over members that exist and are enabled)
u_vol_eff = u_vol + (u_vol_factor − 1)·u_vol + (u_vol_factor_ps − 1)·u_vol + (u_vol_factor_scaling_ps − 1)·u_vol
```

Then resets the non-persistent `u_vol_factor` to `1.0`. Members are looked up by name in
`model.models`; missing or disabled members are skipped.

### `calc_pressure`

```
pres_in = el_k_eff · (vol − u_vol_eff)² + el_eff · (vol − u_vol_eff)
pres_tm = pres_in − pres_ext
pres    = pres_in + pres_ext
for each contained component (existing & enabled):  component.pres_ext += pres
pres_ext := 0
```

The container's full pressure is **added** to every contained component's `pres_ext`, which those
components read in their own `calc_pressure`. Because contents reset `pres_ext` each step, the
contributions compose without accumulating.

## Factor system

`el_base`, `u_vol`, `el_k` are **never used raw**. Each combines three multiplier layers **additively
against the base** into an `*_eff` value:

| Layer | Persistence | Set by |
|---|---|---|
| `<p>_factor` | reset to `1.0` every step | transient interventions |
| `<p>_factor_ps` | persistent | user / scenario / regulator models (e.g. `Breathing`) |
| `<p>_factor_scaling_ps` | persistent | `ModelScaler` (allometric/weight scaling) |

```
p_eff = p + (factor − 1)·p + (factor_ps − 1)·p + (factor_scaling_ps − 1)·p
```

Same pattern as [`Capacitance`](./Capacitance.md).

## Notes

- **Membership is name-based and enable-aware.** Volume is summed and pressure transmitted only for
  members that resolve to a model and are `is_enabled`; missing or disabled members are skipped (so a
  disabled chamber neither adds phantom volume nor accumulates an unbounded `pres_ext`).
- **Sub-unstressed operation matters.** The thorax runs *below* its unstressed volume (`vol < u_vol`),
  so a higher elastance makes `pres_in` more negative — this is how `Breathing`'s muscle effort
  (which raises `THORAX.el_base_factor`) produces inspiratory suction.
- The order of stepping sets whether a content sees this step's container pressure or last step's (at
  most one step of lag) — inherent to sequential stepping, stable at the default step size.

## Example definition (JSON)

```json
{
  "name": "UPPER_BODY",
  "description": "passive container grouping cephalic vessels for tilt",
  "model_type": "Container",
  "is_enabled": true,
  "u_vol": 0,
  "el_base": 0,
  "el_k": 0,
  "pres_ext": 0,
  "vol_extra": 0,
  "contained_components": ["BR_ART", "BR_CAP", "BR_VEN", "RUB", "VUB", "THORAX"]
}
```

## Usage in the model

- `THORAX` and `PERICARDIUM` are the canonical containers (created inside the respiration/heart
  composite models); they transmit intrathoracic/pericardial pressure to the lungs, great vessels and
  heart chambers.
- `Breathing` drives `THORAX.el_base_factor` to generate the inspiratory pressure swing.
- Also used as passive grouping containers (e.g. `UPPER_BODY`) for postural/tilt experiments.
