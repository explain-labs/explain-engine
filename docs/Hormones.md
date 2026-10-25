# Hormones

`Hormones` is the slow neuro-hormonal controller of volume, pressure and osmolality: the renin–angiotensin–aldosterone system (RAAS) and antidiuretic hormone (ADH, vasopressin). It is the long-loop counterpart of the fast [Ans](./Ans.md) baroreflex. Each hormone is an activity level (1.0 = resting) that moves first-order toward a target set by its stimuli and acts through its own effector channels. It holds no blood and is neutral at rest: it only diverges when the patient is perturbed (haemorrhage, hyperosmolality) or a pathway is switched off.

## Physiology

- **Renin–angiotensin.** When renal perfusion pressure or circulating volume falls, the kidney releases renin, which generates angiotensin II within tens of seconds to minutes. Angiotensin II:
  - constricts the systemic arterioles (and the veins, mobilising volume);
  - constricts the efferent arteriole of the glomerulus, defending filtration pressure (GFR) when perfusion falls;
  - stimulates aldosterone.
- **Aldosterone** acts on the distal nephron over hours: it retains sodium and excretes potassium. Hyperkalaemia stimulates it directly.
- **ADH** rises with plasma osmolality (a 1–2 % rise is enough) and, less sensitively, with a large volume loss. It makes the collecting duct permeable to water (antidiuresis), and at high levels it constricts vessels.

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
| `raas_enabled`, `adh_enabled` | boolean | `true` | Per-pathway switches (off holds that pathway's hormones at 1). |
| `perfusion_model`, `perfusion_prop` | – | `"KID_ART"`, `"pres"` | Renal perfusion pressure (averaged over each update). |
| `volume_model`, `volume_prop` | – | `"Circulation"`, `"total_blood_volume"` | Circulating volume. |
| `plasma_model` | – | `"AA"` | Plasma Na and K source (`solutes`). |
| `circulation_name`, `kidneys_name`, `efferent_name` | – | `"Circulation"`, `"Kidneys"`, `"KID_CAP_KID_VEN"` | Effector targets. |

### Config: set-points

| Property | Unit | Default | Description |
|---|---|---|---|
| `perfusion_setpoint` | mmHg | 40 | Healthy renal perfusion pressure of this patient. |
| `volume_setpoint` | L | 0.4 | Healthy circulating volume of this patient. |
| `osmo_na_setpoint` | mmol/L | 138 | Plasma Na (the osmolality proxy, osmolality ≈ 2·Na). |
| `k_setpoint` | mmol/L | 3.5 | Plasma K. |

The set-points are the patient's **healthy reference**, not its current state (see [Assumptions](#assumptions-and-limitations)).

### Config: dynamics and effects

| Property | Default | Description |
|---|---|---|
| `renin_gain`, `renin_vol_gain` | 3.0, 3.0 | Angiotensin drive per fractional perfusion and volume deficit. |
| `angiotensin_tc` | 30 s | Angiotensin time constant. |
| `aldo_gain`, `aldo_k_in_gain` | 1.0, 2.0 | Aldosterone drive per (angiotensin − 1) and per fractional K excess. |
| `aldosterone_tc` | 1800 s | Aldosterone time constant (physiologic; compress for demos). |
| `adh_gain_osmo`, `adh_gain_baro` | 4.0, 1.0 | ADH drive per fractional Na excess and per fractional volume deficit. |
| `adh_tc` | 120 s | ADH time constant. |
| `hormone_min`, `hormone_max` | 0, 8 | Clamp on every hormone activity. |
| `ang_svr_gain`, `ang_svr_ven_gain` | 0.3, 0.2 | Arteriolar and venular constriction per (angiotensin − 1). |
| `adh_svr_gain` | 0.05 | Arteriolar constriction per (ADH − 1). |
| `ang_efferent_gain` | 0.5 | Renal efferent constriction per (angiotensin − 1). |
| `aldo_na_gain`, `aldo_k_gain` | 0.01, 0.1 | Na reabsorption rise and K reabsorption fall per (aldosterone − 1). |
| `adh_water_gain` | 0.015 | Water reabsorption rise per (ADH − 1). |
| `svr_factor_min`, `svr_factor_max`, `efferent_factor_min`, `efferent_factor_max` | 0.5 / 5 | Clamps on the vascular effects. |
| `na_factor_min`, `na_factor_max`, `k_factor_min`, `k_factor_max`, `water_factor_min`, `water_factor_max` | 0.95/1.02, 0.2/1.5, 0.5/1.03 | Clamps on the renal effects. |

### Outputs

| Property | Description |
|---|---|
| `renin` | Instantaneous angiotensin drive (the target, un-lagged). |
| `angiotensin`, `aldosterone`, `adh` | Hormone activities (1 = rest). |
| `svr_factor`, `svr_ven_factor`, `efferent_factor` | Applied vascular effects. |
| `na_reabs_factor`, `k_reabs_factor`, `water_reabs_factor` | Applied renal effects. |
| `sensed_perfusion`, `sensed_volume`, `sensed_na`, `sensed_osmolality`, `sensed_k` | What the sensors read. |

## Calculation

Every step the renal perfusion pressure is integrated, so the controller senses its mean, not one sample of a pulsatile pressure. **Every 1 s:**

1. **Fractional errors** against the set-points: perfusion and volume deficits, Na and K excesses.
2. **Hormones** (each a first-order lag with step fraction `min(1, Δt/tc)`, clamped 0–8):
   ```
   renin       = 1 + renin_gain·perf_deficit + renin_vol_gain·vol_deficit
   angiotensin → renin                                                      (tc 30 s)
   aldosterone → 1 + aldo_gain·(angiotensin − 1) + aldo_k_in_gain·k_excess   (tc 1800 s)
   adh         → 1 + adh_gain_osmo·na_excess + adh_gain_baro·vol_deficit      (tc 120 s)
   ```
3. **Effects**, clamped:
   ```
   Circulation.svr_factor_hormones_art = 1 + 0.3·(ang − 1) + 0.05·(adh − 1)
   Circulation.svr_factor_hormones_ven = 1 + 0.2·(ang − 1)
   KID_CAP_KID_VEN.r_factor_ps         = 1 + 0.5·(ang − 1)                    renal efferent arteriole
   Kidneys.reabsorption_factors.na     = 1 + 0.01·(aldo − 1)
   Kidneys.reabsorption_factors.k      = 1 − 0.1·(aldo − 1)
   Kidneys.reabs_factor_adh            = 1 + 0.015·(adh − 1)
   ```

## Factor system

Hormones writes **its own channels**, so it composes with the other writers instead of overwriting them:
- **Circulation:** `svr_factor_hormones_art` / `_ven`, which Circulation adds to the vessels' `r_factor_ps` as deltas, next to the user's `svr_factor_art` and Drugs' `svr_factor_drug`. See [Circulation](./Circulation.md).
- **The renal efferent resistor:** its `r_factor_ps`, owned by Hormones. The renal *afferent* is left to the Kidneys' autoregulation, which acts on `AD_KID_ART`.
- **Kidneys:** dedicated hormone factors (`reabsorption_factors`, `reabs_factor_adh`), separate from the user's reabsorption layer. See [Kidneys](./Kidneys.md).

## Inputs and outputs

- **Reads:** `KID_ART.pres`, `Circulation.total_blood_volume`, `AA.solutes.na` and `.k`.
- **Writes:** the channels above.
- **Written by:** the user (switches, gains); the scenario generators (set-points, via `scripts/_reference.mjs`).
- **Read by:** Circulation, Kidneys and the efferent resistor (the channels); `DataCollector` watchers.

## Assumptions and limitations

- **Set-points are the healthy reference of the patient's size and gestation.** A lesion keeps its size's reference, so a coarctation's low renal pressure activates RAAS (angiotensin ≈ 2.5), as it should. `scripts/_reference.mjs` (`scaleHormoneReferences`) derives them: volume scales with weight, perfusion with the gestation's defended MAP (`BR_MAP.set_value`). `_make_preterm.mjs`, `_make_bischoff.mjs`, `_make_fetus*.mjs` and `build_patient.mjs` apply it; below 34 weeks the [Kidneys](./Kidneys.md) renal reference replaces `perfusion_setpoint`.
- **Near-neutral at rest** in every scenario (300 s from build): angiotensin, aldosterone and ADH 0.99–1.03, except **fetus_term**. There the fetal renal pressure (39 mmHg) sits above its reference (35 mmHg), so angiotensin settles at 0.70 and the arteriolar factor at 0.91. This is known from its validation ([TermFetusReference](./TermFetusReference.md)); the stored file holds 0.77 / 0.93, so it drifts a little after loading.
- **Aldosterone's volume effect is small:** water transport isn't osmotically coupled to Na, so aldosterone shows as lower urinary Na rather than volume. ADH and angiotensin carry the volume and pressure defence. With the physiologic `aldosterone_tc`, aldosterone barely moves in a short session.
- **The owned channels are overwritten** while running: edit them through the hormones, or switch them off (`hormones_running`, `raas_enabled`, `adh_enabled`), which releases them to 1.
- **Not modelled:** natriuretic peptides, thirst and intake, catecholamines (the ANS and Drugs cover those).
- **Validation (at introduction, 2026-10):** `scripts/headless.mjs <scenario> --bleed FRAC | --naload Δ`:
  - a −8 % haemorrhage raises angiotensin and aldosterone and constricts the efferent, so GFR is defended and urine falls toward oliguria;
  - +12 mmol/L Na raises ADH 1.0 → 1.35 and halves urine output, while RAAS stays quiet.

## Example definition (JSON)

From `term_neonate.json`, `models.Hormones` (trimmed to gating and set-points; gains and time constants are the defaults):

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
  "adh_tc": 120
}
```

## Usage in the scenarios

One instance in every scenario, running. `perfusion_setpoint` ranges from 22.6 (25 wk) to 40.9 mmHg (term), `volume_setpoint` from 55 to 286 mL.

## References

No literature values; gains and time constants are model choices calibrated for teaching.
