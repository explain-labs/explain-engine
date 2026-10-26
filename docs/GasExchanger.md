# GasExchanger

A `GasExchanger` moves O2 and CO2 by diffusion between a **blood** compartment and a **gas** compartment: the alveolar gas and pulmonary capillary blood of each lung, and the sweep gas and blood of the ECLS oxygenator. Every bit of oxygen the patient takes up and CO2 it removes through the lungs crosses one of these.

## Physiology

In the alveoli, gas and blood are separated by a membrane less than a micrometre thick. O2 diffuses from the alveolar gas (pO2 ~100 mmHg) into the mixed-venous blood (~40 mmHg), and CO2 the other way. The rate is Fick's law: flux = diffusing capacity × partial-pressure difference. The diffusing capacity lumps membrane area, thickness and the gas's solubility; CO2 diffuses about 20 times more easily than O2. In a healthy lung, blood equilibrates with alveolar gas well within its transit time, so oxygenation is limited by ventilation and perfusion, not diffusion. Lung disease (RDS, atelectasis, oedema) lowers the effective capacity by removing area.

The exchange also changes the gas volume: more O2 is taken up than CO2 given off (respiratory quotient < 1), so alveolar gas shrinks a little with every breath. During apnoea that shrinkage draws gas down the airways: apnoeic oxygenation.

## Inheritance

```
BaseModelClass
  └── GasExchanger
```

## Properties

### Config (set in the definition JSON)

