# GasComposition

`GasComposition` holds one function, `calc_gas_composition(gc, fio2, temp, humidity, fico2)`. It **overwrites** a gas compartment's whole composition with fresh gas of a given dry O2 (and CO2) fraction, at the compartment's current pressure, the given temperature and humidity. It initialises gas compartments and sets gas sources (room air, ventilator and oxygenator supply). It is a module of functions, not a model class.

The per-step partial pressures of a compartment are computed by its own method [`GasCapacitance.calc_gas_composition()`](./GasCapacitance.md#calculation), not by this function.

## Physiology

"FiO2 0.21" means 21 % of the **dry** gas is O2. Once the gas is humidified, water vapour takes its share of the total pressure, and the other gases share what's left:

```
pO2 = FiO2 · (P − pH2O)        in room air at 37 °C, 100 % RH: 0.21 · (760 − 47) ≈ 150 mmHg
```

## API

```js
import { calc_gas_composition } from "./component_models/GasComposition.js";
calc_gas_composition(gc, fio2 = 0.205, temp = 37, humidity = 1.0, fico2 = 0.000392);
```

| Argument | Unit | Default | Description |
|---|---|---|---|
| `gc` | – | – | A GasCapacitance. |
| `fio2` | – | 0.205 | Dry O2 fraction, clamped 0–1. Callers always pass it (Gas uses 0.21 at room air). |
| `temp` | °C | 37 | Temperature; written to `gc.temp`. |
| `humidity` | – | 1.0 | Relative humidity 0–1; written to `gc.humidity`. |
| `fico2` | – | 0.000392 | Dry CO2 fraction (ambient ~0.04 %), clamped to `1 − fio2`. Only the ECLS sweep gas passes its own. |

**Writes on `gc`:** `temp`, `humidity`, `ctotal`, and for each species (O2, CO2, N2, H2O, other) the concentration, partial pressure and fraction. It also refreshes `gc.pres` by running the compartment's elastance, volume and pressure calculations, without stepping it (no heat or water exchange).

## Calculation

1. **Dry mix.** O2 = `fio2`, CO2 = `fico2`; N2 takes the rest (the reference N2 share is rescaled to `1 − fio2 − fico2`; "other" is 0).
2. **Pressure:** `gc.pres` from the current volume. If it isn't positive, it returns after setting `temp` and `humidity`, leaving the composition unchanged.
3. **Total concentration** from the ideal gas law: `ctotal = P / (R·(273.15 + temp)) · 1000` (mmol/L).
4. **Water vapour:** `pH2O = svp_h2o(temp) · humidity` (see [Units](./Units.md)); `fH2O = pH2O/P`.
5. **Each dry species:** `p = f_dry · (P − pH2O)`, fraction `p/P`, concentration `fraction · ctotal`.

## Assumptions and limitations

- **`fo2` reads below the FiO2 you set.** It is the fraction of the *wet* gas: `fio2 · (1 − fH2O)`. At 20 °C and 50 % RH (MOUTH), 0.21 becomes 0.208. Divide by `1 − fh2o` for the dry fraction.
- **It discards the compartment's history,** including its CO2. That is why [Gas](./Gas.md) only rebuilds fixed sources at runtime, never airway compartments.
- **Dry air is O2 + N2 + CO2.** Argon (0.93 %) is counted as N2; "other" (e.g. an anaesthetic or helium) is always 0 here.
- **Uses the compartment's current pressure.** A source rebuilt at an elevated pressure (the 1160 mmHg ventilator supply) gets the matching molar density.

## Callers

| Caller | Compartments | When |
|---|---|---|
| [Gas](./Gas.md) | every gas compartment without gas; supersaturated ones; MOUTH | build; `set_fio2`, `set_temperature`, `set_humidity` |
| [Ventilator](./Ventilator.md) | `VENT_GASIN`, `VENT_GASCIRCUIT`, `VENT_GASOUT` | build, FiO2 / temperature / humidity changes |
| [Ecls](./Ecls.md) | `ECLS_GAS_SOURCE` | sweep-gas FiO2, CO2, temperature or humidity changes |

## References

None; ideal gas law and Dalton's law.
