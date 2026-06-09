# GasDiffusor

A `GasDiffusor` diffuses gases between **two gas compartments**, driven by their partial-pressure
difference. It is the gas-to-gas analogue of [`BloodDiffusor`](./BloodDiffusor.md) (which is
blood-to-blood) and [`GasExchanger`](./GasExchanger.md) (which is blood-to-gas).

## What it models

```
gas1 (po2, pco2, pn2, pother)  ⇌[GasDiffusor]⇌  gas2 (...)
   flux = (p1 − p2) · dif · Δt
```

Each step it refreshes both gas compartments' composition, then moves O₂, CO₂, N₂ and "other" down
their partial-pressure gradients between the compartments' concentrations (`co2`/`cco2`/`cn2`/
`cother`).

`dif_o2`, `dif_co2`, `dif_n2`, `dif_other` use the [factor / effective-value pattern](./Capacitance.md).

## Calculation cycle (`calc_model`)

1. Refresh each compartment's partial pressures via the **`GasCapacitance.calc_gas_composition`
   method** — which derives partials from the current concentrations. (Not the standalone
   `calc_gas_composition` initializer, which would reset the compartments to a fixed room-air mix.)
2. Compose the effective diffusion constants.
3. For each species, compute the flux and apply it to both compartments, **each write guarded by
   `fixed_composition` and a positive volume**.

## Notes

- **Not used in the standard scenarios** (the lung uses a `GasExchanger` to blood, not a gas-gas
  diffusor), so this element is latent — but correct if wired up.
- The method-vs-initializer distinction in step 1 is essential: calling the standalone initializer
  here would overwrite both compartments with room air every step (and so produce no real diffusion).
