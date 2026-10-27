# Heart

`Heart` is the cardiac driver. It holds no blood itself; the chambers ([`HeartChamber`](./HeartChamber.md)) and the coronary bed ([`BloodTimeVaryingElastance`](./BloodTimeVaryingElastance.md)) do. Heart does five things:
- runs the conduction system (rhythm, AV conduction, escape and ectopic beats);
- turns each beat into an activation signal that makes the chambers contract;
- passes autonomic, drug, temperature and myocardial-oxygen effects on to heart rate and the chambers;
- synthesises an ECG;
- measures each beat's volumes and pressures.

## Physiology

Each heartbeat starts in the **sinus node**. Its firing rate is the heart rate, set by a resting rate that the autonomic nervous system, drugs, temperature and hypoxia push up or down. The impulse spreads through the atria (P wave; the atria contract), pauses in the **AV node**, and then activates the ventricles (QRS; the ventricles contract). The ventricles stay refractory until repolarisation ends (T wave, end of QT).

Explain reproduces this sequence with timers and produces the conduction disorders a clinician meets:
- **First-degree AV block:** a long PR interval.
- **Second-degree (2:1, 3:1) block:** some P waves aren't followed by a QRS.
- **Complete heart block:** the atria and ventricles beat independently, the ventricles at a slow escape rate.
- **Sinus arrest** with a ventricular escape rhythm.
- **Ventricular tachycardia.**
- **Single premature ventricular contractions.**

The **activation signal** is what turns electricity into mechanics. During atrial and ventricular activation, Heart sends each chamber a value between 0 (relaxed) and 1 (fully contracted), which stiffens the chamber (see [TimeVaryingElastance](./TimeVaryingElastance.md)). The ventricles' pulse rises slowly and falls quickly, like the real ventricular pressure. The right ventricle can lag the left by a few milliseconds (`rv_delay` > 0), as in a pressure-loaded RV, or lead it (`rv_delay` < 0: the LV lags), so the pulmonary valve opens first, as in the transitional circulation.

Heart also measures each beat as an echo or catheter study would:
- end-diastolic and end-systolic volumes and pressures of all four chambers;
- stroke volume and ejection fraction of both ventricles.

It finds end-diastole and end-systole from the valves, the way they are defined clinically: the mitral valve closing starts systole, and the aortic valve closing ends it.

## Inheritance

```
BaseModelClass
  └── Heart
```

## Properties

### Config: rate and timing

| Property | Unit | Default | Description |
|---|---|---|---|
| `heart_rate_ref` | bpm | 110 | Resting (reference) sinus rate. term_neonate_72h 120.33. |
| `pq_time` | s | 0.1 | Atrial activation (P wave) and PQ interval. |
| `av_delay` | s | 0.0005 | AV-node pause after the PQ interval, before the QRS. |
| `qrs_time` | s | 0.075 | Ventricular depolarisation (QRS). |
| `qt_time` | s | 0.4 | QT at 60 bpm (a QTc), from QRS onset; rate-corrected each beat with Bazett, `cqt_time = qt_time·√(60/HR)`. Sets both the ECG QT and how long the ventricles contract. 0.4 in every scenario (neonatal QTc ~0.40 s). |
| `act_peak` | – | 0.85 | Fraction of the QT at which ventricular activation peaks (end-systole). |
| `relax_frac` | – | 0.06 | Relaxation after end-systole: the activation decays with τ = `relax_frac`·RR (30 ms at 120/min). 0 = a raised-cosine fall to zero at the end of the QT. |
| `rv_delay` | s | 0.0 | RV activation lag behind the LV; 0 = both together; negative = the LV (and the coronaries) lag the RV by \|`rv_delay`\|. term_neonate_72h uses 0. |

### Config: rhythm and conduction

