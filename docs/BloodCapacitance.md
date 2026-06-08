# BloodCapacitance

A BloodCapacitance is a volume compartment that holds blood with tracked composition: dissolved gases, solutes, drugs, temperature, and viscosity. It extends the base `Capacitance` class with blood-specific mixing logic.

## Inheritance

```
BaseModelClass
  └── Capacitance            (volume, elastance, pressure)
        └── BloodCapacitance (blood composition tracking)
```

BloodCapacitance is itself the parent of `BloodVessel` (adds resistance and flow) and is used standalone for compartments that hold blood but have no built-in resistance (e.g., a pure compliance chamber). Flow into and out of a standalone BloodCapacitance is handled by separate `Resistor` models that reference it.

## What it models

A passive blood-containing compartment. It holds a volume of blood at a pressure determined by its elastance, and tracks the composition of that blood as fluid flows in and out. It does not have its own resistance or flow -- those are provided by connected `Resistor` or `BloodVessel` models.

## Properties

### Inherited from Capacitance

All capacitance properties are available. See the Capacitance base model for the full list. Key ones:

| Property | Unit | Description |
|---|---|---|
| `u_vol` | L | Unstressed volume |
| `el_base` | mmHg/L | Baseline elastance |
| `el_k` | unitless | Non-linear elastance coefficient |
| `vol` | L | Current volume |
| `pres` | mmHg | Total pressure |
| `pres_in` | mmHg | Recoil pressure |
| `pres_tm` | mmHg | Transmural pressure |

### Blood composition (unique to BloodCapacitance)

| Property | Unit | Description |
|---|---|---|
| `temp` | degC | Blood temperature |
| `viscosity` | cP | Blood viscosity |
| `to2` | mmol/L | Total oxygen concentration |
| `tco2` | mmol/L | Total carbon dioxide concentration |
| `ph` | unitless | Blood pH (-1 = not calculated) |
| `pco2` | mmHg | Partial pressure of CO2 (-1 = not calculated) |
| `po2` | mmHg | Partial pressure of O2 (-1 = not calculated) |
| `so2` | unitless | Oxygen saturation (-1 = not calculated) |
| `hco3` | mmol/L | Bicarbonate concentration (-1 = not calculated) |
| `be` | mmol/L | Base excess (-1 = not calculated) |
| `solutes` | object | Dictionary of solute concentrations (keyed by name) |
| `drugs` | object | Dictionary of drug concentrations (keyed by name) |

Note: `ph`, `pco2`, `po2`, `so2`, `hco3`, and `be` are initialized to -1 and are calculated by external gas exchange models (e.g., `AcidBase`). They are not computed by the BloodCapacitance itself.

### Haldane effect

`calc_blood_composition` (in `BloodComposition.js`) couples oxygen saturation back into the CO2
dissociation. The plasma CO2 partition gains an SO₂-dependent term:

```
cco2p = tco2 / (1 + kc/hp + kc*kd/hp² + haldane_coeff * (1 - so2))
pco2  = cco2p / alpha_co2p
```

Lower SO₂ raises the effective CO2-carrying capacity, so at a given `tco2` deoxygenated blood shows a
lower `pco2`/`hco3` — the Haldane effect. `so2` is taken from the previous calculation step (the
acid-base and oxygen solvers run sequentially); at steady state the one-step lag vanishes. The
strength is set by `haldane_coeff` on the `Blood` model (propagated to every blood component and
adjustable at runtime via `Blood.set_haldane_coeff`); `haldane_coeff = 0` disables the effect and
reproduces the previous behaviour. Note this is distinct from the **CO₂-Bohr effect** (high pCO₂
right-shifts P50, reducing O₂ affinity), which is modelled separately via the `dpCO2` term.

## Mixing logic (`volume_in`)

BloodCapacitance overrides the `volume_in` method to perform composition mixing when blood flows in from another compartment. For each tracked substance, the mixing uses a linear dilution formula:

```
concentration += ((concentration_from - concentration) * dvol) / vol
```

This is applied to:
- `to2` and `tco2` (dissolved gases)
- All entries in `solutes`
- All entries in `drugs`
- `temp` (temperature treated as a solute for mixing)
- `viscosity` (treated as a solute for mixing)

The `comp_from` parameter (the upstream compartment) must have matching properties (`to2`, `tco2`, `solutes`, `drugs`, `temp`, `viscosity`).

## Three-tier factor system

BloodCapacitance inherits the full three-tier factor system from Capacitance:

| Tier | Factors | Purpose |
|---|---|---|
| Non-persistent | `u_vol_factor`, `el_base_factor`, `el_k_factor` | Transient effects, reset each step |
| Persistent (`_ps`) | `u_vol_factor_ps`, `el_base_factor_ps`, `el_k_factor_ps` | Ongoing physiological modulation |
| Scaling (`_scaling`) | `u_vol_factor_scaling`, `el_base_factor_scaling`, `el_k_factor_scaling` | ModelScaler weight/manual scaling |

## Calculation cycle

BloodCapacitance does not override `calc_model()` -- it inherits the Capacitance cycle:

1. `calc_elastances()` -- compute effective elastance from base + all factor tiers
2. `calc_volumes()` -- compute effective unstressed volume from base + all factor tiers
3. `calc_pressure()` -- compute recoil, transmural, and total pressure

## Example definition (JSON)

```json
{
  "name": "PV",
  "description": "pulmonary veins",
  "model_type": "BloodCapacitance",
  "is_enabled": true,
  "vol": 0.04,
  "u_vol": 0.038,
  "el_base": 3100,
  "el_k": 0,
  "fixed_composition": false
}
```

## Usage in the model

- Used for compartments that are pure compliances (no built-in resistance), such as specific pooling volumes
- Serves as the parent class for `BloodVessel`, which adds resistance, flow, and ANS coupling
