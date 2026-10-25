# AnsAfferent

An `AnsAfferent` is an autonomic **receptor**. It reads one quantity (arterial pressure, a blood gas), turns it into a normalised firing rate between 0 and 1 (0.5 at the set-point), smooths it with a time constant, and sends it to the efferents it is wired to. It is one of the parts of the reflex network managed by [Ans](./Ans.md); [AnsEfferent](./AnsEfferent.md) turns the firing into an effect.

## Physiology

A baroreceptor fires faster as the arterial wall stretches; a chemoreceptor fires faster as pCO2 rises or pO2 falls. Around the normal value the response is roughly linear and saturates at the extremes: below some pressure the receptor is silent, above another it can't fire faster. The receptor also has a little inertia, so it follows changes with a lag of a second or more.

## Inheritance

```
BaseModelClass
  └── AnsAfferent
```

## Properties

### Config (set in the definition JSON)

| Property | Unit | Default | Description |
|---|---|---|---|
| `input_model`, `input_prop` | – | `""` | The quantity sensed, e.g. `AAR` / `pres`, `AA` / `pco2`. |
| `min_value` | input unit | 0 | Input at which the firing rate is 0. |
| `set_value` | input unit | 0 | Set-point: firing rate 0.5. Re-anchored per scenario to its calibrated rest. |
| `max_value` | input unit | 0 | Input at which the firing rate is 1. |
| `tc` | s | 1.0 | Time constant of the firing rate (0 = instantaneous). |
| `efferents` | list | `[]` | Efferents that receive the firing rate. |
| `effect_weight` | – | 1.0 | Weight (and sign) of this afferent in its efferents. Negative for a receptor whose effect opposes its firing, e.g. `CR_PO2` (−0.4): falling pO2 must raise ventilation. |
| `ans_active` | boolean | `true` | Copied from Ans. The afferent keeps firing; the efferents apply the gate. |

### Outputs

| Property | Unit | Description |
|---|---|---|
| `input_value` | input unit | Last value read. |
| `firing_rate` | 0–1 | Smoothed firing rate. |

## Calculation

Every 15 ms (skipped if `input_model` is missing or the input is not a finite number):

1. **Clamp** the input to `min_value … max_value` and take its deviation from the set-point.
2. **Piecewise-linear receptor curve**, with separate gains above and below the set-point:
   ```
   input ≥ set:  rate = 0.5 + 0.5 · (input − set) / (max − set)
   input < set:  rate = 0.5 − 0.5 · (set − input) / (set − min)
   ```
   (a zero-width side gives gain 0).
3. **Time constant:** `firing_rate += 0.015/tc · (rate − firing_rate)`.
4. **Report** to every efferent: `update_effector(firing_rate, effect_weight, name)`.

**Example**, `BR_MAP` in term_neonate (25 / 60.6 / 100 mmHg, tc 0.5 s): a MAP of 45 mmHg gives `0.5 − 0.5·15.6/35.6 = 0.28`, so the heart-rate and tone efferents see a firing deficit of 0.22.

## Factor system

None.

## Inputs and outputs

- **Reads:** `input_model.input_prop`.
- **Writes:** nothing directly; it calls `update_effector` on its efferents.
- **Written by:** Ans (`ans_active`); the scenario generators (set-points, ranges, wiring).
- **Read by:** its efferents; `DataCollector` watchers (`firing_rate`).

## Assumptions and limitations

- **Static, piecewise-linear curve.** No rate sensitivity (a real baroreceptor responds to the rate of pressure rise as well as its level) and no resetting of the set-point.
- **Saturation by clamping** the input, not a sigmoid: the firing rate stops exactly at 0 and 1.
- **The asymmetric gains are set by the window:** a set-point closer to `max_value` makes the receptor more sensitive above it than below.

## Example definition (JSON)

From `term_neonate.json`, `models.Ans.components.BR_MAP` (trimmed to the config props):

```json
{
  "name": "BR_MAP",
  "model_type": "AnsAfferent",
  "is_enabled": true,
  "input_model": "AAR",
  "input_prop": "pres",
  "min_value": 25,
  "set_value": 60.56,
  "max_value": 100,
  "tc": 0.5,
  "efferents": ["EF_HR", "EF_SVR", "EF_HEART"],
  "effect_weight": 1
}
```

## Usage in the scenarios

`BR_MAP`, `CR_PCO2`, `CR_PO2` and `CR_PH` in every scenario; `CR_PO2_HR` (hypoxic bradycardia) in none at present (the preterm scenarios that had it were removed on 2026-10-25 to be rebuilt). Their settings are tabled in [Ans → The reflex network](./Ans.md#the-reflex-network-in-the-scenarios).

## References

No literature values; set-points are each scenario's calibrated rest.