| Property | Unit | Default | Description |
|---|---|---|---|
| `sa_node_enabled` | boolean | `true` | `false` = sinus arrest. |
| `av_block_mode` | – | `"none"` | `none`, `first_degree`, `second_degree` or `complete`. |
| `av_block_ratio` | – | 2 | Second degree: every `ratio`-th P wave is blocked (2 → 2:1). |
| `first_degree_pq_factor` | – | 2.5 | First degree: PQ interval multiplier. |
| `vent_pacemaker_mode` | – | `"escape"` | `escape` (slow back-up pacemaker) or `vt` (fast ventricular focus). |
| `vent_escape_enabled` | boolean | `true` | Enables the escape pacemaker. |
| `vent_escape_rate` | bpm | 50 | Escape rhythm rate. |
| `vt_rate` | bpm | 200 | Ventricular tachycardia rate. |
| `pvc_coupling` | s | 0.3 | Delay of a triggered PVC (`trigger_pvc()`). |

### Config: ECG

| Property | Unit | Default | Description |
|---|---|---|---|
| `p_amp`, `q_amp`, `r_amp`, `s_amp`, `t_amp` | mV | 0.15, −0.1, 1.0, −0.25, 0.25 | Wave amplitudes of the synthetic ECG. |

### Config: modulation

| Property | Unit | Default | Description |
|---|---|---|---|
| `ans_sens` | – | 1.0 | Sensitivity of rate and chambers to the ANS. |
| `hr_factor` | – | 1.0 | User heart-rate factor. |
| `hr_override` | boolean | `false` | Pins the rate to `heart_rate_ref`, ignoring all factors. |
| `cont_factor_left`, `cont_factor_right` | – | 1.0 | Contractility (left: LA, LV; right: RA halves, RV). A change is applied as a delta to the chambers' `el_max_factor_ps`. |
| `relax_factor_left`, `relax_factor_right` | – | 1.0 | Diastolic stiffness, applied the same way to `el_min_factor_ps`. |
| `pc_el_factor` | – | 1.0 | Pericardial stiffness (`PERICARDIUM` `el_base` and `el_k` `_factor_ps`). |
| `pc_extra_volume` | L | 0.0 | Pericardial fluid (`PERICARDIUM.vol_extra`): tamponade. |
| `cor_r_systolic_factor` | – | 0.0 | Systolic rise of the coronary inflow resistance: `AA_COR.r_factor = 1 + c·vaf` each step (intramural vessels compressed by the contracting myocardium). 5 in all shipped scenarios. |

### Set by other models

| Property | Unit | Default | Written by |
|---|---|---|---|
| `ans_activity_hr` | – | 1.0 | `EF_HR` efferent (baroreflex/chemoreflex chronotropy). |
| `ans_activity` | – | 1.0 | `EF_HEART` efferent: sympathetic drive to the chambers (inotropy, lusitropy). |
| `ans_activity_factor` | – | 1.0 | `Mob`: hypoxic scaling of that drive. |
| `hr_mob_factor` | – | 1.0 | `Mob`: myocardial-oxygen-balance effect on rate. |
| `hr_temp_factor` | – | 1.0 | `Thermoregulation`: temperature effect on rate. |
| `hr_drug_factor` | – | 1.0 | `Drugs`: chronotropy. |
| `hr_chemo_factor` | – | 1.0 | `EF_HR_CHEMO` efferent: hypoxic bradycardia (in no shipped scenario). |

### Outputs

