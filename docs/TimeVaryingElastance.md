# TimeVaryingElastance

A `TimeVaryingElastance` is an elastic compartment whose stiffness changes during the heartbeat. It moves between a relaxed (diastolic) and a contracted (systolic) pressure–volume relation, driven by an activation signal from the `Heart`. It is the base of every heart chamber and of the coronary bed.

## Physiology

Heart muscle is soft when relaxed and stiff when contracted. If a chamber's volume is held fixed, its pressure therefore rises during systole and falls during diastole. The *time-varying elastance* concept (Suga and Sagawa) captures this with one number that changes over the cycle:

- **Diastole.** The chamber sits on its *end-diastolic pressure–volume relation*: low elastance (`el_min`), so it fills at low pressure. A stiff, poorly relaxing ventricle (diastolic dysfunction) has a high `el_min`.
- **Systole.** The elastance rises to `el_max`, the slope of the *end-systolic pressure–volume relation* and the classic load-independent index of contractility. A higher `el_max` means a stronger contraction.
- **In between,** the activation signal from the `Heart` (0 at rest, 1 at peak contraction) blends the two curves. That one signal produces ejection, isovolumic relaxation and filling, depending on the valves and the pressures around the chamber.

The same mechanism drives the coronary bed: the contracting myocardium squeezes the intramural vessels in systole.

## Inheritance

```
BaseModelClass
  └── TimeVaryingElastance
        ├── HeartChamber               (+ blood composition, ANS/drug/load contractility; own factor composition)
        └── BloodTimeVaryingElastance  (+ blood composition)
```

`HeartChamber` overrides `calc_elastances` and `calc_volumes` (extra layers; see [HeartChamber](./HeartChamber.md)) but uses `calc_pressure` from this class. `BloodTimeVaryingElastance` uses all of this class's calculation.

## Properties

### Config (set in the definition JSON)

