# GasDiffusor

A `GasDiffusor` diffuses gases between **two gas compartments**, driven by their partial-pressure
difference. It is the gas-to-gas analogue of [`BloodDiffusor`](./BloodDiffusor.md) (blood-to-blood)
and [`GasExchanger`](./GasExchanger.md) (blood-to-gas). It moves four species — O₂, CO₂, N₂ and
"other" — down their gradients between two [`GasCapacitance`](./GasCapacitance.md) compartments.

## Inheritance

```
BaseModelClass
  └── GasDiffusor   (partial-pressure-driven gas-to-gas diffusion of O₂/CO₂/N₂/other)
```

Lives in `base_models/` (alongside `GasExchanger` and `BloodDiffusor`). It is a transport element,
not a compartment: it holds no volume and writes directly into the two compartments it references.

## What it models

```
gas1 (po2, pco2, pn2, pother)  ⇌[GasDiffusor]⇌  gas2 (...)
   flux_s = (p1_s − p2_s) · dif_s_step · Δt        for s ∈ {o2, co2, n2, other}
```

Each step it refreshes both compartments' partial pressures from their current concentrations,
composes the effective diffusion constants, then for each species moves the flux out of `comp_gas1`
and into `comp_gas2`.

## Properties

### Config

| Property | Unit | Description |
|---|---|---|
| `comp_gas1` | name | First gas compartment (the `p1` side) |
| `comp_gas2` | name | Second gas compartment (the `p2` side) |
| `dif_o2` | mmol/(mmHg·s) | O₂ diffusion constant (default 0.01) |
| `dif_co2` | mmol/(mmHg·s) | CO₂ diffusion constant (default 0.01) |
| `dif_n2` | mmol/(mmHg·s) | N₂ diffusion constant (default 0.01) |
| `dif_other` | mmol/(mmHg·s) | Other-gases diffusion constant (default 0.01) |

### Computed / local

| Property | Unit | Description |
|---|---|---|
| `dif_o2_step` / `dif_co2_step` / `dif_n2_step` / `dif_other_step` | mmol/(mmHg·s) | Effective diffusion constants after the factors |
| `_comp_gas1` / `_comp_gas2` | ref | Resolved compartment instances |

## Factor system

Each diffusion constant uses the three-tier [factor / effective-value pattern](./Capacitance.md).
Note the scaling tier here is named **`_factor_scaling`** (not `_factor_scaling_ps` as on
`Capacitance`):

| Tier | Factors | Purpose |
|---|---|---|
| Non-persistent | `dif_o2_factor`, `dif_co2_factor`, `dif_n2_factor`, `dif_other_factor` | Transient effects, reset to 1.0 each step |
| Persistent (`_ps`) | `dif_o2_factor_ps`, … | Ongoing modulation |
| Scaling (`_scaling`) | `dif_o2_factor_scaling`, … | `ModelScaler` scaling |

The effective constant (shown for O₂; identical form for CO₂/N₂/other):

```
dif_o2_step = dif_o2
            + (dif_o2_factor          − 1) · dif_o2
            + (dif_o2_factor_ps       − 1) · dif_o2
            + (dif_o2_factor_scaling  − 1) · dif_o2
```

## Calculation cycle (`calc_model`)

1. Resolve `_comp_gas1` / `_comp_gas2` from `model.models`.
2. Refresh each compartment's partial pressures via the
   **[`GasCapacitance.calc_gas_composition`](./GasCapacitance.md) method** — which derives partials
   from the current concentrations. **Not** the standalone
   [`calc_gas_composition`](./GasComposition.md) initializer, which would reset both compartments to
   a fixed room-air mix every step (and so produce no real diffusion).
3. Compose the four effective diffusion constants (`dif_*_step`).
4. For each species, compute `d = (p1 − p2) · dif_step · Δt` and apply it — subtract from
   `comp_gas1`, add to `comp_gas2`, mixing into the concentration over the compartment volume:
   ```
   comp_gas1.c = (comp_gas1.c · vol1 − d) / vol1
   comp_gas2.c = (comp_gas2.c · vol2 + d) / vol2
   ```
   Each write is **guarded by `fixed_composition` and a positive volume** (`vol > 0`), so a fixed
   (infinite-reservoir) compartment stays constant and an empty compartment cannot produce NaN.
5. Reset the non-persistent factors (`dif_o2_factor` … `dif_other_factor`) to 1.0.

## Example definition (JSON)

No standard scenario wires a `GasDiffusor` (the lung exchanges to blood through a
[`GasExchanger`](./GasExchanger.md), not gas-to-gas), so there is no in-repo example. A correct
definition follows the shape of the other transport elements:

```json
{
  "name": "GASDIF_EXAMPLE",
  "description": "gas-to-gas diffusor between two gas compartments",
  "model_type": "GasDiffusor",
  "is_enabled": true,
  "comp_gas1": "DS",
  "comp_gas2": "ALL",
  "dif_o2": 0.01,
  "dif_co2": 0.01,
  "dif_n2": 0.01,
  "dif_other": 0.01
}
```

## Usage in the model

- **Not used in the standard scenarios** — this element is latent but correct if wired up (e.g. to
  model diffusive mixing between two gas spaces without bulk flow).
- The method-vs-initializer distinction in step 2 is essential: using the standalone initializer here
  would overwrite both compartments with the inspired mix every step.