| Property | Unit | Default | Description |
|---|---|---|---|
| `heart_rate` | bpm | 120 | Sinus rate this step (from the reference and the factors). |
| `heart_rate_measured` | bpm | 120 | Measured ventricular rate: 60 / time since the previous ventricular activation (falls when beats stop). |
| `ecg_signal` | mV | 0 | Synthetic lead-II-like ECG. |
| `aaf`, `vaf`, `rvaf` | – | 0 | Atrial, ventricular and right-ventricular activation (0–1). |
| `cqt_time` | s | 0 | Rate-corrected QT of the current beat. |
| `ncc_atrial`, `ncc_ventricular` | steps | 0 | Steps since the atrial / ventricular activation started (`-1` on the activating step). See [ARCHITECTURE §7b](./ARCHITECTURE.md#7b-ncc_-cycle-counters-live-on-the-components). |
| `cardiac_cycle_state` | – | 0 | 1 = systole (mitral closed → aortic closed), 0 = diastole. |
| `cardiac_cycle_running` | – | 0 | 1 from SA firing to the end of the QT. |
| `cardiac_cycle_time` | s | 0.353 | Duration of the last SA-to-end-of-QT activation. **Not the RR interval** (use `60 / heart_rate_measured`). |
| `lv_edv`, `lv_esv`, `lv_sv` | L | 0 | LV end-diastolic, end-systolic and stroke volume. |
| `lv_edp`, `lv_esp` | mmHg | 0 | LV end-diastolic and end-systolic pressure, **transmural** (`pres_in`: wall recoil, without the pericardial pressure). |
| `lv_ef` | fraction | 0 | `lv_sv / lv_edv`. |
| `rv_edv`, `rv_esv`, `rv_sv`, `rv_edp`, `rv_esp`, `rv_ef` | L, mmHg, fraction | 0 | The same for the RV. |
| `la_edv`, `la_esv`, `la_edp`, `la_esp` | L, mmHg | 0 | LA end-diastolic/end-systolic volume and pressure (latched at the ventricular transitions). |
| `ra_edv`, `ra_esv`, `ra_edp`, `ra_esp` | L, mmHg | 0 | The same for the RA; with a split right atrium the sum of the two halves' volumes and the mean of their pressures. |

### Internal state (public names, saved with the state)

| Property | Description |
|---|---|
| `prev_cardiac_cycle_running`, `prev_cardiac_cycle_state` | Last step's values, for edge detection (`Mob` reads `prev_cardiac_cycle_running`). |
| `prev_la_lv_flow`, `prev_lv_aa_flow` | Last step's mitral and LV-outflow flows, for systole detection. |
| `prev_cont_factor_left`, `prev_cont_factor_right`, `prev_relax_factor_left`, `prev_relax_factor_right`, `prev_pc_el_factor` | The factors last applied to the chambers; a change triggers the delta setters. |

## Calculation

`calc_model()` runs, in this order, each step:

1. **Contractility, relaxation and pericardium setters** (every 15 ms). When `cont_factor_*`, `relax_factor_*` or `pc_el_factor` changed, the *change* is added to the chambers' (or `PERICARDIUM`'s) persistent factor, floored at 0. `PERICARDIUM.vol_extra` is set from `pc_extra_volume`.
2. **Systole detection** from the previous step's valve flows:
   - mitral flow stopping (`LA_LV`) starts systole;
   - the active LV outflow valve stopping (`LV_AA`, or `LV_PA` in transposition) ends it.

   Without a working LV outflow (aortic atresia, HLHS), systole is the ventricular activation window instead.
3. **Heart rate**:
   ```
   HR = HR_ref · (1 + (ans_activity_hr − 1)·ans_sens + (hr_factor − 1) + (hr_mob_factor − 1)
                    + (hr_temp_factor − 1) + (hr_drug_factor − 1) + (hr_chemo_factor − 1))
   ```
   With `hr_override` it is `HR_ref`. It is floored at 0; at 0 the sinus node is silent.
4. **Conduction timers**:
   - **SA firing** (every `60/HR` s while `sa_node_enabled`) starts the PQ interval and the atrial activation (`ncc_atrial = −1`). The SA timer is not saved: after a load the node fires on the first step. (It used to wait a whole interval, which skipped one beat after every load: term MAP 61 → 53 mmHg for ~2 s, enough to set the brain autoregulation ringing.)
   - **After PQ**, the AV delay runs.
   - **After the AV delay**, the ventricles are activated if they aren't refractory and `av_block_mode` lets this beat through.
   - **After the QRS** comes the QT; the ventricles are refractory until it ends.
5. **Escape / ectopic pacemaker.**
   - If the ventricles have been quiet for `60 / vent_escape_rate` (or `60 / vt_rate` in `vt` mode) and aren't refractory, they fire on their own. At normal rates conducted beats always come first, so the escape pacemaker only appears when conduction fails.
   - A pending PVC fires `pvc_coupling` after `trigger_pvc()`.
