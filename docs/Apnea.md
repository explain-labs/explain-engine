# Apnea

The Apnea model reproduces **apnea of prematurity (AOP)** — the intermittent breathing pauses of the
preterm neonate that cause **oxygen desaturation** and, seconds later, **bradycardia**. It is a small
**episodic controller**: it owns an eupnea ↔ apnea state machine and, during a pause, suppresses
ventilation by driving the existing [Breathing](./Breathing.md) and upper-airway levers. It computes no
physiology of its own — the desaturation and the bradycardia both **emerge** through the unchanged
gas-exchange and ANS machinery downstream.

## Inheritance

```
BaseModelClass
  └── Apnea   (episodic ventilation-suppression controller — owns no compartment)
```

Extends [`BaseModelClass`](./BaseModelClass.md) directly. Like [Mob](./Mob.md) (which drives the Heart)
it is a controller that writes to other models rather than a physical element.

## What it models

```
episode timer ──► onset ──► suppress ventilation ──►  falling alveolar/arterial pO2
                                │                              │
                    central: Breathing.switch_breathing(false) │ (GasExchanger stops loading O2)
                    obstructive: MOUTH_DS.no_flow = true        ▼
                    mixed: obstruct, then also cut drive    AA.to2 ↓ → AA.so2 ↓  (DESATURATION)
                                                                │
                                             CR_PO2_HR (pO2 chemoreceptor) fires low
                                                                ▼
                                        EF_HR_CHEMO → Heart.hr_chemo_factor < 1  (BRADYCARDIA)
```

The three mechanisms of a clinical apnea:

- **central** — respiratory drive ceases: `Breathing.switch_breathing(false)` zeroes the muscle effort.
- **obstructive** — the upper airway collapses: the `MOUTH_DS` resistor is set `no_flow = true`, so
  effort continues but no air moves. Breathing's tidal-volume feedback ramps `rmp_gain` against the
  obstruction, producing a realistic recovery breath on release.
- **mixed** — obstruction first, then central drive loss for the remainder of the pause.

