# BloodDiffusor

`BloodDiffusor` exchanges gases (and optionally solutes) by diffusion between **two blood compartments** that don't share flow: O2 and CO2 move down their partial-pressure gradient, solutes down their concentration gradient. In the scenarios it is `PL_GASEX`, the placental barrier between the fetal villous capillaries and the mother's blood.

For blood ↔ alveolar gas exchange (the lungs, the ECLS oxygenator) see [GasExchanger](./GasExchanger.md); for gas ↔ gas exchange without flow, [GasMixing](./GasMixing.md).

## Physiology

In the placenta, fetal and maternal blood never mix: they are separated by the villous membrane. Gases cross it passively, driven by the difference in partial pressure (Fick's law: flux = diffusing capacity × gradient). Maternal intervillous pO2 is higher than fetal, so O2 moves to the fetus; fetal pCO2 is higher, so CO2 moves to the mother. Fetal haemoglobin's higher affinity lets the fetus load a lot of oxygen at a low pO2. Small solutes (glucose, urea, ions) cross by their concentration gradients.

## Inheritance

```
BaseModelClass
  └── BloodDiffusor
```

## Properties

### Config (set in the definition JSON)

| Property | Unit | Default | Description |
|---|---|---|---|
| `comp_blood1`, `comp_blood2` | – | `"PLF"`, `"PLM"` | Names of the two blood compartments (legacy defaults; every scenario sets `PL_FETAL_CAP` and `PL_MAT`). Positive flux runs 1 → 2. |
| `dif_o2` | mmol/(mmHg·s) | 0.01 | O2 diffusing capacity. |
| `dif_co2` | mmol/(mmHg·s) | 0.01 | CO2 diffusing capacity. |
| `dif_solutes` | L/s per solute | `{}` | Solute diffusing capacities, e.g. `{"glucose": 0.0001}` (mmol/s per mmol/L of gradient). Empty in every scenario. |

In the placenta, `dif_o2` and `dif_co2` are **overwritten every 15 ms by [Placenta](./Placenta.md)** from its own `dif_o2`/`dif_co2`: set them there, or use the factors below.

### Factors

| Property | Default | Layer |
|---|---|---|
| `dif_o2_factor`, `dif_co2_factor`, `dif_solutes_factor` | 1.0 | Non-persistent (reset to 1 after each step). |
| `dif_o2_factor_ps`, `dif_co2_factor_ps`, `dif_solutes_factor_ps` | 1.0 | Persistent. |
| `dif_o2_factor_scaling_ps`, `dif_co2_factor_scaling_ps`, `dif_solutes_factor_scaling_ps` | 1.0 | Scaling layer (`_ps` since v1.0, was `*_factor_scaling`); nothing writes it (`ModelScaler` doesn't scale diffusors). |

### Outputs

| Property | Unit | Description |
|---|---|---|
| `dif_o2_step`, `dif_co2_step` | mmol/(mmHg·s) | Effective O2 and CO2 diffusing capacity with the factors. |

## Calculation

Each step (skipped if either compartment is missing):

1. **Partial pressures.** [`calc_blood_composition`](./BloodComposition.md) on both compartments (a full solve on each, every step).
2. **Factors**, additive:
   ```
   dif_o2_step = dif_o2 · (1 + (factor − 1) + (factor_ps − 1) + (factor_scaling − 1))      likewise CO2 and solutes
   ```
3. **Gases** (Fick), in mmol per step:
   ```
   ΔO2  = (pO2₁ − pO2₂)   · dif_o2_step  · dt      moved from to2 of 1 to to2 of 2
   ΔCO2 = (pCO2₁ − pCO2₂) · dif_co2_step · dt      moved between the tco2s
   ```
   A gas is skipped this step if either side has the `-1` sentinel (failed solve).
4. **Solutes:** `Δ = (c₁ − c₂) · dif_solutes[s] · solutes_factor · dt`, for every solute present on both sides.
5. **Transfer** (`_transfer`). Amounts become concentrations through each compartment's volume. The flux is capped at what the donor holds. A `fixed_composition` compartment (an infinite reservoir such as `PL_MAT`) or an empty one keeps its concentration, while the other side still changes.

## Factor system

Additive layers (as Capacitance and Resistor), on `dif_o2`, `dif_co2` and one shared multiplier for all solutes. See [ARCHITECTURE §7a](./ARCHITECTURE.md#7a-the-factor--effective-value-pattern).

## Inputs and outputs

- **Reads:** both compartments' `po2`, `pco2`, `to2`, `tco2`, `solutes`, `vol`, `fixed_composition`.
- **Writes:** `to2`, `tco2`, `solutes` of the non-fixed compartment(s); their solved `ph`, `pco2`, `po2`, `so2`, … through `calc_blood_composition`.
- **Written by:** [Placenta](./Placenta.md) (`dif_o2`, `dif_co2`, `is_enabled` every 15 ms); the fetal generators set the Placenta values.
- **Read by:** `DataCollector` watchers.

## Assumptions and limitations

- **Fick diffusion on partial pressures, no geometry.** A diffusing capacity lumps membrane area, thickness and permeability. No counter-current or concurrent flow pattern; each compartment is well mixed.
- **Full equilibration at the shipped settings.** Fetal capillary blood leaves the exchanger at the maternal pCO2, so the diffusing capacities have little authority over fetal gases; the maternal contents set them (see [Placenta](./Placenta.md#assumptions-and-limitations)).
- **Explicit, one step.** A very large capacity with a small compartment could overshoot the equilibrium in one step; the cap only stops a negative concentration.
- **Two blood solves every step** while it runs (fetal scenarios only), including on the fixed `PL_MAT`.

## Example definition (JSON)

From `fetus_term.json`, `models.Placenta.components.PL_GASEX` (trimmed to the config props):

```json
{
  "name": "PL_GASEX",
  "model_type": "BloodDiffusor",
  "is_enabled": true,
  "comp_blood1": "PL_FETAL_CAP",
  "comp_blood2": "PL_MAT",
  "dif_o2": 0.003,
  "dif_co2": 0.04,
  "dif_solutes": {}
}
```

## Usage in the scenarios

One instance, `PL_GASEX`, owned by `Placenta`, in every scenario: enabled in the three fetal scenarios, disabled after birth.

| Scenario | `dif_o2` | `dif_co2` |
|---|---|---|
| fetus_term | 0.003 | 0.04 |
| fetus_30wk | 0.02 | 0.027 |
| fetus_25wk | 0.012 | 0.016 |
| postnatal (disabled) | 0.01 | 0.01 |

## References

No literature values; the diffusing capacities are calibrated per fetal scenario (see [fetal_circulation](./fetal_circulation.md)).
