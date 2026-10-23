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
  (`ans_activity_hr · ans_sens`, `hr_factor`, `hr_mob_factor`, `hr_temp_factor`, `hr_drug_factor`,
  `hr_chemo_factor`, …), each an additive `(factor − 1)·heart_rate_ref` term; `hr_override` pins it to
  the reference. `hr_chemo_factor` (default `1.0` = no effect) is the **peripheral-chemoreflex hypoxic
  bradycardia** lever, written by an `EF_HR_CHEMO` [Ans](./Ans.md) efferent in scenarios that model
  apnea of prematurity (see [Apnea](./Apnea.md)); it is neutral everywhere it is not wired.
- The sum is floored at `0`: a sinus rate can't be negative, and at `0` the SA node is silent (sinus arrest), so the ventricular escape pacemaker takes over.
- The **sinus interval** `60 / heart_rate` drives the SA node; `pq_time`, `av_delay`, `qrs_time` and
  the rate-corrected `qt_time` (Bazett) set the phase durations.

## Conduction-driven arrhythmias

The atrial and ventricular activations are **decoupled** so the two chambers can beat independently —
real conduction disorders rather than a fixed SA→QRS sequence. This is gated behind **default-neutral**
properties (at the defaults the logic is identity, so every scenario's normal rhythm is unchanged), and
because the ECG and chamber activation already key off `ncc_atrial` (P) and `ncc_ventricular` (QRS)
*independently*, dissociated rhythms render correctly with no ECG changes.

Two intervention points:

- **AV-node conduction gate** at the av-delay → ventricle step. The atrial impulse activates the
  ventricles only if `!ventricle_is_refractory && _av_conducts()`. `av_block_mode` selects:
  `none` (1:1), `first_degree` (1:1 with a prolonged PR — `pq_time · first_degree_pq_factor`),
  `second_degree` (drop every `av_block_ratio`-th P → 2:1, 3:1, …), `complete` (no impulse conducts).
  A blocked impulse leaves a P wave with no following QRS.
- **Independent ventricular pacemaker** (`_vent_activation_timer`): fires a ventricular activation when
  the ventricle has been quiet for `60 / rate` and is not refractory. `vent_pacemaker_mode = "escape"`
  (slow, `vent_escape_rate` ≈ 50 bpm — only fires when conducted beats fail, i.e. complete block or
  sinus arrest) or `"vt"` (fast ventricular focus, `vt_rate` → ventricular tachycardia). All ventricular
  activations route through `_activate_ventricle()` (starts QRS, resets `ncc_ventricular` and the escape
  timer).

This yields the canonical conduction rhythms: **complete heart block** (atria at the sinus rate,
ventricles at the escape rate — AV dissociation), **2nd-degree / 2:1 block** (ventricular rate ≈ ½
atrial), **sinus arrest** (`sa_node_enabled = false` → SA silent → escape rhythm), **ventricular
tachycardia**, and a triggered **PVC** (`trigger_pvc()` → one premature beat after `pvc_coupling`).

> **Neutrality.** At the defaults (`av_block_mode = "none"`, `sa_node_enabled = true`, escape mode at
> 50 bpm) the changes are identity — `_av_conducts()` returns `true`, and the escape pacemaker never
> fires because every conducted beat (all scenario rates > 50 bpm) resets its timer first. The feature
> lives entirely on the existing `Heart`, so it is available in every scenario with no model-definition
> edits. PVCs are deterministic (`trigger_pvc()`), not random — the engine forbids `Math.random()`.

## Activation → chamber contraction (`calc_varying_elastance`)

Two activation functions are computed each step and pushed onto the chambers as `act_factor`:

- **Atrial** `aaf` — a half-sine over the PQ window (→ atria: LA, RA / RAIVCI, RASVC).
- **Ventricular** `vaf` — a skewed pulse over `qrs_time + qt_time` (→ LV, coronaries).
- **Right ventricular** `rvaf` — the same pulse lagging `vaf` by `rv_delay` seconds (→ RV). At the
  default `rv_delay` 0 it equals `vaf`, so both ventricles contract together.

The Heart also propagates `ans_sens`, `ans_activity` (scaled by `ans_activity_factor` from the MOB
hypoxia feedback) to the chambers, so the autonomic and myocardial-oxygen-balance effects reach
`HeartChamber.calc_elastances`.

## Contractility / relaxation / pericardium control

Throttled setters apply **deltas** to persistent chamber factors:

- `set_contractillity(left, right)` → chamber `el_max_factor_ps` (inotropy).
- `set_relaxation(left, right)` → chamber `el_min_factor_ps` (lusitropy).
- `set_pericardium(el_factor, extra_volume)` → `PERICARDIUM.el_base_factor_ps` and `vol_extra`.

They run when `cont_factor_left/right`, `relax_factor_left/right` or `pc_el_factor` change (checked
every 15 ms). Two things to know:

- **Shared layer.** The delta lands in the same `_ps` layer that users and scenarios edit, so the
  chamber's `el_max_factor_ps` is the sum of both.
- **The floor breaks reversibility.** Each result is floored at `0`. A delta that hits the floor is
  partly lost, so stepping a factor down past it and back up doesn't return to the start.

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

`heart_rate_ref`, `pq_time`, `qrs_time`, `qt_time`, `av_delay`, `rv_delay`; ECG amplitudes `p_amp`…`t_amp`;
`ans_sens`, `ans_activity`, `ans_activity_hr`; the `*_factor` modulators; `pc_el_factor`,
`pc_extra_volume`. Rhythm/conduction: `sa_node_enabled`, `av_block_mode`, `av_block_ratio`,
`first_degree_pq_factor`, `vent_pacemaker_mode`, `vent_escape_rate`, `vt_rate`, `pvc_coupling`
(+ the `trigger_pvc()` method).

**term_neonate (calibrated assumption, 2026-10):**
- `heart_rate_ref` 120.33, for a resting HR of 120: calm day-3 term infants measure 117–121 (Satoh
  2016, He 2011, Agata 1994)
- LV `el_max` ×1.15 and RV `el_max` ×1.3, so stroke volume and ejection fraction match neonatal CMR
  (Jhaveri 2023: SV 1.6 mL/kg, EF 63 / 52.5 %) at unchanged output. Lowering HR alone is largely
  compensated by Frank–Starling filling but leaves EF low.
- see `scripts/_fix_term_hr_contractility.mjs` and [TermNeonateReference](./TermNeonateReference.md)

## Notes & caveats

- **End-diastolic pressures.** The diastole-branch in `analyze` now writes `*_edp` (it previously
  wrote `*_esp`, leaving `lv_edp`/`rv_edp`/… at 0 and corrupting the end-systolic values).
- **MOB coupling.** `ans_activity_factor` scales the sympathetic drive the Heart sends to the
  chambers; it is set by the `Mob` model's hypoxia feedback (1.0 = no effect).
- **`rv_delay`** is meant for a few milliseconds of RV pre-ejection lag (e.g. a pressure-loaded RV in
  pulmonary hypertension): the LV ejects first, so aortic pressure leads PA pressure at the start of
  systole. The delayed pulse is cut off when the next beat starts, which only matters if `rv_delay`
  approaches the diastolic interval. Used by `bischoff_bidir_pda`.
- The systole detection reads `LA_LV.flow` / `LV_AA.flow` directly — these mitral/aortic-valve
  connectors are assumed present.
