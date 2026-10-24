# Uterus

> **Experimental.** Used only by the archived `adult_female_uterus` scenario (the Pregnancy panel is hidden in the app as unfinished). It builds and runs on the current engine, but its pregnancy physiology isn't calibrated; see [Assumptions and limitations](#assumptions-and-limitations).

`Uterus` turns the adult uterine vascular bed (`UT_ART` → `UT_CAP` → `UT_VEN`) into an organ. It holds no blood. It controls those vessels and adds:
- a uterine oxygen consumption, with blood-flow and oxygen read-outs;
- **pregnancy:** with gestational age the bed dilates and fills, and its O2 demand rises;
- **labour:** periodic contractions that raise the intrauterine pressure and throttle uterine flow;
- an optional coupling that feeds uterine arterial blood into the fetal placenta's maternal pool.

It is the single source of the pregnancy state (`pregnant`, `preg_ga`, `iup`) that [MaternalPlacenta](./MaternalPlacenta.md) reads.

## Physiology

Outside pregnancy the uterus receives a small blood flow (~50 mL/min). In pregnancy the uterine arteries and the spiral arteries remodel into wide, low-resistance vessels, and uterine blood flow rises to roughly 500–750 mL/min at term, 10–15 % of the mother's cardiac output, most of it to the placenta. The uterus and the conceptus consume more oxygen as they grow.

In labour the myometrium contracts every few minutes. The pressure inside the uterus (resting tone ~8–12 mmHg, peaks 40–60 mmHg above it) compresses the vessels in its wall: inflow falls and venous blood is squeezed out. Contraction strength is summarised clinically in **Montevideo units** (peak amplitude × contractions per 10 min; adequate labour ≥ 200).

## Inheritance

```
BaseModelClass
  └── Uterus
```

## Properties

### Config: wiring (model names)

| Property | Default | Description |
|---|---|---|
| `ut_art_name`, `ut_cap_name`, `ut_ven_name` | `"UT_ART"`, `"UT_CAP"`, `"UT_VEN"` | The uterine arteriole, capillary and venule (BloodVessels). |
| `ut_in_res_name` | `"AD_UT_ART"` | Inflow resistor (the uterine blood-flow read-out). |
| `ut_out_res_name` | `"UT_VEN_VLB"` | Venous drainage resistor (owned by `VLB`; scaled in pregnancy). |
| `pl_mat_name` | `"PL_MAT"` | Fetal placenta's maternal pool, for the coupling. |

### Config: metabolism and tone

| Property | Unit | Default | Description |
|---|---|---|---|
| `uterus_running` | boolean | `true` | Master switch. Off restores the pregnancy layers and zeroes the outputs. |
| `met_active` | boolean | `true` | Switches the uterine O2 consumption. |
| `ut_vo2` | mL O2/kg/min | 0.04 | Uterine O2 consumption per kg maternal weight (2.4 mL/min at 60 kg). Not part of `Metabolism`'s map. |
| `vo2_factor`, `vo2_factor_ps` | – | 1.0 | Non-persistent (reset each step) and persistent VO2 multipliers. |
| `resp_q` | – | 0.8 | Respiratory quotient. |
| `perfusion_factor` | – | 1.0 | Vascular tone of `UT_ART`: < 1 dilates, > 1 constricts. |

### Config: pregnancy