6. **ECG** (`calc_ecg`): a sum of Gaussian waves (P in the PQ interval; Q, R, S in the QRS; T in the QT), positioned relative to each phase (T in the ST–T phase, which lasts `cqt_time − qrs_time` after the QRS), so the trace follows the timing settings. Isoelectric baseline 0 mV.
7. **Rate measurement** and the `ncc_*` counters advance.
8. **Activation** (`calc_varying_elastance`):
   ```
   aaf = sin(π·n_a/N_a)                       N_a = pq_time/dt, while 0 ≤ n_a < N_a
   x = n_v/N_v                                N_v = cqt_time/dt (the QT includes the QRS)
   vaf = ½(1 − cos(π·x/p))        for x < p   p = act_peak
       = exp(−(x−p)·cqt_time/τ)  for x ≥ p (cut below 0.005, restarted by the next QRS),  τ = relax_frac·60/HR
   rvaf = vaf shifted by rv_delay             (rv_delay < 0: vaf is the one shifted, by |rv_delay|)
   ```
   A raised cosine that rises to 1 at end-systole (`act_peak` of the QT), so the ventricles eject for most of the QT, then an exponential relaxation that still runs as the ventricle starts to fill (with `relax_frac` 0 a raised cosine back to zero at the end of the QT instead). Heart writes these values to the chambers' `act_factor`:
   - `aaf` → LA, RA (or RAIVCI/RASVC);
   - `vaf` → LV and COR;
   - `rvaf` → RV.

   It also passes `ans_sens` and `ans_activity · ans_activity_factor` to the chambers, and sets the coronary inflow resistor's non-persistent factor `AA_COR.r_factor = 1 + cor_r_systolic_factor · vaf`.
9. **Per-beat analysis** (`analyze`), at the systole/diastole transitions:
   - at end-systole, it latches the end-systolic volume and pressure;
   - at end-diastole, the end-diastolic values, then `SV = EDV − ESV` and `EF = SV / EDV` (0 if EDV = 0).

## Factor system

Heart has no factor layers of its own. It writes into the chambers':
- `cont_factor_*` → `el_max_factor_ps`;
- `relax_factor_*` → `el_min_factor_ps`;
- `pc_el_factor` → `PERICARDIUM` `el_base_factor_ps` and `el_k_factor_ps`.

Each is applied as a delta to the *shared* persistent layer, so the chamber's factor is the sum of Heart's and anyone else's change. The floor at 0 makes a delta that hits it irreversible: stepping a factor down past 0 and back up doesn't return to the start.

## Inputs and outputs

- **Reads:** the `LA_LV` flow and the active LV outflow valve's flow (systole timing); chamber volumes and `pres_in` (per-beat analysis); `PERICARDIUM`.
- **Writes:**
  - `act_factor`, `ans_sens`, `ans_activity` of LA, LV, RV, RA/RAIVCI/RASVC;
  - `act_factor` of COR, and `AA_COR.r_factor` (systolic coronary resistance);
  - the chambers' `el_max_factor_ps`/`el_min_factor_ps`;
  - `PERICARDIUM` factors and `vol_extra`.
- **Written by:** the ANS efferents (`EF_HR`, `EF_HEART`, `EF_HR_CHEMO`), `Mob`, `Thermoregulation`, `Drugs` (see above); the user (rate, rhythm, factors, `trigger_pvc`).
- **Read by:**
  - `Monitor` (heart rate, ECG);
  - `HeartFunction` (`lv_esp`/`lv_esv`/`lv_edp`/`lv_edv` and the RV values, for wall stress);
  - `Mob` (`cardiac_cycle_running`, `cardiac_cycle_time`; its chamber refs);
  - `Pda` (`ncc_ventricular`);
  - `DataCollector`, which always watches `ncc_atrial` and `ncc_ventricular`.

## Assumptions and limitations

