# Ecls

The `Ecls` device model simulates an **extracorporeal life support** (ECMO/ECLS) circuit: blood is
drained from a patient compartment, pumped through a membrane oxygenator and returned to the patient.
It is a **coordinator** — it owns the circuit sub-models (drainage cannula, inflow tubing, pump,
oxygenator, outflow tubing, return cannula, plus a sweep-gas side) and, each update tick, drives their
resistances, enabled/clamped states, pump pressure and gas-exchange constants, then reads back
smoothed pressures, flow and blood gases.

## Inheritance

```
BaseModelClass
  └── Ecls   (ECLS/ECMO circuit coordinator)
```

`Ecls` extends `BaseModelClass` directly. Like the [`Ventilator`](./Ventilator.md), it is a composite
whose circuit sub-models (`ECLS_*`) are declared under `components`, instantiated into `model.models`
at build, and reached by name; `Ecls` itself contributes no compartment physics, only control.

## What it models

- A drainage → pump → oxygenator → return blood circuit wired into two named patient compartments
  (`drainage_site`, `return_site`).
- A selectable cannula library (real Bio-Medicus / Medtronic Crescent devices) that sets cannula
  geometry and resistance.
- Centrifugal or roller pump drive, applied as an external pressure across the pump or oxygenator.
- A sweep-gas side feeding the oxygenator's gas exchanger, with adjustable FiO₂/FiCO₂ and diffusion
  constants.
- Smoothed, near-real-time pressure and flow read-outs via four
  [`RealTimeMovingAverage`](./RealTimeMovingAverage.md) filters, plus once-per-second blood-gas
  read-outs (venous and post-oxygenator).

## Circuit topology

```
patient(drainage_site) ─[ECLS_DRAINAGE]─► ECLS_TUBING_IN ─► ECLS_PUMP ─► ECLS_OXY ─► ECLS_TUBING_OUT ─[ECLS_RETURN]─► patient(return_site)
                                                                            │
                                                              [ECLS_GASEX: GasExchanger]
                                                                            │
                  ECLS_GAS_SOURCE ─[ECLS_GAS_INSP_VALVE]─► ECLS_GAS_OXY ─[ECLS_GAS_EXP_VALVE]─► ECLS_GAS_OUT   (sweep gas)
```

| Sub-model | Type | Role |
|---|---|---|
| `ECLS_DRAINAGE` | Resistor | Drainage cannula (`drainage_site → ECLS_TUBING_IN`) |
| `ECLS_TUBING_IN` | BloodCapacitance | Inflow tubing; its pressure is reported as `p_ven` |
| `ECLS_PUMP` | BloodVessel | Pump; its pressure is reported as `p_int`; centrifugal drive sets `p2_ext` |
| `ECLS_OXY` | BloodVessel | Membrane oxygenator; blood side of the gas exchanger; roller drive sets `p1_ext` |
| `ECLS_TUBING_OUT` | BloodCapacitance/BloodVessel | Outflow tubing; its pressure is reported as `p_art` |
| `ECLS_RETURN` | Resistor | Return cannula (`ECLS_TUBING_OUT → return_site`); its flow ×60 is `flow` |
| `ECLS_GAS_SOURCE` | GasCapacitance | Sweep-gas source (composition from `gas_fio2`/`gas_fico2`/…) |
| `ECLS_GAS_INSP_VALVE` | Resistor | Sweep-gas inlet valve; resistance sized each update so sweep flow tracks `gas_flow` |
| `ECLS_GAS_OXY` | GasCapacitance | Gas side of the oxygenator |
| `ECLS_GAS_EXP_VALVE` | Resistor | Sweep-gas outlet valve (`ECLS_GAS_OXY → ECLS_GAS_OUT`); enabled with the circuit, back-flow blocked |
| `ECLS_GAS_OUT` | GasCapacitance | Sweep-gas outlet |
| `ECLS_GASEX` | GasExchanger | O₂/CO₂ exchange between `ECLS_OXY` (blood) and `ECLS_GAS_OXY` (gas) |

