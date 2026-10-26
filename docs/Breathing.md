# Breathing

`Breathing` drives spontaneous breathing. It decides how much the patient should breathe (a target minute volume, set by the chemoreflex), splits that into a rate and a tidal volume, and turns it into a respiratory-muscle pressure that lowers the pleural (`THORAX`) pressure each breath. The effort follows the **neural drive**, not the measured tidal volume: the lungs, the airway and any device decide how much volume that effort moves. It is the spontaneous counterpart of the [Ventilator](./Ventilator.md), and the effort partner of [Respiration](./Respiration.md), which sets the mechanics the breath acts against.

## Physiology

The brainstem sets ventilation to keep arterial CO2 (and, weaker, O2) at its set-point: rising pCO2 increases minute ventilation through the chemoreflex. A newborn breathes fast and shallow, about 40/min at 5–6 mL/kg. At a higher drive both rate and depth rise; Mecklenburgh's relation describes the split, with tidal volume rising with rate.

Each breath the diaphragm and intercostal muscles contract during inspiration, lowering the pleural pressure so air flows in, and relax during expiration, which is passive. The same effort moves less air into stiff lungs (RDS) or through a narrow airway, and more on CPAP or pressure support. Patients partly defend their tidal volume against such loads through reflexes and muscle properties, but only partly. The rest is left to the chemoreflex, so a stiff lung shows as faster, shallower breathing and a higher pCO2.

## Inheritance

```
BaseModelClass
  └── Breathing
```

## Properties

### Config (set in the definition JSON)

| Property | Unit | Default | Description |
|---|---|---|---|
| `breathing_enabled` | boolean | `true` | Spontaneous breathing on/off (`switch_breathing`); off in a fetus. |
| `minute_volume_ref` | L/kg/min | 0.2 | Reference minute volume (term 0.207). |
| `minute_volume_ref_factor`, `minute_volume_ref_scaling_factor` | – | 1.0 | Persistent multipliers on the reference (no engine model writes them). |
| `vt_rr_ratio` | L·min/kg | 1.212e-4 | Mecklenburgh ratio: `Vt / RR` per kg (term 1.298e-4). |
| `vt_rr_ratio_factor`, `vt_rr_ratio_scaling_factor` | – | 1.0 | Multipliers on `vt_rr_ratio`. |
| `ie_ratio` | – | 0.3 | Inspiratory **fraction** of the breath (Ti/Ttot), not an I:E ratio. Term 0.40, preterm 0.38. |
| `rmp_gain` | mmHg/L | calibrated | Muscle pressure per litre of target tidal volume. |
| `rmp_calibrated` | boolean | `false` | `rmp_gain` holds a calibrated value (true in every scenario). |
| `rmp_gain_max` | mmHg | 100 | Cap on the peak muscle pressure. |
| `load_compensation` | 0–1 | 0.5 | Partial compensation of the effort for loads and support. |
| `mv_ans_factor` | – | 1.0 | Chemoreflex modulation of minute volume; written by the `EF_MV` efferent. |
| `ans_activity_factor` | – | 1.0 | Global multiplier on minute volume; no model writes it (a manual lever). |
| `thorax` | list | `["THORAX"]` | The container the muscle pressure acts on. |
| `hvd_enabled` | boolean | `true` | Hypoxic ventilatory depression (below). |
| `hvd_model` | – | `"AA"` | Arterial compartment whose pO2 is sensed. |
| `hvd_po2_threshold` | mmHg | 70 | The depression grows as pO2 falls below this (term rests at ~75). |
| `hvd_gain` | – | 2.0 | Drive reduction per fractional pO2 deficit below the threshold. |
| `hvd_max` | – | 0.8 | Largest fractional reduction of the drive. |
| `hvd_tc` | s | 120 | Time constant of the depression (onset and offset). |
| `hvd_factor` | – | 1.0 | Applied factor on the drive (state, saved; 1 = none). |

### Outputs

| Property | Unit | Description |
|---|---|---|
| `target_minute_volume` | L/min | Demanded minute volume. |
| `resp_rate` | /min | Computed rate (latched into each breath). |
| `resp_rate_measured` | /min | Rate from the observed breath timing. |
| `target_tidal_volume` | L | Demanded tidal volume. |
| `insp_tidal_volume`, `exp_tidal_volume` | L | Lung-volume rise over the last inspiration and fall from its peak; 0 while breathing is off. |
| `minute_volume` | L/min | `exp_tidal_volume · resp_rate`. |
| `resp_muscle_pressure` | mmHg | Current muscle pressure (positive = inspiratory effort). |
| `pmus_max` | mmHg | Peak muscle pressure of the current breath. |
| `load_factor` | – | Current effort trim from load compensation. |
| `insp_running`, `exp_running` | boolean | Spontaneous (neural) phase; both false while breathing is off. `_insp_running`/`_exp_running` remain as aliases. |
| `ncc_insp`, `ncc_exp` | steps | Phase step counters; `ncc_insp === 1` marks the first step of an inspiration. |

