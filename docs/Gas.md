# Gas

The `Gas` model is a **manager** for the gas-containing compartments, the gas-phase analogue of
[`Blood`](./Blood.md). It seeds atmospheric pressure, temperature, humidity and the initial gas
composition onto every `GasCapacitance` at build, and exposes setters to change them at runtime.

## What it does

- **Bootstrap (`init_model`).** For each `GasCapacitance`: set `pres_atm`, `temp`, `target_temp`.
  Apply any per-site `temp_settings` / `humidity_settings`. Then **bootstrap the gas composition only
  for freshly-constructed compartments** — those with no gas of any species (sum of `co2`/`cco2`/
  `cn2`/`ch2o`/`cother` is 0) — via the standalone `calc_gas_composition(fio2, …)`. Guarding on the
  raw concentrations preserves a restored saved state even if the derived `ctotal` was not serialized.
- **`calc_model`** is empty: the per-compartment composition is computed by `GasCapacitance` itself
  and by the `GasExchanger`/`GasDiffusor` elements; `Gas` is purely an initializer/manager.

## Setters

- `set_atmospheric_pressure` — propagate `pres_atm` to all gas compartments.
- `set_temperature(temp, sites)` / `set_humidity(humidity, sites)` — record per-site settings and
  apply them (default sites `OUT`, `MOUTH`).
- `set_fio2(new_fio2, sites)` — re-derive the gas composition of the given sites at the new FiO₂
  (`parseFloat`-guarded against string input that would corrupt the fraction math).

## Configuration (model-definition fields)

`pres_atm`, `fio2`, `temp`, `humidity`, `temp_settings`, `humidity_settings`.

## Notes

- The gas chemistry itself is documented in [`GasComposition`](./GasComposition.md) and
  [`GasCapacitance`](./GasCapacitance.md).
- Compartments not listed in `humidity_settings` start dry and are humidified over time by
  `GasCapacitance.add_watervapour`.