Sub-model references (`_ecls_drainage`, `_ecls_pump`, …, `_ecls_gasex`) are resolved **lazily** inside
`calc_model` (each tick while running) rather than in an `init_model`.

## Properties

### Configuration (independent)

| Property | Unit | Description |
|---|---|---|
| `ecls_running` | bool | Master on/off for the circuit |
| `ecls_clamped` | bool | Clamp the blood path (`no_flow` on every blood sub-model; disables the gas exchanger) |
| `drainage_site` | string | Patient compartment the drainage cannula drains (default `RA`) |
| `return_site` | string | Patient compartment the return cannula feeds (default `AAR`) |
| `drainage_cannula_type` | string | Key into `drainage_cannulas` (default `Bio-Medicus venous 12 Fr`) |
| `return_cannula_type` | string | Key into `return_cannulas` (default `Bio-Medicus arterial 10 Fr`) |
| `drainage_res_factor` | × | Multiplier on drainage-cannula resistance (default 1.0) |
| `return_res_factor` | × | Multiplier on return-cannula resistance |
| `tubing_res_factor` | × | Multiplier on both tubing resistances |
| `pump_res_factor` | × | Multiplier on pump resistance |
| `oxy_res_factor` | × | Multiplier on oxygenator resistance |
| `oxy_res_for` / `oxy_res_back` | mmHg/(L/s) | Oxygenator resistance (default 1500/1500) |
| `oxy_vol` | L | Oxygenator volume (default 0.09) |
| `pump_res_for` / `pump_res_back` | mmHg/(L/s) | Pump resistance (default 50/50) |
| `pump_vol` | L | Pump volume (default 0.031) |
| `pump_rpm` | rpm | Pump speed — the primary control (default 1500) |
| `pump_type` | string | Key into `pumps` (default `Abbott PediMag`); selecting it copies the H-Q/roller coefficients and sets `pump_mode` |
| `pump_mode` | 0/1 | 0 = centrifugal (drives the pump), 1 = roller (drives the oxygenator); set from the selected pump's `type` |
| `pump_hq_a` / `pump_hq_b` / `pump_hq_c` | — | Centrifugal head-flow coefficients (mmHg per krpm², per krpm·(L/min), per (L/min)²) |
| `roller_ml_per_rev` / `roller_kp` / `roller_drive_max` | mL/rev, —, mmHg | Roller flow-source stroke volume, controller gain, drive clamp |
| `pumps` | dict | Pump device library (H-Q coefficients / roller params, `type`, `max_rpm`, `prime` per device) |
| `gas_flow` | L/min | Sweep-gas flow (default 0.5) |
| `gas_fio2` | fraction | Sweep-gas FiO₂ (default 0.205) |
| `gas_fico2` | fraction | Sweep-gas FiCO₂ (default 0.000392) |
| `gas_humidity` | fraction | Sweep-gas humidity (default 0.5) |
| `gas_temp` | °C | Sweep-gas temperature (default 20) |
| `blood_temp_active` | bool | Blood-side **heater-cooler** on/off (default `false` = neutral; `ECLS_OXY` behaves like any blood compartment) |
| `blood_temp` | °C | Heater-cooler target blood temperature at the oxygenator (default 37); e.g. 33.5 for therapeutic hypothermia |
| `blood_temp_tc` | s | Heat-exchanger equilibration time constant (default 2.0, fast) |
| `dif_o2` | mmol/(mmHg·s) | Gas-exchanger O₂ diffusion constant (default 0.0005) |
| `dif_co2` | mmol/(mmHg·s) | Gas-exchanger CO₂ diffusion constant (default 0.001) |
| `oxygenator_type` | string | Key into `oxygenators` (default `Getinge Quadrox-i Neonatal`); copies the membrane transfer caps |
| `oxy_o2_cap` / `oxy_co2_cap` | mmol/s | Active O₂/CO₂ membrane transfer ceilings, pushed onto `ECLS_GASEX` |
| `oxy_surface_area` / `oxy_rated_flow` | m², L/min | Selected oxygenator's surface area / rated blood flow (informational) |
| `oxygenators` | dict | Oxygenator device library (surface area, rated flow, `o2_cap`/`co2_cap`, prime per device) |
| `drainage_cannula_diameter` / `_length` | m | Drainage cannula geometry (copied from the selected library entry) |
| `return_cannula_diameter` / `_length` | m | Return cannula geometry (copied from the selected library entry) |
| `tubing_in_diameter`/`_length`, `tubing_out_diameter`/`_length` | m | Tubing geometry |
| `cannula_sizes_single`, `cannula_size_double` | Fr | Available cannula sizes (UI metadata) |
| `return_cannulas`, `drainage_cannulas` | dict | Cannula library (inner diameter, length, resistance per device) |

