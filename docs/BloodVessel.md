# BloodVessel

A BloodVessel represents a blood vessel segment in the circulatory model. It combines a volume compartment (capacitance) with flow resistance and supports autonomic nervous system (ANS) regulation.

## Inheritance

```
BaseModelClass
  └── Capacitance          (volume, elastance, pressure)
        └── BloodCapacitance   (blood composition: O2, CO2, solutes, drugs, temperature)
              └── BloodVessel  (resistance, flow, ANS coupling)
```

## What it models

A BloodVessel is both a **capacitance** (it holds a volume of blood at a certain pressure) and a **resistance** (blood flows through it with a pressure drop). Each BloodVessel creates one or more internal `Resistor` objects based on its `inputs` list. These resistors handle the actual flow calculations between upstream components and this vessel.

When the ANS changes vascular tone, the vessel's resistance **and** elastance change simultaneously. This coupling is governed by the `alpha` parameter and is a distinguishing feature of the Explain model.

## Initialization

During `init_model()`, the BloodVessel creates a `Resistor` instance for each entry in its `inputs` array. Each resistor is named `{inputName}_{vesselName}` (e.g., `AA_AD1`) and is registered in the model engine. These resistors are marked as `is_externally_managed = true`, meaning the BloodVessel controls their properties directly -- the resistors do not apply their own factors.

If a resistor already exists in the model engine (e.g., when loading from a saved state), the existing instance is reused.

## Calculation cycle (`calc_model`)

Each model step executes in this order:

1. **`calc_resistances()`** -- compute effective forward, backward, and non-linear resistances
2. **`calc_elastances()`** -- compute effective elastance with ANS and resistance-elastance coupling
3. **Update resistors** -- push the calculated values to all internal `Resistor` objects
4. **`calc_volumes()`** -- compute effective unstressed volume (inherited from Capacitance)
5. **`calc_pressure()`** -- compute recoil, transmural, and total pressure (inherited from Capacitance)
7. **`get_flows()`** -- sum forward and backward flows from all internal resistors

## Properties

### Base properties (from definition JSON)

| Property | Unit | Description |
|---|---|---|
| `u_vol` | L | Unstressed volume -- the volume at which transmural pressure is zero |
| `el_base` | mmHg/L | Baseline elastance (stiffness). Higher = stiffer vessel |
| `el_k` | unitless | Non-linear elastance coefficient. Adds quadratic pressure term at high volumes |
| `r_for` | mmHg·s/L | Forward flow resistance |
| `r_back` | mmHg·s/L | Backward flow resistance |
| `r_k` | unitless | Non-linear resistance coefficient. Adds flow-dependent resistance |
| `inputs` | string[] | Names of upstream components (a Resistor is created for each) |
| `alpha` | 0-1 | Resistance-elastance coupling factor (see ANS section) |
| `ans_sens` | 0-1 | Sensitivity to ANS activity. 0 = no effect, 1 = full effect |
| `no_flow` | boolean | If true, all flow is blocked |
| `no_back_flow` | boolean | If true, backward flow is blocked (valve-like behavior) |

### Dependent properties (calculated each step)

| Property | Unit | Description |
|---|---|---|
| `vol` | L | Current blood volume in the vessel |
| `pres` | mmHg | Total pressure (recoil + external) |
| `pres_in` | mmHg | Recoil pressure from elastance |
| `pres_tm` | mmHg | Transmural pressure (recoil - external) |
| `flow` | L/s | Net flow (forward - backward) |
| `flow_forward` | L/s | Total forward flow across all input resistors |
| `flow_backward` | L/s | Total backward flow across all input resistors |

### Calculated intermediates (available for monitoring)

| Property | Unit | Description |
|---|---|---|
| `r_for_eff` | mmHg·s/L | Effective forward resistance this step (after all factors) |
| `r_back_eff` | mmHg·s/L | Effective backward resistance this step |
| `r_k_eff` | unitless | Effective non-linear resistance coefficient |
| `el_eff` | mmHg/L | Effective elastance (from Capacitance) |
| `u_vol_eff` | L | Effective unstressed volume (from Capacitance) |

## Three-tier factor system

Each physical property can be modulated by three independent factor tiers. All factors default to 1.0 (no change). The effective value is computed additively:

```
value_eff = base
  + (factor - 1) * base          # tier 1: non-persistent
  + (factor_ps - 1) * base       # tier 2: persistent
  + (factor_scaling - 1) * base  # tier 3: scaling
```

### Tier 1: Non-persistent factors (reset every step)