## Calculation

### Target minute volume and the rate / volume split

```
MV_ref               = minute_volume_ref · minute_volume_ref_factor · minute_volume_ref_scaling_factor · weight
target_minute_volume = (MV_ref + (mv_ans_factor − 1) · MV_ref) · ans_activity_factor · hvd_factor
resp_rate            = √( target_minute_volume / (vt_rr_ratio' · weight) )        Mecklenburgh: MV = ratio · RR²
target_tidal_volume  = target_minute_volume / resp_rate
```

`vt_rr_ratio'` includes its two factors. The inversion is guarded against a non-positive denominator or target.

### Hypoxic ventilatory depression

Under sustained hypoxaemia the newborn's ventilation rises within a minute (the peripheral chemoreflex, `EF_MV`) and then falls back over minutes, a central depression of the drive (De Boeck 1984; Rehan 1996). `hvd_factor` relaxes over `hvd_tc` towards

```
1 − min(hvd_gain · (hvd_po2_threshold − pO2) / hvd_po2_threshold, hvd_max)     while pO2 < hvd_po2_threshold, else 1
```

term_neonate_72h (re-validation): FiO₂ 0.15 → ventilation +16 % at 30 s, +18 % at 1 min, back to +4 % by 5 min (12 % below the peak; data ~14–16 %); the chemoreflex re-drives against the depression (factor 0.51 at 5 min), so the net fall is smaller than the factor. FiO₂ 0.07 (`probe_lactate`): pH 7.44 at 1 min (early hyperventilation), then 7.33 at 7 min as the depression lets the lactic acidosis show. Without it, the stronger peripheral chemoreflex of re-validation (l) kept that baby alkalotic (pH 7.41 at 7 min).

**term_neonate_72h calibration (2026-10):** `ie_ratio` 0.40 (Ti 0.65 s of 1.63 s); `vt_rr_ratio` set for RR 40 / Vt 5.3 mL/kg at 213 mL/kg/min; `minute_volume_ref` 0.207, with the chemoreceptor set-points re-anchored so the chemoreflex is neutral at PaCO2 39.7. With the linear muscle ramp, peak flows are 0.70 / 0.66 L/min/kg (reference 0.83 / 0.64). See `scripts/_fix_term_breathing_pattern.mjs` and [TermNeonateReference](./TermNeonateReference.md).

### Breath phases

While breathing is on, a breath starts when `_breath_timer` reaches `_breath_interval`. Its timing and target are **latched** for the whole breath, so a chemoreflex change during a breath acts on the next:

```
_breath_interval = 60 / resp_rate,   _ti = ie_ratio · _breath_interval,   _te = _breath_interval − _ti
```

Inspiration runs until `_breath_timer > _ti`, then expiration until the next start, where the finished breath is closed out (tidal volumes, calibration or load compensation).

**While breathing is off** there is no breath clock: no phases, tidal and minute volumes 0, rate 0, no muscle pressure. Switching it back on starts a breath at once.

**Tidal volumes are measured at the lungs** (`Respiration.lungs`), so they don't depend on the airway route (natural airway, ET tube, leak).

### Muscle pressure

```
pmus_max = min( rmp_gain · load_factor · latched target Vt , rmp_gain_max )
pmus(t)  = pmus_max · shape(t),        THORAX.pres_ext −= pmus(t)
```

`shape` ramps linearly from 0 to 1 over inspiration, then relaxes exponentially over expiration, `(e^(−4x) − e^(−4)) / (1 − e^(−4))`, with `x` the fraction of expiration elapsed. The pressure acts on the pleural space; THORAX resets `pres_ext` each step.

### Calibration

`rmp_gain` is the effort the patient's own respiratory system needs per litre of tidal volume. It is calibrated once and then frozen:
- **Starting estimate:** twice the elastance of the lungs and thorax in series, using their effective elastances `el_eff`, so factor layers count.
- **Per-breath correction** by `(target / exhaled Vt)^0.8`. The gain freezes after 3 consecutive breaths within 2 %, or after 40 breaths.
- **The shipped scenarios** carry a gain written by `scripts/_calibrate_breathing.mjs`, run on the natural airway with the ventilator off. Re-run it after changing a scenario's lung or thorax mechanics.
- **Older scenarios** stored `rmp_gain` as an elastance gain; without `rmp_calibrated` the value is discarded and recalibrated.