### Computed (dependent) read-outs

| Property | Unit | Description |
|---|---|---|
| `p_ven` | mmHg | Filtered (moving-average) venous/inlet pressure (`ECLS_TUBING_IN.pres`) |
| `p_int` | mmHg | Filtered pressure at the pump interface (`ECLS_PUMP.pres`) |
| `p_art` | mmHg | Filtered arterial/outlet pressure (`ECLS_TUBING_OUT.pres`) |
| `flow` | L/min | Circuit blood flow (`ECLS_RETURN.flow × 60`) |
| `flow_avg` | L/min | Moving-average of `flow` |
| `pump_pressure` | mmHg | Pump drive pressure = `−head` (centrifugal H-Q) or `−`roller-controller output |
| `sat_ven_o2` | % | Venous (pre-oxygenator) O₂ saturation |
| `sat_postoxy_o2` | % | Post-oxygenator O₂ saturation |
| `pco2_postoxy` | mmHg | Post-oxygenator pCO₂ |
| `drainage_res` / `return_res` | mmHg/(L/s) | Active cannula resistances (from the selected library entry) |
| `tubing_in_res` / `tubing_out_res` | mmHg/(L/s) | Tubing resistances. `tubing_out_res` drives the `ECLS_OXY → ECLS_TUBING_OUT` resistor; `tubing_in_res` is **vestigial** — it is not applied (see calc-cycle step 5) |
| `tubing_in_vol` / `tubing_out_vol` | L | Tubing volumes |

### Internal (`_`-prefixed) and moving averages

`prev_fio2` / `prev_fico2` / `prev_gas_flow` detect sweep-gas changes so compositions/valve resistance
are only recomputed when needed. `_update_interval` (0.015 s) and `_update_counter` gate the main
control block; `_blood_comp_interval` (1.0 s) and `_blood_comp_counter` gate the blood-gas read-outs.
`pressure_avg_window` / `flow_avg_window` (default 400 samples, ≈0.9 s at the 0.015 s update rate)
size the four [`RealTimeMovingAverage`](./RealTimeMovingAverage.md) filters
(`_flow_avg_calculator`, `_p_ven_avg_calculator`, `_p_int_avg_calculator`, `_p_art_avg_calculator`).

## Cannula library

`drainage_cannulas` / `return_cannulas` are dictionaries of real devices (Bio-Medicus, Medtronic
Crescent), each with an `inner_diameter` (m), `length` (m) and measured `resistance` (mmHg/(L/s)).
Setting `drainage_cannula_type` / `return_cannula_type` copies the matching entry's geometry and
resistance into the active `*_cannula_*` / `*_res` parameters — once in the constructor, and re-checked
each tick in `calc_model`.

## Calculation cycle (`calc_model`)

**When `ecls_running` is false:** zero `flow`/`flow_avg`/`p_ven`/`p_int`/`p_art`, reset the four
moving-average filters and `_blood_comp_counter`, and **disable every circuit sub-model** so a stopped
circuit no longer conducts passive flow, then return. (Sub-model refs are only non-null once the
circuit has run.)

**When running**, every `_update_interval` (0.015 s):

1. Rebuild any moving-average filter whose window size changed (`flow_avg_window` /
   `pressure_avg_window`).
2. Resolve the `ECLS_*` sub-model references; **skip the tick** if any of the eleven required ones is
   missing (`ECLS_GAS_EXP_VALVE` is resolved too, but its use is individually guarded rather than
   gating the tick).
