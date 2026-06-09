# GasExchanger

A `GasExchanger` moves O₂ and CO₂ between a **blood** compartment and a **gas** compartment, driven by
their partial-pressure difference — the alveolar gas exchange of the lung and the membrane of an ECLS
oxygenator.

## What it models

```
blood (po2, pco2)  ⇌[GasExchanger]⇌  gas (po2, pco2)
        flux = (p_blood − p_gas) · dif · Δt
```

Each step it refreshes the blood composition, computes the O₂ and CO₂ fluxes from the partial-pressure
gradients, and transfers them: oxygen and carbon dioxide move down their gradients between the blood's
`to2`/`tco2` and the gas's `co2`/`cco2`.

`dif_o2` and `dif_co2` use the [factor / effective-value pattern](./Capacitance.md)
(`dif_o2_factor`/`_ps`/`_scaling`) so `Respiration` (and scaling) can modulate diffusion capacity.

## Calculation cycle (`calc_model`)

1. `calc_blood_composition(comp_blood)` to get current `po2`/`pco2`.
2. Skip the step if either compartment's volume is 0 (both volumes are denominators).
3. Compose the effective diffusion constants from the factors.
4. ```
   flux_o2  = (po2_blood  − po2_gas)  · dif_o2_step  · Δt
   flux_co2 = (pco2_blood − pco2_gas) · dif_co2_step · Δt
   ```
   Update the new blood `to2`/`tco2` (floored at 0) and the gas `co2`/`cco2`.
5. Write the results back, **guarding each compartment by `fixed_composition`** so a fixed
   (infinite-reservoir) compartment is not changed.

## Wiring

Configured with `comp_blood` and `comp_gas` (the two compartment names). Used as `GASEX_LL` /
`GASEX_RL` (lung capillary ↔ alveolar gas) and `ECLS_GASEX` (oxygenator blood ↔ sweep gas).

## Notes

- O₂ leaves blood when `po2_blood > po2_gas` and enters it when the gradient reverses; the signed flux
  handles both directions, so the same element loads O₂ at the lung and the gradient simply flips for
  CO₂.
- Both the volume guard and the `fixed_composition` guards were added so a collapsed alveolus cannot
  produce NaN and a fixed sweep-gas/blood reservoir stays constant.
