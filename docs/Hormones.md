# Hormones

`Hormones` is the slow neuro-hormonal controller of volume, pressure and osmolality: the renin–angiotensin–aldosterone system (RAAS), antidiuretic hormone (ADH, vasopressin) and the circulating catecholamines of the adrenal medulla. It is the long-loop counterpart of the fast [Ans](./Ans.md) baroreflex. Each hormone is an activity level (1.0 = resting) that moves first-order toward a target set by its stimuli and acts through its own effector channels. It holds no blood and is neutral at rest: it only diverges when the patient is perturbed (haemorrhage, hyperosmolality) or a pathway is switched off.

## Physiology

- **Renin–angiotensin.** When renal perfusion pressure or circulating volume falls, the kidney releases renin, which generates angiotensin II within tens of seconds to minutes. Angiotensin II:
  - constricts the systemic arterioles (and the veins, mobilising volume);
  - constricts the efferent arteriole of the glomerulus, defending filtration pressure (GFR) when perfusion falls;
  - stimulates aldosterone.
- **Aldosterone** acts on the distal nephron over hours: it retains sodium and excretes potassium. Hyperkalaemia stimulates it directly.
- **ADH** rises with plasma osmolality (a 1–2 % rise is enough) and, less sensitively, with a large volume loss. It makes the collecting duct permeable to water (antidiuresis), and at high levels it constricts vessels.
- **The newborn RAAS cannot be switched off.** A volume load lowers renin to about a third of rest, not to zero (Smith 1989; Spitzer 1982).
- **Circulating catecholamines.** A sustained blood-volume loss releases adrenaline from the adrenal medulla. In the newborn it keeps the heart rate up for as long as the volume stays low: conscious newborn lambs keep HR +25 % for 60 min after a 20 % bleed, show only a transient rise at 15 % and none at 10 % (Smith & Abu-Amarah 1997). The fast baroreflex ([Ans](./Ans.md)) acts within seconds and fades as the pressure partly recovers; this arm is slow and sustained.

## Inheritance

```
BaseModelClass
  └── Hormones
```

## Properties

### Config: gating and wiring

