# Ventilator

The `Ventilator` device model simulates a **mechanical ventilator** that drives the patient's lungs
through an endotracheal (ET) tube. It owns a small gas circuit — a fresh-gas reservoir, the patient
circuit, an expiratory (PEEP) reservoir, and the inspiratory/expiratory valves plus the ET-tube
resistor — and modulates those parts every step to deliver the configured ventilation mode (`PC`,
`PRVC`, `VC`, `PS`, or `CPAP`). Pressures are entered in cmH₂O and converted to the engine's mmHg
internally.

## Inheritance

```
BaseModelClass
  └── Ventilator   (mechanical ventilator: owns gas circuit, drives modes)
```

`Ventilator` extends `BaseModelClass` directly. It is a **coordinator/composite**: its gas circuit
sub-models are declared under `components` in the definition and instantiated into `model.models` at
build time, where they participate in the global step loop like any other model. `Ventilator` only
reaches into them by name to set valve states, resistances and reservoir volumes.

## What it models

- An ET-tube-coupled mechanical ventilator with five modes: pressure control (`PC`), pressure-regulated
  volume control (`PRVC`), volume control (`VC`), pressure support (`PS`), and continuous positive
  airway pressure (`CPAP`).
- Time-cycled (`PC`/`PRVC`/`VC`) and flow-cycled (`PS`) breath delivery, with optional patient
  synchronization (trigger detection off the `Breathing` model). `PS` also carries a time-cycled
  mandatory backup so it delivers breaths during apnea / when unsynchronized.
- An optional end-inspiratory pause (`insp_pause`) that produces a plateau pressure, enabling measured
  static compliance and airway resistance.
- A flow- and diameter-dependent ET-tube resistance (turbulent tube behaviour).
- Per-breath read-outs: tidal volumes, minute volume, dynamic & static compliance, measured peak /
  plateau pressure and airway resistance, end-tidal CO₂.

## Gas circuit (owned sub-models)

```
VENT_GASIN ──[VENT_INSP_VALVE]──► VENT_GASCIRCUIT ──[VENT_ETTUBE]──► DS (airway) ──...──► lungs
   fresh gas      inspiratory          patient                ET tube
   (fio2)           valve              circuit
                                          └────[VENT_EXP_VALVE]──► VENT_GASOUT (PEEP reservoir)
```

| Sub-model | Type | Role |
|---|---|---|
| `VENT_GASIN` | GasCapacitance | Fresh-gas reservoir, composition set from `fio2`/`temp`/`humidity` (fixed composition) |
| `VENT_GASCIRCUIT` | GasCapacitance | Patient-side circuit gas volume; its pressure is the reported airway `pres` |
| `VENT_GASOUT` | GasCapacitance | Expiratory reservoir, pinned to hold PEEP (composition = room air) |
| `VENT_INSP_VALVE` | Resistor | Inspiratory valve (`VENT_GASIN → VENT_GASCIRCUIT`) |
| `VENT_ETTUBE` | Resistor | ET tube (`VENT_GASCIRCUIT → DS`); its `r_for`/`r_back` are driven by `calc_ettube_resistance` |
| `VENT_EXP_VALVE` | Resistor | Expiratory valve (`VENT_GASCIRCUIT → VENT_GASOUT`) |

References to all six are cached in `init_model` and held in `_ventilator_parts` for batch enable/disable.

## Properties

### Configuration (independent)

