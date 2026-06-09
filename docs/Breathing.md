# Breathing

The Breathing model is the **spontaneous breathing driver**. It decides how much the patient should
breathe (target minute volume), splits that into a respiratory rate and tidal volume, generates a
respiratory-muscle effort waveform over each breath, and applies that effort to the `THORAX`
container — which in turn drives the lungs. It is the spontaneous counterpart to the `Ventilator`
device.

## What it models

```
minute volume target  ──Mecklenburgh──►  resp_rate + tidal volume
        │                                        │
        │                              breath phase state machine (insp / exp)
        ▼                                        ▼
   resp-muscle pressure waveform  ──►  THORAX.el_base_factor  ──►  thoracic recoil  ──►  lung volume change
                                                                          ▲
                                              adaptive rmp_gain ◄── tidal-volume feedback
```

## Target minute volume and the rate/volume split

```
minute_volume_ref' = minute_volume_ref · minute_volume_ref_factor · minute_volume_ref_scaling_factor · weight
target_minute_volume = minute_volume_ref' · mv_ans_factor · ans_activity_factor
```

The split uses the **Mecklenburgh** relationship `VT / RR = vt_rr_ratio`, i.e. tidal volume scales
with rate. Substituting into `MV = VT · RR` gives `MV = vt_rr_ratio · RR²`, inverted in
`vt_rr_controller`:

```
resp_rate          = sqrt( target_minute_volume / (vt_rr_ratio' · weight) )
target_tidal_volume = target_minute_volume / resp_rate
```

(`vt_rr_ratio'` folds in the `_factor` and `_scaling_factor`.) The inversion is guarded against a
non-positive denominator or target so it cannot produce an `Infinity`/`NaN` rate.

## Breath phase state machine

Driven by `_breath_timer` against `_breath_interval = 60 / resp_rate`, with inspiration/expiration
times set by `ie_ratio`:

```
_ti = ie_ratio · _breath_interval        (inspiration time)
_te = _breath_interval − _ti              (expiration time)
```

- `_breath_timer > _breath_interval` → start **inspiration** (reset timers, `ncc_insp = 0`).
- `_insp_timer > _ti` → start **expiration**; latch `insp_tidal_volume` from the accumulated inflow.
- `_exp_timer > _te` → end the breath; latch `exp_tidal_volume`, run the gain controller, update
  `minute_volume = exp_tidal_volume · resp_rate`.

Tidal volumes are integrated from `MOUTH_DS.flow · Δt` (positive flow during inspiration, negative
during expiration).

## Respiratory-muscle pressure

`calc_resp_muscle_pressure` builds the effort waveform, scaled by `rmp_gain`:

- **Inspiration:** linear ramp `mp = (ncc_insp / steps_per_inspiration) · rmp_gain`.
- **Expiration:** Mecklenburgh exponential decay
  `mp = (e^(−4·fraction) − e^(−4)) / (1 − e^(−4)) · rmp_gain`.

### Coupling to the thorax (important)

The effort is applied as `THORAX.el_base_factor += resp_muscle_pressure` each step (a non-persistent
factor, reset to 1.0 by the Container every step). This **modulates thoracic elastance**, not an
external pressure. It produces inspiration because the `THORAX` operates **below its unstressed
volume** (`vol ≈ 0.227 L < u_vol ≈ 0.267 L`): there `(vol − u_vol) < 0`, so raising the elastance
makes the recoil pressure *more negative*, increasing the suction transmitted to the lungs and
drawing air in. (An older external-pressure form, `THORAX.pres_ext += −resp_muscle_pressure`, is left
commented out for reference.)

## Adaptive gain (tidal-volume feedback)

At the end of each breath, `rmp_gain` is nudged ±0.1 to close the gap between the achieved
`exp_tidal_volume` and `target_tidal_volume`, clamped to `[0, rmp_gain_max]`. This is a slow integral
controller that learns the muscle effort needed to hit the target tidal volume.

## Configuration (model-definition fields)

| Field | Meaning |
|---|---|
| `breathing_enabled` | spontaneous breathing on/off (`switch_breathing`) |
| `minute_volume_ref` (+ `_factor`, `_scaling_factor`) | reference minute volume (L/kg/min) |
| `vt_rr_ratio` (+ `_factor`, `_scaling_factor`) | Mecklenburgh tidal-volume/rate ratio |
| `ie_ratio` | inspiratory fraction of the breath |
| `rmp_gain_max` | ceiling on muscle-pressure gain |
| `mv_ans_factor`, `ans_activity_factor` | autonomic modulation of minute volume |

When `breathing_enabled` is false, `resp_rate`, the activation counters, `target_tidal_volume` and
the muscle pressure are all zeroed (so the thorax coupling adds 0).

## Notes & caveats

- **`MOUTH_DS` and `THORAX` are dereferenced without null checks.** Both are core to breathing and
  always present in respiratory scenarios; a configuration lacking them would throw.
- **`resp_rate_measured` has a startup transient.** `_rr_factor` starts at 0, so the
  `_rr_counter > 4·_rr_factor` branch fires repeatedly until it settles after the first breaths
  (same pattern as the `Heart` measured-rate logic). The settled value is correct.
- **`debug_factor1`** is declared but unused (debug cruft).
- **The phase machine keeps running when breathing is disabled** (a breath every 60 s, since
  `resp_rate = 0` leaves `_breath_interval` at 60), but with zero muscle pressure it has no
  mechanical effect — it still lets the tidal-volume integrators measure externally driven (e.g.
  ventilator) flow.
