# BloodDiffusor

A `BloodDiffusor` exchanges gases and solutes between **two blood compartments** — used where blood
equilibrates with blood across a membrane rather than with a gas, most notably the placenta
(fetal capillary ↔ maternal pool).

## What it models

```
blood1 (po2, pco2, solutes)  ⇌[BloodDiffusor]⇌  blood2 (po2, pco2, solutes)
   gases:   flux = (p1 − p2) · dif · Δt          (partial-pressure driven)
   solutes: flux = (c1 − c2) · dif · Δt          (concentration driven)
```

Each step it refreshes both compartments' blood composition (for the partial pressures), then moves
O₂ and CO₂ down their **partial-pressure** gradients and each configured solute down its
**concentration** gradient.

`dif_o2`, `dif_co2` and the per-solute `dif_solutes` use the
[factor / effective-value pattern](./Capacitance.md).

## Calculation cycle (`calc_model`)

1. `calc_blood_composition` on both compartments.
2. Compose the effective diffusion constants from the factors.
3. For O₂, CO₂ and each solute: compute the flux and apply it to both compartments, **each write
   guarded by `fixed_composition` and a positive volume**, so a fixed reservoir (e.g. the maternal
   pool `PL_MAT`) supplies/absorbs gas without changing its own composition and an empty compartment
   never divides by zero.

## Wiring

Configured with `comp_blood1` / `comp_blood2` and the diffusion constants. The placenta's `PL_GASEX`
connects the fetal capillary to the fixed maternal pool.

## Notes

- This is the reference implementation the other diffusors follow: it already guarded
  `fixed_composition` on every write, which is why the maternal pool stays constant.
- Gases use partial pressures (so they respect the dissociation curves), while solutes use raw
  concentrations.
