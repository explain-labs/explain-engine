# AnsEfferent

An `AnsEfferent` is an autonomic **effector pathway**. It collects the firing rates its [AnsAfferent](./AnsAfferent.md) receptors send it, combines them into one firing rate, maps that to an effect factor (1 at rest), smooths it with a time constant, and writes it onto one property of a target model: heart rate, contractility, vascular tone or ventilation. It is part of the reflex network managed by [Ans](./Ans.md).

## Physiology

The brainstem integrates the receptors and sends the result out over sympathetic and vagal nerves. More sympathetic and less vagal activity raises heart rate, contractility and vascular tone; the reverse lowers them. Each organ responds at its own speed:
- the heart rate within one or two beats (vagal, fast);
- the vessels and contractility over 5–15 s (sympathetic, slower);
- ventilation over several breaths.

## Inheritance

```
BaseModelClass
  └── AnsEfferent
```

## Properties

### Config (set in the definition JSON)

| Property | Unit | Default | Description |
|---|---|---|---|
| `target_model`, `target_prop` | – | `""` | The property written, e.g. `Heart` / `ans_activity_hr`. |
| `effect_at_min_firing_rate` | – | 0 | Effect factor at firing rate 0. |
| `effect_at_max_firing_rate` | – | 0 | Effect factor at firing rate 1. |
| `tc` | s | 1.0 | Time constant of the effect (0 = instantaneous). |
| `ans_active` | boolean | `true` | Copied from Ans; when false the effect is 1. |

### Outputs

| Property | Unit | Description |
|---|---|---|
| `firing_rate` | 0–1 | Combined firing rate of the last update. |
| `effector` | – | Current effect factor (the value written to the target). |

## Calculation

**`update_effector(rate, weight, source)`**, called by each afferent on its own update, accumulates `(rate − 0.5) · weight` per source.

**Every 15 ms:**
1. **Combine.** `firing_rate = 0.5 + Σ over afferents of (their average weighted deviation in this window)`, clamped to 0–1. Afferents **add**: a second receptor adds its drive instead of diluting the first.
2. **Map to an effect**, piecewise linear with 1 at 0.5:
   ```
   firing ≥ 0.5:  effect = 1 + (effect_at_max − 1) · (firing − 0.5) / 0.5
   firing < 0.5:  effect = effect_at_min + (1 − effect_at_min) · firing / 0.5
   ```
   With the clamp, the effect always stays between `effect_at_min_firing_rate` and `effect_at_max_firing_rate`.
3. **Gate:** with `ans_active` false the effect is 1 at once (no time constant).
4. **Time constant:** `effector += 0.015/tc · (effect − effector)`.
5. **Write** `target_model.target_prop = effector` (skipped if the target is missing), and clear the accumulators.

**Example**, `EF_HR` in term_neonate (effect 1.5 at firing 0, 0.43 at firing 1, tc 0.5 s): the baroreceptor firing 0.28 at a MAP of 45 mmHg gives an effect of `1.5 + (1 − 1.5) · 0.28/0.5 = 1.22`, so within about a second Heart adds `0.22 · heart_rate_ref · ans_sens` to its rate.

## Factor system

None of its own. What the target does with the value is the target's business: Heart adds `(ans_activity_hr − 1) · heart_rate_ref · ans_sens` to its rate and scales contractility and relaxation with `ans_activity` (see [Heart](./Heart.md)), Circulation passes `ans_activity` to each vessel's `ans_sens`, and Breathing multiplies the minute volume by `mv_ans_factor`.

## Inputs and outputs

- **Reads:** the afferents' reports (through `update_effector`).
- **Writes:** `target_model.target_prop`.
- **Written by:** its afferents; Ans (`ans_active`); the scenario generators (ranges, time constants).
- **Read by:** its target; `DataCollector` watchers (`effector`, `firing_rate`).

## Assumptions and limitations

- **Additive integration, then a clamp.** Two afferents on one efferent add their deviations; the clamp caps the combined drive at the configured range. In the shipped wiring only `EF_MV` has two (pCO2 and pO2); the clamp keeps `mv_ans_factor` within 0.1–10 (it reached −0.035 and 11.35 at the extremes before v1.0).
- **One target per efferent;** a nerve with several effects is several efferents fed by the same afferent (as `BR_MAP` → `EF_HR`, `EF_SVR`, `EF_HEART`).
- **No separate sympathetic and vagal limbs** with their own dynamics; one time constant per efferent.

## Example definition (JSON)

From `term_neonate.json`, `models.Ans.components.EF_HR` (trimmed to the config props):

```json
{
  "name": "EF_HR",
  "model_type": "AnsEfferent",
  "is_enabled": true,
  "target_model": "Heart",
  "target_prop": "ans_activity_hr",
  "effect_at_max_firing_rate": 0.428,
  "effect_at_min_firing_rate": 1.5,
  "tc": 0.5
}
```

## Usage in the scenarios

`EF_HR`, `EF_SVR`, `EF_HEART` and `EF_MV` in every scenario; `EF_HR_CHEMO` (hypoxic bradycardia) in none at present (the preterm scenarios that had it were removed on 2026-10-25 to be rebuilt). Their targets, ranges and time constants are tabled in [Ans → The reflex network](./Ans.md#the-reflex-network-in-the-scenarios).

## References

No literature values; ranges and time constants are model choices.
