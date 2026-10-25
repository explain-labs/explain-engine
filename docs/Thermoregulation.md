# Thermoregulation

`Thermoregulation` is the body-temperature controller. It integrates a heat balance:
- **production:** metabolic heat from the O2 consumption, plus brown-fat thermogenesis below the set-point;
- **loss:** radiation, convection, evaporation, and the heat spent warming and humidifying inspired gas;
- **exchange with the blood pool:** heat flows by perfusion between the body (tissue) and the blood.

From the resulting core temperature it drives:
- the Q10 effect on O2 use (Metabolism);
- the heart-rate change with temperature (Heart);
- the temperature the blood and the airway gas warm toward (Blood, Gas).

It holds no compartment and is neutral at rest: a trim captured at warm-up balances the scenario's own environment.

## Physiology

A newborn loses heat quickly: a large surface for its mass, thin skin and little fat. The losses are:
- **radiation** to cooler surroundings and **convection** to the air;
- **evaporation**, very large in an extremely preterm infant in dry air;
- **respiration:** warming and humidifying inspired gas.

The thermoneutral environment (32–36 °C, higher for smaller infants) minimises the energy spent keeping warm. Newborns cannot shiver: in the cold they burn brown fat (non-shivering thermogenesis), which raises O2 consumption. Hypothermia slows metabolism (Q10 ≈ 2–2.5) and the heart; fever does the reverse.

## Inheritance

```
BaseModelClass
  └── Thermoregulation
```

## Properties

### Config: environment and switches

| Property | Unit | Default | Description |
|---|---|---|---|
| `thermoregulation_running` | boolean | `true` | Switch. Off releases the owned channels once. |
| `env_temp` | °C | 32 | Air temperature (term 32, preterm 34–36, fetus 37.3 for the amniotic fluid). |
| `radiant_temp` | °C or null | null | Radiant warmer temperature; null = `env_temp`. |
| `rel_humidity` | 0–1 | 0.5 | Ambient humidity (term 0.5, preterm 0.6–0.8, fetus 1). |
| `respiratory_heat_loss` | boolean | `true` | Count the airway conditioning heat (off in the fetus). |
| `resp_window` | s | 30 | Averaging window for the respiratory heat (must span several breaths). |
| `metabolism_name`, `heart_name`, `blood_name`, `gas_name` | – | the model names | Wiring. |

### Config: body and effectors

| Property | Unit | Default | Description |
|---|---|---|---|
| `setpoint_temp` | °C | 37 | Hypothalamic set-point (fetus 37.5). |
| `heat_capacity` | J/(kg·K) | 3470 | Specific heat of tissue. |
| `surface_area_k` | – | 0.05 | Body surface = k · weight^(2/3) m² (Meeh). |
| `h_radiative`, `h_convective` | W/(m²·K) | 9.6, 7.0 | Heat-transfer coefficients. |
| `evap_coeff` | W/m² | 6.0 | Evaporative loss per unit dryness (1 − humidity). |
| `caloric_equiv_o2` | J/mL O2 | 20.1 | Heat per mL O2 consumed. |
| `blood_density`, `cp_blood` | kg/L, J/(kg·K) | 1.06, 3800 | Blood heat capacity. |
| `blood_temp_tc` | s | 10 | Perfusion equilibration time constant (match `Blood.blood_temp_tc`). |
| `blood_volume_per_kg` | L/kg | 0.08 | Circulating volume used for the perfusion coupling mass. |
| `bat_gain`, `bat_max_per_kg` | W/°C, W/kg | 6, 4.5 | Brown-fat heat per °C below the set-point, and its ceiling (0 in the fetus). |
| `q10` | – | 2.3 | Metabolic Q10. |
| `vo2_temp_factor_min`, `vo2_temp_factor_max` | – | 0.5, 2.5 | Clamp on the Q10 factor. |
| `hr_temp_gain` | 1/°C | 0.1 | Heart-rate factor change per °C. |
| `hr_temp_factor_min`, `hr_temp_factor_max` | – | 0.6, 1.6 | Clamp on the heart-rate factor. |

### Baseline (captured, saved with the state)

| Property | Unit | Description |
|---|---|---|
| `loss_trim` | W | Heat-loss offset (insulation, posture) that balances production at the set-point in the scenario's environment. |
| `loss_trim_seeded` | boolean | The trim has been captured. A fresh build starts at the set-point; a saved state keeps its own core temperature. |

### Outputs

| Property | Unit | Description |
|---|---|---|
| `core_temp`, `skin_temp`, `skin_gradient` | °C | Core, skin read-out (= core − `skin_gradient`, 1 °C) and the gradient. |
| `heat_production`, `heat_loss`, `brown_fat_heat` | W | Production, effective loss (with the trim), brown-fat part. |
| `q_respiratory`, `q_perfusion` | W | Airway conditioning heat; tissue → blood heat flow. |
| `blood_temp_mean` | °C | Heat-capacity-weighted mean blood temperature. |
| `vo2_temp_factor`, `vo2_bat_factor`, `hr_temp_factor` | – | Applied effects. |

