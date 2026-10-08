# Breathing

The Breathing model is the **spontaneous breathing driver**. It decides how much the patient should
breathe (target minute volume), splits that into a respiratory rate and tidal volume, and turns it into
a respiratory-muscle pressure that lowers the pleural (`THORAX`) pressure over each breath, which in
turn drives the lungs. The effort follows the **neural drive**, not the measured tidal volume: the
lungs, the airway and any device decide how much volume that effort moves. It is the spontaneous
counterpart to the `Ventilator` device, and the effort partner of [Respiration](./Respiration.md)
(which sets the mechanics the breath acts against).

## Inheritance

```
BaseModelClass
  └── Breathing   (breath-effort generator — no compartment of its own)
```

Extends `BaseModelClass` directly. It owns no volume/pressure; `calc_model()` runs a breath state
machine and subtracts its muscle pressure from `THORAX.pres_ext` each step.

## What it models

```
chemoreflex (ANS) ─► mv_ans_factor ─► target minute volume ─Mecklenburgh─► resp_rate + target Vt
                                                                                  │
                                         pmus_max = rmp_gain · load_factor · target Vt
                                                                                  │
                    muscle waveform (ramp, then relaxation) ─► THORAX.pres_ext −= pmus ─► lungs
                                                                                  │
          measured Vt at the lungs ─► calibration (once) / partial load compensation ◄┘
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
| `rmp_gain` | calibrated | mmHg/L | muscle pressure per litre of target tidal volume (see *Calibration*) |
| `rmp_calibrated` | `false` | — | `rmp_gain` holds a calibrated value; written into every scenario by `scripts/_calibrate_breathing.mjs` |
| `rmp_gain_max` | `100.0` | mmHg | maximum pressure the respiratory muscles can exert (caps `pmus_max`) |
| `load_compensation` | `0.5` | 0–1 | partial compensation of the effort for loads and support (see *Load compensation*) |
| `ie_ratio` | `0.3` | — | inspiratory fraction of the breath |
| `mv_ans_factor` | `1.0` | — | chemoreflex modulation of minute volume, written by `AnsEfferent` `EF_MV` |
| `ans_activity_factor` | `1.0` | — | global multiplier on minute volume (no engine model writes it; a manual lever) |
| `thorax` | `["THORAX"]` | — | the container the muscle pressure acts on |

### Computed / reported (outputs)

| Property | Unit | Description |
|---|---|---|
| `target_minute_volume` | L/min | demanded minute volume |
| `resp_rate` | breaths/min | computed rate; latched into the breath timing at each breath start |
| `resp_rate_measured` | breaths/min | rate inferred from observed breath timing |
| `target_tidal_volume` | L | demanded tidal volume |
| `minute_volume` | L/min | achieved MV (`exp_tidal_volume · resp_rate`) |
| `insp_tidal_volume` | L | lung volume rise over the last inspiration |
| `exp_tidal_volume` | L | lung volume fall from the breath's peak to its end |
| `resp_muscle_pressure` | mmHg | current muscle pressure (positive = inspiratory effort) |
| `pmus_max` | mmHg | peak muscle pressure of the current breath |
| `load_factor` | — | current effort trim from load compensation |
| `insp_running` / `exp_running` | — | spontaneous (neural) phase flags; `_insp_running` / `_exp_running` remain as aliases |
| `ncc_insp` / `ncc_exp` | steps | phase step counters (`ncc_insp === 1` marks the first step of an inspiration) |

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

A breath starts when `_breath_timer` reaches `_breath_interval`. At that moment the timing and the
target are **latched** for the whole breath, so a chemoreflex change during a breath acts on the next:

```
_breath_interval = 60 / resp_rate
_ti = ie_ratio · _breath_interval        (inspiration)
_te = _breath_interval − _ti              (expiration)
target Vt of the breath = target_tidal_volume
```

Inspiration runs until `_breath_timer > _ti`, then expiration until the next breath start. At that
point the finished breath is closed out (tidal volumes, calibration or load compensation).

### Tidal volume at the lungs

Tidal volumes are measured on the lung compartments (`Respiration.lungs`, normally `ALL` + `ALR`):
`insp_tidal_volume` is the rise over the inspiration, `exp_tidal_volume` the fall from the breath's
peak to its end. The measurement does not depend on the airway route: natural airway, ET tube or a
tube leak all give the volume that actually reached the alveoli.

## Respiratory-muscle pressure

```
pmus_max = min( rmp_gain · load_factor · target Vt of the breath , rmp_gain_max )
pmus(t)  = pmus_max · shape(t)
THORAX.pres_ext −= pmus(t)
```

`shape` is a linear ramp from 0 to 1 over inspiration, then an exponential relaxation over expiration,
`(e^(−4x) − e^(−4)) / (1 − e^(−4))` with `x` the fraction of expiration elapsed. The pressure acts
directly on the pleural space; the THORAX resets `pres_ext` every step.

Because the effort is a pressure set by the drive, the mechanics shape the breath: stiffer lungs or a
narrower airway give less volume for the same effort, CPAP or pressure support add volume, and the
chemoreflex (through `mv_ans_factor`) answers the resulting PaCO2 change with a new rate and target.

## Calibration

`rmp_gain` is the effort the patient's own respiratory system needs per litre of tidal volume. It is
calibrated once and then frozen:

- Until `rmp_calibrated` is set, the gain starts from an estimate (twice the elastance of the lungs and
  thorax in series) and is corrected each breath by `(target / exhaled Vt)^0.8`. It is frozen after
  three consecutive breaths within 2 %, or after 40 breaths.
- Every scenario with spontaneous breathing carries a calibrated gain, written by
  `node scripts/_calibrate_breathing.mjs` (on the natural airway, with the ventilator off). Re-run it
  after changing a scenario's lung or thorax mechanics. Scenarios with breathing off (fetal, ventilated)
  calibrate when breathing starts.
- A scenario saved before this design stored `rmp_gain` as an elastance gain; without
  `rmp_calibrated` it is discarded and recalibrated.

## Load compensation

Patients partly defend their tidal volume against a load (and give up effort under support) through
volume-related reflexes and intrinsic muscle properties. `load_compensation` (`lc`, 0–1) models this
as a proportional trim of the effort, updated each breath and pulled back towards 1:

```
load_factor += 0.2 · [ (target / Vt − 1) · lc − (load_factor − 1) · (1 − lc) ]
steady state:  load_factor − 1 = lc / (1 − lc) · (target / Vt − 1)
```

`lc = 0` is a pure pressure generator, `lc → 1` defends the target tidal volume (the behaviour of the
previous design). The default `0.5` halves the tidal-volume deficit of a load. `load_factor` is
clamped to 0.25–4.

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
  "rmp_gain": 276.44,
  "rmp_calibrated": true,
  "load_compensation": 0.5,
  "ie_ratio": 0.3,
  "mv_ans_factor": 1.0,
  "ans_activity_factor": 1.0
}
```

