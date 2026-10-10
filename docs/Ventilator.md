# Ventilator

> **In the app the ventilator is the [SLE6000](./Sle6000.md).** Every scenario up to 30 kg uses
> `Sle6000`, a subclass of this model; only the adult scenarios keep `Ventilator` itself.
> - This class is the physics underneath, and its API is what Resuscitation, the respiratory suite,
>   the probes and the calibration scripts call.
> - Its HFOV, VC and PRVC modes have no control in the app.

The `Ventilator` device model simulates a **mechanical ventilator** that drives the patient's lungs
through an endotracheal (ET) tube. It owns a small gas circuit — a fresh-gas reservoir, the patient
circuit, an expiratory (PEEP) reservoir, and the inspiratory/expiratory valves plus the ET-tube
resistor — and modulates those parts every step to deliver the configured ventilation mode (`PC`,
`PRVC`, `VC`, `PS`, `CPAP`, or `HFOV`). Pressures are entered in cmH₂O and converted to the engine's mmHg
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

- An ET-tube-coupled mechanical ventilator with seven modes: pressure control (`PC`),
  pressure-regulated volume control (`PRVC`), volume control (`VC`), pressure support (`PS`),
  synchronised intermittent mandatory ventilation (`SIMV`, with optional pressure support),
  continuous positive airway pressure (`CPAP`, with an optional apnoea backup rate), and
  high-frequency oscillation (`HFOV`).
- Time-cycled (`PC`/`PRVC`/`VC`) and flow-cycled (`PS`, SIMV support breaths) breath delivery, with
  patient triggering: always on in `PS` and `SIMV`, optional (`synchronized`) in the time-cycled
  modes. The trigger is a volume trigger off the `Breathing` effort, or a flow trigger at the tube
  (`trigger_mode`). `PS` also carries a time-cycled mandatory backup so it delivers breaths during
  apnea.
- An optional end-inspiratory pause (`insp_pause`) that produces a plateau pressure, enabling measured
  static compliance and airway resistance.
- A flow-, diameter- and length-dependent ET-tube resistance (Rohrer form, symmetric in inspiration
  and expiration, valid from neonatal 2.5 mm to adult 9 mm tubes).
- A heated humidifier: the fresh gas and the circuit are held at `temp` / `humidity`.
- Per-breath read-outs: tidal volumes, minute volume, dynamic & static compliance, measured peak /
  plateau pressure and airway resistance, end-tidal CO₂, and the monitored values a ventilator
  screen shows: mean airway pressure, measured Ti / Te / I:E, rate, triggers per minute and
  dynamic resistance.

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
| `VENT_LEAK` | Resistor | Leak around an uncuffed tube (`DS → MOUTH`), driven by `leak_size`. Added by `init_model` when a scenario does not declare it. |

References to the first six are cached in `init_model` and held in `_ventilator_parts` for batch enable/disable. `VENT_LEAK` is handled separately: it is only open while the ventilator is on **and** `leak_size > 0`.

## Properties

### Configuration (independent)

| Property | Unit | Description |
|---|---|---|
| `pres_atm` | mmHg | Atmospheric reference pressure (default 760) |
| `fio2` | fraction | Fraction of inspired O₂ for the fresh gas (default 0.205) |
| `humidity` | fraction | Fresh-gas relative humidity (default 1.0) |
| `temp` | °C | Fresh-gas temperature (default 37) |
| `ettube_diameter` | mm | ET-tube inner diameter (default 4); drives the `_ett_k1`/`_ett_k2` Rohrer coefficients |
| `ettube_length` | mm | ET-tube length (default 110); scales resistance by `length/110` |
| `vent_mode` | string | `PC` / `PRVC` / `VC` / `PS` / `SIMV` / `CPAP` / `HFOV` / `HFOV_CMV` (default `PRVC`) |
| `hfo_map_cmh2o` | cmH₂O | HFOV mean airway pressure (default 10) |
| `hfo_amplitude_cmh2o` | cmH₂O | HFOV peak-to-peak circuit pressure swing (default 25) |
| `hfo_freq` | Hz | HFOV frequency (default 10) |
| `hfo_insp_fraction` | fraction | HFOV inspiratory fraction of the cycle: 0.33 = I:E 1:2 (default), 0.5 = 1:1 |
| `hfo_bias_flow` | L/min | HFOV continuous fresh-gas (bias) flow (default 10) |
| `pres_response_tau` | s | First-order response of the delivered pressure to its target in `pressure_control` and `cpap_control` (0 = ideal, the default; the Sle6000 uses 0.012) |
| `hfo_volume_guarantee` | bool | HFOV volume targeting: servo the amplitude to `hfo_tidal_volume_target` (default false) |
| `hfo_tidal_volume_target` | L | HFOV expired volume per oscillation to aim for (default 0.002) |
| `hfo_amplitude_max_cmh2o` | cmH₂O | HFOV volume targeting: the amplitude limit (default 40) |
| `hfo_sigh_rate` | /min | Automatic HFOV sighs (0 = off) |
| `hfo_sigh_time` / `hfo_sigh_cmh2o` | s / cmH₂O | Duration and held pressure of an HFOV sigh (default 0.4 s, 10) |
| `hfo_activity` | string | `HFOV_CMV`: oscillate in `both` phases (default) or in expiration only (`exp`) |
| `vent_rate` | breaths/min | Mechanical rate; in `PS` it is the backup/apnea rate (default 40) |
| `tidal_volume` | L | Target tidal volume for `PRVC` and `VC` (default 0.015) |
| `insp_time` | s | Inspiratory time (default 0.4) |
| `insp_pause` | s | End-inspiratory hold duration (default 0 = off); carved out of `insp_time`, must be `< insp_time` |
| `insp_flow` | L/min | Maximal flow of the demand valve in `PC`/`PRVC`/`PS`/`CPAP`; the delivered (constant) flow in `VC` (default 12) |
| `leak_size` | mm | Equivalent diameter of the gap around an uncuffed tube; 0 = no leak (default). Useful range ≈ 0.5–1.25 mm neonatal, 1–3 mm adult — see *Tube leak* |
| `exp_valve_resistance` | mmHg·s/L | Expiratory limb + valve; 0 = auto by circuit size (default) — see *Expiratory valve* |
| `volume_guarantee` | bool | Volume guarantee on top of `PC` (incl. synchronized A/C) or `PS`: the working pressure is servoed breath-to-breath to `tidal_volume`, limited by `pip_cmh2o_max` (default false) |
| `rise_time` | s | Pressure rise time in `PC`/`PRVC`/`PS`: the target ramps PEEP → PIP over this time (default 0.1; 0 = as fast as `insp_flow` allows) |
| `exp_flow` | L/min | Expiratory flow setting (default 3; reserved — not used in the current math) |
| `pip_cmh2o` | cmH₂O | Peak inspiratory pressure target in `PC` (default 14); not used in `PS` |
| `ps_cmh2o` | cmH₂O | Pressure support level **above PEEP** in `PS` (default 10); the PS target is `peep_cmh2o + ps_cmh2o` |
| `pip_cmh2o_max` | cmH₂O | Pressure limit of the volume-targeted modes (PRVC, volume guarantee); the VC pop-off (default 14) |
| `peep_cmh2o` | cmH₂O | Positive end-expiratory pressure / CPAP level (default 3) |
| `trigger_volume_perc` | % | Trigger volume as a percent of `tidal_volume` (default 6), with `trigger_mode` `"volume"` |
| `trigger_mode` | string | `"volume"` (default): `trigger_volume_perc` of the set Vt during a patient effort; `"flow"`: `trigger_flow` at the tube |
| `trigger_flow` | L/min | Flow-trigger threshold: inspiratory flow at the tube during expiration (default 0.6) |
| `leak_compensation` | bool | Flow trigger: subtract the learned baseline leak flow before the threshold (default true) — see *Tube leak* |
| `leak_comp_max_perc` | % | Compensate only while the leak (3-breath mean of `leak_perc`) is at most this (default 100; the SLE6000 sets 35) |
| `leak_term_min_perc` / `leak_term_max_perc` | % | Flow cycling: compensate the leak only while it is within this range (default 0–100; the SLE6000 sets 10–50) |
| `leak_term_max_flow` | L/min | Flow cycling: cap on the compensated leak flow (default 0 = no cap; the SLE6000 sets 5). It is also capped at half the peak flow |
| `term_sens_perc` | % | Termination sensitivity: a `PS` (or SIMV support) breath cycles off when inspiratory flow falls below this % of its peak (default 30) |
| `backup_rate` | /min | `CPAP` apnoea backup: a time-cycled breath at `pip_cmh2o`/`insp_time` after `60/backup_rate` s without a spontaneous effort (default 0 = off) |
| `synchronized` | bool | Enable patient-trigger detection in `PC`/`PRVC`/`VC` (default false). `PS` and `SIMV` always trigger; ignored in `CPAP` |

