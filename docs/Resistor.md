# Resistor

A `Resistor` moves volume between two compartments driven by their pressure difference. It is the
**flow element** of the circuit and the canonical implementation of the factor / effective-value
pattern for resistances; `HeartValve` is a thin subclass, and `BloodVessel` creates `Resistor`s
internally.

## Inheritance

```
BaseModelClass
  └── Resistor          (pressure-driven flow between two compartments)
        └── HeartValve      (+ no_back_flow valve behaviour)
```

See [BaseModelClass.md](./BaseModelClass.md) for the lifecycle contract and shared fields.

## What it models

Flow from `comp_from` to `comp_to`, with separate forward/backward resistances and an optional
non-linear (turbulent) term:

```
ΔP = (comp_from.pres + p1_ext) − (comp_to.pres + p2_ext)
forward  (ΔP ≥ 0):  flow = (ΔP − r_k_eff · prev_flow²) / r_for_eff
backward (ΔP < 0):  flow = (ΔP + r_k_eff · prev_flow²) / r_back_eff     (unless no_back_flow)
```

The resistor does not store volume itself — it reads the two compartments' pressures, computes a flow,
and hands the volume across via their `volume_out`/`volume_in` methods.

## Properties

### Config / independent (set in the definition JSON)

| Property | Unit | Description |
|---|---|---|
| `r_for` | mmHg·s/L | Forward flow resistance |
| `r_back` | mmHg·s/L | Backward flow resistance |
| `r_k` | unitless | Non-linear (turbulent) resistance coefficient |
| `comp_from` | string | Name of the upstream compartment |
| `comp_to` | string | Name of the downstream compartment |
| `no_flow` | bool | When true, block all flow (set `flow = 0` and return) |
| `no_back_flow` | bool | When true, block backward flow (valve behaviour) |
| `p1_ext` | mmHg | External pressure added at the inlet (non-persistent; cleared each step) |
| `p2_ext` | mmHg | External pressure added at the outlet (non-persistent; cleared each step) |
| `fixed_composition` | bool | Passed through to the endpoints' volume handling |
| `is_externally_managed` | bool | Flag read by owning models to skip their own flow calc |

Factor inputs (all default `1.0`) — see [Factor system](#factor-system):
`r_factor`, `r_k_factor` (non-persistent); `r_factor_ps`, `r_k_factor_ps` (persistent);
`r_factor_scaling_ps`, `r_k_factor_scaling_ps` (scaling). Note a **single** `r_factor` layer scales
both `r_for` and `r_back`.

### Computed / dependent (engine outputs)

| Property | Unit | Description |
|---|---|---|
| `flow` | L/s | Current flow (positive = forward, negative = backward) |
| `r_for_eff` | mmHg·s/L | Effective forward resistance after the factor layers |
| `r_back_eff` | mmHg·s/L | Effective backward resistance after the factor layers |
| `r_k_eff` | unitless | Effective non-linear coefficient after the factor layers |
| `_comp_from` / `_comp_to` | ref | Resolved references to the up/downstream compartments |
| `_prev_flow` | L/s | Flow from the previous step (used by the non-linear term) |

## Calculation cycle (`calc_model`)

Each step: resolve `_comp_from`/`_comp_to` from `model.models`, then `calc_resistance()` →
`calc_flow()`.

### `calc_resistance`

```
r_for_eff  = r_for  + (r_factor − 1)·r_for   + (r_factor_ps − 1)·r_for   + (r_factor_scaling_ps − 1)·r_for
r_back_eff = r_back + (r_factor − 1)·r_back  + (r_factor_ps − 1)·r_back  + (r_factor_scaling_ps − 1)·r_back
r_k_eff    = r_k    + (r_k_factor − 1)·r_k   + (r_k_factor_ps − 1)·r_k   + (r_k_factor_scaling_ps − 1)·r_k
```

Then resets the non-persistent factors `r_factor` and `r_k_factor` to `1.0`.

### `calc_flow`

1. Compute inlet/outlet pressures including the non-persistent `p1_ext`/`p2_ext`, then clear those and
   reset `flow` to `0`.
2. If `no_flow`, set `_prev_flow = 0` and return.
3. Pick the direction by the sign of `ΔP` (forward if `ΔP ≥ 0`, else backward unless `no_back_flow`),
   guard against a non-positive effective resistance, and compute `flow` with the lagged non-linear
   term.
4. Move the volume across:
   - `comp_from.volume_out(flow · Δt)` returns any volume it could not supply;
   - `comp_to.volume_in(flow · Δt − un-supplied, comp_from)` adds the rest and mixes composition.

   This `volume_out` → `volume_in` handshake conserves volume — a resistor never creates volume from
   an empty compartment.
5. Store `_prev_flow = flow` (or clear it to `0` when no flow occurred — no-flow or blocked backflow)
   so the non-linear term stays consistent next step.

## Factor system

The resistances are **never used raw**. Each parameter combines three multiplier layers **additively
against the base** into an `*_eff` value:

| Layer | Persistence | Set by |
|---|---|---|
| `<p>_factor` | reset to `1.0` every step | transient interventions |
| `<p>_factor_ps` | persistent | user / scenario / regulator models (ANS, Circulation…) |
| `<p>_factor_scaling_ps` | persistent | `ModelScaler` (allometric/weight scaling) |

```
p_eff = p + (factor − 1)·p + (factor_ps − 1)·p + (factor_scaling_ps − 1)·p
```

`r_factor` / `r_factor_ps` / `r_factor_scaling_ps` apply identically to both `r_for` and `r_back`;
`r_k` has its own `r_k_factor` family. This is the same pattern as [`Capacitance`](./Capacitance.md).

## Notes

- **Non-linear term.** It reads `_prev_flow`, not the just-reset `flow` — an explicit lagged scheme; at
  steady state `prev_flow == flow`. (An earlier version used the zeroed `flow`, so `r_k` was inert.)
- **Resistance guard.** A non-positive effective resistance is skipped (no flow) to avoid an
  Infinity/NaN flow.
- `r_k` is `0` in the standard scenarios, so the linear Poiseuille term dominates; the non-linear term
  is available for turbulent/stenotic elements.

## Example definition (JSON)

```json
{
  "name": "PA_PAAL",
  "description": "input connector for PAAL",
  "model_type": "Resistor",
  "is_enabled": true,
  "r_for": 1493.7,
  "r_back": 1493.7,
  "r_k": 0,
  "comp_from": "PA",
  "comp_to": "PAAL",
  "no_flow": false,
  "no_back_flow": false,
  "p1_ext": 0,
  "p2_ext": 0,
  "fixed_composition": false,
  "is_externally_managed": false
}
```

## Usage in the model

- Every connection that carries flow between two compartments is a `Resistor` (a typical neonate
  scenario has ~40 of them wiring the circuit together by `comp_from`/`comp_to`).
- Set `no_back_flow` for valve-like behaviour (or use `HeartValve`).
- `r_factor_ps` is the standard lever for vasoconstriction/dilation (PVR/SVR adjustments by ANS and
  scenario tuning); `r_factor_scaling_ps` is written by `ModelScaler` for weight-based scaling.