| Factor | Affects |
|---|---|
| `el_base_factor` | `el_base` |
| `el_k_factor` | `el_k` |
| `u_vol_factor` | `u_vol` |
| `r_factor` | `r_for`, `r_back` |
| `r_k_factor` | `r_k` |

These are set by other models during a step (e.g., the breathing model applying intrathoracic pressure effects) and automatically reset to 1.0 after use.

### Tier 2: Persistent factors (`_ps`)

| Factor | Affects |
|---|---|
| `el_base_factor_ps` | `el_base` |
| `el_k_factor_ps` | `el_k` |
| `u_vol_factor_ps` | `u_vol` |
| `r_factor_ps` | `r_for`, `r_back` |
| `r_k_factor_ps` | `r_k` |

These persist across steps and are used by controllers like the ANS or Heart model to apply ongoing physiological modulation.

### Tier 3: Scaling factors (`_scaling`)

| Factor | Affects |
|---|---|
| `el_base_factor_scaling` | `el_base` |
| `el_k_factor_scaling` | `el_k` |
| `u_vol_factor_scaling` | `u_vol` |
| `r_factor_scaling` | `r_for`, `r_back` |
| `r_k_factor_scaling` | `r_k` |

These are used exclusively by the `ModelScaler` for weight-based or manual scaling. Having a dedicated tier means scaling does not interfere with physiological factors in tier 2. The `ModelScaler.incorporate()` method can bake scaling factors into the base properties and reset them to 1.0.

## ANS and resistance-elastance coupling

The ANS influences both resistance and elastance, but through different pathways:

### Resistance

ANS modulates resistance directly, scaled by sensitivity:

```
r_for_eff = r_for
  + (r_factor - 1) * r_for
  + (r_factor_ps - 1) * r_for
  + (ans_activity - 1) * r_for * ans_sens
  + (r_factor_scaling - 1) * r_for
```

### Elastance (alpha coupling)

When a vessel constricts (resistance increases), its wall also becomes stiffer (elastance increases). The `alpha` parameter controls how strongly resistance changes translate into elastance changes using a power-law relationship:

```
_r_elas_factor     = r_factor    ^ alpha
_r_ps_elas_factor  = r_factor_ps ^ alpha
_ans_elas_factor   = ans_activity ^ alpha

el_eff = el_base
  + (el_base_factor - 1) * el_base
  + (el_base_factor_ps - 1) * el_base
  + (_r_elas_factor - 1) * el_base
  + (_r_ps_elas_factor - 1) * el_base
  + (_ans_elas_factor - 1) * el_base * ans_sens
  + (el_base_factor_scaling - 1) * el_base
```

Typical alpha values:
- **Large arteries**: 0.5 (moderate coupling)
- **Arterioles**: 0.63 (stronger coupling)
- **Veins/venules**: 0.75 (strongest coupling)

An alpha of 0.0 means resistance changes have no effect on elastance.

## Externally managed mode

When `is_externally_managed = true`, the BloodVessel is controlled by a parent model (typically a `MicroVascularUnit`). In this mode, all three tiers of factors are reset to 1.0 every step, and the parent sets the base properties (`el_base`, `r_for`, `r_back`, `u_vol`, etc.) directly. This prevents double-application of factors.

## Pressure calculation

Pressure is calculated by the inherited `Capacitance.calc_pressure()`:

```
pres_in = el_k_eff * (vol - u_vol_eff)^2 + el_eff * (vol - u_vol_eff)
pres_tm = pres_in - pres_ext
pres    = pres_in + pres_ext
```

Where `pres_ext` is a non-persistent external pressure (e.g., intrathoracic pressure) that resets to 0 each step.

## Example definition (JSON)

```json
{
  "name": "AD1",
  "description": "descending aorta segment 1",
  "model_type": "BloodVessel",
  "is_enabled": true,
  "vol": 0.02725,
  "u_vol": 0.02625,
  "el_base": 625,
  "el_k": 0,
  "r_for": 6.2,
  "r_back": 6.2,
  "r_k": 0,
  "inputs": ["AA"],
  "alpha": 0.5,
  "ans_sens": 0.0
}
```

## Usage in the model hierarchy

- **Standalone**: Used for large arteries (AA, AD1, AD2) and veins (IVCI, SVCI) that are directly defined in the model.
- **Inside MicroVascularUnit**: Three BloodVessels (ART, CAP, VEN) are created as sub-components. They are marked `is_externally_managed = true` and the MVU distributes properties across them.
- **Inside Heart (indirectly)**: Heart valves use standalone `Resistor` objects that connect HeartChamber components, not BloodVessels.
