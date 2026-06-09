# Heart

The `Heart` model is the **cardiac driver**. It owns the rhythm and conduction, synthesizes the ECG,
generates the activation that contracts the chambers, applies neuro-hormonal control to contractility/
relaxation/heart rate, and measures per-beat haemodynamics. It does not hold blood itself — the
chambers (`HeartChamber`/`BloodTimeVaryingElastance`) do; the Heart drives their `act_factor`.

## Conduction and rhythm

A timed state machine models the cardiac conduction system, gated off the engine-level counters
`ncc_atrial` / `ncc_ventricular`:

```
SA node fires ─► PQ (atrial) ─► AV delay ─► QRS (ventricular) ─► QT ─► (refractory clears) ─► next beat
```

- **Heart rate** is the reference rate scaled by the autonomic and modulating factors
  (`ans_activity_hr · ans_sens`, `hr_factor`, `hr_mob_factor`, …); `hr_override` pins it to the
  reference.
- The **sinus interval** `60 / heart_rate` drives the SA node; `pq_time`, `av_delay`, `qrs_time` and
  the rate-corrected `qt_time` (Bazett) set the phase durations.

## Activation → chamber contraction (`calc_varying_elastance`)

Two activation functions are computed each step and pushed onto the chambers as `act_factor`:

- **Atrial** `aaf` — a half-sine over the PQ window (→ atria: LA, RA / RAIVCI, RASVC).
- **Ventricular** `vaf` — a skewed pulse over `qrs_time + qt_time` (→ ventricles: LV, RV, coronaries).

The Heart also propagates `ans_sens`, `ans_activity` (scaled by `ans_activity_factor` from the MOB
hypoxia feedback) to the chambers, so the autonomic and myocardial-oxygen-balance effects reach
`HeartChamber.calc_elastances`.

## Contractility / relaxation / pericardium control

Throttled setters apply **deltas** to persistent chamber factors:

- `set_contractillity(left, right)` → chamber `el_max_factor_ps` (inotropy).
- `set_relaxation(left, right)` → chamber `el_min_factor_ps` (lusitropy).
- `set_pericardium(el_factor, extra_volume)` → `PERICARDIUM.el_base_factor_ps` and `vol_extra`.

## Per-beat measurements (`analyze`)

At the systole↔diastole transitions it latches the end-systolic and end-diastolic volumes and
pressures for LV/RV/LA/RA, and derives stroke volume and ejection fraction:

```
SV = EDV − ESV          EF = SV / EDV   (guarded against EDV = 0)
```

## ECG (`calc_ecg`)

A lead-II-like signal synthesized from a sum of Gaussians (P, Q, R, S, T), each positioned within its
conduction phase so the morphology tracks the configured `pq`/`qrs`/`qt` timings; baseline is
isoelectric at 0 mV.

## Configuration (model-definition fields)

`heart_rate_ref`, `pq_time`, `qrs_time`, `qt_time`, `av_delay`; ECG amplitudes `p_amp`…`t_amp`;
`ans_sens`, `ans_activity`, `ans_activity_hr`; the `*_factor` modulators; `pc_el_factor`,
`pc_extra_volume`.

## Notes & caveats

- **End-diastolic pressures.** The diastole-branch in `analyze` now writes `*_edp` (it previously
  wrote `*_esp`, leaving `lv_edp`/`rv_edp`/… at 0 and corrupting the end-systolic values).
- **MOB coupling.** `ans_activity_factor` scales the sympathetic drive the Heart sends to the
  chambers; it is set by the `Mob` model's hypoxia feedback (1.0 = no effect).
- The systole detection reads `LA_LV.flow` / `LV_AA.flow` directly — these mitral/aortic-valve
  connectors are assumed present.