## Usage in the model

- The **ANS** chemoreflex (`CR_PCO2` → `EF_MV`) writes `mv_ans_factor`; only PaCO2 drives breathing in
  the shipped scenarios.
- The **Ventilator** arms its patient trigger on `ncc_insp === 1` and disarms on `!insp_running`;
  the **Monitor** counts a spontaneous breath on `ncc_insp === 1`.
- When `breathing_enabled` is false, `resp_rate`, the counters, `target_tidal_volume` and the muscle
  pressure are zeroed, but the phase machine keeps running, so the lung tidal volumes are still
  measured (e.g. ventilator-driven breaths).

## Apnea coupling

`breathing_enabled` (via `switch_breathing`) is the lever the [Apnea](./Apnea.md) controller uses to
model a **central** apnea: switching it off removes the muscle pressure. An **obstructive** apnea leaves
the drive on but occludes `MOUTH_DS` (`no_flow = true`): the effort continues against a closed airway,
and the rising PaCO2 strengthens the recovery breaths through the chemoreflex. The `Resuscitation`
device switches breathing off during CPR.

## Verification

`npm run validate:resp` (see [TESTING](./TESTING.md)) checks the spontaneous steady state, the
chemoreflex, resistive and elastic loads, CPAP and pressure support against clinical ranges. The
redesign moved the suite from 52 pass / 13 known failures to all checks passing except the listed
known failures (no vagal rate response to stiff lungs, no Hering–Breuer reflex under pressure
support, and the ventilator and preterm calibration items).

## Notes & caveats

- **Rate and mechanics.** The rate follows the minute-volume demand (Mecklenburgh) and therefore the
  chemoreflex; there is no vagal rate response to stiff lungs and no Hering–Breuer shortening of
  inspiration.
- **`resp_rate_measured` has a startup transient.** `_rr_factor` starts at 0, so the
  `_rr_counter > 4·_rr_factor` branch fires repeatedly until it settles after the first breaths (same
  pattern as the `Heart` measured-rate logic). The settled value is correct.