### Computed (dependent) read-outs

| Property | Unit | Description |
|---|---|---|
| `pres` | cmH₂O | Airway pressure = `(VENT_GASCIRCUIT.pres − pres_atm) · 1.35951` |
| `flow` | L/min | ET-tube flow `× 60` |
| `vol` | mL | Volume integrated from ET-tube flow over the current breath (reset each inspiration) |
| `exp_time` | s | Expiratory time = `60/vent_rate − insp_time` |
| `trigger_volume` | L | Trigger threshold = `(tidal_volume/100) · trigger_volume_perc` |
| `minute_volume` | L/min | `exp_tidal_volume · rate` — the set `vent_rate` for purely mandatory modes; whenever the patient can trigger (`PS`, or `synchronized`) the *measured*, breath-averaged rate; CPAP uses the patient's spontaneous rate |
| `compliance` | mL/cmH₂O | Dynamic compliance (= `compliance_dynamic`), measured per breath at end-expiration |
| `compliance_dynamic` | mL/cmH₂O | `Vt / (p_peak − PEEP)` — always available |
| `compliance_static` | mL/cmH₂O | `Vt / (p_plat − PEEP)` — only when an inspiratory pause produced a plateau (else 0) |
| `resistance` | cmH₂O/(L/s) | Measured airway resistance `(p_peak − p_plat) / insp_flow` — needs a plateau; `null` when unmeasurable |
| `p_peak` | cmH₂O | Measured peak inspiratory (circuit) pressure over the breath (in CPAP: over the spontaneous breath) |
| `p_plat` | cmH₂O | Measured plateau pressure, sampled during the inspiratory pause |
| `exp_tidal_volume` | L | Expired tidal volume (per breath) |
| `insp_tidal_volume` | L | Inspired tidal volume (per breath) |
| `tv_kg` | mL/kg | Expired tidal volume per kg (`exp_tidal_volume·1000 / weight`); also in CPAP |
| `ncc_insp` | counter | Ventilator inspiration step counter (see breath cycle counters) |
| `ncc_exp` | counter | Ventilator expiration step counter |
| `etco2` | mmHg | End-tidal CO₂, sampled from `DS.pco2` at each new inspiration |
| `co2` | mmHg | Current dead-space CO₂ (`DS.pco2`) |
| `triggered_breath` | bool | True once a patient-triggered/synchronized breath has been armed |
| `pip_delivered` | cmH₂O | The inspiratory pressure target in use: `pip_cmh2o` (PC), `peep + ps_cmh2o` (PS), or the working pressure in PRVC / volume guarantee |
| `leak_perc` | % | Per-breath leak at the tube flow sensor, `(Vti − Vte)/Vti` |
| `leak_flow_comp` | L/min | Baseline leak flow the flow trigger subtracts at the current pressure (0 = not compensating) |
| `pressure_limited` | bool | Volume-targeted modes: working pressure at `pip_cmh2o_max` while Vt is still below target (the "Vt low / Pmax reached" alarm condition) |
| `map_meas` | cmH₂O | Mean airway pressure over the last breath; without breaths (CPAP, HFOV, apnoea) over 3 s blocks |
| `hfo_amplitude_delivered` | cmH₂O | HFOV amplitude in use: the set one, or the working one with volume targeting |
| `hfo_sigh_remaining` / `hfo_pause_remaining` | s | Time left of a running HFOV sigh / oscillation pause (0 = oscillating) |
| `ti_meas` / `te_meas` | s | Measured inspiratory time of the last breath and the expiratory time before it |
| `ie_ratio_meas` | – | `te_meas / ti_meas` (shown as 1:x) |
| `rr_meas` | /min | Breath-averaged delivered rate; in CPAP the patient's rate while breathing |
| `trig_per_min` | /min | Patient-triggered ventilator breaths over the last 60 s |
| `r_dyn` | cmH₂O/(L/s) | `(p_peak − PEEP) / peak expiratory flow` of the last breath, the dynamic resistance neonatal ventilators report |

