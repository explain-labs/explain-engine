# Apnea

`Apnea` generates the recurring breathing pauses of apnoea of prematurity. It runs a breathing ↔ apnoea cycle with irregular but reproducible timing. During a pause it uses existing levers: it switches spontaneous breathing off (central), closes the upper airway (obstructive), or both (mixed). It computes no physiology itself: the desaturation and, through the chemoreflex, the bradycardia follow from the gas exchange and the ANS.

## Physiology

Preterm infants have an immature respiratory control: breathing stops for 10–20 s or longer, several times an hour, more often the more preterm the infant.
- **Central** apnoea (no respiratory effort) is the most common type.
- **Obstructive** apnoea is effort against a closed upper airway, no flow.
- **Mixed** apnoea starts obstructive and continues central.

During the pause alveolar O2 falls and the blood desaturates. The low pO2 triggers a reflex bradycardia within seconds. Longer pauses desaturate deeper and are more often followed by bradycardia. Heart rate usually recovers before saturation, because the vagal reflex is faster than reoxygenation.

## Inheritance

```
BaseModelClass
  └── Apnea
```

## Properties

### Config (set in the definition JSON)

| Property | Unit | Default | Description |
|---|---|---|---|
| `apnea_enabled` | boolean | `false` | Switch (`switch_apnea`). Off in every scenario. |
| `apnea_frequency` | /min | 0.5 | Mean number of episodes per minute. |
| `apnea_duration` | s | 12 | Mean episode duration. Scenarios 14–20. |
| `apnea_variability` | 0–1 | 0.3 | Uniform jitter of interval and duration (± fraction of the mean). |
| `apnea_type` | – | `"central"` | `"central"`, `"obstructive"` or `"mixed"`. |
| `mixed_obstructive_fraction` | 0–1 | 0.5 | In a mixed episode, the leading obstructive share of the pause. |
| `seed` | – | 42 | Seed of the deterministic random generator. |
| `breathing_model` | – | `"Breathing"` | Model whose breathing is switched off. |
| `airway_model` | – | `"MOUTH_DS"` | Upper-airway resistor that is closed. |

### Episode state (saved with the state)

| Property | Unit | Description |
|---|---|---|
| `baseline_breathing` | boolean or null | Breathing state at the first build. A non-breathing patient (fetus) is never started; null until captured. |
| `drive_off` | boolean | Apnea has switched breathing off. |
| `airway_obstructed` | boolean | Apnea has closed the airway. |
| `episode_timer` | s | Time in the current phase. |
| `episode_duration` | s | Drawn duration of the running episode. |
| `next_interval` | s | Drawn gap until the next onset. |

### Outputs

| Property | Unit | Description |
|---|---|---|
| `in_apnea` | boolean | An episode is running. |
| `active_type` | – | Type of the running episode (`""` when breathing). |
| `apnea_count` | – | Completed episodes. |
| `last_apnea_duration`, `longest_apnea_duration` | s | Duration of the last and the longest episode. |
| `time_since_last_apnea` | s | Time since the last episode ended. |

## Calculation

Each step:
- **Not active** (`apnea_enabled` false, or a non-breathing patient): ventilation is restored if Apnea had suppressed it; nothing else.
- **Breathing:** count toward `next_interval`, then start an episode. Its duration is drawn, and
  - **central:** `Breathing.switch_breathing(false)`;
  - **obstructive / mixed:** `MOUTH_DS.no_flow = true`, unless the patient is intubated (Ventilator on, tube not out). On a nasal CPAP interface (`Ventilator.interface` prongs or mask) only `airway_obstructed` is set: the Ventilator then closes both the nose path and the mouth leak itself.
- **In an episode:**
  - a mixed episode also switches breathing off after `mixed_obstructive_fraction` of its duration;
  - at the end, ventilation is restored, the counters are updated and the next interval is drawn.

**Timing.** The gap is drawn so the *episode rate* matches `apnea_frequency`: mean gap = 60/frequency − mean duration (at least 1 s). Gap and duration each get a uniform jitter of ± `apnea_variability`. A linear congruential generator seeded by `seed` keeps headless runs reproducible.

**After a pause.** In an obstructive pause Breathing keeps its effort against the closed airway. Its load compensation raises the effort over the missed breaths (up to about ×2 at the default `load_compensation`), so the first breath after release is a large one.

**Desaturation and bradycardia** are emergent:
- the lungs stop refreshing alveolar gas, so [GasExchanger](./GasExchanger.md) loads less O2 and the arterial saturation falls;
- where the scenario has one, a pO2 heart-rate chemoreceptor (`CR_PO2_HR`, reading `AA.po2`) drives `EF_HR_CHEMO` onto `Heart.hr_chemo_factor` (see [Ans](./Ans.md));
- its set-point is a few mmHg below the baseline pO2, so the reflex is neutral at rest.

## Factor system

None. It switches `Breathing.breathing_enabled` and the airway resistor's `no_flow`.

## Inputs and outputs

- **Reads:** `Breathing.breathing_enabled` (baseline, once).
- **Writes:** `Breathing.breathing_enabled` (via `switch_breathing`), `MOUTH_DS.no_flow`.
- **Written by:** the user and bot (`apnea_enabled`, the settings).
- **Read by:** `DataCollector` watchers.

## Assumptions and limitations

- **Episodes are scheduled, not caused.** They don't follow sleep state, hypoxia, temperature, feeds or caffeine, and they don't end early on hypoxaemia: a pause runs its drawn duration.
- **No obstructive apnoea through a tube.** With an endotracheal tube in place the upper airway is bypassed and the Ventilator keeps `MOUTH_DS` closed, so an obstructive episode (or the obstructive part of a mixed one) does nothing, and Apnea never reopens `MOUTH_DS` while the tube is in. (Until the re-validation it closed and then reopened it, which left the natural airway open beside the tube after every episode: 56 of 120 s in a test with 8-s episodes.) The episode clock keeps running, so `apnea_count` still counts those episodes.
- **Shared levers.** [Resuscitation](./Resuscitation.md) also switches breathing; Apnea only reopens what it closed itself (`drive_off`, `airway_obstructed`).
- **Saved states keep the episode.** A state saved mid-pause finishes that pause after reload and restores ventilation.

## Example definition (JSON)

No shipped scenario has an Apnea model; a `models.Apnea` entry (config props only) looks like:

```json
{
  "name": "Apnea",
  "model_type": "Apnea",
  "is_enabled": true,
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

## Usage in the scenarios

Not used by any shipped scenario: `term_neonate_72h` has no Apnea model.

## References

No literature values; frequencies and durations are set per scenario for teaching.
