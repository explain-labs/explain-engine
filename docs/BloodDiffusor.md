# BloodDiffusor

A `BloodDiffusor` exchanges gases and solutes between **two blood compartments**. It is used wherever blood equilibrates with blood across a membrane rather than with a gas phase — most notably the placenta (fetal capillary ↔ maternal pool). O₂ and CO₂ move down their **partial-pressure** gradients; each configured solute moves down its **concentration** gradient.

## Inheritance

```
BaseModelClass
  └── BloodDiffusor   (blood↔blood gas/solute exchange)
```

`BloodDiffusor` extends `BaseModelClass` directly (note: the source lives in `base_models/`, not `component_models/`). It is not a capacitance — it holds no volume and computes no pressure; it only mutates the composition of the two compartments it references.

## What it models

```
blood1 (po2, pco2, solutes)  ⇌[BloodDiffusor]⇌  blood2 (po2, pco2, solutes)
   gases:   flux = (p1 − p2) · dif_step · Δt        (partial-pressure driven)
   solutes: flux = (c1 − c2) · dif · solutes_step · Δt   (concentration driven)
```

Each step it refreshes both compartments' blood composition (so the partial pressures are current), composes the effective diffusion constants from the factor tiers, then transfers O₂, CO₂ and each configured solute from the higher to the lower side, conserving mass.

## Properties

### Configuration

| Property | Unit | Description |
|---|---|---|
| `comp_blood1` | name | First blood compartment (default `"PLF"` — a legacy name no scenario defines; scenarios set it, e.g. `PL_FETAL_CAP`) |
| `comp_blood2` | name | Second blood compartment (default `"PLM"` — likewise legacy; e.g. `PL_MAT`) |
| `dif_o2` | mmol/(mmHg·s) | O₂ diffusion constant |
| `dif_co2` | mmol/(mmHg·s) | CO₂ diffusion constant |
| `dif_solutes` | object | Per-solute diffusion constants, keyed by solute name (L/s: the flux in mmol/s per mmol/L of gradient) |

### Factor tiers (see below)

`dif_o2_factor`, `dif_o2_factor_ps`, `dif_o2_factor_scaling`; `dif_co2_factor`, `dif_co2_factor_ps`, `dif_co2_factor_scaling`; `dif_solutes_factor`, `dif_solutes_factor_ps`, `dif_solutes_factor_scaling` — all default `1.0`.

### Computed / dependent

| Property | Unit | Description |
|---|---|---|
| `dif_o2_step` | mmol/(mmHg·s) | Effective O₂ diffusion constant for the current step |
| `dif_co2_step` | mmol/(mmHg·s) | Effective CO₂ diffusion constant for the current step |

### Local references (`_`-prefixed)

`_comp_blood1`, `_comp_blood2` — resolved each step from `model.models[comp_blood1/2]`.

## Factor system

`dif_o2`, `dif_co2` and the per-solute `dif_solutes` follow the engine's three-tier factor / effective-value pattern (same convention as [Capacitance](./Capacitance.md)). For O₂ and CO₂ the effective constant is built additively against the base:

```
dif_o2_step = dif_o2
            + (dif_o2_factor       − 1)·dif_o2
            + (dif_o2_factor_ps    − 1)·dif_o2
            + (dif_o2_factor_scaling − 1)·dif_o2
```

(identically for `dif_co2_step`). Solutes share one dimensionless multiplier applied to every per-solute constant:

```
solutes_step = 1 + (dif_solutes_factor − 1) + (dif_solutes_factor_ps − 1) + (dif_solutes_factor_scaling − 1)
```

| Tier | Factors | Purpose |
|---|---|---|
| Non-persistent | `dif_o2_factor`, `dif_co2_factor`, `dif_solutes_factor` | Transient interventions; **reset to 1.0 at the end of every `calc_model`** |
| Persistent (`_ps`) | `dif_o2_factor_ps`, `dif_co2_factor_ps`, `dif_solutes_factor_ps` | Ongoing scenario/user modulation; persist across steps |
| Scaling | `dif_o2_factor_scaling`, `dif_co2_factor_scaling`, `dif_solutes_factor_scaling` | ModelScaler weight/manual scaling |

## Calculation cycle (`calc_model`)

1. Resolve `_comp_blood1` / `_comp_blood2` from the engine map; return (no exchange) if either is missing.
2. Call [`calc_blood_composition`](./BloodComposition.md) on both compartments so `po2`/`pco2`/solute concentrations are current.
3. Compose `dif_o2_step`, `dif_co2_step` and `solutes_step` from the factors.
4. **O₂:** `do2 = (blood1.po2 − blood2.po2) · dif_o2_step · _t`, then update each side's `to2` by `(to2·vol ∓ do2)/vol`. Skipped this step if either `po2` is negative — the `−1` sentinel a failed acid-base / O₂ solve leaves behind, which would otherwise drive a spurious flux.
5. **CO₂:** same with `pco2` / `dif_co2_step` → `tco2` (same `−1` sentinel guard).
6. **Solutes:** for each key in `dif_solutes`, `dsol = (c1 − c2) · dif_solutes[sol] · solutes_step · _t`, update each side's concentration. A solute that is not a number on either side is skipped.
7. Reset the non-persistent factors (`dif_o2_factor`, `dif_co2_factor`, `dif_solutes_factor`) to `1.0`.

`_t` is the modeling stepsize. All transfers go through `_transfer()`:

- **Donor limit** — the flux is capped at what the (non-fixed) donor holds (`conc · vol`), so no concentration goes below zero.
- Every write is **guarded by `!fixed_composition && vol > 0`**, so a fixed reservoir (e.g. the maternal pool) supplies/absorbs gas and solute without changing its own composition (and without a donor cap), and an empty compartment never divides by zero.

## Example definition (JSON)

From `archive/term_fetus.json` — `PL_GASEX`, a component of the `Placenta` model, connecting the fetal capillary to the fixed maternal pool:

```json
{
  "name": "PL_GASEX",
  "description": "blood diffusor model of the diffusion across the placenta",
  "is_enabled": true,
  "model_type": "BloodDiffusor",
  "comp_blood1": "PL_FETAL_CAP",
  "comp_blood2": "PL_MAT",
  "dif_o2": 0.03,
  "dif_co2": 0.04,
  "dif_solutes": {},
  "dif_o2_factor": 1,
  "dif_co2_factor": 1,
  "dif_solutes_factor": 1,
  "dif_o2_factor_ps": 1,
  "dif_co2_factor_ps": 1,
  "dif_solutes_factor_ps": 1,
  "dif_o2_factor_scaling": 1,
  "dif_co2_factor_scaling": 1,
  "dif_solutes_factor_scaling": 1
}
```

Here `PL_MAT` carries `fixed_composition: true`, so the diffusor drives fetal gases toward the maternal set-point while the maternal pool stays constant.

## Usage in the model

- The placenta's `PL_GASEX` is the canonical instance: it connects the fetal capillary to the fixed maternal pool, equilibrating fetal blood gases toward maternal values.
- This is the reference implementation the other exchangers follow — it already guards `fixed_composition` on every write, which is why the maternal pool stays constant.
- Gases use **partial pressures** (so they respect the dissociation curves computed by [BloodComposition](./BloodComposition.md)), while solutes use **raw concentrations**.
- The compartments referenced must be [BloodCapacitance](./BloodCapacitance.md)-family models carrying `to2`/`tco2`/`solutes`/`vol`/`fixed_composition`.
</content>
