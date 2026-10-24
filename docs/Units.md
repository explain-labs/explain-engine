# Units

`helpers/Units.js` holds the engine's shared physical constants and unit conversions. Every model that converts between gas volumes and amounts, or needs water vapour pressure, imports them from here, so each constant is defined once.

## Physiology

Gas amounts in physiology are quoted in two ways:
- **Volumes at STPD** (0 °C, 760 mmHg, dry): oxygen consumption (VO2, mL/kg/min), Hüfner's constant (1.36 mL O2 per g Hb), O2 solubility (0.0031 mL/dL per mmHg). At STPD one mmol of gas occupies 22.414 mL, whatever the body temperature.
- **Partial pressures** in gas mixtures, from the ideal gas law. Gas in the airways and alveoli is saturated with water vapour at body temperature (47 mmHg at 37 °C), which dilutes the other gases (the "− 47" in the alveolar gas equation).

## API

| Export | Value | Meaning |
|---|---|---|
| `O2_MMOL_PER_ML` | 1 / 22.414 mmol/mL | Every mL O2 (or CO2) ↔ mmol conversion. STPD, independent of temperature. |
| `GAS_CONSTANT` | 62.36367 L·mmHg/(mol·K) | Ideal gas constant, for `p·V = n·R·T` in gas compartments. |
| `svp_h2o(temp)` | mmHg | Saturation water vapour pressure at `temp` °C: `exp(20.386 − 5132 / (temp + 273.15))`. |

## Users

| Export | Imported by |
|---|---|
| `O2_MMOL_PER_ML` | [BloodComposition](./BloodComposition.md), [Metabolism](./Metabolism.md), [Mob](./Mob.md), [Lactate](./Lactate.md), [Uterus](./Uterus.md), [MaternalPlacenta](./MaternalPlacenta.md), [Monitor](./Monitor.md) |
| `GAS_CONSTANT` | [GasCapacitance](./GasCapacitance.md), [GasComposition](./GasComposition.md), [GasExchanger](./GasExchanger.md) |
| `svp_h2o` | [GasCapacitance](./GasCapacitance.md), [GasComposition](./GasComposition.md), [Gas](./Gas.md) |

No other file in the engine hard-codes these numbers.

## Assumptions and limitations

- **`svp_h2o` is a two-parameter Clausius–Clapeyron fit**, slightly low against the Buck equation: −0.4 % at 30 °C, −0.9 % at 33.5 °C, −1.3 % at 37 °C (46.5 vs 47.1 mmHg), −1.6 % at 40 °C. The inspired pO2 at 37 °C is therefore 0.13 mmHg higher than with the standard 47 in room air, 0.6 mmHg in 100 % O2.
- **CO2 uses the same molar volume as O2** (ideal gas). The real STPD molar volume of CO2 is ~22.26 mL/mmol, 0.7 % smaller.

## References

- 22.414 L/mol (ideal gas at STP) and R = 62.364 L·mmHg/(mol·K): CODATA values.
- Buck AL. New equations for computing vapor pressure and enhancement factor. *J Appl Meteorol* 1981;20:1527–32 (the comparison above).
