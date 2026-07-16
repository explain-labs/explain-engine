# GasCapacitance

A `GasCapacitance` is a volume compartment that holds **gas** instead of blood. It extends the base
[`Capacitance`](./Capacitance.md) with gas-specific state: a five-species composition
(O₂, CO₂, N₂, water vapour, "other") tracked as concentrations, partial pressures and fractions,
plus temperature/humidity dynamics and the atmospheric/external pressures relevant to a gas space.
It models airways, alveoli and the gas side of devices (ventilator circuit, ECLS sweep gas).

## Inheritance

```
BaseModelClass
  └── Capacitance          (volume, elastance, pressure)
        └── GasCapacitance (gas composition, heat, water vapour, atmospheric/external pressures)
```

Gas flow into and out of a `GasCapacitance` is handled by separate `Resistor` models that reference
it (e.g. `MOUTH_DS` connecting `MOUTH` → `DS`). Diffusion of individual species is handled by
[`GasExchanger`](./GasExchanger.md) (gas ↔ blood) and [`GasDiffusor`](./GasDiffusor.md) (gas ↔ gas).

## What it models

A passive gas-containing compartment. It holds a volume of gas at a pressure determined by its
elastance plus the surrounding pressures (atmospheric, chest-compression, muscle), and tracks the
composition of that gas. Each step it relaxes its temperature toward a target, evaporates water
vapour toward saturation, recomputes pressure, and re-derives the partial pressures and fractions
from the current concentrations. Like its parent it has no built-in resistance or flow.

## Properties

### Inherited from Capacitance

See [`Capacitance`](./Capacitance.md) for the full list and the factor system. Key ones:

| Property | Unit | Description |
|---|---|---|
| `u_vol` | L | Unstressed volume (config) |
| `el_base` | mmHg/L | Baseline elastance (config) |
| `el_k` | unitless | Non-linear elastance coefficient (config) |
| `pres_ext` | mmHg | External pressure, non-persistent — cleared each step (config) |
| `fixed_composition` | bool | Freeze volume and composition (infinite reservoir) (config) |
| `vol` | L | Current volume (computed) |
| `pres` | mmHg | Total pressure (computed) |
| `pres_in` | mmHg | Recoil pressure (computed) |
| `pres_tm` | mmHg | Transmural pressure (computed) |

`GasCapacitance` also re-initializes `fixed_composition` to `false` in its own constructor.

### Config (unique to GasCapacitance)

| Property | Unit | Description |
|---|---|---|
| `pres_atm` | mmHg | Atmospheric pressure (default 760); set by the [`Gas`](./Gas.md) manager at build |
| `pres_cc` | mmHg | Chest-compression external pressure, non-persistent — cleared each step |
| `pres_mus` | mmHg | Muscle external pressure, non-persistent — cleared each step |
| `target_temp` | °C | Temperature the gas relaxes toward (set per-site by `Gas`) |
| `temp` | °C | Current gas temperature (also runtime state; seeded by `Gas`) |
| `humidity` | fraction | Relative humidity 0–1 (seeded by `Gas`) |

### Computed (gas state)

Concentrations are in mmol/L; partial pressures in mmHg; fractions are unitless 0–1.

| Property | Unit | Description |
|---|---|---|
| `ctotal` | mmol/L | Total gas molecule concentration (`ch2o + co2 + cco2 + cn2 + cother`) |
| `co2` | mmol/L | Oxygen concentration (note: the name is "concentration of O₂", not CO₂) |
| `cco2` | mmol/L | Carbon dioxide concentration |
| `cn2` | mmol/L | Nitrogen concentration |
| `ch2o` | mmol/L | Water vapour concentration |
| `cother` | mmol/L | Other-gases concentration |
| `po2` | mmHg | Partial pressure of O₂ |
| `pco2` | mmHg | Partial pressure of CO₂ |
| `pn2` | mmHg | Partial pressure of N₂ |
| `ph2o` | mmHg | Partial pressure of water vapour |
| `pother` | mmHg | Partial pressure of other gases |
| `pres_rel` | mmHg | Pressure relative to atmospheric (`pres − pres_atm`) |
| `fo2` | fraction | Fraction of O₂ |
| `fco2` | fraction | Fraction of CO₂ |
| `fn2` | fraction | Fraction of N₂ |
| `fh2o` | fraction | Fraction of water vapour |
| `fother` | fraction | Fraction of other gases |

`_gas_constant = 62.36367` (L·mmHg/(mol·K)) is a local constant used by `add_heat` / `add_watervapour`.

## Factor system

`GasCapacitance` inherits the full three-tier factor system from [`Capacitance`](./Capacitance.md)
acting on `el_base`, `u_vol` and `el_k`:

| Tier | Factors | Purpose |
|---|---|---|
| Non-persistent | `el_base_factor`, `u_vol_factor`, `el_k_factor` | Transient effects, reset to 1.0 each step |
| Persistent (`_ps`) | `el_base_factor_ps`, `u_vol_factor_ps`, `el_k_factor_ps` | Ongoing modulation (e.g. lung recruitment) |
| Scaling (`_scaling_ps`) | `el_base_factor_scaling_ps`, `u_vol_factor_scaling_ps`, `el_k_factor_scaling_ps` | `ModelScaler` weight/manual scaling |

