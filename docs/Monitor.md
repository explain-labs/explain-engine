# Monitor

The `Monitor` device model is a **read-only patient monitor**. It does not change the physiology — it
samples other models each step and publishes bedside read-outs. It is an observer: it never writes to
the models it samples, and no model's physics depends on it, so it can be added or removed without
affecting the simulation. (The [Calibrator](./Calibrator.md) does read its read-outs — `heart_rate`,
`flows.lvo` and the `minmax` pressures — as its calibration targets, so a calibration run needs a
Monitor with the matching targets.) The `DataCollector` relays its read-outs (via the normal watchlist)
to the user.

The model is deliberately minimal. It computes a handful of bedside values itself — **heart rate**,
**respiratory rate**, **end-tidal CO₂**, **temperature** and the **O₂ saturations** (pre-/post-ductal
and venous) — and exposes everything else through three uniform, **JSON-configurable** read-out systems
(`flow_targets`, `minmax_targets`, `signal_targets`) plus a few derived metrics.

> **Arterial blood pressure is not a built-in field.** There is no `abp_syst`/`abp_diast`/`abp_mean`
> property on this model. To monitor a pressure waveform's per-beat extremes and mean, add the
> compartment (e.g. `AD` for post-ductal ABP) to `minmax_targets`; the values then publish as the flat
> keys `Monitor.minmax.<name>_pres_min` / `_pres_max` / `_pres_mean`.

## Physiology

A bedside monitor shows the vital signs a neonatal team watches: heart rate (from the ECG), pre- and post-ductal oxygen saturation (right hand and a foot; a difference signals right-to-left ductal shunting), blood pressures, respiratory rate, end-tidal CO2 and temperature. Its numbers are averaged over beats and breaths, so they lag fast changes by several seconds.

## Built-in read-outs

| Property | How |
|---|---|
| `heart_rate` | rolling average of the beat-to-beat rate over the last **`hr_avg_beats`** beats (bpm) |
| `resp_rate` | rolling average of the breath-to-breath rate over the last **`rr_avg_time`** seconds (breaths/min) |
| `etco2` | end-tidal CO₂; mirrored from `Ventilator.etco2` while the ventilator is enabled, otherwise derived from the spontaneous breath (see below) |
| `temp` | blood temperature (°C), mirrored each step from `AA.temp` (last value kept if AA is absent) |
| `sao2_pre`, `sao2_post` | pre-/post-ductal arterial O₂ saturation, from `AA.so2` / `AD.so2` |
| `svo2` | mixed-venous O₂ saturation, from the pulmonary artery (`PA.so2`). Falls back to `RAIVCI.so2` when there is no PA; `RAIVCI` holds IVC-side blood, which misses the brain's extraction where the right-atrial halves don't mix (the fetal scenarios). In `term_neonate_72h` the two agree (81.9 %). |

**Heart rate** — on each ventricular beat (`Heart.ncc_ventricular === 1`), the beat-to-beat rate is
`60 / interval` (interval = time since the previous beat). A running window of the last `hr_avg_beats`
rates is kept (with a running sum) and averaged into `heart_rate`, so it updates every beat.

**Asystole** — when no beat arrives for `asystole_time` (6 s), `heart_rate` reads 0 and its window is
cleared, the beat-averaged `flows` and the derived `fo_flow`/`do2_br`/`do2_lb` read 0, and the per-beat
`minmax` pressures/volumes are latched from the flat line — repeated every `asystole_time` while it
lasts — instead of holding the last beat. The interval that ends an asystole (longer than
`asystole_time`) is not counted as a beat-to-beat interval.

**Respiratory rate** — `calc_resp_rate()` detects a breath when an **active** breathing source reaches
the start of inspiration (`ncc_insp === 1`): the spontaneous `Breathing` model (when
`breathing_enabled`) or the `Ventilator` (when `is_enabled`). One breath counts once: a ventilator
breath that starts while a spontaneous inspiration is running (`Breathing.insp_running`) is the breath
that effort triggered or landed on, and an effort that starts during a ventilator inspiration
(`Ventilator._inspiration`) is fused into it. So in patient-triggered modes (PTV, PSV, synchronised
SIMV breaths) the rate is the patient's rate, and in unsynchronised CMV it is the set rate plus the
efforts that fall between the ventilator breaths. It keeps a rolling window of breath-to-breath
intervals spanning ~`rr_avg_time` seconds and reports `breaths / window-time × 60`, updated every
breath. When no breath starts for a whole window (apnoea), `resp_rate` follows the open interval
(`60 / time since the last breath`) and the window restarts with the next breaths; the interval that
ends the apnoea is not counted. Both references are optional (`?? null`); a missing source is simply
skipped.

