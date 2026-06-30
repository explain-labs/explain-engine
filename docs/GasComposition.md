# GasComposition

`GasComposition.js` exports the standalone function
**`calc_gas_composition(gc, fio2 = 0.205, temp = 37, humidity = 1.0, fico2 = 0.000392)`** — an
**initializer** that sets a gas compartment's full composition from a target dry-gas mix and the
local temperature and humidity. It is the counterpart to the
[`GasCapacitance.calc_gas_composition`](./GasCapacitance.md) *method* (which instead derives partial
pressures from the compartment's already-present concentrations).

## Inheritance

This is **not a class** — it is a module-level function, so it has no inheritance chain. It takes a
gas-compartment instance `gc` (typically a [`GasCapacitance`](./GasCapacitance.md)) by reference and
writes its composition fields in place. It does not extend `BaseModelClass` and is not registered in
`ModelIndex.js`.

## What it models

The wet (humidified) gas composition of a compartment at its current pressure. Given a **dry**
inspired fraction of O₂ and CO₂, with N₂ (and "other") taking the remainder, it computes the
saturated water-vapour pressure at the compartment's temperature, removes that vapour pressure from
the available dry-gas pressure, and partitions the rest among O₂, CO₂, N₂ and "other" — yielding a
mutually consistent set of partial pressures, fractions and concentrations that sum to `ctotal`.

## Parameters

| Parameter | Default | Description |
|---|---|---|
| `gc` | — | The gas compartment to write (mutated in place) |
| `fio2` | 0.205 | Target **dry** O₂ fraction |
| `temp` | 37 | Temperature (°C) used for the gas law and vapour pressure |
| `humidity` | 1.0 | Relative humidity 0–1 |
| `fico2` | 0.000392 | Target **dry** CO₂ fraction |

Reference dry-air constants (module-local): `_fo2_dry = 0.205`, `_fco2_dry = 0.000392`,
`_fn2_dry = 0.794608`, `_fother_dry = 0.0`, `_gas_constant = 62.36367` (L·mmHg/(mol·K)).

## Calculation

### 1. Dry-gas fractions (re-normalize N₂ / other to the supplied O₂/CO₂)

```
new_fo2_dry    = fio2
new_fco2_dry   = fico2
new_fn2_dry    = _fn2_dry    · (1 − (fio2 + fico2)) / (1 − (_fo2_dry + _fco2_dry))
new_fother_dry = _fother_dry · (1 − (fio2 + fico2)) / (1 − (_fo2_dry + _fco2_dry))
```

### 2. Get a current pressure

It calls `gc.calc_model()` to ensure `gc.pres` is up to date, reads `pressure = gc.pres`, then
**persists** the supplied `temp` and `humidity` onto `gc` (so the compartment's own per-step
calculations stay consistent with the concentrations set below). If `pressure <= 0` it **returns
early** (a non-physical pressure would otherwise produce Infinity/NaN fractions).

### 3. Total concentration (ideal gas law)

```
ctotal = (pressure / (R · (273.15 + temp))) · 1000        (mmol/L)
```

### 4. Water vapour (saturated × humidity)

```
ph2o = exp(20.386 − 5132 / (temp + 273.15)) · humidity
fh2o = ph2o / pressure
ch2o = fh2o · ctotal
```

### 5. Partition the remaining (dry) pressure among each species

For each species `s ∈ {o2, co2, n2, other}`, the dry fraction is applied to the **non-vapour**
pressure `(pressure − ph2o)`, and the fraction/concentration follow:

```
p_s = new_f{s}_dry · (pressure − ph2o)
f_s = p_s / pressure
c_s = f_s · ctotal
```

(Recall `gc.co2` is the **oxygen** concentration — see [`GasCapacitance`](./GasCapacitance.md).)
All partial pressures, fractions and concentrations are thus mutually consistent and the
concentrations sum to `ctotal`.

## When it is used

To **seed or reset** a compartment to a known gas mix, never as the per-step update:

- at build, by [`Gas.init_model`](./Gas.md) for freshly-constructed compartments;
- when FiO₂ / temperature / humidity changes, via `Gas.set_fio2` (and the `Ventilator` / `Ecls`
  setters);
- on the ventilator / ECLS gas sources.

The per-step composition update is done by the [`GasCapacitance.calc_gas_composition`](./GasCapacitance.md)
*method*, which derives partials from existing concentrations and does **not** overwrite the mix.

## Notes

- The Kelvin conversions use `273.15` consistently (matching the per-step water-vapour formula in
  `GasCapacitance.calc_watervapour_pressure`).
- ⚠️ It **overwrites** the composition. Calling it on a diffusing compartment every step would reset
  it to the fixed inspired mix — which is exactly why [`GasDiffusor`](./GasDiffusor.md) and
  [`GasExchanger`](./GasExchanger.md) use the *method*, not this function.