| Property | Unit | Default | Description |
|---|---|---|---|
| `hormones_running` | boolean | `true` | Master switch. Off releases every owned channel to 1 once, then idles. |
| `raas_enabled`, `adh_enabled`, `catecholamines_enabled` | boolean | `true` | Per-pathway switches (off holds that pathway's hormones at 1). |
| `perfusion_model`, `perfusion_prop` | – | `"KID_ART"`, `"pres"` | Renal perfusion pressure (averaged over each update). |
| `volume_model`, `volume_prop` | – | `"Circulation"`, `"total_blood_volume"` | Circulating volume. |
| `plasma_model` | – | `"AA"` | Plasma Na and K source (`solutes`). |
| `pressure_model` | – | `"AAR"` | Arterial pressure (averaged over each update), for `cat_input` `"pressure"`. |
| `circulation_name`, `kidneys_name`, `efferent_name`, `heart_name` | – | `"Circulation"`, `"Kidneys"`, `"KID_CAP_KID_VEN"`, `"Heart"` | Effector targets. |

### Config: set-points

| Property | Unit | Default | Description |
|---|---|---|---|
| `perfusion_setpoint` | mmHg | 40 | Healthy renal perfusion pressure of this patient. |
| `volume_setpoint` | L | 0.4 | Healthy circulating volume of this patient. |
| `osmo_na_setpoint` | mmol/L | 138 | Plasma Na (the osmolality proxy, osmolality ≈ 2·Na). |
| `k_setpoint` | mmol/L | 3.5 | Plasma K. |
| `pressure_setpoint` | mmHg | 60 | Arterial pressure (only for `cat_input` `"pressure"`). |

The set-points are the patient's **healthy reference**, not its current state (see [Assumptions](#assumptions-and-limitations)).

### Config: dynamics and effects

| Property | Default | Description |
|---|---|---|
| `renin_gain`, `renin_vol_gain` | 3.0, 3.0 | Angiotensin drive per fractional perfusion and volume deficit. |
| `renin_min` | 0.35 | Floor on the renin target: how far a volume load can suppress the RAAS. |
| `angiotensin_tc` | 30 s | Angiotensin time constant. |
| `aldo_gain`, `aldo_k_in_gain` | 1.0, 2.0 | Aldosterone drive per (angiotensin − 1) and per fractional K excess. |
| `aldosterone_tc` | 1800 s | Aldosterone time constant (physiologic; compress for demos). |
| `adh_gain_osmo`, `adh_gain_baro` | 4.0, 1.0 | ADH drive per fractional Na excess and per fractional volume deficit. |
| `adh_tc` | 120 s | ADH time constant. |
| `cat_input` | `"volume"` | Catecholamine stimulus: `"volume"` (the blood-volume deficit) or `"pressure"` (the arterial pressure deficit). |
| `cat_gain`, `cat_threshold` | 0, 0 | Catecholamine drive per fractional deficit beyond the threshold. |
| `catecholamine_tc` | 60 s | Catecholamine time constant (adrenal release and plasma build-up). |
| `hormone_min`, `hormone_max` | 0, 8 | Clamp on every hormone activity. |
| `ang_svr_gain`, `ang_svr_ven_gain` | 0.3, 0.2 | Arteriolar and venular constriction per (angiotensin − 1). |
| `adh_svr_gain` | 0.05 | Arteriolar constriction per (ADH − 1). |
| `ang_efferent_gain` | 0.5 | Renal efferent constriction per (angiotensin − 1). |
| `aldo_na_gain`, `aldo_k_gain` | 0.01, 0.1 | Na reabsorption rise and K reabsorption fall per (aldosterone − 1). |
| `adh_water_gain` | 0.015 | Water reabsorption rise per (ADH − 1). |
| `cat_hr_gain` | 0 | Heart-rate factor rise per (catecholamine − 1). **0 = the arm is off**; a scenario switches it on. |
| `hr_factor_min`, `hr_factor_max` | 1.0, 1.6 | Clamp on the heart-rate effect. |
| `svr_factor_min`, `svr_factor_max`, `efferent_factor_min`, `efferent_factor_max` | 0.5 / 5 | Clamps on the vascular effects. |
| `na_factor_min`, `na_factor_max`, `k_factor_min`, `k_factor_max`, `water_factor_min`, `water_factor_max` | 0.95/1.02, 0.2/1.5, 0.5/1.03 | Clamps on the renal effects. |

### Outputs

| Property | Description |
|---|---|
| `renin` | Instantaneous angiotensin drive (the target, un-lagged). |
| `angiotensin`, `aldosterone`, `adh`, `catecholamine` | Hormone activities (1 = rest). |
| `svr_factor`, `svr_ven_factor`, `efferent_factor` | Applied vascular effects. |
| `na_reabs_factor`, `k_reabs_factor`, `water_reabs_factor` | Applied renal effects. |
| `hr_cat_factor` | Applied heart-rate effect. |
| `sensed_perfusion`, `sensed_volume`, `sensed_pressure`, `sensed_na`, `sensed_osmolality`, `sensed_k` | What the sensors read. |

## Calculation

Every step the renal perfusion pressure and the arterial pressure are integrated, so the controller senses their means, not one sample of a pulsatile pressure. **Every 1 s:**

1. **Fractional errors** against the set-points: perfusion, volume and pressure deficits, Na and K excesses.
2. **Hormones** (each a first-order lag with step fraction `min(1, Δt/tc)`, clamped 0–8):
   ```
   renin         = max(renin_min, 1 + renin_gain·perf_deficit + renin_vol_gain·vol_deficit)
   angiotensin   → renin                                                      (tc 30 s)
   aldosterone   → 1 + aldo_gain·(angiotensin − 1) + aldo_k_in_gain·k_excess   (tc 1800 s)
   adh           → 1 + adh_gain_osmo·na_excess + adh_gain_baro·vol_deficit      (tc 120 s)
   catecholamine → 1 + cat_gain·max(0, deficit − cat_threshold)                (tc 60 s)
                   deficit = vol_deficit (cat_input "volume") or pressure deficit ("pressure")
   ```
3. **Effects**, clamped:
   ```
   Circulation.svr_factor_hormones_art = 1 + 0.3·(ang − 1) + 0.05·(adh − 1)
   Circulation.svr_factor_hormones_ven = 1 + 0.2·(ang − 1)
   KID_CAP_KID_VEN.r_factor_ps         = 1 + 0.5·(ang − 1)                    renal efferent arteriole
   Kidneys.reabsorption_factors.na     = 1 + 0.01·(aldo − 1)
   Kidneys.reabsorption_factors.k      = 1 − 0.1·(aldo − 1)
   Kidneys.reabs_factor_adh            = 1 + 0.015·(adh − 1)
   Heart.hr_cat_factor                 = 1 + cat_hr_gain·(catecholamine − 1)  clamped 1.0–1.6
   ```

## Factor system

Hormones writes **its own channels**, so it composes with the other writers instead of overwriting them:
- **Circulation:** `svr_factor_hormones_art` / `_ven`, which Circulation adds to the vessels' `r_factor_ps` as deltas, next to the user's `svr_factor_art` and Drugs' `svr_factor_drug`. See [Circulation](./Circulation.md).
- **The renal efferent resistor:** its `r_factor_ps`, owned by Hormones. The renal *afferent* is left to the Kidneys' autoregulation, which acts on `AD_KID_ART`.
- **Kidneys:** dedicated hormone factors (`reabsorption_factors`, `reabs_factor_adh`), separate from the user's reabsorption layer. See [Kidneys](./Kidneys.md).
- **Heart:** `hr_cat_factor`, added to the heart rate next to the baroreflex, Mob, temperature and drug terms. See [Heart](./Heart.md).

## Inputs and outputs

- **Reads:** `KID_ART.pres`, `AAR.pres`, `Circulation.total_blood_volume`, `AA.solutes.na` and `.k`.
- **Writes:** the channels above.
- **Written by:** the user (switches, gains); the scenario generators (set-points, via `scripts/_reference.mjs`).
- **Read by:** Circulation, Kidneys, Heart and the efferent resistor (the channels); `DataCollector` watchers.

## Assumptions and limitations

- **Set-points are the healthy reference of the patient's size and gestation.** A lesion keeps its size's reference, so a coarctation's low renal pressure activates RAAS (angiotensin ≈ 2.5), as it should. `scripts/_reference.mjs` (`scaleHormoneReferences`) derives them: volume scales with weight, perfusion with the gestation's defended MAP (`BR_MAP.set_value`). `build_patient.mjs` applies it; below 34 weeks the [Kidneys](./Kidneys.md) renal reference replaces `perfusion_setpoint`.
- **Near-neutral at rest** in term_neonate_72h (300 s from build): angiotensin, aldosterone and ADH 0.99–1.03.
- **Aldosterone's volume effect is small:** water transport isn't osmotically coupled to Na, so aldosterone shows as lower urinary Na rather than volume. ADH and angiotensin carry the volume and pressure defence. With the physiologic `aldosterone_tc`, aldosterone barely moves in a short session.
- **The owned channels are overwritten** while running: edit them through the hormones, or switch them off (`hormones_running`, `raas_enabled`, `adh_enabled`), which releases them to 1.
- **The renin floor** (`renin_min` 0.35): an iso-oncotic load of 42 mL/kg over 60 min drove renin to 0.08 without it; with it, renin and angiotensin settle at 0.35 and aldosterone follows over its 30-min lag (Smith 1989: 38 % renin, 37 % aldosterone at 150 min). At 30 min the load leaves renin at 0.44, so the floor acts only at the extreme. ADH has no floor (no usable number; it holds ~0.74 under load).
- **The catecholamine arm is fitted to the heart-rate outcome, not to plasma levels.** No newborn haemorrhage catecholamine concentrations were found, so `catecholamine` is an activity, and only its effect on heart rate is calibrated. It acts on the heart rate only (no inotropy, no vasoconstriction; the ANS and [Drugs](./Drugs.md) carry those).
- **The fit is narrow.** In term_neonate_72h (`cat_gain` 20, `cat_threshold` 0.07, `cat_hr_gain` 0.175), `cat_hr_gain` 0.165 is already too weak for the 20 % target and 0.185 too strong. A later recalibration of the circulation can push it out of range: re-run `scripts/probe_haemorrhage.mjs` after one.
- **Blood pressure after a 20 % bleed stays too high** (−12 % at 5 min, then about −7 to −8 % from 15 min, vs the lambs' −20 % sustained). The arm can't fix that, so it is an open item of the bleed side (refill, vessel tone).
- **Not modelled:** natriuretic peptides, thirst and intake.
- **Validation (at introduction, 2026-10):** `scripts/headless.mjs <scenario> --bleed FRAC | --naload Δ`:
  - a −8 % haemorrhage raises angiotensin and aldosterone and constricts the efferent, so GFR is defended and urine falls toward oliguria;
  - +12 mmol/L Na raises ADH 1.0 → 1.35 and halves urine output, while RAAS stays quiet.
- **Validation of the catecholamine arm (2026-10):** `scripts/probe_haemorrhage.mjs` (5-min arterial bleed, `Fluids.remove_volume`), term_neonate_72h:

  | Target | Window | Result |
  |---|---|---|
  | 10 %: no sustained HR rise (Smith 1997) | ±5 % at 15/30/60 min | pass |
  | 20 %: HR +25 % sustained (Smith 1997) | +18 to +32 % at 15/30/60 min | pass |
  | 35 %: MAP ~60 % of baseline (Bauer 1997) | −30 to −50 % at 5 min | pass |
  | 20 %: MAP −20 % sustained (Smith 1997) | −15 to −25 % at 15/30/60 min | **fail** (too high) |

  With the arm off, the 10 % and 35 % targets pass and both 20 % targets fail.

## Example definition (JSON)

From `term_neonate_72h.json`, `models.Hormones` (trimmed to gating and set-points; gains and time constants are the defaults):

```json
{
  "name": "Hormones",
  "model_type": "Hormones",
  "is_enabled": true,
  "hormones_running": true,
  "raas_enabled": true,
  "adh_enabled": true,
  "perfusion_setpoint": 40.85,
  "volume_setpoint": 0.286,
  "osmo_na_setpoint": 138.19,
  "k_setpoint": 3.452,
  "angiotensin_tc": 30,
  "aldosterone_tc": 1800,
  "adh_tc": 120,
  "cat_input": "volume",
  "cat_gain": 20,
  "cat_threshold": 0.07,
  "cat_hr_gain": 0.175
}
```

## Usage in the scenarios

One instance in every scenario, running. term_neonate_72h: `perfusion_setpoint` 40.9 mmHg, `volume_setpoint` 0.301 L, catecholamine arm on (values above). The ToF scenarios leave the arm off.

## References

The RAAS and ADH gains and time constants are model choices calibrated for teaching. The renin floor and the catecholamine arm rest on:

- Smith 1989, conscious newborn lambs, saline at 5 % of body weight (doi:10.1152/ajpregu.1989.257.6.R1519): renin 38 %, aldosterone 37 % of baseline.
- Smith 1990, fetal sheep, 18 mL/kg dextran (doi:10.1152/ajpregu.1990.259.5.R1050): renin 59 %.
- Spitzer 1982 (doi:10.1038/ki.1982.60): the neonatal RAAS cannot be fully suppressed.
- Smith & Abu-Amarah 1997, conscious newborn lambs (doi:10.1152/ajpheart.1997.273.1.H339): 20 % bleed, MAP −20 % and HR +25 % sustained for 60 min; 10–15 % transient only.
- Smith 2000 (doi:10.1111/j.1469-445x.2000.02009.x): the HR rise is age-dependent (lambs yes, 11-week sheep no).
- Rose 1987 (doi:10.1152/ajpregu.1987.252.2.R306): catecholamines and AVP rise and output falls after haemorrhage in lambs.
- Padbury 1987 (doi:10.1172/JCI113166): adrenal adrenaline drives the newborn heart rate.
- Bauer 1997 (doi:10.1016/S0940-2993(97)80139-X): MAP at 60 % of baseline after ~35 % blood loss.