**End-tidal CO₂** — while the `Ventilator` is enabled, `etco2` is mirrored straight from
`Ventilator.etco2`. Otherwise it is derived from the spontaneous breath: `calc_resp_rate` tracks the
running peak airway pCO₂ over each breath on the airway gas compartment named by `etco2_source`
(default `"DS"`, resolved to `_ds`), and latches that end-expiratory peak as `etco2` at the onset of the
next spontaneous breath (resetting the per-breath peak). If neither source is present the last value is
kept. When no breath starts for `rr_avg_time` (apnoea) and the ventilator is off, the spontaneous
`etco2` reads 0 (no expired breath to measure, as on a capnograph). Switching the ventilator on or off
resets the per-breath peak, so the first spontaneous breath after weaning does not report the
maximum over the whole ventilated period.

## Configurable read-outs

All three take a JSON array of `{ name, model }` objects, resolve them in `init_model` (dropping any
whose model does not resolve), and seed their output keys to `0` so the watch paths exist from the
start. This is the intended way to add bedside numbers without touching engine code.

### Flows (`flow_targets` → `Monitor.flows`)

`model` is a `"ModelName.prop"` dot-path (the prop defaults to `flow`):

```json
"flow_targets": [
  { "name": "kidney_flow", "model": "AD_KID_ART.flow" },
  { "name": "brain_flow",  "model": "AA_BR_ART.flow" }
]
```

Each connector's `flow · Δt` is integrated every step (`collect_flows`) and, once every
`flow_avg_beats` beats, converted to a beat-averaged value (`counter / beats_time · 60`) and published
under **`Monitor.flows.<name>`** in **L/min** — e.g. watch `Monitor.flows.kidney_flow`.

### Min/max (`minmax_targets` → `Monitor.minmax`)

`model` is a compartment name; the per-beat min/max of its `pres` and `vol` are tracked
(`collect_pressures`) and latched on each beat:

```json
"minmax_targets": [
  { "name": "left_ventricle", "model": "LV" },
  { "name": "right_atrium",   "model": "RAIVCI" }
]
```

Published as **flat** keys under `Monitor.minmax`, reset every beat:

| Key | Unit | Source |
|---|---|---|
| `<name>_pres_min`, `<name>_pres_max` | mmHg | compartment `pres` (total pressure) |
| `<name>_pres_mean` | mmHg | for the arterial targets in `arterial_mean_targets` (default `abp_pre`, `abp`, `pap`): the **clinical mean** `min + (max − min)/3`, as the reference literature reports MAP and mean PAP; for all other targets the true time-averaged mean. The arterial estimate badly underestimates atrial/venous means (CVP), whose a/c/v waves dip well below diastole |
| `<name>_pres_mean_int` | mmHg | **true time-averaged mean** over the beat (`Σpres / n`), every target. The model's central arterial waveforms have a form factor (mean − min)/(max − min) of about 0.5, so for `abp_pre` this sits ~5–7 mmHg above the clinical mean |
| `<name>_vol_min`, `<name>_vol_max` | mL | compartment `vol` (× 1000) |

Watch e.g. `Monitor.minmax.left_ventricle_pres_max`. The keys are **flat** (not a nested object)
because the `DataCollector` watcher resolves at most two property levels (`model.prop1.prop2`) — i.e.
a watch path of at most three dotted parts; `Monitor.minmax.left_ventricle.pres_max` (four parts)
would not resolve. Targets without a numeric `pres`/`vol` (e.g. a resistor) are not tracked.

### Raw signals (`signal_targets` → `Monitor.signals`)

For waveforms / raw values (no averaging), `model` is a `"ModelName.prop"` dot-path:

```json
"signal_targets": [
  { "name": "ecg",     "model": "Heart.ecg_signal" },
  { "name": "lv_pres", "model": "LV.pres" }
]
```

Each is read **unprocessed every step** (`collect_signals`) and published under
**`Monitor.signals.<name>`** — e.g. watch `Monitor.signals.ecg`. A `prop` is required (entries without
a `"."` are dropped).

