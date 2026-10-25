# Gas

`Gas` manages the gas side of the model, the counterpart of [Blood](./Blood.md); it is not a compartment. At build it gives every gas compartment the atmospheric pressure, temperature, humidity and starting composition. At runtime it provides the setters for FiO2, ambient temperature and humidity, and altitude, and it couples the airway's temperature to the body's.

## Physiology

The air a baby breathes is cool and dry: about 20 °C and 50 % humidity in a room, 21 % O2. On its way in, the nose and airways warm it to body temperature and saturate it with water vapour, so alveolar gas is 37 °C and 100 % humid, with a water vapour pressure of ~47 mmHg that dilutes the other gases. Conditioning the gas costs the body heat and water, a real loss in a small preterm infant (which is why gases are heated and humidified on a ventilator).

The partial pressure of inspired O2 is FiO2 × (barometric pressure − water vapour pressure). At altitude, a lower barometric pressure lowers it at the same FiO2.

## Inheritance

```
BaseModelClass
  └── Gas
```

## Properties

### Config (set in the definition JSON)

| Property | Unit | Default | Description |
|---|---|---|---|
| `pres_atm` | mmHg | 760 | Atmospheric pressure, given to every gas compartment. |
| `fio2` | – | 0.21 | Dry O2 fraction applied to fresh compartments and the sources at build. Afterwards: the last value given to `set_fio2`. Scenarios 0.21–0.30. |
| `temp` | °C | 20 | Temperature given to every gas compartment at build, before `temp_settings`. |
| `humidity` | – | 0.5 | Default relative humidity. |
| `temp_settings` | {name: °C} | `{}` | Per-compartment temperature. Scenarios: MOUTH 20, DS 32, ALL 37, ALR 37. |
| `humidity_settings` | {name: fraction} | `{}` | Per-compartment humidity. Scenarios: MOUTH 0.5, DS/ALL/ALR 1. |
| `thermoregulation_name` | – | `"Thermoregulation"` | Model whose `setpoint_temp` anchors the airway offsets. |
| `gas_containing_modeltypes` | list | `["GasCapacitance"]` | Model types treated as gas compartments. |

## Calculation

`calc_model` does nothing; the gas physics run in [GasCapacitance](./GasCapacitance.md) and [GasComposition](./GasComposition.md). All the work is at build and in the methods.

**Build (`init_model`):**
1. Every gas compartment gets `pres_atm`, and `temp` and `target_temp` from `temp`; then `temp_settings` and `humidity_settings` are applied by name.
2. A compartment with no gas at all is filled by [`calc_gas_composition`](./GasComposition.md) from `fio2`, its temperature and humidity. A loaded state keeps its own composition.
3. A compartment whose water vapour exceeds saturation at its final temperature is rebuilt (e.g. an idle ventilator circuit bootstrapped warmer by its device).
4. The fixed-composition sources named in the settings (MOUTH) are rebuilt from `fio2`, temperature and humidity, so the scenario's settings reach them.
5. For each body-warmed compartment (the non-fixed members of `temp_settings`: DS, ALL, ALR), its offset from the body set-point is stored: DS −5 °C, alveoli 0.

## Methods

| Method | Effect |
|---|---|
| `set_fio2(fio2, sites = ["OUT", "MOUTH"])` | Rebuilds each named site's composition at `fio2`; stores `fio2`. Absent sites are skipped (no scenario has `OUT`). Room-air FiO2 is set on MOUTH. |
| `set_temperature(t, sites = ["OUT", "MOUTH"])` | Adds the sites to `temp_settings` and re-applies all of them (`temp`, `target_temp`). Fixed sources are rebuilt with their **own** dry FiO2 (their water content follows the new temperature). |
| `set_humidity(h, sites = ["OUT", "MOUTH"])` | Same for humidity. Airway compartments relax to the new humidity on their own; fixed sources are rebuilt with their own FiO2. |
| `set_atmospheric_pressure(p)` | `pres_atm` on every gas compartment. In term_neonate, 760 → 600 mmHg lowers mouth pO2 from 158 to 125 mmHg, alveolar pO2 105 → 76 and post-ductal pO2 73 → 57 mmHg (SO2 96.7 → 94.7 %) within 2 min. |
| `set_body_temperature(core)` | Called by Thermoregulation: `target_temp` of each body-warmed compartment = core + its stored offset, so fever and hypothermia reach the alveoli (and the dead space stays 5 °C below). Neutral at rest. |
| `drain_respiratory_heat()` | Called by Thermoregulation: returns and clears the heat (J, sensible + latent) the body-warmed compartments gave to the gas since the last call. |

## Factor system

None.

## Inputs and outputs

- **Reads:** `Thermoregulation.setpoint_temp` (build); the body-warmed compartments' heat accumulators.
- **Writes:** every gas compartment's `pres_atm`, `temp`, `target_temp`, `humidity`, and composition through `calc_gas_composition`.
- **Written by:** the user and bot (FiO2, temperature, humidity, altitude); Thermoregulation (`set_body_temperature`, `drain_respiratory_heat`).
- **Read by:** Thermoregulation (respiratory heat loss).

## Assumptions and limitations

- **Membership by `model_type` string**, as in Blood: a custom gas compartment type must be added to `gas_containing_modeltypes`.
- **Rebuilding a source discards its history.** `calc_gas_composition` writes a fresh composition (ambient CO2 0.04 %); this is why only fixed sources are rebuilt by the setters, never airway compartments.
- **The setters' sites accumulate.** A site passed to `set_temperature` or `set_humidity` stays in the settings and is re-applied on every later call.
- **Devices own their gas lines.** Ventilator and ECLS gas compartments receive `pres_atm` and the default temperature here but are set by their device; they are not in `temp_settings`.
- **Altitude changes only the ambient pressure.** No hypoxic ventilatory acclimatisation, no change in gas density.

## Example definition (JSON)

From `term_neonate.json`, `models.Gas` (trimmed to the config props):

```json
{
  "name": "Gas",
  "model_type": "Gas",
  "is_enabled": true,
  "pres_atm": 760,
  "fio2": 0.21,
  "temp": 20,
  "humidity": 0.5,
  "temp_settings": { "MOUTH": 20, "DS": 32, "ALL": 37, "ALR": 37 },
  "humidity_settings": { "MOUTH": 0.5, "DS": 1, "ALL": 1, "ALR": 1 },
  "thermoregulation_name": "Thermoregulation",
  "gas_containing_modeltypes": ["GasCapacitance"]
}
```

## Usage in the scenarios

One instance in every scenario, with the settings above. `fio2` 0.21 in term_neonate.

## References

No literature values; the temperatures and humidities are the conventional room and airway values.