3. Apply `drainage_site` / `return_site` to the cannula resistors, and copy the selected cannula
   geometry/resistance from the library.
4. Sync every sub-model's `is_enabled` to `ecls_running` (including both sweep-gas valves); set
   `no_flow = ecls_clamped` on all blood sub-models; enable `ECLS_GASEX` only when **unclamped**
   (`is_enabled = !ecls_clamped`); block back-flow on `ECLS_GAS_EXP_VALVE`.
5. Push resistances onto each sub-model: drainage/return cannula, pump, oxygenator and outlet-tubing
   resistance × its `*_res_factor`. (The inlet segment's resistance is the pump's own inlet resistor;
   `tubing_in_res` is **not** applied — `ECLS_TUBING_IN` is a bare `BloodCapacitance` that owns no
   resistor, so writing `r_for` onto it would do nothing.)
6. Recompute the sweep-gas composition when `gas_fio2`/`gas_fico2` changed; size the inspiratory-valve
   resistance each update so sweep flow tracks `gas_flow` (see below).
7. Update `ECLS_GASEX.dif_o2` / `dif_co2` and the membrane transfer ceilings `o2_cap` / `co2_cap`
   (from the selected oxygenator) — the rated-flow limit.
8. **Pump drive** (see below).
9. Read raw pressures, push them through the moving-average filters into `p_ven`/`p_int`/`p_art`, set
   `flow` (= `ECLS_RETURN.flow × 60`) and `flow_avg`.
10. Once per `_blood_comp_interval` (1.0 s), recompute blood composition on the two tubing
    compartments and read out `sat_ven_o2`, `sat_postoxy_o2`, `pco2_postoxy`.

### Pump drive — head-flow (H-Q) model

The pump develops a **flow-dependent head**, not a fixed pressure. The flow input is a short EMA
(`_pump_flow_ema_tc`, ~0.3 s) of the circuit flow (`ECLS_RETURN.flow × 60`, L/min) — lagged feedback
that keeps the operating point stable without the 6 s display `flow_avg`'s sluggishness.

**Centrifugal** (`pump_mode 0`) — rotodynamic characteristic, head clamped ≥ 0:
```
head = hq_a·(rpm/1000)² − hq_b·(rpm/1000)·Q − hq_c·Q²      // mmHg, Q in L/min
pump_pressure = −head
```
Head falls as flow rises, so the operating point is **afterload/preload sensitive** — the defining
behaviour of a centrifugal pump. (At insufficient rpm the head cannot overcome arterial afterload and
the circuit can run retrograde — physiological for valveless VA ECMO.)

**Roller** (`pump_mode 1`) — positive-displacement **flow source**. An integral controller trims the
drive so circuit flow tracks the target, making flow (nearly) **independent of afterload**:
```
Q_target = roller_ml_per_rev·rpm / 1000
_roller_drive += roller_kp·(Q_target − Q)     // clamped to [0, roller_drive_max]
pump_pressure = −_roller_drive
```

The drive is applied to the driven vessel's **downstream** node (`p2_ext`) and the other vessel's
`p1_ext`/`p2_ext` are zeroed — centrifugal drives `ECLS_PUMP`, roller drives `ECLS_OXY`:
```
pump_mode 0: ECLS_PUMP.p2_ext = pump_pressure;  ECLS_OXY  p1_ext = p2_ext = 0
pump_mode 1: ECLS_OXY.p2_ext  = pump_pressure;  ECLS_PUMP p1_ext = p2_ext = 0
```
The negative downstream-node pressure over-fills that compartment from upstream and pushes the circuit
**forward**; driving `p1_ext` (the upstream node) instead would push it backward. Zeroing the other
vessel means switching `pump_mode` at runtime cannot leave a stale drive applied (the `BloodVessel`
never self-resets `p1_ext`/`p2_ext`; only its owned resistor does, each step). `head` is applied as a
single-node external pressure — a lumped approximation of the true inlet→outlet head, adequate for the
0D circuit.

### Pump device library