| Property | Unit | Default | Description |
|---|---|---|---|
| `pregnant` | boolean | `false` | Pregnancy switch. |
| `preg_ga` | weeks | 0 | Gestational age of the pregnancy (not `model.gestational_age`, which is the mother's own). |
| `preg_ga_threshold`, `preg_ga_term` | weeks | 4, 40 | The adaptations ramp linearly between these ages. |
| `preg_res_term_factor` | – | 0.083 | Resistance multiplier of `UT_ART`, `UT_VEN` and the drainage at term. |
| `preg_cap_res_term_factor` | – | 0.083 | Resistance multiplier of `UT_CAP` (myometrium) at term; archived scenario 0.43, so the placenta takes the larger share. |
| `preg_vol_term_factor` | – | 3.0 | Unstressed-volume multiplier of the bed at term (engorgement). |
| `preg_vo2_term_factor` | – | 8.0 | VO2 multiplier at term (archived scenario 2). |
| `couple_placenta` | boolean | `false` | Drive `PL_MAT`'s O2/CO2 content from `UT_ART` while pregnant. Set `Placenta.skip_mat_gas_write` with it. |

### Config: contractions

| Property | Unit | Default | Description |
|---|---|---|---|
| `contractions_running` | boolean | `false` | Labour switch. |
| `contraction_period` | s | 180 | Time between contraction onsets. |
| `contraction_duration` | s | 60 | Duration of each contraction. |
| `resting_tone` | mmHg | 8 | Intrauterine pressure between contractions. |
| `contraction_amplitude` | mmHg | 50 | Peak pressure above resting tone. |
| `contraction_pres_gain` | – | 0.6 | Fraction of the pressure applied to the bed vessels as external pressure. |
| `contraction_r_peak` | – | 2.0 | Bed resistance multiplier at the contraction peak. |

### Outputs

| Property | Unit | Description |
|---|---|---|
| `ut_blood_flow` | mL/min | Total uterine inflow (placental + myometrial), smoothed over 5 s. |
| `ut_do2`, `ut_vo2_ml` | mL O2/min | O2 delivery and the uterine consumption (`MaternalPlacenta` reports the placental one). |
| `ut_o2er` | % | Whole-uterus extraction `(Ca − Cv)/Ca` from `UT_ART` and `UT_VEN`, so it includes the placenta. |
| `ut_avo2` | mmol/L | Arterio-venous O2 content difference. |
| `iup` | mmHg | Intrauterine pressure (0 when contractions are off). |
| `contraction_active` | boolean | Inside a contraction. |
| `montevideo_units` | MVU | `contraction_amplitude · 600 / contraction_period` (the setting, not a measurement). |

## Calculation

Each step (references resolved lazily; skipped without the three vessels; outputs zeroed when `UT_CAP` is empty):

1. **Pregnancy scaling.** `frac = (preg_ga − threshold)/(term − threshold)`, 0–1, 0 when not pregnant. Linear in `frac`:
   - `r_factor_scaling_ps` of `UT_ART`, `UT_VEN` and the drainage resistor → `preg_res_term_factor`; of `UT_CAP` → `preg_cap_res_term_factor`;
   - `u_vol_factor_scaling_ps` of the three vessels → `preg_vol_term_factor`.
   Written every step, so they return to 1 when the pregnancy is switched off.
2. **VO2 multiplier** follows the myometrial flow gain (`1/cap_res_factor`), reaching `preg_vo2_term_factor` exactly at term, so the extraction stays physiological while flow rises.
3. **Contractions.** A timer runs over `contraction_period`; inside the first `contraction_duration` the intensity is a half-sine 0 → 1 → 0.
   - `iup = resting_tone + contraction_amplitude · intensity`;
   - each bed vessel gets `pres_ext += iup · contraction_pres_gain` (compression; venous blood squeezed out);
   - the bed's resistance factor is `1 + intensity·(contraction_r_peak − 1)`.
4. **Non-persistent tone:** `UT_ART.r_factor = perfusion_factor · contraction factor`; `UT_CAP` and `UT_VEN.r_factor` = contraction factor.
5. **Uterine metabolism** on `UT_CAP`: `ut_vo2 · factors · pregnancy multiplier`, STPD conversion as in Metabolism; `resp_q` times it added as CO2.
6. **Read-outs:** smoothed inflow, DO2, AV difference and O2ER.
7. **Coupling** (pregnant and `couple_placenta`): `PL_MAT.to2/tco2` = `UT_ART.to2/tco2`.

## Factor system

- It writes the **scaling layers** (`r_factor_scaling_ps`, `u_vol_factor_scaling_ps`), which belong to `ModelScaler`. That is safe only while the uterine vessels aren't in a scaler group (they aren't in the archived scenario).
- It writes the **non-persistent** `r_factor` every step (tone and contractions).
- It leaves `r_factor_ps` (Circulation's SVR channels) and the ANS alone; BloodVessel multiplies all layers.

## Inputs and outputs

- **Reads:** the three vessels and the inflow resistor (flows, O2 contents, `UT_CAP` volume); `model.weight`.
- **Writes:** the vessels' scaling layers, `r_factor`, `pres_ext`; `UT_CAP.to2/tco2`; `UT_VEN_VLB.r_factor_scaling_ps`; `PL_MAT.to2/tco2` when coupled.
- **Read by:** `MaternalPlacenta` (`pregnant`, `preg_ga`, `iup`).
- **Written by:** the user.

## Assumptions and limitations

- **Pregnancy isn't calibrated.** Measured in the archived scenario:

  | Gestation | Uterine flow (mL/min) | Placental share | MAP (mmHg) |
  |---|---|---|---|
  | not pregnant | 46 | – | 98 |
  | 20 wk | 78 | 11 % | 89 |
  | 28 wk | 96 | 15 % | 81 |
  | 36 wk | 166 | 25 % | 114 |
  | 40 wk | 628 | 84 % | 75 |

  The term value is right, but the path isn't. Resistance falls linearly with gestation, so flow (∝ 1/R) stays low until the last weeks and then jumps; real uterine flow rises steadily from the first trimester. MAP is non-monotonic with gestation. The maternal blood volume expansion, cardiac output rise and fall in SVR of pregnancy aren't modelled.
- **Scaling-layer use** (see [Factor system](#factor-system)).
- **Contractions are a fixed waveform.** No uterine electrophysiology, no oxytocin; `montevideo_units` restates the settings.
- **The coupling is plumbing only.** No combined mother + fetus scenario uses it.
- **Consumption is silently capped** when it would make `UT_CAP`'s O2 content negative.

## Example definition (JSON)

From `archive/adult_female_uterus.json`, `models.Uterus` (trimmed to the physiology props; the wiring props are the defaults):

```json
{
  "name": "Uterus",
  "model_type": "Uterus",
  "is_enabled": true,
  "uterus_running": true,
  "ut_vo2": 0.04,
  "perfusion_factor": 1,
  "pregnant": false,
  "preg_ga": 0,
  "preg_res_term_factor": 0.083,
  "preg_cap_res_term_factor": 0.43,
  "preg_vol_term_factor": 3,
  "preg_vo2_term_factor": 2,
  "couple_placenta": false,
  "contractions_running": false,
  "contraction_period": 180,
  "contraction_duration": 60,
  "resting_tone": 8,
  "contraction_amplitude": 50,
  "contraction_pres_gain": 0.6,
  "contraction_r_peak": 2
}
```

## Usage in the scenarios

Only `archive/adult_female_uterus` (60 kg adult female, not pregnant at build). There the uterine bed (`AD_UT_ART` → `UT_ART` → `UT_CAP` → `UT_VEN` → `VLB`) runs in parallel with the placental bed `PL_IVS` of [MaternalPlacenta](./MaternalPlacenta.md). With contractions on at term, the smoothed uterine flow swings between ~410 and ~670 mL/min over a cycle. None of the canonical neonatal and fetal scenarios include it.

## References

None calibrated yet.