### Load compensation

A proportional trim of the effort, updated each breath and pulled back toward 1:

```
load_factor += 0.2 · [ (target / Vt − 1) · lc − (load_factor − 1) · (1 − lc) ]       lc = load_compensation (≤ 0.95)
steady state:  load_factor − 1 = lc / (1 − lc) · (target / Vt − 1),     clamped 0.25–4
```

`lc = 0` is a pure pressure generator; `lc → 1` defends the target tidal volume. The default 0.5 halves the tidal-volume deficit of a load.

## Factor system

None of the engine's factor layers. Its own multipliers (`*_factor`, `*_scaling_factor`, `mv_ans_factor`, `ans_activity_factor`) multiply the minute volume or the Vt/RR ratio and are never reset.

## Inputs and outputs

- **Reads:** the lungs' volumes; the lungs' and thorax's `el_eff` (initial estimate); `model.weight`.
- **Writes:** `THORAX.pres_ext`.
- **Written by:**
  - the `EF_MV` efferent of the chemoreflex (`mv_ans_factor`);
  - [Apnea](./Apnea.md) and Resuscitation (`breathing_enabled` through `switch_breathing`);
  - the Calibrator and scenario scripts (`minute_volume_ref`, `vt_rr_ratio`).
- **Read by:**
  - [Ventilator](./Ventilator.md): it arms its patient trigger on `ncc_insp === 1`, disarms on `!insp_running`, and classes spontaneous breaths by `insp_running`;
  - Monitor (counts a breath on `ncc_insp === 1` while breathing is on);
  - `DataCollector` watchers.

## Assumptions and limitations

- **The rate follows only the drive.** No vagal rate response to stiff lungs, no Hering–Breuer shortening of inspiration (parked).
- **Central vs obstructive apnoea.** A central apnoea switches breathing off; an obstructive one keeps the drive and closes `MOUTH_DS` (see [Apnea](./Apnea.md)).
- **One muscle-pressure shape** (linear ramp); infants reach peak flow earlier in inspiration, so peak inspiratory flow is ~15 % low at term.
- **`resp_rate_measured` has a start-up transient** over the first breaths; the settled value is correct.
- **Verification:** `npm run validate:resp` (see [TESTING](./TESTING.md)) checks the spontaneous steady state, the chemoreflex, resistive and elastic loads, CPAP and pressure support against clinical ranges. The known failures are the missing vagal and Hering–Breuer reflexes, plus listed ventilator and preterm calibration items.

## Example definition (JSON)

From `term_neonate_72h.json`, `models.Breathing` (trimmed to the config props):

```json
{
  "name": "Breathing",
  "model_type": "Breathing",
  "is_enabled": true,
  "breathing_enabled": true,
  "minute_volume_ref": 0.20729,
  "minute_volume_ref_factor": 1,
  "minute_volume_ref_scaling_factor": 1,
  "vt_rr_ratio": 0.00012979,
  "vt_rr_ratio_factor": 1,
  "vt_rr_ratio_scaling_factor": 1,
  "ie_ratio": 0.4,
  "rmp_gain": 334.48,
  "rmp_calibrated": true,
  "rmp_gain_max": 100,
  "load_compensation": 0.5,
  "mv_ans_factor": 0.9978,
  "ans_activity_factor": 1
}
```

## Usage in the scenarios

One instance in every scenario.

| Scenario | Breathing | `minute_volume_ref` | `vt_rr_ratio` | `ie_ratio` | `rmp_gain` |
|---|---|---|---|---|---|
| term_neonate_72h | on | 0.207 | 1.30e-4 | 0.40 | 334 |

## References

The term breathing pattern (rate, tidal volume, minute ventilation, Ti/Ttot, peak flows) is referenced in [TermNeonateReference](./TermNeonateReference.md) (Schmalisch 2005; Hannover 2018).

- De Boeck C, Van Reempts P, Rigatto H, Chernick V. Naloxone reduces decrease in ventilation induced by hypoxia in newborn infants. *J Appl Physiol* 1984;56:1507–11. doi:10.1152/jappl.1984.56.6.1507 (term newborns on 15 % O2: ventilation ~14 % below its early peak)
- Rehan V, Haider AZ, Alvaro RE, et al. The biphasic ventilatory response to hypoxia in preterm infants is not due to a decrease in metabolism. *Pediatr Pulmonol* 1996;22:287–94. doi:10.1002/(SICI)1099-0496(199611)22:5<287::AID-PPUL1>3.0.CO;2-I (−16 ± 2 % from the peak at 5 min; likely central)
