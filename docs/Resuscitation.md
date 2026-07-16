# Resuscitation

The `Resuscitation` device model drives a **CPR** scenario: rhythmic chest compressions plus
ventilations, in the standard compression/ventilation cycles. It is a **coordinator** — it generates a
sinusoidal compression-pressure waveform and applies it to the circulation as an external pressure,
and it commands the [`Ventilator`](./Ventilator.md) and [`Breathing`](./Breathing.md) models to
deliver (or suppress) breaths.

## Inheritance

```
BaseModelClass
  └── Resuscitation   (CPR coordinator: compressions + ventilation timing)
```

`Resuscitation` extends `BaseModelClass` directly and owns no sub-models — it acts on existing models
(`Ventilator`, `Breathing`, and the compartments named in `chest_comp_targets`) by reference.

## What it models

- **Chest compressions** — a sinusoidal external pressure applied to a set of weighted target
  compartments (heart chambers, great vessels, lungs, coronaries).
- **Ventilations** — delivered through the mechanical `Ventilator` (spontaneous `Breathing` is
  switched off while CPR runs).
- **Compression/ventilation ratio** — e.g. 15 compressions : 2 breaths, or continuous compressions
  with asynchronous ventilation.

## Properties

### Configuration (independent)

| Property | Unit | Description |
|---|---|---|
| `cpr_enabled` | bool | Master on/off (normally toggled via `switch_cpr`) |
| `chest_comp_freq` | compressions/min | Compression frequency (default 100) |
| `chest_comp_max_pres` | mmHg | Peak compression pressure (default 10; scenarios use ~60) |
| `chest_comp_targets` | dict | `{ compartment: relative weight }` to compress |
| `chest_comp_no` | count | Compressions per cycle before a pause (default 15) |
| `chest_comp_cont` | bool | Continuous compressions (no ventilation pauses) (default false) |
| `vent_freq` | breaths/min | Ventilation frequency (default 30) |
| `vent_no` | count | Breaths per ventilation pause (default 2) |
| `vent_pres_pip` | cmH₂O | Ventilator PIP during CPR (default 16) |
| `vent_pres_peep` | cmH₂O | Ventilator PEEP during CPR (default 5) |
| `vent_insp_time` | s | Ventilator inspiratory time during CPR (default 1.0) |
| `vent_fio2` | fraction | Inspired O₂ fraction, pushed to the ventilator (default 0.21) |

### Computed (dependent)

| Property | Unit | Description |
|---|---|---|
| `chest_comp_pres` | mmHg | Current compression pressure (the waveform value) |

### Internal (`_`-prefixed)

`_ventilator` / `_breathing` are references resolved in `init_model`. `_comp_timer` /
`_comp_counter` track the current compression; `_comp_pause` / `_comp_pause_interval` /
`_comp_pause_counter` manage the ventilation pause; `_vent_interval` / `_vent_counter` schedule the
breaths within a pause.

## Enabling CPR — `switch_cpr(state)`

When turned **on** it: starts the ventilator (`switch_ventilator(true)`), configures pressure control
from `vent_pres_pip` / `vent_pres_peep` / `vent_insp_time` (`set_pc(pip, peep, 1.0, t_in, 5.0)`),
switches off spontaneous `Breathing` (`switch_breathing(false)`), and sets `cpr_enabled = true`.
Turning it **off** just clears `cpr_enabled` (the ventilator/breathing states are left as they are).
All calls are null-guarded with `?.`.

## Calculation cycle (`calc_model`)

Runs every step while `cpr_enabled` (returns immediately otherwise):

1. **Timing** — the compression pause equals the time for `vent_no` breaths
   (`_comp_pause_interval = (60/vent_freq)·vent_no`); the per-breath interval is
   `_vent_interval = _comp_pause_interval/vent_no + _t`. In continuous mode the ventilator rate is set
   to `vent_freq`; otherwise it is forced to `1.0` (breaths are triggered manually during pauses).
2. **Pause handling** — while paused, advance `_comp_pause_counter` until `_comp_pause_interval`
   elapses (then resume compressions), and fire `Ventilator.trigger_breath()` every `_vent_interval`.