Central is the dominant type in AOP and is the default. The desat→brady coupling (the
`CR_PO2_HR` afferent and `EF_HR_CHEMO` efferent) lives in the ANS wiring, not in this class — see
[Ans](./Ans.md) and [Usage](#usage-in-the-model).

## Properties

### Configuration (set in the model definition)

| Property | Default | Unit | Description |
|---|---|---|---|
| `apnea_enabled` | `false` | — | master switch; episodes only occur when `true` (`switch_apnea`) |
| `apnea_frequency` | `0.5` | episodes/min | mean episode onset rate |
| `apnea_duration` | `12.0` | s | mean pause duration |
| `apnea_variability` | `0.3` | — | coefficient of variation on interval and duration (0–1) |
| `apnea_type` | `"central"` | — | `"central"` \| `"obstructive"` \| `"mixed"` |
| `mixed_obstructive_fraction` | `0.5` | — | for mixed: leading obstructed fraction of the pause |
| `seed` | `42` | — | PRNG seed (deterministic episode timing) |
| `breathing_model` | `"Breathing"` | — | name of the spontaneous-breathing model to suppress |
| `airway_model` | `"MOUTH_DS"` | — | name of the upper-airway resistor to occlude |

### Computed / reported (outputs)

| Property | Unit | Description |
|---|---|---|
| `in_apnea` | — | whether an episode is currently running |
| `active_type` | — | type of the running episode (`""` when eupneic) |
| `apnea_count` | — | number of completed episodes |
| `last_apnea_duration` | s | duration of the most recent completed episode |
| `longest_apnea_duration` | s | longest episode so far |
| `time_since_last_apnea` | s | time since the last episode ended |

### Local (internal)

`_breathing` / `_airway` (resolved target refs), `_baseline_breathing` (spontaneous-breathing state at
init — respected, so a non-breathing scenario is never force-started), `_timer` (phase timer, reset each
transition), `_next_interval` / `_current_duration` (drawn timings), `_obstructed` / `_drive_off`
(which levers this model currently holds), `_rng_state` (LCG state).

## Calculation (`calc_model`)

Each step, if `apnea_enabled` is false or the patient is not a baseline spontaneous breather, the model
guarantees eupnea (restores both levers) and returns. Otherwise it advances the phase timer and runs the
state machine:

- **Eupnea:** when `_timer ≥ _next_interval` → **onset**. Draw a duration; apply the mechanism
  (`_set_central(true)`, `_set_obstruction(true)`, or obstruction-then-handover for mixed).
- **Apnea:** for a mixed episode, at `_current_duration · mixed_obstructive_fraction` add central drive
  loss. When `_timer ≥ _current_duration` → **terminate**: restore both levers, update the episode
  counters, and draw the next inter-onset interval.

### Deterministic timing

Episodes are stochastic but **reproducible**: a seeded linear-congruential generator (`_rand`, no
`Math.random`) keeps headless probe runs deterministic while the episodes stay irregular. `_jitter`
applies a symmetric multiplicative spread of `±apnea_variability` around a mean. The inter-onset gap is
derived from `apnea_frequency` **minus** the mean duration, so the *rate of episodes* matches
`apnea_frequency` rather than the rate of eupneic gaps.

## Factor system

This model has **no factor/`_eff` tunables of its own** — it is a controller, not a physical element.
It drives targets through their existing hooks: the boolean `Breathing.breathing_enabled` (via
`switch_breathing`) and `MOUTH_DS.no_flow`. The heart-rate side is the additive
`Heart.hr_chemo_factor` written by the `EF_HR_CHEMO` efferent (see [Heart](./Heart.md) §heart rate and
[Ans](./Ans.md)).

## Example definition (JSON)

Inserted by `scripts/_add_apnea.mjs` (GA-graded defaults); a preterm 28 wk block:

```json
{
  "name": "Apnea",
  "description": "apnea of prematurity — episodic ventilation suppression",
  "is_enabled": true,
  "model_type": "Apnea",
  "components": {},
  "apnea_enabled": false,
  "apnea_frequency": 0.7,
  "apnea_duration": 16,
  "apnea_variability": 0.3,
  "apnea_type": "central",
  "mixed_obstructive_fraction": 0.5,
  "seed": 42,
  "breathing_model": "Breathing",
  "airway_model": "MOUTH_DS"
}
```

## Usage in the model

- **Desaturation is emergent.** With drive off (or the airway occluded) the lungs stop refreshing
  alveolar gas; [GasExchanger](./GasExchanger.md) stops replenishing `AA.to2`; and
  [`calc_blood_composition`](./BloodComposition.md) recomputes a falling `so2`. [Monitor](./Monitor.md)
  surfaces it as `sao2_pre`.
- **Bradycardia is emergent, via the chemoreflex.** `scripts/_add_apnea.mjs` also closes the
  hypoxia→bradycardia loop the base ANS lacks: a dedicated pO₂ heart-rate chemoreceptor afferent
  `CR_PO2_HR` (reading `AA.po2`) drives a new efferent `EF_HR_CHEMO` onto `Heart.hr_chemo_factor`. The
  afferent's setpoint is placed a few mmHg **below** the scenario's calibrated baseline `AA.po2`, so the
  reflex is neutral at rest and engages only when an apnea pulls pO₂ below baseline; its dynamic range is
  centred on the pO₂ band an apnea actually reaches (~35–50 mmHg). The **desat→brady lag** (a few
  seconds) is not hard-coded — it emerges from O₂ washout plus the afferent/efferent time constants, and
  heart rate recovers before saturation because the vagal reflex (tc ≈ 1 s) is faster than re-oxygenation.
- **Ships dormant.** Patched scenarios keep `apnea_enabled = false` so their calibrated baseline vitals
  are unchanged; enable it per run (probe / UI) or patch with `<scenario>=on`. `Heart.hr_chemo_factor`
  defaults to `1.0`, so the chemoreflex efferent is neutral wherever it is not wired.
- **Verification:** `node scripts/probe_apnea.mjs preterm_28wk` reports per-episode duration, SpO₂ nadir,
  HR nadir, and the desat→brady lag; `--no-chemoreflex` disables `EF_HR_CHEMO` to show the episodes still
  desaturate identically but the heart rate no longer falls. See [TESTING](./TESTING.md).
- **Interaction:** [Resuscitation](./Resuscitation.md) also toggles `Breathing.breathing_enabled`; the
  two are mutually exclusive clinical states. Apnea records and restores the baseline breathing state, so
  a non-breathing scenario (e.g. a fetus) is never force-started.

## Notes & caveats

- **Duration-dependent bradycardia is intended.** Short pauses (~10 s) desaturate but rarely bradycard;
  longer pauses (>15–20 s) reach a lower pO₂ and drive a clear bradycardia — matching the clinical
  observation that bradycardia probability rises with apnea length.
- **Obstructive episodes ramp `rmp_gain`.** During an occlusion Breathing keeps trying and its
  tidal-volume feedback climbs toward `rmp_gain_max`; on release this yields an exaggerated recovery
  breath (physiologically apt).
