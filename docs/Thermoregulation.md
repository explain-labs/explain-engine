# Thermoregulation

The `Thermoregulation` model is the **body-temperature process controller** for the neonate — a slow
counterpart to [`Hormones`](./Hormones.md) (RAAS/ADH) and the [`Kidneys`](./Kidneys.md)
autoregulation loop. It holds no compartment of its own, resolves references to other models lazily,
runs on an `_update_interval` accumulator, and **owns its effector channels while enabled** (releasing
them once on disable). It models a **single well-mixed core node** whose temperature is the running
balance of heat produced against heat lost. Default config is **neutral**: thanks to the `_loss_trim`
auto-seed the core sits exactly at `setpoint_temp` (37 °C) at rest, every owned factor is `1.0`, and
baseline vitals/ABG are unchanged. The model only diverges when the thermal environment is perturbed
(cold incubator, radiant warmer, evaporative loss) or when heat production changes.

## Sensors → core node → effectors

```
SENSORS (lazy refs)              CORE NODE (single-node heat balance)        EFFECTORS (owned, default-neutral)
Metabolism.vo2 · vo2_factor ──┐
env_temp / radiant_temp ──────┼─► Q_prod (metabolic + brown fat)            Metabolism.vo2_temp_factor  (Q10 metabolic coupling)
rel_humidity ─────────────────┼─► Q_loss (radiative+convective+evap +trim)  Heart.hr_temp_factor        (temperature → heart rate)
weight (Meeh SA) ─────────────┘    dCore = (Q_prod − Q_loss)/(m·c)·dt        Blood.set_temperature(core) (acid-base / O2 dissoc. dT term)
```

## Heat balance

Every `_update_interval` (default **1 s** — temperature is slow), `_update_temperature(u)` runs the
single-node balance with `u` the exact elapsed time since the last update:

```
Q_prod  = metabolic + brown_fat                                                  [W]
  metabolic = (vo2_eff · weight / 60) · caloric_equiv_o2
    vo2_eff = Metabolism.vo2 · Metabolism.vo2_factor · vo2_temp_factor           (mL O2/kg/min)
  brown_fat = min( bat_gain · max(0, setpoint − core), bat_max_per_kg · weight ) [W]
Q_loss_eff = SA·[ h_radiative·(core − radiant_eff) + h_convective·(core − env_temp) ]
             + SA·evap_coeff·(1 − rel_humidity) + _loss_trim                     [W]
  SA = surface_area_k · weight^(2/3)              (Meeh surface area, m^2)
  radiant_eff = radiant_temp if set, else env_temp
dCore = (Q_prod − Q_loss_eff) / (weight · heat_capacity) · u                     [degC]
```

Neonates **cannot shiver**: below set-point they defend temperature by **non-shivering (brown-fat)
thermogenesis** (`brown_fat_heat`), a linear deficit term capped at `bat_max_per_kg · weight`. The
high neonatal surface-to-mass ratio (the Meeh `weight^(2/3)` term) is what makes them lose heat so
fast. A read-out-only `skin_temp = core_temp − skin_gradient` is also exposed.

## The auto-seed neutrality idiom

A neonate at rest is not in raw radiative/convective balance with a 32 °C incubator — clothing,
posture, nesting and insulation supply an offset the single-node geometry doesn't capture. Rather
than tune coefficients per scenario, the model **auto-seeds** it: at the first update after
`_warmup_delay` (5 s, to let the circuit settle), it sets

```
_loss_trim = Q_prod − q_loss_raw      (evaluated at core == setpoint)
```

so `Q_loss_eff == Q_prod` exactly and `dCore = 0`. The body is therefore **neutral at any baseline
weight, VO2, or env_temp the scenario ships with**, and only the *subsequent* change of
`env_temp` / `radiant_temp` / `rel_humidity` / VO2 moves the core. This is the same idiom as the
Hormones setpoint anchoring and the Kidneys TGF seed.

## Effectors (owned channels)

On each update `_apply_effectors()` maps core temperature to three channels, all default-neutral and
independent of `Ans` / `Drugs`:

| Channel | Mapping | Notes |
|---|---|---|
| `Metabolism.vo2_temp_factor` | `q10 ^ ((core − 37)/10)`, clamped `[vo2_temp_factor_min, vo2_temp_factor_max]` | **new** Q10 metabolic coupling; folds into `vo2_eff` |
| `Heart.hr_temp_factor` | `1 + hr_temp_gain·(core − setpoint)`, clamped `[hr_temp_factor_min, hr_temp_factor_max]` | drives a previously-dormant Heart channel (already summed into HR in `Heart.calc`) |
| `Blood.set_temperature(core)` | propagates core temp to **every** blood compartment | feeds the temperature (dT) term of the Stewart acid-base / O2-dissociation solver (`BloodComposition`) |

The master gate `thermoregulation_running` (default `true`), when set `false`, calls
`_release_channels()` **once** — resetting `vo2_temp_factor`/`hr_temp_factor` to `1.0` and
`Blood.set_temperature(37.0)` — then idles. This is the clean "off" switch; while enabled, manual
edits to those channels are overwritten each tick.

## Key parameters (defaults / units)

| Parameter | Default | Meaning |
|---|---|---|
| `env_temp` | `32.0 °C` | ambient air temperature (neutral-thermal incubator) |
| `radiant_temp` | `null` | radiant-warmer effective temp; `null` → use `env_temp` |
| `rel_humidity` | `0.5` | ambient relative humidity (fraction) — modulates evaporative loss |
| `setpoint_temp` | `37.0 °C` | hypothalamic set-point |
| `heat_capacity` | `3470 J/kg/K` | specific heat of body tissue |
| `surface_area_k` | `0.05` | Meeh constant in `SA = k·weight^(2/3)` |
| `h_radiative` / `h_convective` | `5.5` / `4.0 W/m²/K` | radiative / convective transfer coefficients |
| `evap_coeff` | `6.0 W/m²` per `(1−humidity)` | evaporative/respiratory loss coefficient |
| `caloric_equiv_o2` | `20.1 J/mL` | heat released per mL O2 consumed |
| `bat_gain` / `bat_max_per_kg` | `6.0 W/°C` / `4.5 W/kg` | brown-fat gain and ceiling |
| `q10` | `2.3` | Q10 of metabolic rate (per 10 °C) |
| `hr_temp_gain` | `0.1` | HR factor rise per °C above set-point (~10%/°C) |
| `vo2_temp_factor_min/max` | `0.5` / `2.5` | Q10 clamp |
| `hr_temp_factor_min/max` | `0.6` / `1.6` | HR-factor clamp |

Read-outs: `core_temp`, `skin_temp`, `heat_production`, `heat_loss`, `brown_fat_heat`,
`vo2_temp_factor`, `hr_temp_factor`.

## Risk note

The path **core → VO2 (Q10) → metabolic heat → core** is **positive feedback**: a warmer core raises
VO2 which raises heat production which warms the core further. It is bounded by the dominant heat-loss
limb (which grows ∝ `core − env_temp` and so always overtakes) plus the `vo2_temp_factor` clamp
`[0.5, 2.5]`. Keep the clamp in place when re-tuning `q10` or `caloric_equiv_o2`.

## See also
[`Metabolism`](./Metabolism.md) (VO2 source + the Q10 effector target) ·
[`Heart`](./Heart.md) (`hr_temp_factor` channel) ·
[`Blood`](./Blood.md) (`set_temperature` → acid-base / O2-dissociation) ·
[`Hormones`](./Hormones.md) (sibling controller / neutrality idiom).