- **QT sets both the ECG and the contraction.** With `qt_time` 0.40 the ECG QTc is 0.40 s and the LV ejects for 180 ms in term_neonate_72h at rest (121/min). Until the 2026-10 re-validation QT was 0.25 s and the contraction lasted QRS + QT with a late-peaking `x·sin(πx)` pulse: ejection lasted only 118–131 ms, so peak flows and valve gradients were too high, and lengthening QT alone ate into diastolic filling (term mitral inflow 213 → 104 ms per beat). Counting the QT from QRS onset and the raised-cosine pulse keep filling, EF and output (≤1.4 % change).
- **Relaxation scales with the beat.** τ = `relax_frac`·RR, so relaxation speeds up with heart rate (the frequency-dependent acceleration of relaxation). A fixed τ was rejected: term output peaked at 150/min and fell to below rest at 210/min, while with τ ∝ RR it rises to ~180/min and plateaus. Sympathetic and drug lusitropy act on the passive stiffness only, not on τ. With the AV-valve inertance ([Resistor](./Resistor.md#inertance-inertance)) relax_frac 0.06 gives term mitral E/A 0.61/0.59 m/s (E/A 1.04); before the relaxation tail and inertance E/A was 1.8–5.4 everywhere.
- **The same timings at every size.** `pq_time` 0.1, `qrs_time` 0.075, `qt_time` 0.4, `act_peak` 0.85, `relax_frac` 0.06 and `av_delay` 0.0005 are the shipped values; nothing scales them with gestation or weight.
- **The AV delay is nearly zero.** The PR interval is essentially `pq_time`, and atrial contraction (the `aaf` pulse) spans the whole PQ interval, ending just as the ventricles activate.
- **`cardiac_cycle_time` is the activation time, not the RR interval** (≈0.28 s against 0.50 s at term). `Mob` therefore uses its own measured beat interval for the stroke-work O2 cost (since v1.0).
- **End-diastolic and end-systolic pressures are transmural.** They exclude the pericardial (and thoracic) pressure, which is about −3 to −8 mmHg at term, so they read higher than a catheter's cavity pressure. Transmural is the right quantity for wall stress (`HeartFunction`).
- **Rate factors add.** Each factor adds `(factor − 1)·HR_ref`; they don't multiply.
- **Systole timing needs the left-heart valves.** `LA_LV` and an LV outflow valve are assumed present unless the LV has no outflow.
- **Deterministic rhythm.** No beat-to-beat variability; PVCs are triggered, not random (the engine forbids `Math.random()`).

## Calibration (term_neonate_72h)

- `heart_rate_ref` 120.33 gives a resting HR of 120; calm day-3 term infants measure 117–121 (Satoh 2016, He 2011, Agata 1994).
- LV `el_max` ×1.15 and RV `el_max` ×1.3 make stroke volume and ejection fraction match neonatal CMR (Jhaveri 2023: SV 1.6 mL/kg, EF 63 / 52.5 %) at unchanged output.

See `scripts/_fix_term_hr_contractility.mjs` and [TermNeonateReference](./TermNeonateReference.md).

## Example definition (JSON)

From `term_neonate_72h.json`, `models.Heart` (trimmed to the main config props; `components` holds the chambers, valves and `PERICARDIUM`):

```json
{
  "name": "Heart",
  "model_type": "Heart",
  "is_enabled": true,
  "heart_rate_ref": 120.3333,
  "pq_time": 0.1,
  "qrs_time": 0.075,
  "qt_time": 0.4,
  "av_delay": 0.0005,
  "ans_sens": 1,
  "av_block_mode": "none",
  "vent_pacemaker_mode": "escape",
  "cont_factor_left": 1,
  "cont_factor_right": 1,
  "relax_factor_left": 1,
  "relax_factor_right": 1,
  "pc_el_factor": 1,
  "pc_extra_volume": 0
}
```

## Usage in the scenarios

One `Heart` in every scenario, at the top of the model list (it sets the chambers' activation before they step). It owns 14 sub-models:
- the chambers `LA`, `LV`, `RV`, `RAIVCI`, `RASVC`;
- the valves `LA_LV`, `RAIVCI_RV`, `RASVC_RV`, `RV_PA`, `LV_AA`, and the disabled `RV_AA`, `LV_PA`;
- the intra-atrial connection `RAIVCI_RASVC`;
- `PERICARDIUM`.

The coronary bed `COR` belongs to `Mob`.

Scenario differences:

| | `heart_rate_ref` | Contractility / relaxation factors |
|---|---|---|
| term_neonate_72h | 120.33 | – |

## References

- Bazett HC. An analysis of the time-relations of electrocardiograms. *Heart* 1920;7:353–370. (QT rate correction.)
- Term calibration sources (Satoh 2016, He 2011, Agata 1994, Jhaveri 2023) are listed in [TermNeonateReference](./TermNeonateReference.md).