## Derived metrics

Computed once every `flow_avg_beats` beats from the `flows` dict, so the scenario must define the
matching `flow_targets`:

| Output | Formula | Requires `flow_targets` |
|---|---|---|
| `fo_flow` | `flows.fo_ivci_flow + flows.fo_svc_flow` | `fo_ivci_flow`, `fo_svc_flow` |
| `do2_br` | `flows.brain_flow · AA.to2 / O2_MMOL_PER_ML` (= × 22.414, mL O₂/min) | `brain_flow` |
| `do2_lb` | `flows.kid_flow · 4 · AD.to2 / O2_MMOL_PER_ML` (mL O₂/min) | `kid_flow` |

`O2_MMOL_PER_ML` is `1/22.414` (STPD) from `helpers/Units.js`. `do2_lb` **assumes** the lower-body
flow is four times the renal flow (`kid_flow × 4`) — a fixed ratio, not a measured lower-body flow;
it does not follow redistribution between the kidneys and the rest of the lower body.

## Configuration

| Property | Unit | Default | Description |
|---|---|---|---|
| `hr_avg_beats` | beats | 12 | Heart-rate averaging window. |
| `flow_avg_beats` | beats | 1 | Flow averaging window. |
| `rr_avg_time` | s | 20 | Respiratory-rate averaging window. |
| `asystole_time` | s | 6 | No beat for this long reads as asystole. |
| `etco2_source` | – | `"DS"` | Airway gas compartment for the spontaneous end-tidal CO2. |
| `flow_targets`, `minmax_targets`, `signal_targets` | lists | `[]` | The configurable read-outs (above). |
| `arterial_mean_targets` | list | `["abp_pre", "abp", "pap"]` | `minmax_targets` names whose `_pres_mean` is the clinical mean, diastolic + pulse pressure / 3. |

| Property | Unit | Description |
|---|---|---|
| `flows`, `minmax`, `signals` | dicts | The configurable read-outs (above). |
| `fo_flow`, `do2_br`, `do2_lb` | L/min, mL O2/min | Derived metrics (above). |

The saturations are mirrored every step without averaging. Model references are resolved by name at build: `Heart` (beats), `Breathing` and `Ventilator` (breaths), `AA`, `AD`, `PA`, `RAIVCI`. The target entries name their own models; one that doesn't resolve is dropped.

**term_neonate_72h** configures `flow_targets` lvo, rvo, cor_flow, svc_flow, ivc_flow, da_flow, brain_flow, kid_flow, ua_flow, uv_flow, fo_ivci_flow and fo_svc_flow; `minmax_targets` lv, rv, abp_pre, abp, pap, cvp and la; `signal_targets` ecg, sat_pre, sat_post, abp, resp and co2.

## Inputs and outputs

- **Reads:** Heart (`ncc_ventricular`), Breathing and Ventilator (breath onsets, `etco2`), `AA`, `AD`, `PA`, `RAIVCI`, `DS`, and every configured target.
- **Writes:** nothing outside itself.
- **Read by:** the app's monitor panel, `DataCollector` watchers, the [Calibrator](./Calibrator.md) (calibration targets).

## Assumptions and limitations

- **Observer.** The Monitor never writes to the models it samples; no model's physics depends on it.
  The `DataCollector` reads its outputs through the watchlist like any other model, and the
  `Calibrator` reads them as calibration targets.
- **Breath sourcing.** `resp_rate` counts breaths from the spontaneous `Breathing` source *and* the
  `Ventilator` (each gated by its enable flag), merging the two onsets of one breath (above). Before
  the merge, every patient-triggered breath was counted twice (effort onset + triggered ventilator
  breath), so PTV/PSV showed about double the real rate. An effort during a ventilator inspiration
  in CMV is not counted (fused breath).
- **Start-up transient.** The first heart-rate and respiratory-rate windows include the time before
  the first beat/breath, so the very first read-out is slightly off; it settles after one window.
- **`do2_br` / `do2_lb` need `AA` / `AD`.** The oxygen-delivery metrics read the aortic O₂ content
  (`AA.to2` / `AD.to2`); both references are resolved with a `?? null` fallback, so they hold their
  last value if those compartments are absent (asystole still zeroes them).

## References

None; standard bedside monitoring definitions.