| Property | Unit | Default | Description |
|---|---|---|---|
| `u_vol` | L | 0.0 | Unstressed volume (the end-systolic and end-diastolic relations share it). |
| `el_min` | mmHg/L | 0.0 | Minimal (diastolic) elastance. |
| `el_max` | mmHg/L | 0.0 | Maximal (end-systolic) elastance: contractility. |
| `el_k` | mmHg/L² | 0.0 | Non-linear term of the diastolic relation, above `u_vol` only. The heart chambers of 8 scenarios use a pure quadratic diastolic relation (`el_min` 0, `el_k` > 0); see [HeartChamber](./HeartChamber.md#the-diastolic-relation). |
| `vol` | L | 0.0 | Volume; the starting volume in a definition. |
| `u_vol_factor`, `el_min_factor`, `el_max_factor`, `el_k_factor` | – | 1.0 | Non-persistent factors, reset to 1 every step. |
| `u_vol_factor_ps`, `el_min_factor_ps`, `el_max_factor_ps`, `el_k_factor_ps` | – | 1.0 | Persistent factors. |
| `u_vol_factor_scaling_ps`, `el_min_factor_scaling_ps`, `el_max_factor_scaling_ps`, `el_k_factor_scaling_ps` | – | 1.0 | Persistent scaling factors. |

### Outputs

| Property | Unit | Default | Description |
|---|---|---|---|
| `pres_in` | mmHg | 0.0 | Recoil pressure of the wall. |
| `pres` | mmHg | 0.0 | `pres_in + pres_ext`: what the valves and connectors read. |
| `el_min_eff`, `el_max_eff`, `el_k_eff` | mmHg/L, mmHg/L² | 0.0 | Effective values after the factor layers. `el_max_eff` is kept ≥ `el_min_eff`. |
| `u_vol_eff` | L | 0.0 | Effective unstressed volume, floored at 0. |

### Set by other models

| Property | Unit | Default | Description |
|---|---|---|---|
| `act_factor` | – | 0.0 | Activation, 0 (relaxed) to 1 (fully contracted). Written every step by `Heart`: `aaf` for the atria, `vaf` for the LV and the coronaries, `rvaf` for the RV (equal to `vaf` unless `Heart.rv_delay` is set). A saved value is overwritten on the first step. |
| `pres_ext` | mmHg | 0.0 | External pressure for this step (the `PERICARDIUM` container), reset after use. |

## Calculation

`calc_model()` runs `calc_elastances()` → `calc_volumes()` → `calc_pressure()`.

1. **`calc_elastances`**: `el_min_eff`, `el_max_eff` and `el_k_eff` from the base value and the three layers, composed additively. `el_max_eff` is raised to `el_min_eff` if it falls below it. The non-persistent factors are then reset.
2. **`calc_volumes`**: `u_vol_eff` from the three layers, floored at 0. `u_vol_factor` is reset.
3. **`calc_pressure`**, with `S = vol − u_vol_eff`:

   ```
   p_es    = el_max_eff · S                                     end-systolic relation (linear)
   p_ed    = (S > 0 ? el_k_eff · S² : 0) + el_min_eff · S       end-diastolic relation
   pres_in = p_ed + (p_es − p_ed) · act_factor
   pres    = pres_in + pres_ext
   pres_ext = 0
   ```

   At `act_factor` 0 the chamber is on its diastolic curve, at 1 on its systolic curve, and in between the pressure is blended linearly.

**Volume transfer.** `volume_in(dvol, comp_from)` adds `dvol` (the blood subclasses also mix the composition). `volume_out(dvol)` removes it, stops at 0 and returns what could not be removed, as in [Capacitance](./Capacitance.md). There is no `fixed_composition` here.

## Factor system

`u_vol`, `el_min`, `el_max` and `el_k` each carry the three layers, composed **additively** in this class (see [ARCHITECTURE §7a](./ARCHITECTURE.md#7a-the-factor--effective-value-pattern)). `HeartChamber` replaces this with its own composition. Writers in the current code:

| Layer | Writers |
|---|---|
| `_factor` (reset every step) | `HeartChamber` internally (ANS, drugs, load) |
| `_factor_ps` | `Heart`: `set_contractility` → `el_max_factor_ps`, `set_relaxation` → `el_min_factor_ps` (left and right separately); the `Calibrator` (`el_max_factor_ps`); the user via `setPropValue` |
| `_factor_scaling_ps` | `ModelScaler` (`scale_heart_el_min`/`el_max`, whole heart or left/right) |

## Inputs and outputs

- **Reads:** nothing from other models; `act_factor` and `pres_ext` are written onto it.
- **Written by:** `Heart` (`act_factor`, contractility and relaxation factors); `PERICARDIUM` (`pres_ext`); the connected resistors and valves (volume); `ModelScaler`.
- **Read by:**
  - the valves and connectors (`pres`), and `Heart` (volumes and pressures for the per-beat analysis: EDV, ESV, SV, EF);
  - `Resistor`s with `implicit`, which read the instantaneous local elastance: the diastolic `el_min_eff + 2·el_k_eff·S` blended toward `el_max_eff` by `act_factor`;
  - `DataCollector` watchers (PV loops).

## Assumptions and limitations

- **One unstressed volume for both relations.** The end-systolic relation passes through `u_vol` (`V0` = `u_vol`); a separate `V0` for the ESPVR isn't modelled.
- **Linear systolic relation.** `el_max` is a constant slope; the curvature of the real ESPVR at high loads is ignored.
- **Quadratic, not exponential, diastolic relation.** The diastolic term is `el_min·S + el_k·S²`; real EDPVRs are steeper (power law with exponent ~2.8, Klotz 2006). A pure quadratic (used for the heart chambers) is the closest this form gets. Apart from it, the pericardium is the only diastolic non-linearity.
- **No force–velocity or length-dependent activation.** Contraction depends on volume and activation only. Shortening deactivation and the Frank–Starling length effect on activation aren't modelled; preload acts through the pressure–volume relation alone.
- **Below the unstressed volume** the systolic term goes strongly negative (`el_max · S`), which acts as early-diastolic suction.

## Example definition (JSON)

No scenario uses a plain `TimeVaryingElastance`. The coronary bed uses this class's calculation unchanged; from `term_neonate.json`, `models.Mob.components.COR` (a `BloodTimeVaryingElastance`, trimmed to the props this class defines):

```json
{
  "name": "COR",
  "model_type": "BloodTimeVaryingElastance",
  "is_enabled": true,
  "u_vol": 0.00028,
  "el_min": 30000,
  "el_max": 90000,
  "el_k": 0,
  "vol": 0.00067
}
```

## Usage in the scenarios

Six instances in every shipped scenario:

| Instance | Class | Activation | term_neonate `el_min` / `el_k` / `el_max` | `u_vol` (mL) |
|---|---|---|---|---|
| `LV` | HeartChamber | `vaf` | 0 / 1.56·10⁵ / 30478 | 0.73 |
| `RV` | HeartChamber | `rvaf` | 0 / 1.79·10⁵ / 28120 | 4.0 |
| `LA` | HeartChamber | `aaf` | 0 / 2.11·10⁵ / 2975 | 0 |
| `RAIVCI`, `RASVC` | HeartChamber | `aaf` | 0 / 9.20·10⁵ / 5947 each | 0 |
| `COR` | BloodTimeVaryingElastance | `vaf` | 30000 / 0 / 90000 | 0.28 |

(`el_min`, `el_max` in mmHg/L, `el_k` in mmHg/L².)

The heart chambers are owned by `Heart`, the coronary bed by `Mob`.

## References

- Suga H, Sagawa K, Shoukas AA. Load independence of the instantaneous pressure-volume ratio of the canine left ventricle and effects of epinephrine and heart rate on the ratio. *Circ Res* 1973;32(3):314–322. [doi:10.1161/01.res.32.3.314](https://doi.org/10.1161/01.res.32.3.314) (the time-varying elastance concept).

The elastance and unstressed-volume values are scenario calibrations (see the `*Reference.md` pages).
