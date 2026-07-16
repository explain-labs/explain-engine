# Autonomic Nervous System (Ans, AnsAfferent, AnsEfferent)

The autonomic nervous system (ANS) subsystem is a closed-loop reflex controller. It senses
physiological quantities (pressures, blood gases), converts them to normalized **receptor firing
rates**, and feeds those back as **effect factors** onto target models (heart rate, contractility,
vascular tone, minute volume, …). It is the model's baroreflex and chemoreflex.

Three classes work together:

| Class | Role | Analogy |
|---|---|---|
| `Ans` | Manager — enables/disables the loop and refreshes the blood gases its receptors read | central control |
| `AnsAfferent` | Receptor — maps one input quantity to a firing rate (0–1) | baro-/chemoreceptor |
| `AnsEfferent` | Effector — averages incoming firing rates and writes an effect factor to a target | efferent nerve |

## Data flow

```
            input_prop (e.g. AAR.pres, AA.po2)
                   │
                   ▼
            ┌───────────────┐   firing_rate (0–1)      ┌───────────────┐   effector (factor)
   sensor → │  AnsAfferent  │ ───────────────────────► │  AnsEfferent  │ ──────────────────────► target_model.target_prop
            │  (receptor)   │   update_effector(fr, w)  │  (effector)   │   (e.g. Heart.ans_activity_hr)
            └───────────────┘                           └───────────────┘
                   ▲                                                                    │
                   └──────────────────── physiological response ────────────────────────┘
```

An afferent can drive **several** efferents (its `efferents` list); an efferent can be driven by
**several** afferents (they accumulate via `update_effector`). All three run on their own throttled
interval, decoupled from the model step size.

## `Ans` — the manager

`calc_model()` runs every `_update_interval` (0.05 s) and does two things:

1. Propagates its `ans_active` flag to every sub-model listed in `components` (the afferents and
   efferents), so the whole loop can be switched on/off at once.
2. Recomputes the blood composition (`calc_blood_composition`) for every compartment named in
   `blood_composition_models`, so chemoreceptor afferents reading `po2`/`pco2`/`ph` see fresh values.

`Ans` holds no control logic itself — it is wiring and gating.

## `AnsAfferent` — receptor curve

Each afferent maps its input to a normalized firing rate in **[0, 1]**, with **0.5 as the setpoint**
(no effect). Updated every `_update_interval` (0.015 s):

1. **Read input:** `input_value = models[input_model][input_prop]`.
2. **Activation** (deviation from setpoint, clamped to the configured window):
   - `input_value > max_value` → `activation = max_value − set_value`
   - `input_value < min_value` → `activation = min_value − set_value`
   - otherwise → `activation = input_value − set_value`
3. **Gain** — the slope that maps activation onto the firing-rate range, separately above and below
   the setpoint so an asymmetric input window still spans 0→1:
   - activation > 0: `gain = (1.0 − 0.5) / (max_value − set_value)`
   - activation ≤ 0: `gain = (0.5 − 0.0) / (set_value − min_value)`
   - (each guarded against a zero-width range → gain 0)
4. **Target firing rate:** `new_firing_rate = 0.5 + gain · activation`.
5. **First-order lag** with time constant `tc` (forward Euler), so the receptor responds gradually:
   `firing_rate += (Δt / tc) · (new_firing_rate − firing_rate)`  (with `Δt = _update_interval`; if
   `tc == 0` the new rate is applied instantly).
6. **Broadcast:** call `update_effector(firing_rate, effect_weight)` on each connected efferent.

So a rising input (e.g. arterial pressure) above setpoint drives the firing rate toward 1; below
setpoint toward 0; at setpoint it sits at 0.5.

## `AnsEfferent` — effect translation

Each efferent collects firing rates from its afferents during the interval and, every
`_update_interval` (0.015 s), turns the average into an effect factor written to its target.

**Accumulation** (`update_effector`, called by each afferent):
```
_cum_firing_rate         += (firing_rate − 0.5) · weight   // summed weighted deviation
_cum_firing_rate_counter += 1                              // number of afferent votes
```

**Averaging** (`calc_model`): the resting firing rate must be 0.5 *regardless of how many afferents
feed the efferent*, so the 0.5 setpoint is added **after** averaging the deviations:
```
firing_rate = 0.5 + _cum_firing_rate / _cum_firing_rate_counter   (or 0.5 if no afferent fired)
```
> Note: an earlier version seeded the accumulator with 0.5 and divided that by the vote count, which
> made the resting rate 0.5/N — wrong for any efferent with more than one afferent. The accumulator
> now holds only deviations and is reset to 0.

**Translation** to an effect factor — piecewise linear, pinned to `1.0` (no effect) at firing rate
0.5 and continuous at the breakpoint:
```
firing_rate ≥ 0.5 :  effector = 1.0 + (effect_at_max_firing_rate − 1.0) / 0.5 · (firing_rate − 0.5)
firing_rate < 0.5 :  effector = effect_at_min_firing_rate + (1.0 − effect_at_min_firing_rate) / 0.5 · firing_rate
```
At firing rate 1.0 the effector equals `effect_at_max_firing_rate`; at 0.0 it equals
`effect_at_min_firing_rate`; at 0.5 it equals 1.0. If `ans_active` is false the effector is forced to
1.0 (no effect).

A first-order lag with time constant `tc` smooths the effector, then it is written straight onto the
target: `models[target_model][target_prop] = effector`. The accumulator is reset for the next window.

## Configuration (model-definition fields)

**AnsAfferent**: `input_model`, `input_prop`, `min_value` / `set_value` / `max_value` (the receptor
window, in the input's own units), `tc`, `efferents` (list of efferent names), `effect_weight`.

**AnsEfferent**: `target_model`, `target_prop` (the factor it drives, e.g. `Heart.ans_activity_hr`),
`effect_at_min_firing_rate`, `effect_at_max_firing_rate`, `tc`.

**Ans**: `ans_active`, `components` (its afferents/efferents), `blood_composition_models`.

Example wiring (term neonate): afferent `BR_MAP` reads `AAR.pres` and drives `EF_HR`, `EF_SVR`,
`EF_HEART`; efferent `EF_HR` writes `Heart.ans_activity_hr` with
`effect_at_max_firing_rate = 0.428`, `effect_at_min_firing_rate = 1.5` (high pressure → faster
firing → factor < 1 → lower heart rate; the baroreflex).

## Notes & caveats

- **Timing / lag.** Afferents, efferents and the manager each run on their own interval and the
  afferent→efferent hand-off depends on step order, so the loop carries up to one interval of lag.
  This is intended (receptors and effectors are not instantaneous) and stable at the default
  intervals.
- **Reference guarding.** `AnsAfferent` skips its update when `input_model` is missing and only calls
  `update_effector` on efferents that resolve to a model with that hook; `AnsEfferent` skips the write
  when `target_model` is missing. So broken afferent/efferent wiring degrades gracefully. The `Ans`
  manager itself (`components`, `blood_composition_models`) still dereferences its names directly — a
  name that does not resolve to a built model there will throw.
- **Setpoint = 0.5** everywhere — both the receptor output and the effector's neutral point. Keep new
  afferents/efferents on that convention so resting tone composes to "no effect".
