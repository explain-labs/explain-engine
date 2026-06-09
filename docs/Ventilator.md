# Ventilator

The `Ventilator` device model simulates a **mechanical ventilator** driving the lungs through an
endotracheal (ET) tube. It owns its own gas circuit (gas source, circuit, expiratory reservoir, and
the inspiratory/expiratory valves + ET-tube resistors) and modulates those parts each step to deliver
the configured ventilation mode.

## Gas circuit (owned sub-models)

```
VENT_GASIN ──[VENT_INSP_VALVE]──► VENT_GASCIRCUIT ──[VENT_ETTUBE]──► (airway/DS) ──[VENT_EXP_VALVE]──► VENT_GASOUT
   fresh gas        inspiratory          patient circuit        ET tube                  expiratory
   (fio2)             valve                                                                 valve → PEEP reservoir
```

While the ventilator is enabled, the spontaneous mouth path (`MOUTH_DS`) is blocked, so the patient
is ventilated through the tube rather than breathing around it.

## Ventilation modes (`vent_mode`)

| Mode | Cycling | Pressure |
|---|---|---|
| `PC` | time-cycled (`time_cycling`) | pressure-controlled to `pip` / `peep` |
| `PRVC` | time-cycled | pressure-controlled, with PIP auto-adjusted to hit `tidal_volume` |
| `PS` | flow-cycled (`flow_cycling`) | pressure-support, ends when flow drops below 30 % of peak |

If `synchronized`, `triggering()` watches the `Breathing` model and starts a ventilator breath when
the patient's inspiratory effort has moved the trigger volume.

## Calculation cycle (`calc_model`)

1. Convert `pip` / `pip_max` / `peep` from cmH₂O to mmHg.
2. If synchronized, run patient-trigger detection.
3. Run the mode's cycling (`time_cycling` or `flow_cycling`) and `pressure_control`.
4. Publish read-outs: airway `pres`, `flow`, integrated `vol`, end-tidal `co2`, `minute_volume`,
   and refresh the ET-tube resistance.

### Pressure control (`pressure_control`)

- **Inspiration** — close the expiratory valve, open the inspiratory valve with
  `r_for = (gasin.pres + pip − atm − peep) / (insp_flow/60)`; cut off when circuit pressure exceeds
  PIP; integrate inspiratory tidal volume.
- **Expiration** — close the inspiratory valve, open the expiratory valve, and set the expiratory
  reservoir volume so it holds PEEP; integrate expiratory tidal volume.

### PRVC auto-PIP (`pressure_regulated_volume_control`)

At each expiration, nudge `pip_cmh2o` ±1 cmH₂O to drive the achieved tidal volume toward
`tidal_volume`, clamped between `peep + 2` and `pip_cmh2o_max`.

## ET-tube resistance (`calc_ettube_resistance`)

`R = (a·flow + b) · (length / 110)`, floored at 15, where `a`/`b` come from the tube diameter
(`set_ettube_diameter`: `a = −2.375·d + 11.9375`, `b = −14.375·d + 65.9374`). Resistance is therefore
flow- and diameter-dependent (turbulent ET-tube behaviour) and pushed onto the `VENT_ETTUBE` resistor.

## Control API

`set_pc`, `set_prvc`, `set_psv` configure a mode and its targets; `switch_ventilator(state)` enables
the device (and blocks `MOUTH_DS`); `trigger_breath()` forces the next breath by expiring the current
one; `set_fio2` / `set_humidity` / `set_temp` re-derive the fresh-gas composition (`set_fio2` accepts
either a fraction or a percentage > 20).

## Configuration (model-definition fields)

| Field | Meaning |
|---|---|
| `vent_mode` | `PC` / `PRVC` / `PS` |
| `vent_rate`, `insp_time` | rate (breaths/min) and inspiratory time (s) |
| `pip_cmh2o`, `pip_cmh2o_max`, `peep_cmh2o` | pressure targets / ceiling (cmH₂O) |
| `tidal_volume` | target tidal volume (L) for PRVC |
| `insp_flow`, `exp_flow` | flow settings |
| `ettube_diameter`, `ettube_length` | ET-tube geometry (drives resistance) |
| `fio2`, `humidity`, `temp` | fresh-gas conditioning |
| `synchronized`, `trigger_volume_perc` | patient-triggered ventilation |

## Notes & caveats

- **`compliance` is per-breath, in mL/cmH₂O**, measured at end-expiration. (An earlier every-step
  recomputation in `calc_model` used inconsistent units and overwrote it; that line was removed.)
- **`resistance` is left as `null`** in `calc_model` — a placeholder; the meaningful airway resistance
  is the ET-tube value in `_et_tube_resistance` / `VENT_ETTUBE.r_for`.
- **`trigger_breath(...)` ignores its arguments** — it only forces the current breath to expire; the
  `pip`/`peep`/… parameters are vestigial.
- **External-model references are guarded.** `DS` (end-tidal CO₂), `MOUTH_DS` (mouth blocking) and the
  `Breathing` model (trigger) are now null-safe; the ET-circuit sub-models are the ventilator's own
  components and are assumed present.
- **`exp_time = 60/vent_rate − insp_time` can go negative** if `insp_time` exceeds the breath period
  (very high rate); that is a configuration error, not guarded.
