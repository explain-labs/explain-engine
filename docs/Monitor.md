# Monitor

The `Monitor` device model is a **read-only patient monitor**. It does not change the physiology — it
samples other models each step and publishes bedside read-outs. It is a pure observer: nothing in the
engine reads from it, and it never writes to the models it samples, so it can be added or removed
without affecting the simulation. The `DataCollector` relays its read-outs (via the normal watchlist)
to the user.

The model is deliberately minimal. It computes a handful of bedside values itself — **heart rate**,
**respiratory rate**, **end-tidal CO₂**, **temperature** and the **O₂ saturations** (pre-/post-ductal
and venous) — and exposes everything else through three uniform, **JSON-configurable** read-out systems
(`flow_targets`, `minmax_targets`, `signal_targets`) plus a few derived metrics.

> **Arterial blood pressure is not a built-in field.** There is no `abp_syst`/`abp_diast`/`abp_mean`
> property on this model. To monitor a pressure waveform's per-beat extremes and mean, add the
> compartment (e.g. `AD` for post-ductal ABP) to `minmax_targets`; the values then publish as the flat
> keys `Monitor.minmax.<name>_pres_min` / `_pres_max` / `_pres_mean`.

## Built-in read-outs

| Output | How |
|---|---|
| `heart_rate` | rolling average of the beat-to-beat rate over the last **`hr_avg_beats`** beats (bpm) |
| `resp_rate` | rolling average of the breath-to-breath rate over the last **`rr_avg_time`** seconds (breaths/min) |
| `etco2` | end-tidal CO₂; mirrored from `Ventilator.etco2` while the ventilator is enabled, otherwise derived from the spontaneous breath (see below) |
| `temp` | blood temperature (°C), mirrored each step from `AA.temp` (last value kept if AA is absent) |
| `sao2_pre`, `sao2_post` | pre-/post-ductal arterial O₂ saturation, from `AA.so2` / `AD.so2` |
| `svo2` | venous O₂ saturation, from the right atrium / IVC (`RAIVCI.so2`) |

**Heart rate** — on each ventricular beat (`Heart.ncc_ventricular === 1`), the beat-to-beat rate is
`60 / interval` (interval = time since the previous beat). A running window of the last `hr_avg_beats`
rates is kept (with a running sum) and averaged into `heart_rate`, so it updates every beat.

**Respiratory rate** — `calc_resp_rate()` detects a breath when an **active** breathing source reaches
the start of inspiration (`ncc_insp === 1`): the spontaneous `Breathing` model (when
`breathing_enabled`) or the `Ventilator` (when `is_enabled`). It keeps a rolling window of
breath-to-breath intervals spanning ~`rr_avg_time` seconds and reports `breaths / window-time × 60`,
updated every breath. Both references are optional (`?? null`); a missing source is simply skipped.

**End-tidal CO₂** — while the `Ventilator` is enabled, `etco2` is mirrored straight from
`Ventilator.etco2`. Otherwise it is derived from the spontaneous breath: `calc_resp_rate` tracks the
running peak airway pCO₂ over each breath on the airway gas compartment named by `etco2_source`
(default `"DS"`, resolved to `_ds`), and latches that end-expiratory peak as `etco2` at the onset of the
next spontaneous breath (resetting the per-breath peak). If neither source is present the last value is
kept.

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
| `<name>_pres_mean` | mmHg | **true time-averaged mean** over the beat (`Σpres / n`), not the arterial `(2·min+max)/3` estimate — that approximation badly underestimates atrial/venous means (CVP) whose a/c/v waves dip well below diastole, so an integral mean is used and is correct for all waveforms |
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
| `do2_br` | `flows.brain_flow · AA.to2 · 22.4` | `brain_flow` |
| `do2_lb` | `flows.kid_flow · 4 · AD.to2 · 22.4` | `kid_flow` |

## Configuration

`hr_avg_beats` (12), `flow_avg_beats` (1), `rr_avg_time` (20 s), `sat_avg_time` (5 s), plus the three
`*_targets` arrays. Model references are resolved by name: `Heart` (beats), `Breathing` + `Ventilator`
(breaths). The `flow_targets`/`minmax_targets`/`signal_targets` entries name their own models.

## Notes & caveats

- **Pure observer.** The Monitor never writes to the models it samples; no model depends on it. The
  `DataCollector` reads its outputs through the watchlist like any other model.
- **Breath sourcing.** `resp_rate` counts breaths from the spontaneous `Breathing` source *and* the
  `Ventilator` (each gated by its enable flag). In assisted ventilation, where both are active, both
  breath types are counted, which can overcount the rate; in purely spontaneous or purely ventilated
  states it is correct.
- **Start-up transient.** The first heart-rate and respiratory-rate windows include the time before
  the first beat/breath, so the very first read-out is slightly off; it settles after one window.
- **`do2_br` / `do2_lb` need `AA` / `AD`.** The oxygen-delivery metrics read the aortic O₂ content
  (`AA.to2` / `AD.to2`); both references are resolved with a `?? null` fallback, so they hold their
  last value if those compartments are absent.
