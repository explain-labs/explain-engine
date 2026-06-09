# GasCapacitance

A `GasCapacitance` is a [`Capacitance`](./Capacitance.md) that holds **gas** instead of blood. It adds
gas composition (O₂, CO₂, N₂, water vapour, other), temperature/humidity dynamics, and the
atmospheric/external pressures relevant to a gas space (airways, alveoli, ventilator/ECLS circuits).

## Inheritance

```
BaseModelClass
  └── Capacitance
        └── GasCapacitance   (gas composition, heat, water vapour, atmospheric pressure)
```

## Gas state

Concentrations (mmol/L): `co2` (oxygen — note the name is "concentration of O₂"), `cco2`, `cn2`,
`cother`, `ch2o`, summed as `ctotal`. Partial pressures (`po2`, `pco2`, `pn2`, `pother`, `ph2o`) and
fractions (`fo2`, …) are derived from those.

## Calculation cycle (`calc_model`)

1. **`add_heat`** — relax `temp` toward `target_temp`; adjust volume for the temperature change
   (skipped for `fixed_composition`).
2. **`add_watervapour`** — drive `ch2o` toward the saturated vapour concentration at the current
   temperature; adjust volume (the concentration update is skipped for `fixed_composition`).
3. **`calc_elastances` / `calc_volumes`** (inherited) and **`calc_pressure`** — which adds the
   external/chest/muscle/atmospheric pressures:
   `pres = pres_in + pres_ext + pres_cc + pres_mus + pres_atm`, and reports `pres_rel`
   (relative to atmospheric).
4. **`calc_gas_composition`** (the method) — recompute `ctotal` from the concentrations and derive the
   partial pressures and fractions. (Distinct from the standalone
   [`calc_gas_composition`](./GasComposition.md) initializer.)

## Composition mixing (`volume_in`)

When gas flows in, the incoming concentrations and temperature are mixed by volume fraction — the same
algebraically-correct dilution as `BloodCapacitance`. The mixing is **skipped for `fixed_composition`
compartments** (an infinite reservoir holds its composition) and **guarded against an empty
compartment** (no division by zero).

## Notes

- `fixed_composition` is honoured in `volume_in`, in the `add_watervapour` concentration update, and
  by the diffusors/exchangers — so reservoirs like `MOUTH`, the ventilator gas source and the ECLS
  sweep gas stay constant.
- `pres_cc` (chest compression) and `pres_mus` (muscle) are external-pressure channels that
  `GasCapacitance` reads; `Capacitance`/`Container`/`TimeVaryingElastance` read only `pres_ext`.