| Property | Unit | Default | Description |
|---|---|---|---|
| `comp_blood` | – | `""` | Blood compartment (e.g. `LL_CAP`, `ECLS_OXY`). |
| `comp_gas` | – | `""` | Gas compartment (e.g. `ALL`, `ECLS_GAS_OXY`). |
| `dif_o2` | mmol/(mmHg·s) | 0 | O2 diffusing capacity. |
| `dif_co2` | mmol/(mmHg·s) | 0 | CO2 diffusing capacity. |
| `o2_cap`, `co2_cap` | mmol/s | 0, 0 | Optional membrane transfer ceiling; 0 = none. Only the ECLS oxygenator uses it (set by `Ecls` from the oxygenator's rated flow). |
| `bc_interval` | s | 0.002 | How often the blood-gas solve runs; fluxes in between use the last pO2/pCO2. |

### Factors

| Property | Default | Layer and writers |
|---|---|---|
| `dif_o2_factor`, `dif_co2_factor` | 1.0 | Non-persistent (reset each step): `Surfactant` (derecruitment). |
| `dif_o2_factor_ps`, `dif_co2_factor_ps` | 1.0 | Persistent, changed as deltas: `Respiration` (`set_gasexchange` and atelectasis), the `Calibrator`. |
| `dif_o2_factor_scaling_ps`, `dif_co2_factor_scaling_ps` | 1.0 | Scaling layer; nothing writes it. (Named `*_factor_scaling` before v1.0.) |

### Outputs

| Property | Unit | Description |
|---|---|---|
| `flux_o2`, `flux_co2` | mmol per step | Amount moved this step, positive = blood → gas (O2 uptake is negative). Divide by the step size for a rate. |
| `dif_o2_step`, `dif_co2_step` | mmol/(mmHg·s) | Effective diffusing capacities with the factors. |

## Calculation

Each step (skipped if either compartment is missing or empty):

1. **Blood gases** of `comp_blood` by [`calc_blood_composition`](./BloodComposition.md), every `bc_interval`. The gas side's partial pressures come from its own step.
2. **Factors**, additive, floored at 0 (several writers lowering them together must not make a negative capacity):
   ```
   dif_step = dif · (1 + (factor − 1) + (factor_ps − 1) + (factor_scaling_ps − 1)),   ≥ 0
   ```
3. **Fluxes** (Fick):
   ```
   flux_o2  = (pO2_blood  − pO2_gas)  · dif_o2_step  · dt
   flux_co2 = (pCO2_blood − pCO2_gas) · dif_co2_step · dt
   ```
   - A gas is skipped while the blood solve has failed (the `-1` sentinel); otherwise the gradient would pump a runaway flux.
   - With a ceiling set, each flux is clamped to `cap · dt`.
   - Each flux is capped at what the donor holds.
4. **Contents.** Blood `to2`/`tco2` and gas `co2`/`cco2` change by the flux over their volumes (a `fixed_composition` side is left unchanged).
5. **Gas volume.** The net molar exchange `flux_o2 + flux_co2` changes the gas volume at the gas compartment's pressure and temperature (ideal gas); every species keeps its moles in the new volume. Alveolar gas shrinks when uptake exceeds output, and the pressure drop draws gas in through the airways.

## Factor system

Additive layers, as in [Capacitance](./Capacitance.md#factor-system), with a floor at 0. See [ARCHITECTURE §7a](./ARCHITECTURE.md#7a-the-factor--effective-value-pattern).

## Inputs and outputs

- **Reads:** blood `po2`, `pco2`, `to2`, `tco2`, `vol`; gas `po2`, `pco2`, `co2`, `cco2`, `vol`, `pres`, `temp`.
- **Writes:** blood `to2`, `tco2` (and its solved gases); gas `co2`, `cco2`, every gas concentration and `vol` (volume change).
- **Written by:** `Surfactant`, `Respiration`, the `Calibrator` (factors); `Ecls` (`dif_o2`, `dif_co2`, `o2_cap`, `co2_cap` of `ECLS_GASEX`); the scenario generators (`dif_o2`, `dif_co2`).
- **Read by:** `DataCollector` watchers; the probes (`flux_o2` as VO2).

## Assumptions and limitations

- **Fick diffusion between two well-mixed compartments.** No capillary transit time, no end-capillary equilibration profile, no diffusion limitation that appears only at high cardiac output. Ventilation–perfusion mismatch comes from the network (intrapulmonary shunts, two lungs), not from inside the exchanger.
- **The CO2/O2 capacity ratio is 6 in every scenario,** a calibration value (`scripts/reseed_term_neonate.mjs` raised CO2 sixfold), not the physical ~20.
- **Diffusing capacities are per scenario,** set by the generators: term_neonate_72h 0.001 / 0.006 per lung. As a lung DLO2 that is ~2.7 mL/(min·mmHg) at term (0.76 per kg).
- **The fetal lungs exchange nothing** (`dif_o2` = `dif_co2` = 0), but the exchangers still run their blood solve.
- **No water vapour or nitrogen crosses the membrane** (no N2 washout into blood, no absorption atelectasis from N2).

## Example definition (JSON)

From `term_neonate_72h.json`, `models.Respiration.components.GASEX_LL` (trimmed to the config props):

```json
{
  "name": "GASEX_LL",
  "model_type": "GasExchanger",
  "is_enabled": true,
  "comp_blood": "LL_CAP",
  "comp_gas": "ALL",
  "dif_o2": 0.001,
  "dif_co2": 0.006,
  "o2_cap": 0,
  "co2_cap": 0,
  "bc_interval": 0.002
}
```

## Usage in the scenarios

Three instances in term_neonate_72h:

| Exchanger | Blood ↔ gas | State |
|---|---|---|
| `GASEX_LL`, `GASEX_RL` | `LL_CAP` ↔ `ALL`, `RL_CAP` ↔ `ALR` | enabled (capacity 0 in a fetus) |
| `ECLS_GASEX` | `ECLS_OXY` ↔ `ECLS_GAS_OXY` | disabled until ECLS runs; set by `Ecls` |

| Scenario | `dif_o2` | `dif_co2` |
|---|---|---|
| term_neonate_72h | 0.001 | 0.006 |

## References

No literature values; the capacities are calibrated per scenario against arterial gases (see the `*Reference.md` pages).
