# Gas

The `Gas` model is a **manager** for the gas-containing compartments — the gas-phase analogue of
[`Blood`](./Blood.md). It is not itself a compartment: it seeds atmospheric pressure, temperature,
humidity and the initial gas composition onto every [`GasCapacitance`](./GasCapacitance.md) at build,
and exposes setters to change those at runtime. Its `calc_model` is empty; the per-compartment
chemistry is done by `GasCapacitance` and the gas-exchange/diffusion elements.

## Inheritance

```
BaseModelClass
  └── Gas   (gas-system manager — atmospheric pressure, temperature, humidity, initial composition)
```

## What it models

Global gas-phase boundary conditions. At build it walks `model.models`, collects every model whose
`model_type` is in `gas_containing_modeltypes` (default `["GasCapacitance"]`), and pushes the shared
`pres_atm`/`temp`/`target_temp` onto each. It then overrides individual compartments with any
per-site `temp_settings` / `humidity_settings`, and bootstraps each freshly-constructed compartment's
gas composition from the global `fio2` via the standalone
[`calc_gas_composition`](./GasComposition.md). At runtime its setters re-apply these boundary
conditions (atmospheric pressure, temperature, humidity, FiO₂) to chosen sites.

## Properties

### Config

| Property | Unit | Description |
|---|---|---|
| `pres_atm` | mmHg | Atmospheric pressure (default 760), propagated to every gas compartment |
| `fio2` | fraction | Inspired O₂ fraction (default 0.21) used to bootstrap compositions |
| `temp` | °C | Global gas temperature (default 20) applied as both `temp` and `target_temp` |
| `humidity` | fraction | Global gas humidity 0–1 (default 0.5) |
| `temp_settings` | object | Map `compartment_name → temperature (°C)` overriding the global temp per site |
| `humidity_settings` | object | Map `compartment_name → humidity (fraction)` overriding the global humidity per site |
| `gas_containing_modeltypes` | list | Model types treated as gas compartments (default `["GasCapacitance"]`) |

### Local / computed

| Property | Description |
|---|---|
| `_gas_components` | Array of resolved gas-compartment instances, populated in `init_model` |

`Gas` carries no factor parameters of its own.

## Bootstrap (`init_model`)

1. Apply the `args` (config) onto the instance.
2. Rebuild `_gas_components`: for every model whose `model_type` is in `gas_containing_modeltypes`,
   push it and set `model.pres_atm = pres_atm`, `model.temp = temp`, `model.target_temp = temp`.
3. For each entry in `temp_settings`, set that compartment's `temp` **and** `target_temp`.
4. For each entry in `humidity_settings`, set that compartment's `humidity`.
5. **Bootstrap composition only for freshly-constructed compartments** — those whose
   `co2 + cco2 + cn2 + ch2o + cother === 0` — by calling
   `calc_gas_composition(model, fio2, model.temp, model.humidity)`. Guarding on the raw
   concentrations (rather than the derived `ctotal`) preserves a restored/loaded saved state even if
   `ctotal` was not serialized.

`calc_model` is intentionally empty.

## Setters (runtime)

- **`set_atmospheric_pressure(new_pres_atm)`** — set `pres_atm` and propagate it to every compartment
  in `_gas_components`.
- **`set_temperature(new_temp, sites = ["OUT", "MOUTH"])`** — record `temp_settings[site]` for each
  site (`parseFloat`), then apply `temp` **and** `target_temp` to all recorded sites.
- **`set_humidity(new_humidity, sites = ["OUT", "MOUTH"])`** — record `humidity_settings[site]`
  (`parseFloat`) and apply `humidity` to all recorded sites.
- **`set_fio2(new_fio2, sites = ["OUT", "MOUTH"])`** — set `fio2` (`parseFloat`, to avoid string
  concatenation corrupting the `1 − (fio2 + fico2)` fraction math), then re-derive each site's
  composition via the standalone [`calc_gas_composition`](./GasComposition.md) at that site's current
  `temp`/`humidity`.

## Example definition (JSON)

From `term_neonate.json` — note the per-site temperature/humidity profile (cool, half-humid mouth;
warm, fully-saturated alveoli):

```json
{
  "name": "Gas",
  "description": "gas composition model",
  "model_type": "Gas",
  "is_enabled": true,
  "pres_atm": 760,
  "fio2": 0.21,
  "temp": 20,
  "humidity": 0.5,
  "humidity_settings": { "MOUTH": 0.5, "DS": 1, "ALL": 1, "ALR": 1 },
  "temp_settings": { "MOUTH": 20, "DS": 32, "ALL": 37, "ALR": 37 },
  "gas_containing_modeltypes": ["GasCapacitance"]
}
```

## Usage in the model

- Built once per scenario; runs first so every [`GasCapacitance`](./GasCapacitance.md) starts with a
  consistent pressure/temperature/humidity and a physiological room-air (or FiO₂-set) composition.
- The setters are the entry points the UI / `Ventilator` / `Ecls` and the bot use to change inspired
  oxygen, ambient pressure, and airway conditioning at runtime.
- Compartments not listed in `humidity_settings` start at the global `humidity` and are humidified
  over time by `GasCapacitance.add_watervapour`.
- The gas chemistry itself is documented in [`GasComposition`](./GasComposition.md) and
  [`GasCapacitance`](./GasCapacitance.md).
