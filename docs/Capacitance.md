# Capacitance

A `Capacitance` is the base **volume compartment**: it holds a volume and produces a pressure from
its elastance. `BloodCapacitance`, `GasCapacitance` and (indirectly) `BloodVessel` build on it.

## Inheritance

```
BaseModelClass
  └── Capacitance         (volume → elastance → pressure)
        ├── BloodCapacitance   (+ blood composition)
        └── GasCapacitance     (+ gas composition, atmospheric/external pressures)
```

## The factor / effective-value pattern (engine-wide)

Core physics parameters are **never used raw**. Each (`el_base`, `u_vol`, `el_k` here; `r_for`,
`r_back`, `r_k` on `Resistor`; `el_min`/`el_max` on `TimeVaryingElastance`) has three multiplier
layers that combine **additively against the base** into an `*_eff` value:

| Layer | Persistence | Set by |
|---|---|---|
| `<p>_factor` | reset to 1.0 every step | transient interventions |
| `<p>_factor_ps` | persistent | user / scenario / regulator models (ANS, MOB, Circulation…) |
| `<p>_factor_scaling_ps` | persistent | `ModelScaler` (allometric/weight scaling) |

```
p_eff = p + (factor − 1)·p + (factor_ps − 1)·p + (factor_scaling_ps − 1)·p
```

So each factor of 1.0 is "no effect", and simultaneous factors add their deltas. When you add a
tunable parameter, follow this convention so it composes with interventions and scaling.

## Calculation cycle (`calc_model`)

1. **`calc_elastances`** — compute `el_eff` and `el_k_eff` from the factors; reset the non-persistent
   factors.
2. **`calc_volumes`** — compute `u_vol_eff`; reset the non-persistent factor.
3. **`calc_pressure`**:
   ```
   pres_in = el_k_eff · (vol − u_vol_eff)² + el_eff · (vol − u_vol_eff)
   pres_tm = pres_in − pres_ext                 (transmural)
   pres    = pres_in + pres_ext                 (total)
   pres_ext := 0                                (external pressure is non-persistent)
   ```
   The `el_k_eff` term adds non-linear stiffening at high volume; `pres_ext` is an external pressure
   (e.g. from a `Container` or chest compression) applied this step and then cleared.

## Volume flow

- **`volume_in(dvol, comp_from)`** — add `dvol` (skipped when `fixed_composition`). Subclasses extend
  this to mix in the incoming composition.
- **`volume_out(dvol)`** — remove `dvol` (skipped when `fixed_composition`); if the volume would go
  negative it is clamped to 0 and the **un-removed** amount is returned, so a `Resistor` never pulls
  volume that isn't there. A `fixed_composition` compartment supplies volume without depleting (an
  infinite reservoir).

## Notes

- **`fixed_composition`** freezes both volume and (in the subclasses) composition — used for
  infinite reservoirs (outside air, maternal blood, ventilator/ECLS gas sources).
- The non-linear term uses `(vol − u_vol_eff)²` (sign-independent), so it also adds positive pressure
  below the unstressed volume; this is the engine convention and `el_k` is 0 for most compartments.
