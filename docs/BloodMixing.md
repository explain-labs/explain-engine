# BloodMixing

`helpers/BloodMixing.js` holds the two functions that move blood composition between compartments: `mix_blood_in` (mixing on inflow, the advection of everything blood carries) and `exchange_blood` (exchange without net flow between two compartments of one continuous pool). Every blood compartment and `Resistor.mix_flow` use them, so the mixing rule exists in one place.

## API

| Function | Arguments | Returns | Description |
|---|---|---|---|
| `mix_blood_in(target, dvol, comp_from)` | receiving compartment, volume that just arrived (L), source compartment | – | Mixes the source composition into `target`. Call it **after** the volume has been added to `target.vol`. |
| `exchange_blood(a, b, dv)` | two compartments, volume swapped each way (L) | – | Swaps `dv` of blood both ways, with no net volume change. |

### `mix_blood_in`

With `V` the target volume after the inflow and `f = dvol / V`:

```
c += (c_from − c) · f
```

This is exact mass balance: `c_new·V = c_old·(V − dvol) + c_from·dvol`. It is applied to:
- `to2` and `tco2`;
- every key of `target.solutes` and `target.drugs` (a key missing, zero or NaN on the source counts as 0);
- `temp` (blood treated as one fluid, so temperature mixes like a concentration).

It does nothing when:
- `target.fixed_composition` is set (an infinite reservoir keeps its composition);
- `target.vol ≤ 0` (avoids NaN on an empty compartment).

**Viscosity is not mixed**: `Blood` derives each compartment's viscosity from its own haemoglobin every step.

### `exchange_blood`

```
dv  = min(dv, ½ · min(V_a, V_b))                 (stability clamp)
c_a += (c_b − c_a) · dv / V_a
c_b −= (c_b − c_a) · dv / V_b                    (using the pre-exchange concentrations)
```

Applied to `to2`, `tco2`, `temp`, every solute and every drug. A key present on only one side is created on the other (counted as 0 there). `c_a·V_a + c_b·V_b` is conserved, so nothing is created or lost. A `fixed_composition` side keeps its composition (its fraction is 0), and then the other side simply relaxes toward it. It does nothing when `dv ≤ 0` or either volume is 0.

## Where it is used

| Caller | Function | When |
|---|---|---|
| [`BloodCapacitance`](./BloodCapacitance.md) (and so `BloodVessel`), [`BloodTimeVaryingElastance`](./BloodTimeVaryingElastance.md), [`HeartChamber`](./HeartChamber.md) | `mix_blood_in` | in `volume_in`, every time a resistor moves blood into the compartment |
| [`Resistor`](./Resistor.md#mixing-without-net-flow-mix_flow) with `mix_flow > 0` | `exchange_blood` | every step, with `dv = mix_flow · dt`, when both ends carry blood and the connection is open |

In the shipped scenarios the only blood `mix_flow` is `RAIVCI_RASVC` (0.01 L/s), between the two halves of the right atrium.

## Notes

- **Keys must exist on the receiving side.** `mix_blood_in` only mixes the solutes and drugs the target already has; a key that only the source carries is not transported. The seeding models keep the key sets identical across the circulation:
  - `Blood` seeds the solutes at build (including `lact`);
  - `Drugs` adds its drug keys and `Glucose` its `glucose` key to every circulating compartment.

  In term_neonate_72h all 47 circulating blood compartments carry the same 11 solutes and 3 drugs. A new solute or drug must be seeded the same way.
- **Hot path.** `mix_blood_in` runs about 45 times per step, so it uses plain `for…in` loops and allocates nothing.
- **Well-mixed compartments.** Both functions assume each compartment is instantly and completely mixed. Streaming inside a compartment is represented by splitting it and choosing `mix_flow`.
- The gas counterpart for `mix_flow` is [`helpers/GasMixing.js`](../helpers/GasMixing.js) `exchange_gas`. Gas mixing on inflow lives in `GasCapacitance.volume_in`.
