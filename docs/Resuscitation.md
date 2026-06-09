# Resuscitation

The `Resuscitation` device model drives a **CPR** scenario: rhythmic chest compressions plus
ventilations, in the standard compression/ventilation cycles. It is a coordinator — it generates the
compression-pressure waveform and applies it to the circulation, and it commands the `Ventilator` and
`Breathing` models to deliver (or suppress) breaths.

## What it models

- **Chest compressions** — a sinusoidal external pressure applied to a set of weighted target
  compartments (heart chambers, great vessels, lungs, coronaries).
- **Ventilations** — delivered through the mechanical `Ventilator` (spontaneous `Breathing` is
  switched off while CPR runs).
- **Compression/ventilation ratio** — e.g. 15 compressions : 2 breaths, or continuous compressions
  with asynchronous ventilation.

## Enabling CPR — `switch_cpr(state)`

When turned on it: starts the ventilator (`switch_ventilator(true)`), sets pressure-control settings
from `vent_pres_pip` / `vent_pres_peep` / `vent_insp_time`, switches off spontaneous `Breathing`, and
sets `cpr_enabled`. Turning it off just clears `cpr_enabled` (the ventilator/breathing states are left
as they are).

## Calculation cycle (`calc_model`)

Runs every step while `cpr_enabled`:

1. **Compression/ventilation timing** — the compression pause equals the time for `vent_no` breaths;
   ventilations are triggered on the `Ventilator` during the pause.
2. **Compression force** — a sine wave `chest_comp_pres = A·sin(2πf·t − π/2) + A` with
   `A = chest_comp_max_pres / 2` and `f = chest_comp_freq / 60`, so pressure ramps 0 → max → 0 each
   compression.
3. **Cycle control** — after `chest_comp_no` compressions (non-continuous mode) it enters a pause and
   triggers a breath; the pause lasts long enough for the configured ventilations.
4. **Apply force** — for each `{ compartment: weight }` in `chest_comp_targets`,
   `compartment.pres_ext += chest_comp_pres · weight`.

## Compression coupling (important)

The compression is delivered as **external pressure** (`pres_ext`), the channel that *every*
compartment type reads (blood vessels, heart chambers, the thorax container, gas compartments). It is
added (`+=`) so it composes with other external pressures and is consumed + reset by each
compartment's `calc_pressure` every step.

> Previously the force was written to `pres_cc`, which only `GasCapacitance` and `BloodPump` read — so
> the compressions reached the lungs but **not** the heart chambers or vessels, and generated no
> circulation. Writing `pres_ext` makes compressions actually drive forward flow. Because `pres_ext`
> is order-sensitive (reset each step), a compression can lag by at most one step depending on model
> step order.

Typical `chest_comp_targets` weights (scenario): ventricles `LV`/`RV` and coronaries `COR` at 1.0,
atria 0.5–0.8, great vessels 0.5–0.7, lungs `ALL`/`ALR` at 0.2.

## Configuration (model-definition fields)

| Field | Meaning |
|---|---|
| `cpr_enabled` | master on/off (normally toggled via `switch_cpr`) |
| `chest_comp_freq` | compressions per minute |
| `chest_comp_max_pres` | peak compression pressure (mmHg) |
| `chest_comp_targets` | `{ compartment: relative weight }` to compress |
| `chest_comp_no`, `chest_comp_cont` | compressions per cycle / continuous mode |
| `vent_freq`, `vent_no` | ventilation rate / breaths per cycle |
| `vent_pres_pip`, `vent_pres_peep`, `vent_insp_time` | ventilator pressure-control settings |
| `vent_fio2` | inspired O₂ fraction (pushed to the ventilator) |

## Notes & caveats

- **Requires `Ventilator` and `Breathing`.** Both are resolved at init; all calls to them are now
  null-guarded, so a missing ventilator no longer crashes at build (`set_fio2` in `init_model`) or
  during CPR — compressions still run, but no mechanical breaths are delivered.
- **Compression is order-sensitive.** Applied via `pres_ext +=`; if `Resuscitation` steps after a
  target compartment, that compartment sees the compression one step later. Stable at the default
  step size.
- **Frequencies must be > 0** — `chest_comp_freq` and `vent_freq` appear in denominators; zero would
  yield a degenerate (infinite-period) cycle.