3. **Compression force** (when not paused) — a half-rectified sine:

   ```
   A = chest_comp_max_pres / 2
   f = chest_comp_freq / 60
   chest_comp_pres = A·sin(2πf·_comp_timer − π/2) + A
   ```

   so pressure ramps 0 → max → 0 each compression. After `60/chest_comp_freq` seconds the compression
   counter increments.
4. **Cycle control** — after `chest_comp_no` compressions in non-continuous mode, enter a pause and
   trigger a breath.
5. **Apply force** — for each `{ compartment: weight }` in `chest_comp_targets`,
   `compartment.pres_ext += chest_comp_pres · weight`.

## Compression coupling (important)

The compression is delivered as **external pressure** (`pres_ext`), the channel that *every*
compartment type reads (blood vessels, heart chambers, the thorax `Container`, gas compartments). It
is added (`+=`) so it composes with other external pressures and is consumed + reset by each
compartment's `calc_pressure` every step.

> Previously the force was written to `pres_cc`, which only `GasCapacitance` and `BloodPump` read — so
> the compressions reached the lungs but **not** the heart chambers or vessels, and generated no
> circulation. Writing `pres_ext` makes compressions actually drive forward flow. Because `pres_ext`
> is reset each step, a compression can lag a given compartment by at most one step depending on model
> step order.

Typical `chest_comp_targets` weights (scenario): ventricles `LV`/`RV` and coronaries `COR` at 1.0,
atria `RASVC`/`RAIVCI` at 0.8 and `LA` at 0.5, great vessels `AA`/`AAR` at 0.7 and `SVC`/`IVCI` at
0.5, lungs `ALL`/`ALR` at 0.2.

## `set_fio2(new_fio2)`

Forwards to `Ventilator.set_fio2` (null-guarded). Called once in `init_model` from `vent_fio2` so the
ventilator's fresh gas matches the configured CPR FiO₂.

## Factor system

`Resuscitation` has no `*_factor` parameters — compression strength is set directly via
`chest_comp_max_pres` and per-target weights in `chest_comp_targets`.

## Example definition (JSON)

From `term_neonate.json`:

```json
{
  "name": "Resuscitation",
  "description": "Resuscitation model",
  "is_enabled": true,
  "model_type": "Resuscitation",
  "components": {},
  "cpr_enabled": false,
  "chest_comp_freq": 100,
  "chest_comp_max_pres": 60,
  "chest_comp_targets": {
    "ALL": 0.2, "ALR": 0.2,
    "LA": 0.5, "LV": 1, "RV": 1,
    "RAIVCI": 0.8, "RASVC": 0.8,
    "AA": 0.7, "AAR": 0.7,
    "SVC": 0.5, "IVCI": 0.5,
    "COR": 1
  },
  "chest_comp_no": 15,
  "chest_comp_cont": false,
  "vent_freq": 30,
  "vent_no": 2,
  "vent_pres_pip": 16,
  "vent_pres_peep": 5,
  "vent_insp_time": 1,
  "vent_fio2": 0.21
}
```

`cpr_enabled: false` is the resting state — CPR is started at runtime with `switch_cpr(true)`.

## Usage in the model

- One `Resuscitation` per scenario, enabled but with `cpr_enabled: false` at rest. Start CPR with
  `switch_cpr(true)`; it takes over the [`Ventilator`](./Ventilator.md) (PC mode) and silences
  spontaneous [`Breathing`](./Breathing.md).
- Compression force reaches the circulation through `pres_ext` on the targeted compartments, driving
  forward flow during arrest.

## Notes & caveats

- **Requires `Ventilator` and `Breathing`.** Both are resolved at init; all calls are null-guarded, so
  a missing ventilator no longer crashes at build (`set_fio2`) or during CPR — compressions still run,
  but no mechanical breaths are delivered.
- **Compression is order-sensitive.** Applied via `pres_ext +=`; if `Resuscitation` steps after a
  target compartment, that compartment sees the compression one step later. Stable at the default step
  size.
- **Frequencies must be > 0** — `chest_comp_freq` and `vent_freq` appear in denominators; zero would
  yield a degenerate (infinite-period) cycle.