| Property | Unit | Description |
|---|---|---|
| `pres_atm` | mmHg | Atmospheric reference pressure (default 760) |
| `fio2` | fraction | Fraction of inspired O₂ for the fresh gas (default 0.205) |
| `humidity` | fraction | Fresh-gas relative humidity (default 1.0) |
| `temp` | °C | Fresh-gas temperature (default 37) |
| `ettube_diameter` | mm | ET-tube inner diameter (default 4); drives the `_a`/`_b` resistance coefficients |
| `ettube_length` | mm | ET-tube length (default 110); scales resistance by `length/110` |
| `vent_mode` | string | `PC` / `PRVC` / `VC` / `PS` / `CPAP` (default `PRVC`) |
| `vent_rate` | breaths/min | Mechanical rate; in `PS` it is the backup/apnea rate (default 40) |
| `tidal_volume` | L | Target tidal volume for `PRVC` and `VC` (default 0.015) |
| `insp_time` | s | Inspiratory time (default 0.4) |
| `insp_pause` | s | End-inspiratory hold duration (default 0 = off); carved out of `insp_time`, must be `< insp_time` |
| `insp_flow` | L/min | Inspiratory flow setting; the delivered flow target in `VC` (default 12) |
| `exp_flow` | L/min | Expiratory flow setting (default 3; reserved — not used in the current math) |
| `pip_cmh2o` | cmH₂O | Peak inspiratory pressure target (default 14) |
| `pip_cmh2o_max` | cmH₂O | PIP ceiling for PRVC auto-regulation (default 14) |
| `peep_cmh2o` | cmH₂O | Positive end-expiratory pressure / CPAP level (default 3) |
| `trigger_volume_perc` | % | Trigger volume as a percent of `tidal_volume` (default 6) |
| `synchronized` | bool | Enable patient-trigger detection (default false; ignored in CPAP) |

### Computed (dependent) read-outs

| Property | Unit | Description |
|---|---|---|
| `pres` | cmH₂O | Airway pressure = `(VENT_GASCIRCUIT.pres − pres_atm) · 1.35951` |
| `flow` | L/min | ET-tube flow `× 60` |
| `vol` | mL | Volume integrated from ET-tube flow over the current breath (reset each inspiration) |
| `exp_time` | s | Expiratory time = `60/vent_rate − insp_time` |
| `trigger_volume` | L | Trigger threshold = `(tidal_volume/100) · trigger_volume_perc` |
| `minute_volume` | L/min | `exp_tidal_volume · rate` — the set `vent_rate` for mandatory modes, the *measured* rate in `PS`; CPAP uses the patient's spontaneous rate |
| `compliance` | mL/cmH₂O | Dynamic compliance (= `compliance_dynamic`), measured per breath at end-expiration |
| `compliance_dynamic` | mL/cmH₂O | `Vt / (p_peak − PEEP)` — always available |
| `compliance_static` | mL/cmH₂O | `Vt / (p_plat − PEEP)` — only when an inspiratory pause produced a plateau (else 0) |
| `resistance` | cmH₂O/(L/s) | Measured airway resistance `(p_peak − p_plat) / insp_flow` — needs a plateau; `null` when unmeasurable |
| `p_peak` | cmH₂O | Measured peak inspiratory (circuit) pressure over the breath |
| `p_plat` | cmH₂O | Measured plateau pressure, sampled during the inspiratory pause |
| `exp_tidal_volume` | L | Expired tidal volume (per breath) |
| `insp_tidal_volume` | L | Inspired tidal volume (per breath) |
| `tv_kg` | mL/kg | Expired tidal volume per kg (`exp_tidal_volume·1000 / weight`) |
| `ncc_insp` | counter | Ventilator inspiration step counter (see breath cycle counters) |
| `ncc_exp` | counter | Ventilator expiration step counter |
| `etco2` | mmHg | End-tidal CO₂, sampled from `DS.pco2` at each new inspiration |
| `co2` | mmHg | Current dead-space CO₂ (`DS.pco2`) |
| `triggered_breath` | bool | True once a patient-triggered/synchronized breath has been armed |

### Internal (`_`-prefixed)