`this.pumps` is a dictionary of real ECLS pumps (Abbott PediMag / CentriMag, Getinge Rotaflow RF-32,
Medtronic Bio-Pump BP-50, a generic roller), each carrying its H-Q coefficients (`hq_a`/`hq_b`/`hq_c`)
or roller parameters (`ml_per_rev`/`roller_kp`/`roller_drive_max`), `type` (`centrifugal`/`roller`),
`max_rpm`, and priming volume. Setting `pump_type` copies the entry's coefficients into the active
fields and sets `pump_mode` from `type` (in the constructor, and re-applied each update when `pump_type`
changes). `pump_rpm` remains the control. Coefficients are calibrated so each pump reaches roughly its
rated flow at its rated rpm against a physiologic circuit afterload; note the **circuit** (cannula size,
venous return) sets the achievable flow ceiling, so a small patient stays preload-limited (e.g. ~0.5
L/min for a term neonate) regardless of pump rating.

### Oxygenator device library and rated-flow transfer

`this.oxygenators` is a dictionary of real membrane oxygenators (Getinge Quadrox-i Neonatal / Pediatric
/ Small Adult, Medtronic Nautilus), each carrying its membrane `surface_area` (m²), `rated_flow`
(L/min), priming volume, and — the physics-driving fields — `o2_cap` / `co2_cap`, the **membrane
transfer ceilings** in mmol/s. Setting `oxygenator_type` copies these into the active `oxy_*` fields (in
the constructor, `init_model`, and each update when the selection changes); `Ecls` then pushes
`oxy_o2_cap` / `oxy_co2_cap` onto `ECLS_GASEX.o2_cap` / `co2_cap` beside the diffusion constants.

The caps make the oxygenator **rated-flow-limited** (see [GasExchanger](./GasExchanger.md)): below the
oxygenator's rated blood flow the outlet blood fully saturates, but once circuit flow exceeds the rating
the per-step transfer is capped and post-oxygenator saturation **falls** — an undersized oxygenator (or
one run past its rating) can no longer fully oxygenate. Because only `ECLS_GASEX` gets a cap, the native
lung's `GasExchanger` instances are unaffected. The `o2_cap`/`co2_cap` values are anchored to the
Quadrox-i Neonatal datasheet (~90 mL O₂/min, ~73 mL CO₂/min at 1.5 L/min) and scaled by rated flow for
the larger devices. At a term neonate's preload-limited ~0.5 L/min the outlet stays fully saturated for
every library oxygenator (correct — all are rated well above that); the decline appears only when blood
flow exceeds the selected device's rated flow.

### Sweep-gas inlet valve

Each update the inlet-valve resistance is sized so the sweep-gas flow tracks the `gas_flow` set-point.
The gas line `ECLS_GAS_SOURCE →[R_insp]→ ECLS_GAS_OXY →[R_exp]→ ECLS_GAS_OUT` is held at fixed pressure
at both ends, so in steady state `Q = ΔP / (R_insp + R_exp)`, giving:

```
R_insp = (ECLS_GAS_SOURCE.pres − ECLS_GAS_OUT.pres) / (gas_flow / 60) − R_exp
```

where `R_exp` is the live `ECLS_GAS_EXP_VALVE` resistance (not a hard-coded constant). `R_insp` is
clamped strictly positive. When `gas_flow ≤ 0` the inlet valve is set `no_flow` (sweep off) rather than
dividing by zero.

## Factor system

`Ecls` uses **plain resistance multipliers** (`drainage_res_factor`, `return_res_factor`,
`tubing_res_factor`, `pump_res_factor`, `oxy_res_factor`), not the engine's three-tier
`*_factor` / `*_factor_ps` / `*_factor_scaling_ps` pattern. Each multiplier scales the corresponding
cannula/tubing/pump/oxygenator resistance before it is written onto the sub-model's `r_for`/`r_back`.
The underlying `ECLS_*` blood sub-models still carry their own three-tier factor layers (see
[BloodVessel](./BloodVessel.md) / [Resistor](./Resistor.md)), but `Ecls` overwrites their `r_for`
directly each tick.