### Internal (`_`-prefixed)

`_pip`/`_pip_max`/`_peep` are the cmH₂O targets converted to mmHg (in `PS`, `_pip` is
`peep_cmh2o + ps_cmh2o`). `_ett_k1`/`_ett_k2` are the ET-tube Rohrer coefficients derived from
diameter. `_rate_avg` is the breath-averaged measured rate (minute volume), `_manual_breath` a
pending `trigger_breath()` request, and `_humidifier_applied` guards the first-step humidifier
setup. `_insp_time_counter`/`_exp_time_counter`,
`_insp_tidal_volume_counter`/`_exp_tidal_volume_counter`, `_trigger_volume_counter`, `_inspiration`,
`_expiration`, `_peak_flow`, `_prev_et_tube_flow`, `_trigger_blocked`, `_trigger_start`,
`_tv_tolerance` (0.0005 L), `_et_tube_resistance`, and the `_vent_*` sub-model references back the
cycling/triggering logic. Added for the pause / VC / measured-mechanics paths: `_pause`,
`_pause_counter`, `_had_pause`, `_pip_meas` (running peak → `p_peak`), `_insp_flow_at_pause`,
`_min_exp_time` (0.1 s floor), `_mandatory_breath` and `_breath_interval_counter`/`_measured_rate`
(PS backup + measured rate), and `_vc_vol_target` (the VC servo's flow-phase cut-off).

## Calculation cycle (`calc_model`)

1. On the first step, apply the humidifier settings (`_apply_humidifier`, see below). Convert
   `pip_cmh2o` (in `PS`: `peep_cmh2o + ps_cmh2o`) / `pip_cmh2o_max` / `peep_cmh2o` to mmHg
   (`÷ 1.35951`) into `_pip`/`_pip_max`/`_peep`.
2. If the mode is `PS` or `SIMV`, or `synchronized` is set and the mode is not CPAP or HFOV, run
   `triggering()`.
3. Dispatch on `vent_mode`:
   - `PC` / `PRVC` → `time_cycling()` then `pressure_control()`
   - `VC` → `time_cycling()` then `volume_control()`
   - `PS` → `flow_cycling()` then `pressure_control()`
   - `SIMV` → `simv_cycling()` then `pressure_control()`
   - `CPAP` → `cpap_cycling()` (`cpap_control()`, or a backup/manual breath)
   - `HFOV` / `HFOV_CMV` → `hfov_control()`
4. Publish read-outs: airway `pres`, `flow` (ET-tube flow × 60), integrate `vol`, sample `co2` from
   `DS`, set `minute_volume` (using the breath-averaged measured rate whenever the patient can
   trigger; CPAP reports a spontaneous minute volume), advance the breath-interval counter, and refresh the ET-tube resistance. Compliance and
   resistance are **not** touched here — they are measured once per breath (see
   `calc_measured_mechanics`), so `calc_model` must not clobber them.
5. `_calc_monitoring()` gathers the monitored values: expiratory time and peak expiratory flow,
   the mean-pressure integral, `rr_meas` and the 60 s trigger count.

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
  `calc_measured_mechanics()` for the breath just completed. In the volume-targeted
  modes (`PRVC`, volume guarantee) `_start_inspiration` calls `pressure_regulated_volume_control()`;
  in `VC`, `time_cycling` calls `volume_control_servo()`. With volume guarantee the flow phase also
  ends once 130 % of `tidal_volume` has been delivered.

During the flow phase the routine also tracks the peak circuit pressure into `_pip_meas` (used as
`p_peak`). The active phase advances its counter each step and toggles `_trigger_blocked`.

### `flow_cycling` (PS)

Pressure support is patient-triggered and **flow-cycled**: a breath begins on a patient trigger
(`triggered_breath` with rising ET-tube flow), the routine tracks `_peak_flow`, and cycles to
expiration when flow falls below **`term_sens_perc` of peak** (default 30 %) — or, as a safety limit, when the breath reaches
`insp_time` (Ti max, for when flow never decays). It also runs a **time-cycled mandatory backup**:
if no breath has started within `60/vent_rate` (tracked breath-start to breath-start via
`_breath_interval_counter`), it delivers a mandatory, time-cycled breath (terminated at `insp_time`).
This provides apnea backup; patient triggers always run in `PS`, whatever `synchronized` says. Peak circuit pressure is
captured into `_pip_meas` for the mechanics read-outs.

### `pressure_control`

- **Pause** — if `_pause` is set, shut **both** valves so the circuit equilibrates with the lung
  (plateau), and return.
- **Inspiration** — close `VENT_EXP_VALVE` and drive `VENT_INSP_VALVE` with the pressure servo
  (`_pressure_servo`, below). Its target ramps from PEEP to PIP over `rise_time` and is then held.
  The result is a square pressure waveform with decelerating flow, as on a real pressure-controlled
  ventilator. Integrate inspiratory tidal volume from positive ET-tube flow, and record
  `_insp_flow_at_pause` for the resistance measurement.
- **Expiration** — open `VENT_EXP_VALVE` (`r_for` from `calc_exp_valve_resistance`, see *Expiratory valve*) and pin the expiratory reservoir volume to
  hold PEEP (`vol = _peep/el_base + u_vol`). The inspiratory valve runs the pressure servo with PEEP
  as its target (a demand valve). While the patient exhales the circuit sits above PEEP and the
  servo stays shut; once the patient inhales it supplies the flow. Integrate expiratory tidal volume
  from negative ET-tube flow.

  > Before 2026-10, the inspiratory valve was simply shut in expiration. The circuit was then sealed
  > between ventilator breaths, apart from the one-way exit to the PEEP reservoir. A spontaneously
  > breathing patient could only draw the ~0.15 L/min that the tubing compliance held, so many
  > efforts never reached the trigger volume (PS: 24 of 40 triggered) or reached it late (~0.37 s
  > into a ~0.46 s effort). During CPR, compressions also pumped the lungs empty through that exit,
  > so rescue breaths reached only about half the set PIP. With the demand valve, PS triggers 34
  > of 38 efforts at ~0.15–0.2 s, and synchronized PC goes from 10 to 28 triggered breaths/min.

### Pressure response (`_respond`)

With `pres_response_tau > 0`, the pressure target of `pressure_control` (the PEEP to PIP ramp, and
PEEP in expiration) and the CPAP level pass through a first-order filter before the demand servo
and the PEEP reservoir see them:

`f += (target − f) · min(1, dt / τ)`

A real ventilator's valves or jets and its pressure loop have a finite speed, and its sensor sits
at the Y-piece. Without the filter the circuit tracks the target within a step, and the PV loop
comes out as a sharp-cornered box. VC and HFO do not use it; they reset the filter state. See
[Sle6000](./Sle6000.md) for the 12 ms value and its calibration.

### `_pressure_servo(target)` (demand valve)

Meters fresh gas into the circuit so `VENT_GASCIRCUIT` follows `target` (mmHg above atmospheric):

```
q = clamp( q_out + gain · (target − P_circuit) / (E_circuit · dt) ,  0 , insp_flow/60 )
r_for(VENT_INSP_VALVE) = (VENT_GASIN.pres − P_circuit) / q        (no_flow when q ≈ 0)
```

`q_out` is what left the circuit last step (ET tube, plus the expiratory valve when it is open), so
the valve feeds the patient's demand forward and only corrects the residual pressure error.
`gain` (`_servo_gain`) is 0.8. A lower gain lags the target, which made the adult circuit
oscillate; at 1.0 PS starts to dither. The source sits about 400 mmHg above the circuit, so the
valve is close to an ideal flow source, and the one-step-old circuit pressure the Ventilator sees
(it steps before its components) is good enough. The valve never sucks gas back (`q ≥ 0`), and it
is capped at `insp_flow`. A flow-limited breath (small `insp_flow`, large lung) therefore ramps
instead of squaring, and may not reach PIP within `insp_time`.

This replaced an open–shut valve: fixed `r_for` from `insp_flow`, shut whenever the circuit
exceeded PIP. That valve chattered around PIP, with 80–700 pressure reversals per breath, and
CPAP dipped during spontaneous inspiration. Now there are about 2 reversals per breath in the
pressure modes, and CPAP holds its level.

### `volume_control` (VC)

Volume control delivers a roughly **constant inspiratory flow** by re-solving the inspiratory valve
resistance every step — `r_for = (VENT_GASIN.pres − VENT_GASCIRCUIT.pres) / (insp_flow/60)` pins the
flow near the target while the lung fills — until the delivered volume reaches `_vc_vol_target`, then
holds (the inspiratory pause, in `time_cycling`) and cycles to expiration. `pip_cmh2o_max` acts as a
pressure pop-off (shut the valve if the circuit exceeds it). Expiration mirrors `pressure_control`
(including the PEEP demand valve).
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

### `simv_cycling` (SIMV)

The mandatory rate divides time into windows of `60/vent_rate`. Each window opens with an **assist
window**: the first patient trigger gets a synchronised mandatory breath (PIP, `insp_time`) and
closes the assist window until the next window starts. Without a trigger by the **mandatory breath
point** (`window − insp_time`) a mandatory breath is delivered, so it completes inside its window.
Later triggers in the same window are spontaneous breaths: with `ps_cmh2o > 0` they get pressure
support (`peep + ps_cmh2o`, flow-cycled at `term_sens_perc`, Ti max `insp_time`), otherwise the
patient breathes unsupported on PEEP.

- The support pressure never exceeds the mandatory pressure. With volume guarantee that is the
  working pressure, so the support can't out-ventilate the volume target.
- Volume guarantee trims the working pressure on mandatory breaths only.
- Unsupported spontaneous breaths are not closed out as breaths. Their exhaled volume adds to the
  Vte of the next mandatory breath, as the expired volume of a whole window. With volume guarantee
  and no support this under-trims the mandatory pressure.

### `cpap_cycling` (CPAP with apnoea backup)

`cpap_control()` runs unless a backup or manual breath is due. With `backup_rate > 0`, an apnoea
timer runs from the start of the last breath and restarts on every spontaneous effort
(`Breathing.ncc_insp === 1`). When it passes `60/backup_rate`, or when a manual breath is due
(`trigger_breath`), a time-cycled breath is delivered at `pip_cmh2o` for `insp_time` through
`pressure_control()`, after which CPAP resumes. A backup rate of 30 during apnoea gives 30 breaths
per minute.

### `cpap_control` (CPAP / PS coupling to spontaneous breathing)

CPAP holds the circuit at the CPAP level (= `peep_cmh2o`) and lets the patient breathe spontaneously
through the ET tube — **both valves stay open**. The inspiratory valve is the pressure servo, with
the CPAP level as its target, so it delivers the patient's inspiratory demand (up to `insp_flow`)
instead of letting the pressure dip. The expiratory reservoir is pinned, so the circuit floats at
CPAP. Tidal volumes are accumulated from ET-tube flow and closed out at each spontaneous inspiration
start (`Breathing.ncc_insp === 1`), where `tv_kg` and `p_peak` (peak circuit pressure over that
spontaneous breath) are latched too; `minute_volume = exp_tidal_volume · Breathing.resp_rate`.

> CPAP only ventilates a *spontaneously breathing* patient: with `Breathing` disabled it holds the
> pressure but delivers no tidal volume, as in reality. This is the half of the
> **CPAP/PS-via-ET-tube** coupling owned by the ventilator; the other half lives in `Breathing` (see
> below).

### `pressure_regulated_volume_control` (PRVC and volume guarantee)

PRVC and volume guarantee (`PC`/`PS` with `volume_guarantee`) share one breath-to-breath controller.
It runs at every breath start, on the breath just completed, after `calc_measured_mechanics`:

```
err  = tidal_volume − exp_tidal_volume                       (no change if |err| ≤ _tv_tolerance, 0.5 mL)
step = clamp( _vt_gain · err / compliance_dynamic , ±_vt_max_step )     _vt_gain 0.5, ±3 cmH₂O/breath
_pip_working = clamp( _pip_working + step , peep_cmh2o + 2 , pip_cmh2o_max )
```

`_pip_working` is the inspiratory pressure target in these modes (`pip_delivered`). It starts from
the set pressure (`pip_cmh2o`, or `peep + ps_cmh2o` in PS) whenever the mode changes or
`set_volume_guarantee` is called. **The user's `pip_cmh2o` is never written.** The old PRVC moved
`pip_cmh2o` itself by a fixed ±1 cmH₂O, which limit-cycled between two pressures whenever 1 cmH₂O
moved Vt by more than the tolerance (neonatal PRVC 15 mL alternated between PIP 8 and 9).

**Volume guarantee** also ends a breath early once it has delivered 130 % of the target
(`_vg_vt_limit`). This is the volutrauma guard of clinical VG for a sudden compliance rise: it caps
the breath, and the controller then trims the pressure down. `pressure_limited` flags when the limit
keeps Vt below target. With a spontaneously breathing patient in PS + VG, the controller withdraws
support (down to PEEP + 2) as the patient's own effort takes over the volume.

Verified (`term_neonate` unless noted):
- PC + VG 15 mL converges to 15.3 mL at 8.6 cmH₂O.
- preterm 28 wk VG 5 mL converges to 5.3 mL at 7.3 cmH₂O.
- adult VG 450 mL converges to 451 mL at 13.6 cmH₂O.
- Lung made twice as stiff mid-run: Vt 9.7 recovers to 14.6 mL within about 5 breaths.
- Lung made twice as soft: Vt is capped at about 19.5 mL (130 %) while the pressure is trimmed
  down.

### `triggering` (`PS`, `SIMV`, and synchronized time-cycled modes)

**Flow trigger** (`trigger_mode = "flow"`, `flow_triggering()`): inspiratory flow at the tube above
`trigger_flow` (L/min) during expiration forces the breath, as a ventilator with a proximal flow
sensor does. It is armed once the minimal expiratory time (`_min_exp_time`) has passed, so the end
of the previous breath cannot re-trigger. With the 0.6 L/min default it triggers every effort on
`term_neonate` and `adult_female` in PS (`validate:resp`, case `flowtrig`). A 28-week preterm's
efforts peak at ~0.5 L/min through the tube on PS, so they need a lower threshold; see the
suite's known failures.

**Volume trigger** (`trigger_mode = "volume"`, the default) sets `trigger_volume = (tidal_volume/100)·trigger_volume_perc`. When `Breathing.ncc_insp === 1` (the
onset of a patient effort) and the trigger is not blocked, it arms `_trigger_start` with a zeroed
`_trigger_volume_counter` and integrates **inspiratory** ET-tube flow only (`max(flow, 0)`), so the
expiratory tail of the previous breath cannot cancel the effort. It disarms (counter back to 0) when
the patient's inspiration ends or a ventilator inspiration starts, so a missed effort never carries
over into the next. Once the integrated volume exceeds `trigger_volume` it forces the breath
(`_exp_time_counter = exp_time + 0.1`) and sets `triggered_breath = true`: at most one trigger per
effort.

Some efforts are still missed or triggered late, roughly 1 in 10 in PS on `term_neonate`. These all
start early in the ventilator's expiration, while the patient is still exhaling the previous
supported breath: the effort first has to stop the expiratory flow before any inspiratory flow
counts. This is the ineffective/delayed triggering seen clinically at high respiratory rates, and it
is kept on purpose. `scripts/probe_ventilator_trigger.mjs` counts efforts, blocked efforts,
triggered and backup breaths per minute.

## High-frequency oscillation (`hfov_control`)

`HFOV` replaces breath cycling with an oscillation of the circuit pressure around a mean.

- **Waveform.** The target is `MAP + w(t)`. `w` is a positive half-sine of amplitude `A·(1 − fi)`
  for the first `fi` of the cycle, then a negative half-sine of amplitude `A·fi` for the rest.
  The mean is therefore exactly MAP at any I:E, and the peak-to-peak is exactly `A`.
- **Active expiration.** `_bidirectional_servo` computes the net flow the circuit needs: the
  ET-tube flow plus the proportional pressure correction (gain 0.8, as `_pressure_servo`). A
  positive need is pushed in by the inspiratory valve. A negative need is pulled out through the
  expiratory valve, into `VENT_GASOUT` pinned 10 cmH₂O below the trough (the piston's pull). The
  bias flow runs through both valves on top, so the net is unchanged.
- **Read-outs, per cycle at the tube:**
  - `hfo_tidal_volume` (also `insp_/exp_tidal_volume` and `tv_kg`)
  - `hfo_dco2 = f·Vt²` (mL²/s)
  - `hfo_map_meas` and `hfo_amplitude_meas`
  - `p_peak`, `pip_delivered`, and `minute_volume = Vt·f·60`
- **Not applicable.** There is no triggering and no breath counters in HFOV. The leak (also
  `leak_perc`, per cycle) and the tube dead space still apply.
- **Volume targeting** (`hfo_volume_guarantee`, `set_hfo_volume_guarantee`).
  - Expired volumes vary a lot cycle by cycle. So the working amplitude is trimmed on the
    **average** expired volume of each 0.5 s block, not on every cycle.
  - Vt rises roughly in proportion to the amplitude, so each block corrects half of the gap to
    `amplitude · target / Vte`, by at most 3 cmH₂O.
  - The working amplitude stays within 4 cmH₂O and `hfo_amplitude_max_cmh2o`; `pressure_limited`
    flags a target that the limit stops.
  - The set `hfo_amplitude_cmh2o` is never changed, so switching targeting off returns to it.
  - On preterm_28wk, targeting converges in about 5 s.
- **Sighs and oscillation pause** (HFOV only).
  - `hfo_sigh()` stops the oscillation and holds the circuit at `hfo_sigh_cmh2o` for
    `hfo_sigh_time`. `hfo_sigh_rate` repeats this automatically.
  - `hfo_pause()` holds the circuit at MAP for up to 60 s; a second call cancels it.
  - During a hold the per-cycle measurements are suspended, and the oscillation restarts at the
    beginning of a cycle.
- **HFOV_CMV** (`set_hfov_cmv`). The base level is a time-cycled breath instead of MAP: PIP for
  `insp_time` (reached over `rise_time`), PEEP for the rest of `60/vent_rate`.
  - The oscillation is added in both phases, or only in expiration with `hfo_activity = "exp"`.
  - The breath keeps the usual bookkeeping:
    - the `ncc_insp` / `ncc_exp` counters (Monitor)
    - `rr_meas`
    - `ti_meas` / `te_meas`
    - the per-breath `map_meas`
  - `trigger_breath()` gives an early breath.
  - The per-cycle HFO read-outs run as in HFOV.
- **Stepsize.** 0.5 ms gives ≥ 130 steps per cycle up to 15 Hz.

**CO₂ clearance comes from the airway, not the device.** It relies on the series dead space with
axial dispersion ([GasCapacitance → Series dead space](./GasCapacitance.md#series-dead-space)). With
the old well-mixed dead space, PaCO₂ sat at 10–14 mmHg at any frequency. Now, on preterm_28wk with a
2.5 mm ETT, `PaCO₂·DCO₂` stays constant within about ±8 % over 8–15 Hz × amplitude 15–30. That is
the clinical relationship: CO₂ elimination ∝ f·Vt², so **raising the frequency reduces CO₂
clearance** (smaller Vt), and raising the amplitude increases it. The pressure swing is damped from
the circuit to the trachea and the alveoli. Oxygenation follows MAP through lung volume and
recruitment. `scripts/probe_hfov.mjs` prints all of these.

Limitations:
- The ET tube is resistive only. At 10–15 Hz, inertance adds about ωI ≈ 2 cmH₂O/(L/s) to a
  neonatal tube; this is neglected.
- Absolute PaCO₂ inherits the scenario's lung calibration (see the dead-space follow-up note).

## ET-tube dead space (`_set_tube_dead_space`)

While the ventilator is on, it sets the dead-space compartment's `tube_volume` to the lumen volume
`π·(d/2)²·L` and its `tube_port_model` to `VENT_GASCIRCUIT`. With series dead space on (the default,
see [GasCapacitance → Series dead space](./GasCapacitance.md#series-dead-space)), gas to and from
the circuit then passes through that rigid lumen, so a longer or wider tube adds dead space. On
preterm_28wk, a 2.5 mm tube at 200 mm instead of 110 mm (+0.44 mL) raises PaCO₂ 81 → 91. The leak
and the natural airway bypass the lumen. Switching the ventilator off sets `tube_volume` back to 0.

## Expiratory valve

`VENT_EXP_VALVE` stands for the expiratory limb and valve. `calc_exp_valve_resistance()` sets its
`r_for` whenever the valve opens (PC/PRVC/VC/PS expiration and CPAP). With `exp_valve_resistance = 0`
(auto) it follows the circuit that goes with the tube size:

| ET tube | circuit | r_for (mmHg·s/L) | ≈ cmH₂O/(L/s) |
|---|---|---|---|
| < 4.5 mm | neonatal | 10 | 14 |
| 4.5–6 mm | paediatric | 4 | 5 |
| ≥ 6 mm | adult | 2 | 3 |

ISO 80601-2-12 caps the expiratory pressure drop at 6 cmH₂O at 5, 30 and 60 L/min for the three
circuit classes; real circuits sit well below that. A positive `exp_valve_resistance` overrides the
auto value. The result is kept above the explicit-integration floor `dt · (E_circuit + E_reservoir)`,
like the ET tube.

> Before 2026-10 the valve was fixed at 10 mmHg·s/L for every patient. For an adult that is about
> 14 cmH₂O/(L/s): on CPAP 0.5 the circuit rose to ~3.3 cmH₂O in every exhalation, breaths stacked
> and PaCO₂ rose (`validate_respiratory`, `adult.cpap.paco2_delta`).

## Tube leak (`calc_leak`)

The leak models gas escaping around an uncuffed tube, from the trachea (`DS`) up through the larynx
to the mouth (`MOUTH`, the scenario's atmospheric reservoir). It is its own resistor, `VENT_LEAK`,
and it does not borrow `MOUTH_DS`, because `Respiration` (upper-airway resistance factor) and `Apnea`
(obstructive occlusion) already drive that one. `init_model` adds the `VENT_LEAK` definition to the
ventilator's components when a scenario or saved state does not declare it, so every scenario
supports a leak without being edited.

Its resistance uses the ET tube's Rohrer form for a short channel of diameter `leak_size` (length
20 mm), with the same numerical floor:

```
R_leak = (K1(leak_size) + K2(leak_size)·|V̇_leak|) · 20/110          (K1 ∝ d⁻⁴, K2 ∝ d⁻⁴·⁷⁵, as the ET tube)
```

The leak therefore grows with airway pressure: it is largest at PIP, and smaller but continuous at
PEEP. Because conductance scales with d⁴, the useful range is narrow:

| leak_size | term_neonate PC 20/5 (3.5 mm tube) | adult_female PC 20/5 (7.5 mm tube) |
|---|---|---|
| 0.5 mm | 7 % | — |
| 0.75 mm | 23 % | — |
| 1.0 mm | 45 % | 14 % |
| 1.25 mm | 65 % | — |
| 2.0 mm | ~100 % | 57 % |
| 3.0 mm | — | 88 % |

`leak_perc` is measured the way a ventilator reports it, at the tube flow sensor:
`(Vti − Vte)/Vti` per breath. It is computed at each breath start, and in CPAP at each spontaneous
breath. Behaviour that comes out of the model (`scripts/probe_ventilator_leak.mjs`):

- **PC/PS compensate.** The pressure servo makes up the leaked gas, so the lung Vt barely drops.
  Vti rises and Vte falls. With term_neonate PC 20/5 at 1 mm: Vti 61, Vte 34, lung 48.5 mL.
- **Volume guarantee over-delivers.** It regulates on Vte, so once the leak passes ~30 % it drives
  the pressure to its limit. The lung then gets *more* than the target (18 mL against 15), bounded
  only by the 130 % inspired-volume guard. This is the clinical reason VG is unreliable with large
  leaks.
- **PS cycles on Ti max without leak compensation.** The circuit feeds the leak at the
  inspiratory pressure, so the inspiratory flow levels off at the leak flow and never decays to
  `term_sens_perc` of peak. With leak compensation it cycles on flow again (see *Leak and flow
  cycling* below).
- **Dead-space flush.** The continuous leak flow through `DS` washes out CO₂, which lowers PaCO₂
  a little, much like tracheal gas insufflation.
- **VC is not compensated.** Leaked gas is lost from the set volume.

### Leak and the flow trigger (leak compensation)

During expiration the circuit keeps resupplying the leak through the tube to hold PEEP, so the tube
flow sensor reads a steady *inspiratory* flow equal to the leak flow at PEEP. Uncompensated, that
flow crosses `trigger_flow` and every breath auto-triggers once the minimal expiratory time has
passed: term_neonate in SLE PTV 15/4/30, apnoeic, with a 1 mm leak was cycled at 58/min.

Neonatal ventilators compensate for this, and so does the model. It learns the leak the way the
device can, from its own sensor only (it never reads `VENT_LEAK`): over a whole breath the lung
returns to its start volume, so the breath's net volume through the sensor is the leaked volume.
With the orifice law Q = g·√P (P the circuit pressure),

```
g_breath = max(∫ flow dt, 0) / ∫ √P dt        (per breath, at the breath start)
g        ← g + (g_breath − g)/3                 (filtered over ~3 breaths)
trigger:   flow − g·√P  >  trigger_flow          (leak_flow_comp = g·√P, in L/min)
```

The first breaths after a leak appears are uncompensated while `g` builds up. Compensation applies
only while the 3-breath mean of `leak_perc` is at most `leak_comp_max_perc`; above it the leak
auto-triggers again, as on a device whose compensation range is exceeded. Results with the
SLE6000 (limit 35 %), PTV 15/4/30, `scripts/probe_sle6000.mjs` section 14:

| leak_size | Leak % | apnoeic: triggered / mandatory per 30 s | breathing: triggers per effort |
|---|---|---|---|
| 0 | 0 | 0 / 15 | 1.0 |
| 0.7 mm | 20 | 0 / 15 | 1.0 |
| 0.8 mm | 27 | 0 / 15 | 1.0 |
| 0.9 mm | 36 | 22 / 0 (auto-triggering) | — |
| 1.5 mm | 80 | 43 / 0 (auto-triggering) | — |

The volume trigger (`trigger_mode "volume"`) needs no compensation: it only arms on a `Breathing`
effort, so a leak alone never starts a breath. Not modelled: leak-corrected volumes.

### Leak and flow cycling

A flow-cycled breath (`PS`, and supported breaths in `SIMV`) ends when the inspiratory flow falls
to `term_sens_perc` of its peak. With a leak the flow levels off at the leak flow at the
inspiratory pressure instead. Once that is above the termination level, every breath runs to Ti
max: with SLE PSV 15/4 (Ti Max 0.6 s, Term Sens 5 %) that is every breath from about 0.7 mm
(20 % leak).

With leak compensation, `_term_flow()` takes the learned leak flow `q = g·√P` off first:

```
end of breath:   flow − q  <  term_sens · (peak − q)
```

The breath ends when the patient's own flow has decayed to Term Sens of its peak, just above the
leak flow level. The SLE6000 IFU (§20.6.4) says a termination level below the leak flow is
"terminated at the leak flow level". The flow approaches that level from above and never crosses
it, and the learned leak is about 10 % low at PIP (it is fitted over the whole breath). Ending at
exactly the leak flow therefore still ran to Ti max, and the form above is used instead.

As on the device:
- `q` is capped at half the peak flow and at `leak_term_max_flow`;
- it is applied only while the leak is within `leak_term_min_perc`–`leak_term_max_perc`.

Results with the SLE6000 (5 l/min, 10–50 %), `probe_sle6000.mjs` section 15:

| PSV 15/4, Ti Max 0.6 s | Leak % | breaths ending on Ti Max |
|---|---|---|
| 0.8 mm, compensation off | 28 | all |
| 0.8 mm | 28 | none (mean Ti 0.58 s) |
| 1.2 mm | 64 | all (above 50 %) |

`Breathing` subtracts the leak flow from the airway-opening flow (see below), because gas that
escapes around the tube never reaches the lungs.

## Coupling to `Breathing`

`Breathing` measures its tidal volume at the lungs (see [Breathing](./Breathing.md)), so it does not
depend on the airway route: natural airway, ET tube or a tube leak. The Ventilator reads the
spontaneous phase from `Breathing`: the patient trigger arms on `ncc_insp === 1` and disarms when
`insp_running` ends, and CPAP closes out a spontaneous breath on `ncc_insp === 1`.

## ET-tube resistance (`calc_ettube_resistance`)

```
R  = (K1 + K2·|V̇|) · (ettube_length / 110)      V̇ = ET-tube flow (L/s), R in mmHg·s/L
K1 = 16.92 · (2.5/d)^4       mmHg·s/L         laminar (Poiseuille) term
K2 = 513.7 · (2.5/d)^4.75    mmHg·s²/L²       turbulent (Blasius) term   (d = ettube_diameter)
```

The pressure drop is the Rohrer form `ΔP = K1·V̇ + K2·V̇²`. It is anchored on in-vitro data for a
2.5 mm tube (81 and 139 cmH₂O/(L/s) at 5 and 10 L/min) and scaled to other diameters with the
physical exponents. It reproduces the adult literature (an 8 mm, 27 cm tube ≈ 7 cmH₂O/(L/s) at 1 L/s)
without a separate fit. With `|V̇|` the tube is symmetric: the previous linear fit used the
*signed* flow (so expiration always sat at its floor) and went negative above ~4.6 mm.

Effective values at 5 L/min, 110 mm: 2.5 mm ≈ 81, 3.0 mm ≈ 36, 3.5 mm ≈ 18, 4.0 mm ≈ 10
cmH₂O/(L/s). Measured data show smaller-than-Poiseuille differences between 3.0 and 4.0 mm
(connector losses), so the 3.5–4.0 mm values are on the low side.

The only floor is numerical: the tube flow is integrated explicitly, so `R` is kept at or above
`dt·(E_circuit + E_airway)`. Without that floor the circuit and the airway could equilibrate within
one step, and the pressure would oscillate. Only large adult tubes at low flow reach it. `R` is
written onto `VENT_ETTUBE.r_for` / `r_back` each step. `set_ettube_diameter` requires `d > 1.5`;
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
| `set_psv(pip, peep, rate, t_in, insp_flow)` | Configure PS mode (`pip` absolute → `ps_cmh2o = pip − peep`; `rate` = backup rate; `t_in` = backup Ti and Ti max) |
| `set_hfov(map, amplitude, freq, insp_fraction, bias_flow)` | Configure HFOV (cmH₂O, cmH₂O peak-to-peak, Hz, fraction, L/min) |
| `set_hfo_volume_guarantee(state, vt, amp_max)` | HFOV volume targeting on/off; optional target `vt` (mL, expired per oscillation) and amplitude limit (cmH₂O); restarts the working amplitude |
| `set_hfo_sigh(rate, t, pres)` / `hfo_sigh()` / `hfo_pause(state)` | Automatic HFOV sighs (/min, s, cmH₂O); one sigh now; oscillation pause at MAP (60 s, toggles) |
| `set_hfov_cmv(pip, peep, rate, t_in, amplitude, freq, activity, bias_flow)` | CMV breaths with HFO superimposed (`activity` `both` or `exp`) |
| `set_simv(pip, peep, rate, t_in, ps, insp_flow)` | Configure SIMV: mandatory breaths at `pip`/`rate`/`t_in`, spontaneous breaths supported by `ps` above PEEP (0 = unsupported) |
| `set_volume_guarantee(state, tv, pip_max)` | Volume guarantee on/off for PC/PS/SIMV; optional target `tv` (mL) and pressure limit `pip_max` (cmH₂O); restarts the working pressure |
| `set_cpap(cpap, insp_flow, backup_rate)` | Configure CPAP (`cpap` → `peep_cmh2o`; optional apnoea `backup_rate`, /min, 0 = off) |
| `set_pause(seconds)` | Set the end-inspiratory hold for any time-cycled mode (clamped `< insp_time`) |
| `set_fio2(new_fio2)` | Re-derive fresh-gas composition (a fraction ≤ 1, or a percentage > 1) |
| `set_humidity(new_humidity)` / `set_temp(new_temp)` | Re-derive fresh-gas composition (both `VENT_GASIN` and `VENT_GASCIRCUIT`), and push the new humidity / temperature onto those compartments — see note below |
| `set_ettube_diameter(d)` / `set_ettube_length(l)` | Update tube geometry → resistance |
| `trigger_breath()` | Manual breath: ignored during inspiration, otherwise delivered after the minimal expiratory time (all modes except CPAP) |

> **Why the setters write to the gas compartments directly.** `humidity` and `target_temp` are live
> targets that [`GasCapacitance`](./GasCapacitance.md) relaxes toward on every step. Setting only the
> Ventilator's own `temp`/`humidity` and recomputing the composition is not enough — the compartment
> keeps its old targets and is dragged straight back. `set_temp` therefore also sets
> `VENT_GASIN.temp`/`target_temp` and `VENT_GASCIRCUIT.target_temp`, and `set_humidity` sets
> `humidity` on both. Note that `VENT_GASIN` is `fixed_composition`, so `add_heat`/`add_watervapour`
> skip it entirely and it holds whatever it is given.
>
> **Humidifier at start-up.** `Gas.init_model` runs *after* the Ventilator and resets every gas
> compartment to the ambient temperature. `_apply_humidifier()` (temp, target_temp and humidity on
> `VENT_GASIN`/`VENT_GASCIRCUIT`, then their composition) therefore runs on the ventilator's first
> step and on every `switch_ventilator(true)`. Before this fix the circuit sat at the scenario's
> 20 °C instead of 37 °C.

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
- The [`Breathing`](./Breathing.md) model measures its tidal volume at the lungs, so spontaneous
  tidal-volume feedback continues during CPAP/PS whatever the airway route (see "Coupling to
  `Breathing`").

## Notes & caveats

- **`compliance`/`resistance` are measured per breath** at end-expiration (in
  `calc_measured_mechanics`), not recomputed every step. `compliance` mirrors `compliance_dynamic`
  (mL/cmH₂O). Static compliance and airway resistance (cmH₂O/(L/s)) require an inspiratory pause
  (`insp_pause > 0`); without one, `compliance_static = 0` and `resistance = null`.
- **`resistance` may be `null`** whenever no plateau was measured — downstream displays must tolerate
  a null.
- **Re-enabling is clean.** `switch_ventilator` calls `_reset_state()`, zeroing the internal cycle
  counters/flags so a re-enabled ventilator starts a fresh breath rather than resuming mid-cycle.
- **`trigger_breath()` takes no arguments.** It is ignored during inspiration (it used to restart
  the running breath) and works in `PS` too (it used to do nothing there).
- **`set_fio2` percent/fraction rule**: values ≤ 1 are treated as a fraction, values > 1 as a
  percentage (so `20` → 0.20, `45` → 0.45).
- **VC delivered volume is servo-trimmed.** `volume_control_servo` converges `exp_tidal_volume` on the
  set `tidal_volume` across circuits/flows; a too-low `insp_flow` still flow-limits and undershoots.
- **External-model references are null-safe.** `DS` (et/CO₂), `MOUTH_DS` (mouth blocking) and the
  `Breathing` model (trigger) are guarded with `?.`; the `VENT_*` sub-models are the ventilator's own
  components and are assumed present after build.
- **`exp_time` is floored at `_min_exp_time` (0.1 s)** — `60/vent_rate − insp_time` can no longer go
  negative at very high rates / long `insp_time`, so the cycler cannot jam into continuous inspiration.
