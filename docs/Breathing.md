# Breathing

The Breathing model is the **spontaneous breathing driver**. It decides how much the patient should
breathe (target minute volume), splits that into a respiratory rate and tidal volume, generates a
respiratory-muscle effort waveform over each breath, and applies that effort to the `THORAX`
container — which in turn drives the lungs. It is the spontaneous counterpart to the `Ventilator`
device, and the effort partner of [Respiration](./Respiration.md) (which sets the mechanics the breath
acts against).

## Inheritance

```
BaseModelClass
  └── Breathing   (breath-effort generator — no compartment of its own)
```

Extends `BaseModelClass` directly. It owns no volume/pressure; instead `calc_model()` runs a breath
state machine and applies its effort to the `THORAX` each step (as a pleural pressure referenced to the patient's own FRC).

## What it models

```
minute volume target  ──Mecklenburgh──►  resp_rate + tidal volume
        │                                        │
        │                              breath phase state machine (insp / exp)
        ▼                                        ▼
   resp-muscle pressure waveform  ──►  THORAX.pres_ext (FRC-referenced) ──►  thoracic recoil  ──►  lung volume change
                                                                          ▲
                                              adaptive rmp_gain ◄── tidal-volume feedback
```

## Properties

### Configuration (set in the model definition)

| Property | Default | Unit | Description |
|---|---|---|---|
| `breathing_enabled` | `true` | — | spontaneous breathing on/off (`switch_breathing`) |
| `minute_volume_ref` | `0.2` | L/kg/min | reference minute volume |
| `minute_volume_ref_factor` | `1.0` | — | non-persistent multiplier on the reference MV |
| `minute_volume_ref_scaling_factor` | `1.0` | — | scaling (weight) multiplier on the reference MV |
| `vt_rr_ratio` | `0.0001212` | — | Mecklenburgh tidal-volume / rate² ratio |
| `vt_rr_ratio_factor` | `1.0` | — | multiplier on `vt_rr_ratio` |
| `vt_rr_ratio_scaling_factor` | `1.0` | — | scaling multiplier on `vt_rr_ratio` |
| `rmp_gain_max` | `100.0` | mmHg/L | ceiling on the muscle-pressure gain |
| `ie_ratio` | `0.3` | — | inspiratory fraction of the breath |
| `mv_ans_factor` | `1.0` | — | autonomic modulation of minute volume |
| `ans_activity_factor` | `1.0` | — | global ANS activity multiplier on minute volume |

### Computed / reported (outputs)

| Property | Unit | Description |
|---|---|---|
| `target_minute_volume` | L/min | demanded minute volume |
| `resp_rate` | breaths/min | computed rate driving the breath interval |
| `resp_rate_measured` | breaths/min | rate inferred from observed breath timing |
| `target_tidal_volume` | L | demanded tidal volume |
| `minute_volume` | L/min | achieved MV (`exp_tidal_volume · resp_rate`) |
| `insp_tidal_volume` | L | integrated inspiratory volume of the last breath |
| `exp_tidal_volume` | L | integrated expiratory volume of the last breath (negative inflow) |
| `resp_muscle_pressure` | mmHg/L | current muscle-effort applied to the thorax |
| `rmp_gain` | mmHg/L | adaptive effort gain (tidal-volume feedback) |
| `muscle_dv_ref` | L | thorax excursion below its unstressed volume at the patient's own FRC; pins the baseline of the muscle pressure (see *Coupling to the thorax*) |
| `ncc_insp` / `ncc_exp` | steps | inspiration / expiration step counters |

### Local (internal)

`_eMin4 = e⁻⁴` (Mecklenburgh constant), `_ti`/`_te` (inspiration/expiration times), `_breath_timer`,
`_breath_interval`, `_insp_running`/`_exp_running` phase flags, `_insp_timer`/`_exp_timer`,
`_temp_insp_volume`/`_temp_exp_volume` volume integrators, and `_rr_counter`/`_rr_factor` for the
measured-rate logic. `debug_factor1` is declared but unused.

## Target minute volume and the rate/volume split

```
minute_volume_ref' = minute_volume_ref · minute_volume_ref_factor · minute_volume_ref_scaling_factor · weight
target_minute_volume = (minute_volume_ref' + (mv_ans_factor − 1)·minute_volume_ref') · ans_activity_factor
```

The split uses the **Mecklenburgh** relationship `VT / RR = vt_rr_ratio`, i.e. tidal volume scales
with rate. Substituting into `MV = VT · RR` gives `MV = vt_rr_ratio · RR²`, inverted in
`vt_rr_controller`:

```
resp_rate           = sqrt( target_minute_volume / (vt_rr_ratio' · weight) )
target_tidal_volume = target_minute_volume / resp_rate
```

(`vt_rr_ratio'` folds in `vt_rr_ratio_factor` and `vt_rr_ratio_scaling_factor`.) The inversion is
guarded against a non-positive denominator or target so it cannot produce an `Infinity`/`NaN` rate;
when breathing is disabled `vt_rr_controller` sets `resp_rate = 0` and returns.

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

### Airway-flow integration (route-agnostic)

Tidal volumes are integrated from the **active airway inlet's** `flow · Δt` — positive flow during
inspiration, negative during expiration. The inlet flow `_aw_flow` is the **sum** of two resistors,
each contributing 0 when it is disabled, blocked (`no_flow`) or absent:

```
_aw_flow = (MOUTH_DS.flow      if MOUTH_DS exists and !no_flow)
         + (VENT_ETTUBE.flow   if VENT_ETTUBE exists, is_enabled and !no_flow)
         − (VENT_LEAK.flow     if VENT_LEAK exists, is_enabled and !no_flow)   // tube leak, DS → MOUTH
```

This makes the feedback loop route-agnostic: with the ventilator off, `VENT_ETTUBE` is disabled so
`_aw_flow` is exactly `MOUTH_DS.flow` (the natural-airway spontaneous baseline). When the patient is
intubated (e.g. on CPAP), `MOUTH_DS` is blocked so `_aw_flow` becomes `VENT_ETTUBE.flow` — the
tidal-volume feedback keeps working through the ET tube. Both resistors feed the dead space `DS` with
the same sign convention (positive = inspiration), so the sum collapses to the single open route.

## Respiratory-muscle pressure

`calc_resp_muscle_pressure` builds the effort waveform, scaled by `rmp_gain`:

- **Inspiration:** linear ramp `mp = (ncc_insp / (ti / Δt)) · rmp_gain`.
- **Expiration:** Mecklenburgh exponential decay
  `mp = (e^(−4·fraction) − e^(−4)) / (1 − e^(−4)) · rmp_gain`, with `fraction = ncc_exp / (te / Δt)`.

### Coupling to the thorax (important)

`rmp_gain` is expressed as a thoracic **elastance change** (mmHg/L). The `THORAX` operates below its
unstressed volume (`vol < u_vol`), so an elastance increase there is a more negative recoil pressure,
`ΔP = mp · el_base · (vol − u_vol)`, which is transmitted to the lungs as inspiratory suction.

The effort is applied as that pressure (`THORAX.pres_ext`), with the volume term split in two:

```
vol − u_vol = (EELV − u_vol) + (vol − EELV)
ΔP = mp · el_base · ( muscle_dv_ref + (vol − EELV) )        (capped at 0)
```

- **Within-breath term `(vol − EELV)`** — kept. The effort fades as the chest fills, which is the
  physiological brake on tidal volume.
- **Baseline term** — pinned to `muscle_dv_ref`, the patient's own FRC excursion `(EELV − u_vol)`.
  It is taken provisionally from the loaded state on the first step (scenario snapshots are breathing
  states), then refined once at the first end-expiration on the natural airway.

At the natural FRC this is identical to the old form, `THORAX.el_base_factor += mp`, which is still
used until a reference exists. That old form scaled the effort with the *current* lung volume, so
anything that raised FRC weakened the diaphragm: CPAP, PEEP, air trapping. CPAP 5 through an ET
tube halved the pleural swing (4.8 → 2.4 cmH₂O) and Vt (17 → 10 mL) at the same drive. The chemoreflex
then raised the rate, Vt fell further, and an intubated term neonate on CPAP decompensated:
`rmp_gain` pinned at 100, RR ~100, PaCO₂ 59 after 15 min (`probe_cpap --cpap 900`). With the FRC
reference it holds Vt (~22 mL, RR 52, PaCO₂ 42, stable). Every scenario baseline stays within
±1 mmHg PaCO₂. `_v_eelv` (the last end-expiratory thorax volume) is internal and is re-taken on the
first step after a reload.

## Adaptive gain (tidal-volume feedback)

At the end of each breath, `rmp_gain` is nudged ±0.1 to close the gap between the achieved
`exp_tidal_volume` and `target_tidal_volume`, clamped to `[0, rmp_gain_max]`. This is a slow integral
controller that learns the muscle effort needed to hit the target tidal volume. It only updates while
`breathing_enabled` is true.

## Example definition (JSON)

From `term_neonate.json`:

```json
{
  "name": "Breathing",
  "description": "spontaneous breathing model",
  "model_type": "Breathing",
  "is_enabled": true,
  "breathing_enabled": true,
  "minute_volume_ref": 0.2,
  "minute_volume_ref_factor": 1.0,
  "minute_volume_ref_scaling_factor": 1.0,
  "vt_rr_ratio": 0.00012,
  "vt_rr_ratio_factor": 1.0,
  "vt_rr_ratio_scaling_factor": 1.0,
  "rmp_gain_max": 100.0,
  "ie_ratio": 0.3,
  "mv_ans_factor": 1.0,
  "ans_activity_factor": 1.0
}
```

## Usage in the model

- The **ANS** drives `mv_ans_factor` / `ans_activity_factor` to raise or lower ventilatory drive (e.g.
  hypoxic/hypercapnic chemoreflex).
- `ModelScaler` writes the `*_scaling_factor` levers so reference minute volume and the VT/RR ratio
  track body weight.
- When `breathing_enabled` is false, `resp_rate`, the activation counters, `target_tidal_volume` and
  the muscle pressure are all zeroed (so the thorax coupling adds 0), but the phase machine keeps
  ticking so the tidal-volume integrators can still measure externally driven (ventilator) flow.

## Apnea coupling

`breathing_enabled` (via `switch_breathing`) is the lever the [Apnea](./Apnea.md) controller uses to
model a **central** apnea of prematurity: switching it off zeroes the muscle effort so no spontaneous
breath occurs. An **obstructive** apnea instead leaves drive on but occludes the `MOUTH_DS` airway
resistor (`no_flow = true`) — effort continues, no flow moves, and the tidal-volume feedback ramps
`rmp_gain` against the obstruction (an exaggerated recovery breath on release). Either way the resulting
hypoxemia/bradycardia emerge through the gas-exchange and ANS loops, not from Breathing itself. The
`Resuscitation` device toggles the same flag during CPR.

## Notes & caveats

- **Airway inlets are null-checked.** `MOUTH_DS` and `VENT_ETTUBE` are looked up each step and only
  contribute when present and open, so a scenario without an ET tube simply uses the mouth route.
  `THORAX`, however, is dereferenced without a null check at the end of `calc_model` — it is core to
  breathing and always present, so a configuration lacking it would throw.
- **`resp_rate_measured` has a startup transient.** `_rr_factor` starts at 0, so the
  `_rr_counter > 4·_rr_factor` branch fires repeatedly until it settles after the first breaths (same
  pattern as the `Heart` measured-rate logic). The settled value is correct.
- **`debug_factor1`** is declared but unused (debug cruft).