The gas composition itself is **not** factor-driven (no `*_factor` on the concentrations).

## Calculation cycle (`calc_model`)

`GasCapacitance` overrides `calc_model` (it does not simply inherit the Capacitance cycle):

1. **`add_heat`** — relax `temp` toward `target_temp`: `dT = (target_temp − temp) · 0.0005`, then
   `temp += dT`. Adjust volume for the temperature change via the ideal gas law
   `dV = (ctotal · vol · R · dT) / pres` (added as `dV / 1000`); skipped when `fixed_composition`.
   Volume is floored at 0.
2. **`add_watervapour`** — drive `ch2o` toward the saturated vapour concentration:
   `dH2O = 0.00001 · (pH2Ot − ph2o) · Δt`, where `pH2Ot = calc_watervapour_pressure()`. The
   concentration update `ch2o = (ch2o·vol + dH2O) / vol` and the corresponding volume change are both
   skipped when `fixed_composition`.
3. **`calc_elastances` / `calc_volumes`** (inherited) compute `el_eff`, `u_vol_eff`, `el_k_eff`.
4. **`calc_pressure`** — calls `super.calc_pressure()` (recoil + `pres_ext`, then clears `pres_ext`),
   then adds the gas-space external pressures:
   ```
   pres     = pres_in + pres_ext + pres_cc + pres_mus + pres_atm
   pres_rel = pres − pres_atm
   pres_cc := 0;  pres_mus := 0          (both non-persistent, cleared each step)
   ```
5. **`calc_gas_composition`** (the method, see below) — recompute `ctotal` and derive partial
   pressures and fractions from the current concentrations.

### `calc_watervapour_pressure`

Saturated water-vapour pressure as a function of temperature (Kelvin via `+273.15`):

```
pH2Ot = exp(20.386 − 5132 / (temp + 273.15))
```

### `calc_gas_composition` (method)

Recomputes the total concentration and derives partials/fractions from the **current** species
concentrations (returns early if `ctotal === 0` to avoid division by zero):

```
ctotal = ch2o + co2 + cco2 + cn2 + cother
p_s    = (c_s / ctotal) · pres        for s ∈ {h2o, o2, co2, n2, other}
f_s    =  c_s / ctotal
```

This is distinct from the standalone [`calc_gas_composition`](./GasComposition.md) *initializer*,
which instead sets the concentrations from a target FiO₂/temperature/humidity mix.

## Composition mixing (`volume_in`)

`GasCapacitance` overrides `volume_in(dvol, comp_from)`. It calls `super.volume_in` to update the
volume, then mixes the incoming concentrations and temperature by volume fraction (the same
algebraically-correct dilution as [`BloodCapacitance`](./BloodCapacitance.md)):

```
co2  = (co2·vol  + (comp_from.co2  − co2)·dvol)  / vol      (and cco2, cn2, ch2o, cother)
temp = (temp·vol + (comp_from.temp − temp)·dvol) / vol
```

Mixing is **skipped for `fixed_composition`** compartments (an infinite reservoir holds its
composition and temperature constant) and **guarded against an empty compartment** (`vol <= 0`
returns early — no division by zero).

## Example definition (JSON)

A lung alveolar compartment (left lung) — non-fixed composition, warmed and humidified by the
[`Gas`](./Gas.md) manager:

```json
{
  "name": "ALL",
  "description": "gas capacitance model of the alveolar space of the left lung",
  "model_type": "GasCapacitance",
  "is_enabled": true,
  "u_vol": 0.04,
  "el_base": 186,
  "el_k": 0,
  "pres_ext": 0,
  "fixed_composition": false
}
```

A fixed-composition reservoir (ventilator gas source) keeps its composition and volume constant:

```json
{
  "name": "VENT_GASIN",
  "description": "gas reservoir of the mechanical ventilator",
  "model_type": "GasCapacitance",
  "is_enabled": false,
  "u_vol": 5,
  "el_base": 1000,
  "el_k": 0,
  "fixed_composition": true
}
```

(`temp`, `humidity`, `target_temp` and `pres_atm` are normally seeded by the [`Gas`](./Gas.md)
manager from its `temp_settings` / `humidity_settings` / `pres_atm`, rather than per-compartment.)

## Usage in the model

- Airway/alveolar chain: `MOUTH` (fixed-composition outside air) → `DS` (dead space) → `ALL`/`ALR`
  (left/right alveoli), wired by `Resistor`s; `GASEX_LL`/`GASEX_RL` exchange O₂/CO₂ between the
  alveoli and the lung-capillary blood.
- Device gas spaces: ventilator (`VENT_GASIN`/`VENT_GASCIRCUIT`/`VENT_GASOUT`) and ECLS
  (`ECLS_GAS_SOURCE`/`ECLS_GAS_OXY`/`ECLS_GAS_OUT`); the gas sources are `fixed_composition: true`.
- The [`Gas`](./Gas.md) manager discovers every `GasCapacitance` at build, seeds its pressure,
  temperature and humidity, and bootstraps the initial composition via the standalone
  [`calc_gas_composition`](./GasComposition.md).
