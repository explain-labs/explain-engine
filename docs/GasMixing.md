# GasMixing

`helpers/GasMixing.js` holds `exchange_gas`, the gas counterpart of [BloodMixing](./BloodMixing.md)'s `exchange_blood`: two gas compartments swap an equal volume of gas each step, so their compositions move toward each other without any net flow. It is what a [Resistor](./Resistor.md#mixing-without-net-flow-mix_flow)'s `mix_flow` does between gas compartments.

## Physiology

Gas moves between the airways and the alveoli not only by bulk flow. Near the alveoli, molecular diffusion takes over, and the heartbeat stirs the gas in the small airways (cardiogenic mixing). Both mix fresh and alveolar gas a little even between breaths, or with no breathing at all (apnoeic oxygenation, CO2 washout during apnoea).

## API

| Function | Arguments | Description |
|---|---|---|
| `exchange_gas(a, b, dv)` | two GasCapacitances, volume swapped each way (L) | Swaps `dv` of gas between the ends of `a` and `b` that face each other. |

```
dv   = min(dv, ½ · min(V_a_end, V_b_end))          stability clamp
Δn_k = (c_b,k − c_a,k) · dv                        mmol of species k moving b → a
a gains Δn_k at its end facing b, b loses it at its end facing a
```

- Applied to O2, CO2, N2, H2O and other; each species is conserved and no volume moves.
- **The end facing the neighbour:** for a well-mixed compartment its bulk; for a series dead space (see [GasCapacitance](./GasCapacitance.md#series-dead-space)) the sub-tank at that end, so DS–alveolus mixing acts on the distal sub-tank, not the whole dead space.
- **A `fixed_composition` side** keeps its composition (an infinite reservoir); the other side relaxes toward it.
- **No effect** when `dv ≤ 0` or either end volume is 0.
- **Temperature is not exchanged;** each compartment's wall sets it.

`Resistor.step_model` calls it when `mix_flow > 0`, the connection is open, and both sides are gas compartments; blood compartments go to `exchange_blood` instead.

## Usage in the scenarios

`DS_ALL` and `DS_ALR` (dead space ↔ alveoli) have `mix_flow` 0.001 L/s (60 mL/min each way) in every scenario. Per 0.5 ms step that is 0.5 µL, far below the clamp (a distal DS sub-tank is ~0.25 mL at term).

## Assumptions and limitations

- **One lumped exchange rate** for diffusion and cardiogenic mixing. It doesn't follow heart rate or stroke volume, and doesn't depend on the gas (CO2 and O2 mix equally).
- **Explicit:** concentrations from before the swap; the clamp keeps it stable.
- It shares scratch buffers between calls and so must not run re-entrantly (it never does in the single-threaded worker).