## Example definition (JSON)

Device-level fields from `term_neonate.json` (the full block nests eleven `ECLS_*` sub-models under
`components`, and embeds the cannula library):

```json
{
  "name": "Ecls",
  "description": "extracorporeal life support",
  "is_enabled": true,
  "model_type": "Ecls",
  "components": { "ECLS_DRAINAGE": {}, "ECLS_TUBING_IN": {}, "ECLS_PUMP": {},
                  "ECLS_OXY": {}, "ECLS_TUBING_OUT": {}, "ECLS_RETURN": {},
                  "ECLS_GAS_SOURCE": {}, "ECLS_GAS_OXY": {}, "ECLS_GAS_OUT": {},
                  "ECLS_GAS_INSP_VALVE": {}, "ECLS_GASEX": {} },
  "ecls_running": true,
  "ecls_clamped": true,
  "drainage_site": "RASVC",
  "return_site": "AAR",
  "drainage_cannula_type": "Biomedicus venous 12 Fr",
  "return_cannula_type": "Biomedicus arterial 10 Fr",
  "drainage_res_factor": 1, "return_res_factor": 1,
  "tubing_res_factor": 1, "pump_res_factor": 1, "oxy_res_factor": 1,
  "oxy_res_for": 1500, "oxy_res_back": 1500, "oxy_vol": 0.09,
  "pump_rpm": 1500, "pump_mode": 0,
  "gas_flow": 0.5, "gas_fio2": 0.21, "gas_fico2": 0.000392,
  "gas_humidity": 0.5, "gas_temp": 20,
  "dif_o2": 0.0005, "dif_co2": 0.001,
  "pressure_avg_window": 400, "flow_avg_window": 400
}
```

Note `ecls_clamped: true` ships the circuit on but clamped — no blood flows until it is unclamped.

## Usage in the model

- Used to model VA/VV ECMO support of a patient. Set `drainage_site`/`return_site` to the patient
  compartments the cannulas are inserted into, pick cannula types, then set `ecls_running = true` and
  `ecls_clamped = false` and dial `pump_rpm` / `gas_flow` / `gas_fio2`.
- Reports `flow_avg`, `p_ven`/`p_int`/`p_art`, `sat_ven_o2`/`sat_postoxy_o2`/`pco2_postoxy` for the
  monitor.
- The blood sub-models exchange composition with the patient circuit through the named site
  compartments, so circuit O₂/CO₂ propagate back into the patient via the standard
  [BloodCapacitance](./BloodCapacitance.md) mixing.

## Notes & caveats

- **Stopping the circuit disables it.** The off-branch sets `is_enabled = false` on all sub-models
  (both sweep-gas valves included), so a stopped ECLS no longer conducts passive flow, and releases the
  heater-cooler (see below).
- **The heater-cooler releases cleanly.** Enabling `blood_temp_active` overrides `ECLS_OXY`'s own
  perfusion time constant with the fast `blood_temp_tc`; disabling it (or stopping ECLS) restores the
  compartment's original time constant and clears `temp_ext_override`, handing thermal control back to
  [`Thermoregulation`](./Thermoregulation.md) (which resumes warming `ECLS_OXY` toward core).
- **References are resolved lazily** each tick while running; a missing sub-model skips the tick rather
  than dereferencing undefined.
- **Pump logic is mirrored in `BloodPump`.** The H-Q head + roller flow-source model in this device is
  mirrored in [`BloodPump.calc_pressure`](./BloodPump.md) (kept consistent, though no scenario uses that
  standby class); `ECLS_PUMP` is a [`BloodVessel`](./BloodVessel.md) driven externally rather than a
  `BloodPump`.
- **Flow is preload/afterload limited by the *circuit*, not the pump rating.** The H-Q curve sets the
  head; the cannula sizes and venous return set the achievable flow. A term neonate stays ~0.5 L/min
  even at high rpm (correct); increasing `pump_rpm` past the preload limit just raises head, not flow.
- **`flow` is reported in L/min** (`× 60`) even though the source comment labels it L/s.