## Calculation

Every 1 s:
```
Q_prod = vo2 · vo2_factor · vo2_temp_factor · weight / 60 · 20.1  +  brown fat     (W)
brown fat = min(bat_gain · max(0, set-point − core), bat_max_per_kg · weight)
SA     = surface_area_k · weight^(2/3)
Q_loss = SA·[h_rad·(core − radiant) + h_conv·(core − env)] + SA·evap_coeff·(1 − humidity) + Q_resp + loss_trim
Q_perf = (blood_volume_per_kg · weight · ρ · cp / blood_temp_tc) · (core − blood_mean)
d core / dt = (Q_prod − Q_loss − Q_perf) / (weight · heat_capacity − C_blood)
```
- **`Q_resp`** is the heat the airway compartments actually spent warming and humidifying gas, metered by [GasCapacitance](./GasCapacitance.md) and drained through [`Gas.drain_respiratory_heat`](./Gas.md), averaged over `resp_window`. It is signed, so heat recovered when expired gas cools in the dead space is credited back. It works the same under mechanical ventilation and in apnoea.
- **The trim** is captured once, after 5 s and a full `resp_window`, so production equals loss at the set-point.

**Effects** (written every update):
- `Metabolism.vo2_temp_factor = q10^((core − 37)/10)` (clamped);
- `Metabolism.vo2_bat_factor`: brown fat's O2 cost added to Metabolism's O2 use (its heat is counted once, above);
- `Heart.hr_temp_factor = 1 + hr_temp_gain · (core − set-point)` (clamped);
- `Blood.set_perfusion_target(core)` and `Gas.set_body_temperature(core)`.

**Example** (term_neonate, room moved from 32 to 24 °C):
- after 20 min: core 35.9 °C, brown fat 6.6 W (doubling Metabolism's O2 use, `vo2_bat_factor` 1.97), heart-rate factor 0.89, Q10 factor 0.91;
- after 40 min: core 35.3 °C.

## Factor system

It owns `Metabolism.vo2_temp_factor`, `vo2_bat_factor` and `Heart.hr_temp_factor`, and sets the perfusion and airway temperature targets.

## Inputs and outputs

- **Reads:** Metabolism (`vo2`, `vo2_factor`); `Blood.get_thermal_state`; `Gas.drain_respiratory_heat`; `model.weight`.
- **Writes:** the channels above.
- **Written by:** the user (environment, warmer, humidity, switch).
- **Read by:** Gas (its `setpoint_temp`, at build), `DataCollector` watchers, the Monitor.

## Assumptions and limitations

- **Heat production counts Metabolism only,** not the myocardium (Mob); the trim absorbs it at rest, but a change in cardiac work doesn't change heat.
- **Respiratory heat is 0.87 W of 9.6 W in term_neonate on room air** (~9 %, mostly latent). A heated humidifier drives it to ~0, but the whole-model thermal gain is only ~0.043 °C/W, so the core rises just ~0.04 °C. Most retained heat goes into `Q_perf`.
- **`Q_perf` doesn't return to 0 after a perturbation** (≈ 1.2 W sustained after the humidifier step), although the coupling should be energy-neutral at rest. The coupling mass is the circulating volume (0.08 L/kg), while Blood relaxes all compartments (~2.4× that). Worth checking before relying on absolute temperature excursions.
- **`evap_coeff` still contains the old respiratory loss,** now counted separately by `Q_resp`. Rest is unaffected (the trim absorbs it), but the sensitivity to ambient humidity is overstated.
- **Respiratory water loss** isn't conserved (only its heat is charged).
- **The inspired air (`MOUTH`, 20 °C) and `env_temp` are independent:** a cold room doesn't cool the inspired gas.
- **No skin node, no peripheral vasoconstriction:** skin temperature is a fixed offset; the infant's own vasomotor defence is not modelled.

## Example definition (JSON)

From `term_neonate.json`, `models.Thermoregulation` (trimmed to the main config):

```json
{
  "name": "Thermoregulation",
  "model_type": "Thermoregulation",
  "is_enabled": true,
  "thermoregulation_running": true,
  "env_temp": 32,
  "radiant_temp": null,
  "rel_humidity": 0.5,
  "respiratory_heat_loss": true,
  "setpoint_temp": 37,
  "surface_area_k": 0.05,
  "bat_gain": 6,
  "bat_max_per_kg": 4.5,
  "q10": 2.3
}
```

## Usage in the scenarios

One instance in every scenario.

| Scenario | `env_temp` (°C) | Humidity | Set-point | Brown fat | Respiratory heat |
|---|---|---|---|---|---|
| term_neonate | 32 | 0.5 | 37 | yes | yes |

## References

No literature values; the coefficients are standard heat-transfer estimates, and the trim makes every scenario neutral at its own environment.
