# GasExchanger

A `GasExchanger` moves O₂ and CO₂ across the **blood–gas barrier** — between a blood compartment and a
gas compartment — driven by their partial-pressure difference. It models alveolar gas exchange in the
lung and the membrane of an ECLS oxygenator.

## Inheritance

```
BaseModelClass
  └── GasExchanger   (partial-pressure-driven O₂/CO₂ transfer between blood and gas)
```

Lives in `base_models/` (alongside `GasDiffusor` and `BloodDiffusor`). It is a transport element, not
a compartment: it holds no volume and writes directly into the blood and gas compartments it
references. It pairs a [`BloodCapacitance`](./BloodCapacitance.md)-family compartment with a
[`GasCapacitance`](./GasCapacitance.md).

## What it models

```
blood (po2, pco2)  ⇌[GasExchanger]⇌  gas (po2, pco2)
   flux_o2  = (po2_blood  − po2_gas)  · dif_o2_step  · Δt
   flux_co2 = (pco2_blood − pco2_gas) · dif_co2_step · Δt
```

Each step it recomputes the blood gas composition, computes the O₂ and CO₂ fluxes from the
partial-pressure gradients, and transfers them between the blood's total contents (`to2`/`tco2`,
mmol/L) and the gas compartment's concentrations (`co2`/`cco2`, mmol/L). The fluxes are signed, so the
same element loads O₂ into blood at the lung when `po2_gas > po2_blood` and the gradient simply flips
direction for CO₂.

## Properties

### Config

| Property | Unit | Description |
|---|---|---|
| `comp_blood` | name | Blood compartment (the `po2`/`pco2` blood side) |
| `comp_gas` | name | Gas compartment (the `po2`/`pco2` gas side) |
| `dif_o2` | mmol/(mmHg·s) | O₂ diffusion constant (default 0.0) |
| `dif_co2` | mmol/(mmHg·s) | CO₂ diffusion constant (default 0.0) |

### Computed / local

| Property | Unit | Description |
|---|---|---|
| `flux_o2` | mmol | O₂ transferred this step (blood → gas positive) |
| `flux_co2` | mmol | CO₂ transferred this step (blood → gas positive) |
| `dif_o2_step` / `dif_co2_step` | mmol/(mmHg·s) | Effective diffusion constants after the factors |
| `_blood` / `_gas` | ref | Resolved compartment instances |

## Factor system

`dif_o2` and `dif_co2` use the three-tier [factor / effective-value pattern](./Capacitance.md). Note
the scaling tier here is named **`_factor_scaling`** (not `_factor_scaling_ps` as on `Capacitance`):

| Tier | Factors | Purpose |
|---|---|---|
| Non-persistent | `dif_o2_factor`, `dif_co2_factor` | Transient effects, reset to 1.0 each step |
| Persistent (`_ps`) | `dif_o2_factor_ps`, `dif_co2_factor_ps` | `Respiration` / scenario modulation of diffusion capacity |
| Scaling (`_scaling`) | `dif_o2_factor_scaling`, `dif_co2_factor_scaling` | `ModelScaler` scaling |

The effective constant (shown for O₂; identical for CO₂):

```
dif_o2_step = dif_o2
            + (dif_o2_factor          − 1) · dif_o2
            + (dif_o2_factor_ps       − 1) · dif_o2
            + (dif_o2_factor_scaling  − 1) · dif_o2
```

## Calculation cycle (`calc_model`)

1. Resolve `_blood` / `_gas` from `model.models`.
2. Call `calc_blood_composition(_blood)` (from [`BloodComposition`](./BloodComposition.md)) to get
   current blood `po2`/`pco2`; read `po2_blood`, `pco2_blood`, `to2_blood`, `tco2_blood` and the gas
   `co2`, `cco2`, `po2`, `pco2`.
3. **Skip the step** if either compartment's volume is `<= 0` (both volumes are denominators).
4. Compose the effective diffusion constants `dif_o2_step` / `dif_co2_step` from the factors.
5. **O₂ flux** and new contents:
   ```
   flux_o2      = (po2_blood − po2_gas) · dif_o2_step · Δt
   new_to2_blood = (to2_blood · vol_blood − flux_o2) / vol_blood     (floored at 0)
   new_co2_gas   = (co2_gas   · vol_gas   + flux_o2) / vol_gas       (floored at 0)
   ```
6. **CO₂ flux** and new contents:
   ```
   flux_co2      = (pco2_blood − pco2_gas) · dif_co2_step · Δt
   new_tco2_blood = (tco2_blood · vol_blood − flux_co2) / vol_blood  (floored at 0)
   new_cco2_gas   = (cco2_gas   · vol_gas   + flux_co2) / vol_gas     (floored at 0)
   ```
7. Write the results back, **guarding each compartment by `fixed_composition`**: the blood
   `to2`/`tco2` are updated only if `!_blood.fixed_composition`, and the gas `co2`/`cco2` only if
   `!_gas.fixed_composition` — so a fixed (infinite-reservoir) compartment is not changed.
8. Reset the non-persistent factors (`dif_o2_factor`, `dif_co2_factor`) to 1.0.

Note the flux sign convention: positive `flux_o2`/`flux_co2` moves substance **out of blood and into
gas**. At the lung `po2_gas > po2_blood`, so `flux_o2` is negative (O₂ loads into blood) while
`pco2_blood > pco2_gas` makes `flux_co2` positive (CO₂ off-loads to gas).

## Example definition (JSON)

From `term_neonate.json` — the left-lung exchanger between the left-lung capillary blood and the left
alveolar gas:

```json
{
  "name": "GASEX_LL",
  "description": "gas exchanger model of the blood-gas connection of the left lung",
  "model_type": "GasExchanger",
  "is_enabled": true,
  "comp_blood": "LL_CAP",
  "comp_gas": "ALL",
  "dif_o2": 0.001,
  "dif_co2": 0.006
}
```

## Usage in the model

- `GASEX_LL` / `GASEX_RL` — left / right lung capillary blood ↔ alveolar gas (`ALL` / `ALR`); the
  `dif_o2`/`dif_co2` factors are how `Respiration` (and scaling) modulate diffusion capacity.
- `ECLS_GASEX` — ECLS oxygenator blood ↔ sweep gas; the sweep gas is a `fixed_composition` reservoir,
  so only the blood side is updated.
- The volume guard and `fixed_composition` guards ensure a collapsed alveolus cannot produce NaN and a
  fixed sweep-gas / blood reservoir stays constant.
