# GasComposition

`GasComposition.js` exports the standalone function **`calc_gas_composition(gc, fio2, temp, humidity,
fico2)`** — an **initializer** that sets a gas compartment's composition from a target dry-gas mix and
the local temperature/humidity. It is the counterpart to the `GasCapacitance.calc_gas_composition`
*method* (which instead derives partials from existing concentrations).

## What it computes

Given a dry inspired mix (`fio2`, `fico2`, with N₂ taking the remainder), and the compartment's
pressure:

```
ctotal = pressure / (R · (273.15 + temp)) · 1000          (ideal gas law, mmol/L)
ph2o   = exp(20.386 − 5132 / (temp + 273.15)) · humidity   (saturated vapour × humidity)
for each species s:  p_s = f_s_dry · (pressure − ph2o);  f_s = p_s / pressure;  c_s = f_s · ctotal
```

So the wet partial pressures, fractions and concentrations of O₂, CO₂, N₂, "other" and water vapour
are all set consistently (they sum to `ctotal`).

## When it is used

To **seed or reset** a compartment to a known gas mix: at build (`Gas.init_model`), when FiO₂/
humidity/temperature is changed (`Gas.set_fio2`, `Ventilator`/`Ecls` setters), and on the ventilator/
ECLS gas sources. It is **not** the per-step update — `GasCapacitance.calc_gas_composition` (the
method) does that.

## Notes

- It first calls `gc.calc_model()` to obtain a current pressure, then **persists** `gc.temp` and
  `gc.humidity` so the compartment stays consistent with the concentrations it sets, and **guards
  against a non-physical pressure** (would otherwise produce Infinity/NaN fractions).
- The Kelvin conversions use `273.15` consistently (matching the per-step water-vapour formula in
  `GasCapacitance`).
- ⚠️ It overwrites the composition; calling it on a diffusing compartment every step would reset it to
  the fixed mix — which is exactly why `GasDiffusor` uses the *method*, not this function.