`_pip`/`_pip_max`/`_peep` are the cmH₂O targets converted to mmHg. `_a`/`_b` are the ET-tube
resistance coefficients derived from diameter. `_insp_time_counter`/`_exp_time_counter`,
`_insp_tidal_volume_counter`/`_exp_tidal_volume_counter`, `_trigger_volume_counter`, `_inspiration`,
`_expiration`, `_peak_flow`, `_prev_et_tube_flow`, `_trigger_blocked`, `_trigger_start`,
`_tv_tolerance` (0.0005 L), `_et_tube_resistance`, and the `_vent_*` sub-model references back the
cycling/triggering logic. Added for the pause / VC / measured-mechanics paths: `_pause`,
`_pause_counter`, `_had_pause`, `_pip_meas` (running peak → `p_peak`), `_insp_flow_at_pause`,
`_min_exp_time` (0.1 s floor), `_mandatory_breath` and `_breath_interval_counter`/`_measured_rate`
(PS backup + measured rate), and `_vc_vol_target` (the VC servo's flow-phase cut-off).

## Calculation cycle (`calc_model`)

1. Convert `pip_cmh2o` / `pip_cmh2o_max` / `peep_cmh2o` to mmHg (`÷ 1.35951`) into `_pip`/`_pip_max`/`_peep`.
2. If `synchronized` **and** not CPAP, run `triggering()`.
3. Dispatch on `vent_mode`:
   - `PC` / `PRVC` → `time_cycling()` then `pressure_control()`
   - `VC` → `time_cycling()` then `volume_control()`
   - `PS` → `flow_cycling()` then `pressure_control()`
   - `CPAP` → `cpap_control()`
4. Publish read-outs: airway `pres`, `flow` (ET-tube flow × 60), integrate `vol`, sample `co2` from
   `DS`, set `minute_volume` (using the measured rate in `PS`; CPAP reports a spontaneous minute
   volume), advance the breath-interval counter, and refresh the ET-tube resistance. Compliance and
   resistance are **not** touched here — they are measured once per breath (see
   `calc_measured_mechanics`), so `calc_model` must not clobber them.

### Breath cycle counters (`ncc_insp` / `ncc_exp`)

The ventilator tracks its breath phase on the **instance** counters `this.ncc_insp` and
`this.ncc_exp`. Each cycling routine sets a counter to `-1` at the first step of a new phase and then
increments it every subsequent step, so a value of `1` marks the first full step of inspiration /
expiration (the same `ncc === 1` convention the `Breathing` model uses for spontaneous breaths).

> Drift note: the engine `model` object also initializes `model.ncc_ventilator_insp` and
> `model.ncc_ventilator_exp` (in `ModelEngine.build`), but the current `Ventilator` does **not** read
> or write those — it drives its own `ncc_insp`/`ncc_exp`. The engine-level counters are reserved/
> vestigial for the ventilator.

### `time_cycling` (PC / PRVC / VC)

Recomputes `exp_time = max(60/vent_rate − insp_time, _min_exp_time)` — **floored at 0.1 s** so a high
rate / long `insp_time` can no longer drive it negative (which would jam the cycler into continuous
inspiration). The inspiratory phase is split into a **flow phase** and an optional **pause**, with
`Ti = flow phase + pause`, so `exp_time` and the set I:E ratio are preserved.

- End of the flow phase: when `_insp_time_counter > (insp_time − insp_pause)` — or, in `VC`, when the
  delivered volume `_insp_tidal_volume_counter` reaches the (servo-trimmed) target `_vc_vol_target`.
  If `insp_pause > 0` it enters a bounded hold (`_pause`, both valves shut); otherwise it ends
  inspiration immediately.
- End of the pause: after `insp_pause` seconds it samples `p_plat` from the equilibrated circuit
  pressure and ends inspiration.
- End of expiration: `_start_inspiration()` opens a new breath — resets `vol`, latches
  `exp_tidal_volume`, samples `etco2`/`tv_kg`, updates the measured rate, and calls
  `calc_measured_mechanics()` for the breath just completed. In `PRVC` it then calls
  `pressure_regulated_volume_control()`; in `VC`, `volume_control_servo()`.

During the flow phase the routine also tracks the peak circuit pressure into `_pip_meas` (used as
`p_peak`). The active phase advances its counter each step and toggles `_trigger_blocked`.

### `flow_cycling` (PS)

Pressure support is patient-triggered and **flow-cycled**: a breath begins on a patient trigger
(`triggered_breath` with rising ET-tube flow), the routine tracks `_peak_flow`, and cycles to
expiration when flow falls below **30 % of peak**. It also runs a **time-cycled mandatory backup**:
if no breath has started within `60/vent_rate` (tracked breath-start to breath-start via
`_breath_interval_counter`), it delivers a mandatory, time-cycled breath (terminated at `insp_time`).
This makes `PS` usable with `synchronized = false` and provides apnea backup. Peak circuit pressure is
captured into `_pip_meas` for the mechanics read-outs.

### `pressure_control`

- **Pause** — if `_pause` is set, shut **both** valves so the circuit equilibrates with the lung
  (plateau), and return.
- **Inspiration** — close `VENT_EXP_VALVE`, open `VENT_INSP_VALVE` with
  `r_for = (VENT_GASIN.pres + _pip − pres_atm − _peep) / (insp_flow/60)`; shut the inspiratory valve
  again once `VENT_GASCIRCUIT.pres` exceeds PIP; integrate inspiratory tidal volume from positive
  ET-tube flow and record `_insp_flow_at_pause` for the resistance measurement.
- **Expiration** — close `VENT_INSP_VALVE`, open `VENT_EXP_VALVE` (`r_for = 10`), and pin the
  expiratory reservoir volume to hold PEEP (`vol = _peep/el_base + u_vol`); integrate expiratory tidal
  volume from negative ET-tube flow.

### `volume_control` (VC)

Volume control delivers a roughly **constant inspiratory flow** by re-solving the inspiratory valve
resistance every step — `r_for = (VENT_GASIN.pres − VENT_GASCIRCUIT.pres) / (insp_flow/60)` pins the
flow near the target while the lung fills — until the delivered volume reaches `_vc_vol_target`, then
holds (the inspiratory pause, in `time_cycling`) and cycles to expiration. `pip_cmh2o_max` acts as a
pressure pop-off (shut the valve if the circuit exceeds it). Expiration mirrors `pressure_control`.
VC **bypasses** the PRVC PIP servo. Because the compliant circuit stores compression volume that
dumps into the lung, the delivered tidal volume is trimmed breath-to-breath by
`volume_control_servo()` (proportional, clamped to `[0.1·Vt, Vt]`) so `exp_tidal_volume` converges on
the set `tidal_volume`; if `insp_flow` is too low the breath is genuinely flow-limited and undershoots.

### `calc_measured_mechanics`

Called once per breath (at `_start_inspiration`) on the just-completed breath:
`compliance_dynamic = Vt / (p_peak − PEEP)` (always, and copied to `compliance`); and when a plateau
exists (`insp_pause > 0`), `compliance_static = Vt / (p_plat − PEEP)` and
`resistance = (p_peak − p_plat) / flow` with `flow` the interrupted ET-tube flow (`_insp_flow_at_pause`,
L/s). Without a plateau, `compliance_static = 0` and `resistance = null`.

### `cpap_control` (CPAP / PS coupling to spontaneous breathing)

CPAP holds the circuit at the CPAP level (= `peep_cmh2o`) and lets the patient breathe spontaneously
through the ET tube — **both valves stay open**. The inspiratory valve feeds fresh gas toward the
CPAP target and shuts off at/above it; the expiratory reservoir is pinned so the circuit floats at
CPAP. Tidal volumes are accumulated from ET-tube flow and closed out at each spontaneous inspiration
start (`Breathing.ncc_insp === 1`); `minute_volume = exp_tidal_volume · Breathing.resp_rate`.

> CPAP only ventilates a *spontaneously breathing* patient: with `Breathing` disabled it holds the
> pressure but delivers no tidal volume, as in reality. This is the half of the
> **CPAP/PS-via-ET-tube** coupling owned by the ventilator; the other half lives in `Breathing` (see
> below).

### `pressure_regulated_volume_control` (PRVC auto-PIP)

At each expiration, nudge `pip_cmh2o` by ±1 cmH₂O toward `tidal_volume` (within `_tv_tolerance`),
clamped between `peep_cmh2o + 2` and `pip_cmh2o_max`.

### `triggering` (synchronized modes)

Sets `trigger_volume = (tidal_volume/100)·trigger_volume_perc`. When `Breathing.ncc_insp === 1` and
the trigger is not blocked, it arms `_trigger_start` and integrates ET-tube flow; once the integrated
volume exceeds `trigger_volume` it forces the breath (`_exp_time_counter = exp_time + 0.1`) and sets
`triggered_breath = true`.

## Coupling to `Breathing` (active airway inlet)

`Breathing` measures airway-opening flow **route-agnostically**: it sums `MOUTH_DS.flow` (natural
airway) and `VENT_ETTUBE.flow` (ET tube), each only when that inlet is enabled and not blocked. With
the ventilator off, `VENT_ETTUBE` is disabled so the sum collapses to `MOUTH_DS` (the spontaneous
baseline). When the ventilator is on, `switch_ventilator(true)` blocks `MOUTH_DS` (`no_flow = true`),
so `Breathing` reads `VENT_ETTUBE` instead — which is why the tidal-volume feedback loop keeps working
during CPAP/PS of an intubated, spontaneously breathing patient.

## ET-tube resistance (`calc_ettube_resistance`)

```
R = (a·flow + b) · (ettube_length / 110)        floored at 15
a = −2.375·d + 11.9375
b = −14.375·d + 65.9374        (d = ettube_diameter, from set_ettube_diameter)
```

Resistance is flow- and diameter-dependent (turbulent tube behaviour) and is written onto
`VENT_ETTUBE.r_for` / `r_back` each step. `set_ettube_diameter` requires `d > 1.5`;
`set_ettube_length` requires `length ≥ 50`.

## Factor system

The `Ventilator` class itself exposes **no** three-tier `*_factor` parameters — it is a controller,
not a capacitance/resistor. Its owned gas sub-models (`VENT_*` capacitances and resistors) carry the
usual `el_base_factor*` / `r_factor*` tiers (see [Capacitance](./Capacitance.md) /
[Resistor](./Resistor.md)), but the ventilator drives those resistors by writing `r_for` directly, so
the factor layers on `VENT_INSP_VALVE` / `VENT_ETTUBE` / `VENT_EXP_VALVE` are generally left at 1.0.

## Control API

| Method | Effect |
|---|---|
| `switch_ventilator(state)` | Enable/disable the device and all `_ventilator_parts`; sets `no_flow = !state` on each part; blocks `MOUTH_DS` (`no_flow = state`); resets read-outs when turned off |
| `set_pc(pip, peep, rate, t_in, insp_flow)` | Configure PC mode |
| `set_prvc(pip_max, peep, rate, tv, t_in, insp_flow)` | Configure PRVC (`tv` in mL → L) |
| `set_vc(peep, rate, tv, t_in, insp_flow, pip_max, insp_pause)` | Configure VC (`tv` in mL → L; `pip_max` is the pop-off ceiling; `insp_pause` clamped `< insp_time`) |
| `set_psv(pip, peep, rate, t_in, insp_flow)` | Configure PS mode (`rate` = backup rate) |
| `set_cpap(cpap, insp_flow)` | Configure CPAP (`cpap` → `peep_cmh2o`) |
| `set_pause(seconds)` | Set the end-inspiratory hold for any time-cycled mode (clamped `< insp_time`) |
| `set_fio2(new_fio2)` | Re-derive fresh-gas composition (a fraction ≤ 1, or a percentage > 1) |
| `set_humidity(new_humidity)` / `set_temp(new_temp)` | Re-derive fresh-gas composition (both `VENT_GASIN` and `VENT_GASCIRCUIT`), and push the new humidity / temperature onto those compartments — see note below |
| `set_ettube_diameter(d)` / `set_ettube_length(l)` | Update tube geometry → resistance |
| `trigger_breath()` | Force the next breath by expiring the current one |

> **Why the setters write to the gas compartments directly.** `humidity` and `target_temp` are live
> targets that [`GasCapacitance`](./GasCapacitance.md) relaxes toward on every step. Setting only the
> Ventilator's own `temp`/`humidity` and recomputing the composition is not enough — the compartment
> keeps its old targets and is dragged straight back. `set_temp` therefore also sets
> `VENT_GASIN.temp`/`target_temp` and `VENT_GASCIRCUIT.target_temp`, and `set_humidity` sets
> `humidity` on both. Note that `VENT_GASIN` is `fixed_composition`, so `add_heat`/`add_watervapour`
> skip it entirely and it holds whatever it is given.

## Example definition (JSON)

A typical neonatal ventilator block (from `term_neonate.json`), trimmed to the device-level fields —
the full definition also nests the six `VENT_*` sub-models under `components`:

```json
{
  "name": "Ventilator",
  "description": "mechanical ventilator model",
  "is_enabled": false,
  "model_type": "Ventilator",
  "components": { "VENT_GASIN": { "...": "GasCapacitance" },
                  "VENT_GASCIRCUIT": { "...": "GasCapacitance" },
                  "VENT_GASOUT": { "...": "GasCapacitance" },
                  "VENT_INSP_VALVE": { "...": "Resistor" },
                  "VENT_ETTUBE": { "...": "Resistor, comp_to: DS" },
                  "VENT_EXP_VALVE": { "...": "Resistor" } },
  "pres_atm": 760,
  "fio2": 0.21,
  "humidity": 1,
  "temp": 37,
  "ettube_diameter": 3.5,
  "ettube_length": 110,
  "vent_mode": "PC",
  "vent_rate": 40,
  "tidal_volume": 0.015,
  "insp_time": 0.4,
  "insp_pause": 0,
  "insp_flow": 12,
  "exp_flow": 3,
  "pip_cmh2o": 14,
  "pip_cmh2o_max": 14,
  "peep_cmh2o": 3,
  "trigger_volume_perc": 6,
  "synchronized": true
}
```

`is_enabled: false` is the normal resting state — the ventilator is switched on at runtime via
`switch_ventilator(true)` (or by `Resuscitation.switch_cpr`).

## Usage in the model

- One `Ventilator` per scenario; disabled at rest so the patient breathes spontaneously through
  `MOUTH_DS`. Turn it on with `switch_ventilator(true)` and pick a mode with `set_pc` / `set_prvc` /
  `set_psv` / `set_cpap`.
- The [`Resuscitation`](./Resuscitation.md) model drives the ventilator during CPR (`switch_cpr`
  starts it in PC and pulses `trigger_breath()` for the ventilation pauses).
- The [`Breathing`](./Breathing.md) model reads `VENT_ETTUBE` as its airway inlet whenever the
  ventilator has blocked `MOUTH_DS`, so spontaneous tidal-volume feedback continues during CPAP/PS.

## Notes & caveats

- **`compliance`/`resistance` are measured per breath** at end-expiration (in
  `calc_measured_mechanics`), not recomputed every step. `compliance` mirrors `compliance_dynamic`
  (mL/cmH₂O). Static compliance and airway resistance (cmH₂O/(L/s)) require an inspiratory pause
  (`insp_pause > 0`); without one, `compliance_static = 0` and `resistance = null`.
- **`resistance` may be `null`** whenever no plateau was measured — downstream displays must tolerate
  a null.
- **Re-enabling is clean.** `switch_ventilator` calls `_reset_state()`, zeroing the internal cycle
  counters/flags so a re-enabled ventilator starts a fresh breath rather than resuming mid-cycle.
- **`trigger_breath()` takes no arguments**; it only forces the current breath to expire.
- **`set_fio2` percent/fraction rule**: values ≤ 1 are treated as a fraction, values > 1 as a
  percentage (so `20` → 0.20, `45` → 0.45).
- **VC delivered volume is servo-trimmed.** `volume_control_servo` converges `exp_tidal_volume` on the
  set `tidal_volume` across circuits/flows; a too-low `insp_flow` still flow-limits and undershoots.
- **External-model references are null-safe.** `DS` (et/CO₂), `MOUTH_DS` (mouth blocking) and the
  `Breathing` model (trigger) are guarded with `?.`; the `VENT_*` sub-models are the ventilator's own
  components and are assumed present after build.
- **`exp_time` is floored at `_min_exp_time` (0.1 s)** — `60/vent_rate − insp_time` can no longer go
  negative at very high rates / long `insp_time`, so the cycler cannot jam into continuous inspiration.
