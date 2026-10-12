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
- VA cannulation (separate drainage and return cannula) or VV cannulation with one double-lumen
  cannula (`cannulation`), with cannula libraries calibrated to the manufacturers' pressure-drop
  charts (Bio-Medicus 8–25 Fr, Avalon Elite 13/16 Fr dual-lumen), converted from water to blood.
- Circuit resistances that scale realistically with flow: nonlinear cannula pressure drops, laminar
  tubing from its geometry, and a per-device oxygenator pressure drop. See
  [Circuit calibration](#circuit-calibration).
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
| `cannulation` | string | `"VA"` (default; separate drainage + return cannula) or `"VV-DL"` (one double-lumen cannula: both lumens in `drainage_site`) |
| `dl_cannula_type` | string | Key into `dl_cannulas`, used in `VV-DL` (default `Avalon Elite 13 Fr`) |
| `drainage_site` | string | Patient compartment the drainage cannula drains (default `RA`) |
| `return_site` | string | Patient compartment the return cannula feeds (default `AAR`). In `VV-DL` it is forced to `drainage_site`; the VA site is remembered and restored on the way back to `VA` |
| `drainage_cannula_type` | string | Key into `drainage_cannulas`, used in `VA` (default `Biomedicus venous 12 Fr`) |
| `return_cannula_type` | string | Key into `return_cannulas`, used in `VA` (default `Biomedicus arterial 10 Fr`) |
| `drainage_res_factor` | × | Multiplier on drainage-cannula resistance (default 1.0) |
| `return_res_factor` | × | Multiplier on return-cannula resistance |
| `tubing_res_factor` | × | Multiplier on both tubing resistances |
| `pump_res_factor` | × | Multiplier on pump resistance |
| `oxy_res_factor` | × | Multiplier on oxygenator resistance |
| `oxy_res_for` / `oxy_res_back` | mmHg/(L/s) | Oxygenator resistance; set from the selected oxygenator's `dp_a` (Quadrox-i Neonatal 2700) whenever `oxygenator_type` is applied, editable in between |
| `oxy_vol` | L | Oxygenator volume (default 0.09) |
| `pump_res_for` / `pump_res_back` | mmHg/(L/s) | Pump internal resistance (default 50/50); the inflow tubing's `tubing_in_res` is added in series on the same resistor |
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
| `oxygenators` | dict | Oxygenator device library (surface area, rated flow, `o2_cap`/`co2_cap`, prime and blood-side pressure drop `dp_a` per device) |
| `drainage_cannula_diameter` / `_length` | m | Drainage cannula geometry (copied from the selected library entry) |
| `return_cannula_diameter` / `_length` | m | Return cannula geometry (copied from the selected library entry) |
| `tubing_in_diameter`/`_length`, `tubing_out_diameter`/`_length` | m | Tubing geometry; sets the tubing resistances (Poiseuille, blood) |
| `cannula_sizes_single`, `cannula_size_double` | Fr | Legacy size lists, not used by the engine |
| `return_cannulas`, `drainage_cannulas` | dict | VA cannula libraries (inner diameter, length, water-chart fit `dp_a`/`dp_b` per device) |
| `dl_cannulas` | dict | Double-lumen (VV) cannula library: per device a `drainage` and a `return` lumen fit (`dp_a`/`dp_b`) |

### Computed (dependent) read-outs

| Property | Unit | Description |
|---|---|---|
| `p_ven` | mmHg | Filtered (moving-average) venous/inlet pressure (`ECLS_TUBING_IN.pres`) |
| `p_int` | mmHg | Filtered pressure at the pump interface (`ECLS_PUMP.pres`) |
| `p_art` | mmHg | Filtered arterial/outlet pressure (`ECLS_TUBING_OUT.pres`) |
| `flow` | L/min | Circuit blood flow (`ECLS_RETURN.flow × 60`) |
| `flow_avg` | L/min | Moving-average of `flow` |
| `pump_pressure` | mmHg | Pump drive pressure = `−head` (centrifugal H-Q) or `−`roller-controller output |
| `sat_ven_o2` | % | Venous (pre-oxygenator) O₂ saturation — tapped at the drainage tubing `ECLS_TUBING_IN` |
| `sat_postoxy_o2` | % | Post-oxygenator O₂ saturation — tapped at the oxygenator blood compartment `ECLS_OXY` |
| `pco2_postoxy` | mmHg | Post-oxygenator pCO₂ — tapped at `ECLS_OXY` |
| `drainage_res` / `return_res` | mmHg/(L/s) | Cannula (or lumen) resistance in blood at the current circuit flow — the chord dP(Q)/Q of the device's pressure-drop curve, before `*_res_factor` |
| `drainage_dp` / `return_dp` | mmHg | Pressure drop over the drainage / return cannula (lumen) at the current flow, factor included |
| `tubing_in_res` / `tubing_out_res` | mmHg/(L/s) | Poiseuille tubing resistances (blood) from the tubing geometry, recomputed each update (a scenario value is overwritten). `tubing_out_res` drives the `ECLS_OXY → ECLS_TUBING_OUT` resistor; `tubing_in_res` is added to the pump's inlet resistor |
| `tubing_in_vol` / `tubing_out_vol` | L | Tubing volumes |

### Internal (`_`-prefixed) and moving averages

`prev_fio2` / `prev_fico2` / `prev_gas_flow` detect sweep-gas changes so compositions/valve resistance
are only recomputed when needed. `_update_interval` (0.015 s) and `_update_counter` gate the main
control block; `_blood_comp_interval` (1.0 s) and `_blood_comp_counter` gate the blood-gas read-outs.
`pressure_avg_window` / `flow_avg_window` (default 400 samples, ≈0.9 s at the 0.015 s update rate)
size the four [`RealTimeMovingAverage`](./RealTimeMovingAverage.md) filters
(`_flow_avg_calculator`, `_p_ven_avg_calculator`, `_p_int_avg_calculator`, `_p_art_avg_calculator`).

## Cannula library

`drainage_cannulas` / `return_cannulas` (VA) are dictionaries of real devices (Biomedicus venous
8–25 Fr / arterial 8–21 Fr), each with an `inner_diameter` (m), `length` (m) and the fit
`dP = dp_a·Q + dp_b·Q²` (mmHg, Q in L/min) of its manufacturer pressure-drop chart, measured in water.
`dl_cannulas` (VV) holds double-lumen devices (Avalon Elite 13 / 16 Fr), with a separate fit for the
drainage and the return lumen. Keys use the `Biomedicus` spelling that `drainage_cannula_type` /
`return_cannula_type` reference, so a selection resolves. The **constructor is the single source of
truth** for the catalogue: scenario definitions do not embed their own copy (the last eight that did
were cleaned up on 2026-10-12), so every scenario sees the full catalogue and any cannula can be
selected in any scenario. Each update, `calc_model` copies the selected VA cannulas' geometry into
`*_cannula_diameter`/`_length` and turns the selected fits into the live resistances (next section).

## Circuit calibration

The circuit was recalibrated on 2026-10-12 so that the pump speed needed for a given flow comes out of
realistic circuit losses. Before, the whole neonatal circuit cost only ≈ 31 mmHg at 0.47 L/min, so the
patient's arterial pressure dominated the pump head on VA. VV (no arterial afterload) then needed
≈ 35 % fewer rpm than VA, which bedside practice does not show. With the calibration below, a 13 Fr
double-lumen VV run needs about the same or slightly more rpm than 12/10 Fr VA. That is because the
narrow return lumen costs more than the arterial cannula plus the arterial pressure.

**Cannulas: manufacturer charts, converted to blood.** Each chart was fitted (non-negative least
squares) as `dP = dp_a·Q + dp_b·Q²`. Cannula pressure drop is mostly inertial (entrance and exit
losses), so the quadratic term dominates and the drop rises steeply with flow. The charts are measured
in water at room temperature. Blood (≈ 3 cP at 37 °C and Hct 30–35 %, 1.06 kg/L) is handled by scaling
the linear term by `BLOOD_VISCOSITY_RATIO` (3.0) and the quadratic term by `BLOOD_DENSITY_RATIO` (1.06).
At neonatal flows that puts blood 30–60 % above the water chart. This is inside the 10–80 % excess
Broman et al measured in blood (*Perfusion* 2020, doi:10.1177/0267659120926009).

| Library entry | Chart used (water) | `dp_a` | `dp_b` | blood dP @ 0.5 L/min |
|---|---|---|---|---|
| Biomedicus arterial 8 / 10 / 12 Fr | Medtronic DLP pediatric one-piece arterial 77008 / 77010 / 77012 (proxy: the Bio-Medicus neck cannula's chart is not published as data) | 19.84 / 4.20 / 8.74 | 162.87 / 59.62 / 17.96 | 73 / 22 / 18 mmHg |
| Biomedicus arterial 15 / 17 / 19 / 21 Fr | Bio-Medicus NextGen femoral arterial | 0 / 0 / 0 / 0.39 | 11.35 / 6.08 / 3.45 / 2.07 | — (adult) |
| Biomedicus venous 10 / 12 / 14 Fr | Bio-Medicus NextGen pediatric venous 96830-110 / 112 / 114 | 10.78 / 6.61 / 4.79 | 47.42 / 17.08 / 9.27 | 29 / 14 / 10 mmHg |
| Biomedicus venous 8 Fr | none published; 10 Fr scaled by (ID 2.7/2.1 mm)⁴ | 29.4 | 129.5 | 78 mmHg |
| Biomedicus venous 21 / 23 / 25 Fr | Bio-Medicus NextGen femoral bi-caval venous 96670-121 / 123 / 125 | 3.09 / 2.91 / 1.90 | 2.52 / 1.71 / 1.18 | — (adult) |
| Avalon Elite 13 Fr, drainage / return lumen | Getinge Avalon Elite 10013-CE | 15.18 / 13.74 | 81.78 / 342.83 | 44 / 112 mmHg |
| Avalon Elite 16 Fr, drainage / return lumen | Getinge Avalon Elite 10016-CE | 6.27 / 0 | 32.10 / 168.95 | 18 / 45 mmHg |

The digitised chart points came from the open `perfusion-tools` cannula pressure-drop dataset
(github.com/IMhongkeun/perfusion-tools, `data/cannula-pressure-drop.json`). That dataset digitises the
Medtronic cannulae catalog, the Bio-Medicus NextGen brochure and the Getinge Avalon Elite charts. An
independent blood data point supports the steep return lumen: an OriGen 13 Fr VV catheter costs
275 mmHg at 500 mL/min in lambs. The Medtronic Crescent RA entries (13/15 Fr) were dropped, because
their charts are not available as data.

**How the nonlinearity is applied.** The engine's `Resistor.r_k` term is explicit (lagged by one step).
With these stiff curves it would oscillate. Instead `calc_model` writes the **chord resistance**
`R = (dp_a·3.0 + dp_b·1.06·|Q|)·60` (mmHg/(L/s)) each update, with Q the pump's flow EMA (time
constant 0.3 s, which damps the feedback). Q is held at `CANNULA_FLOW_FLOOR` (0.05 L/min) and above,
and R at `CANNULA_RES_MIN` (100 mmHg/(L/s)) and above. That second floor is for numerical stability,
not physiology: the stiff ECLS compartments (elastance ≈ 50 000 mmHg/L) need R ≥ ≈ 25 at the 0.5 ms
step, and large adult cannulas at near-zero flow would otherwise fall below it.

**Tubing.** Poiseuille with blood viscosity `BLOOD_VISCOSITY` 0.003 Pa·s from `tubing_*_diameter`/
`_length`: 1/4″ × 1 m ≈ 564 mmHg/(L/s) (was a fixed 50).

**Oxygenator.** `dp_a` in the oxygenator library, in mmHg per L/min of blood, linear because hollow
fibre is laminar. Quadrox-i Neonatal 45: ≈ 8 mmHg at 0.2 and ≈ 65 at 1.5 L/min (manufacturer figures
as cited in US patents 11759558 / 12296080), and clinically 53 ± 15 mmHg per L/min (*Perfusion* 2013,
seven patients). The larger devices have no figure at hand. They are assumed to cost the same ≈ 65 mmHg
at their own rated flow (`dp_a = 65 / rated_flow`). Selecting the oxygenator writes
`oxy_res_for/back = dp_a·60`. It was a fixed 1500 mmHg/(L/s), about 25 per L/min.

**PediMag H-Q.** No H-Q curve is published. See [Pump device library](#pump-device-library).

**Result, `term_neonate`** (PediMag, Quadrox-i Neonatal, 1 m + 1 m of 1/4″ tubing; 40 s warm-up):

| rpm | VA 12 Fr venous / 10 Fr arterial → AAR: flow, P_ven, P_pre-oxy | VV Avalon 13 Fr → RA: flow, P_ven, P_pre-oxy |
|---|---|---|
| 2000 | 0.18 L/min, −3, 77 mmHg | 0.29 L/min, −18, 59 mmHg |
| 2400 | 0.38, −10, 102 | 0.37, −26, 85 |
| 2800 | 0.56, −17, 130 | 0.45, −36, 116 |
| 3200 | 0.75, −26, 162 | 0.53, −46, 152 |
| 3600 | 0.93, −36, 197 | 0.61, −58, 193 |

Before, the same VA run gave 0.47 L/min at 2800 rpm. VV with two single-lumen cannulas gave 0.47 L/min
at ≈ 1800 rpm. At ≈ 0.45 L/min VV now needs ≈ 10 % more rpm than VA, and ≈ 20 % more at 0.6 L/min.
Adult (`adult_female`, CentriMag, 25/19 Fr): 4000 rpm → 4.0 L/min (was 6.6), 5000 rpm → 6.0 (was 10.9).
The realistic adult cannula losses also remove most of the implausibly high adult flows noted on
2026-10-01.

## Calculation cycle (`calc_model`)

**When `ecls_running` is false:** zero `flow`/`flow_avg`/`p_ven`/`p_int`/`p_art`, reset the four
moving-average filters and `_blood_comp_counter`, and **disable every circuit sub-model** so a stopped
circuit no longer conducts passive flow, then return. The refs are resolved here as well, so a
circuit that has never run is disabled from the first step (scenarios ship the sub-models with
`is_enabled: true`). It also zeroes `flow` on the circuit's five blood resistors (both cannulas and the
three BloodVessel-owned connectors): a disabled Resistor never runs `calc_flow`, so its last flow would
otherwise linger after a stop.

**When running**, every `_update_interval` (0.015 s):

1. Rebuild any moving-average filter whose window size changed (`flow_avg_window` /
   `pressure_avg_window`).
2. Resolve the `ECLS_*` sub-model references; **skip the tick** if any of the eleven required ones is
   missing (`ECLS_GAS_EXP_VALVE` is resolved too, but its use is individually guarded rather than
   gating the tick).
3. Apply `drainage_site` / `return_site` to the cannula resistors. Then take the pressure-drop fits
   of the selected cannulas: both lumens of `dl_cannula_type` in `VV-DL`, or the two VA cannulas.
   Turn them into the chord resistances `drainage_res`/`return_res` at the current flow, and compute
   the Poiseuille `tubing_in_res`/`tubing_out_res` ([Circuit calibration](#circuit-calibration)).
   (Before every tick, running or not, `_apply_cannulation` forces `return_site = drainage_site` in
   `VV-DL`, or restores the remembered VA return site.)
4. Sync every sub-model's `is_enabled` to `ecls_running` (including both sweep-gas valves); set
   `no_flow = ecls_clamped` on all blood sub-models; enable `ECLS_GASEX` only when **unclamped**
   (`is_enabled = !ecls_clamped`); block back-flow on `ECLS_GAS_EXP_VALVE`.
5. Push resistances onto each sub-model: drainage/return cannula, pump, oxygenator and outlet-tubing
   resistance × its `*_res_factor`. `ECLS_TUBING_IN` is a bare `BloodCapacitance` that owns no
   resistor, so the inflow tubing's `tubing_in_res × tubing_res_factor` is added in series to the
   pump's own inlet resistor.
6. Recompute the sweep-gas composition when `gas_fio2`/`gas_fico2` changed; size the inspiratory-valve
   resistance each update so sweep flow tracks `gas_flow` (see below).
7. Update `ECLS_GASEX.dif_o2` / `dif_co2` and the membrane transfer ceilings `o2_cap` / `co2_cap`
   (from the selected oxygenator) — the rated-flow limit.
8. **Pump drive** (see below).
9. Read raw pressures, push them through the moving-average filters into `p_ven`/`p_int`/`p_art`, set
   `flow` (= `ECLS_RETURN.flow × 60`) and `flow_avg`.
10. Once per `_blood_comp_interval` (1.0 s), recompute blood composition and read out `sat_ven_o2`
    (from the drainage tubing `ECLS_TUBING_IN`, pre-oxygenator) and `sat_postoxy_o2` / `pco2_postoxy`
    (from the oxygenator blood compartment `ECLS_OXY` itself — the true membrane outlet, rather than the
    downstream `ECLS_TUBING_OUT` which lags it by advective mixing).

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
changes). `pump_rpm` remains the control.

The PediMag has no published H-Q curve. Since 2026-10-12 it uses a ≈ 640 mmHg deadhead at 5500 rpm
(`hq_a` 21.16). The published 540 mmHg "maximum outflow pressure" is read as a rated limit, as the
CentriMag's 600 turned out to be (measured deadhead 710, ratio 1.18). The curve shape is the CentriMag
fit scaled to the PediMag's head (×0.91) and flow range (1.5/10 L/min): `hq_b` 5.2, `hq_c` 15.4, flat
at neonatal flows like any mag-lev pump. The old `hq_b` 30.3 made the curve steep. It had been tuned
against the old, far too cheap circuit, and absorbed the missing circuit losses. With the calibrated
circuit, VA `term_neonate` gives ≈ 0.56 L/min at 2800 rpm, close to the PediVAS operating point
(0.6 L/min). The Rotaflow and Bio-Pump `hq_b` predate the circuit calibration and have not been
re-checked.

The other H-Q coefficients are **fit to published pump characteristics** (`head = hq_a·(rpm/1000)² −
hq_b·(rpm/1000)·Q`, with `hq_c = 0`): the deadhead (`Q=0`) scaled as rpm² fixes `hq_a`, and the rated
flow at max rpm fixes the Euler-slip falloff `hq_b`. For the Rotaflow the deadhead is fixed by two
independent data points (~108 mmHg shut-off at 2000 rpm and ~700 mmHg at 5000 rpm → `hq_a ≈ 28`); the
others are anchored to their deadhead magnitude and rated flow (see [BloodPump](./BloodPump.md) for the
coefficient table and sources). The linear `N·Q` falloff keeps a finite slope at low flow, so raising
afterload reduces flow across the operating range. Note the **circuit** (cannula size, venous return)
sets the achievable flow ceiling, so a small patient stays preload-limited (e.g. ~0.5 L/min for a term
neonate) regardless of pump rating — afterload changes then move flow little until the preload limit is
relieved.

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
`components`):

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
  "ecls_running": false,
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

`ecls_running` is the circuit's on/off switch, and every shipped scenario has it **off**
(`ecls_running: false`, since 2026-10-01). Switching it on at runtime gives a primed but clamped circuit
(`ecls_clamped: true`), so no blood flows until it is unclamped. Use `ecls_running` rather than the
model's `is_enabled`: with `is_enabled: false`, `calc_model` never runs, so nothing manages the
sub-models. On top of that, the DataCollector drops watched props of disabled models after every
`calculate()`, which silently kills `Ecls.*` UI read-outs.

## Usage in the model

- Used to model VA/VV ECMO support of a patient. For VA, set `drainage_site`/`return_site` to the
  patient compartments the cannulas are inserted into and pick the two cannula types. For VV, set
  `cannulation = "VV-DL"`, pick `dl_cannula_type` and the `drainage_site` (the return follows). Then
  set `ecls_running = true` and `ecls_clamped = false` and dial `pump_rpm` / `gas_flow` /
  `gas_fio2`.
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

## Changelog

### Circuit calibration and double-lumen VV cannulation (2026-10-12)

- **Cannulas.** The cannulas are now flow-dependent: manufacturer pressure-drop charts, converted from
  water to blood, applied as a chord resistance at the circuit flow.
- **Tubing and oxygenator.** Tubing resistance now comes from the geometry (Poiseuille). The
  oxygenator resistance now comes from the selected device. PediMag H-Q: `hq_a` 17.85 → 21.16,
  `hq_b` 30.3 → 5.2, `hq_c` 0 → 15.4. See [Circuit calibration](#circuit-calibration).
- **VV cannulation.** `cannulation` / `dl_cannula_type` / `dl_cannulas` added. `VV-DL` puts both
  lumens of one Avalon Elite double-lumen cannula in the drainage site. The Medtronic Crescent
  entries were removed from the single-lumen libraries (their resistances were unsourced, and a VV
  cannula is one device).
- **Scenario clean-up.** `tubing_in_res` is live (in series on the pump inlet). The read-outs
  `drainage_dp`/`return_dp` were added. Eight scenarios (`fetus_30wk`, `term_fetus`, `tapvc`,
  `tapvc_obstructed`, `tof`, `tof_pa`, `tof_pink`, `tof_severe`) still embedded cannula (and some
  pump/oxygenator) library copies that override the class libraries. These were removed.
- **Effect.** VV (13 Fr DL) now needs about the same or slightly more rpm than VA (12/10 Fr) for the
  same flow, instead of ≈ 35 % fewer. Adult VA flows at high rpm are much lower and more plausible.

### Sweep-gas row in the diagram (2026-10-05)

- Every scenario's ECLS diagram block (`group: "ecls"`) gains the gas side: `ECLS_GAS_SOURCE`
  ("SWEEP"), `ECLS_GAS_OXY` (unlabelled, directly under `ECLS_OXY`) and `ECLS_GAS_OUT` ("EXHAUST"),
  joined by the connectors `ECLS_SWEEP_IN` (`ECLS_GAS_INSP_VALVE`) and `ECLS_SWEEP_OUT`
  (`ECLS_GAS_EXP_VALVE`). Sweep runs right to left, **countercurrent** to the blood as in a hollow-fibre
  oxygenator.
- Diagram data only. The gas nodes are grey and untinted, like `LUNG`, and their sizes are relative to
  the scenario's own `ECLS_OXY` (`fixed_size`), so the adult diagram scales them up too. The sweep dots
  follow the valve flow, so they stop at `gas_flow` 0 and keep moving while the blood side is clamped.
- To make room, the diagram's `settings.deviceBand` is 0.85 (default 0.5), and the cannula bypass tracks
  moved from 1.6 / 1.68 to 1.84 / 1.92, so a VV return line passes under the gas row.

### Merged right atrium → drainage reaches the whole venous return (2026-10-01)

- The ≈ 0.45 L/min (neonate) / ≈ 2.7 L/min (adult) drainage ceiling noted below was mostly caused by the
  **split right atrium**. `RAIVCI_RASVC` was closed (`no_flow`) in every scenario, so a `RASVC` cannula
  could only reach SVC return. Postnatal scenarios now merge the halves (see
  [HeartChamber](./HeartChamber.md#the-split-right-atrium)).
- `term_neonate` VA (RASVC → AAR), PediMag: 4000 rpm → ≈ 1.06 L/min (p_ven ≈ −12 mmHg, was 0.45 at −135);
  5500 rpm → ≈ 1.5 L/min. Native LVO falls toward 0 as ECMO takes over the circulation.
- Follow-up: with the merged atrium, very high rpm now gives implausibly high flows, e.g. `adult_female`
  CentriMag ≈ 11 L/min at 5000 rpm. Neither caval/atrial collapse around the cannula (inflow limitation)
  nor possibly realistic adult cannula resistances are modelled yet.

### CentriMag H-Q refit to the manufacturer curves (2026-10-01)

- `pumps["Abbott CentriMag"]`: `hq_a` 24 → **23.17**, `hq_b` 11.1 → **0.85**, `hq_c` 0 → **0.38**,
  `max_rpm` 5000 → **5500**. This is a least-squares fit to the H-Q curves in the CentriMag Operation
  Manual (PL-0047 Rev 11, Fig. 14), RMS error 4.8 mmHg; the old coefficients were off by ≈ 216 mmHg
  RMS. The deadhead was about right (rpm² scaling holds, `hq_a` ≈ 23); the flow falloff was 5–7× too
  steep.
- Effect in `adult_female` (VA, RASVC → AAR): the crossover is unchanged at ≈ 2000 rpm. Flow rises much
  faster with rpm (≈ 2.6 L/min at 3000 vs 1.8 before) and reaches the drainage-limited plateau
  (≈ 2.7 L/min, RASVC empties) by ≈ 3000 rpm. That plateau is the venous-return / no-atrial-collapse
  limitation noted under "PediMag head corrected" below, and it is more apparent in the adult.
- The same manual also states a 540 mmHg "maximum pressure head" for the PediMag, which confirms its
  `hq_a` source. Since the CentriMag's 600 mmHg figure sits below its actual deadhead, the PediMag
  deadhead may likewise be somewhat higher than 540. Its `hq_a` is kept at 17.85, which the
  independent PediVAS operating points support.

### PediMag head corrected (2026-10-01)

- `pumps["Abbott PediMag"].hq_a` 9.9 → **17.85** mmHg/krpm². The old value assumed a ~300 mmHg deadhead
  at 5500 rpm; the published maximum outflow pressure is 540 mmHg (Wang et al 2020 *Artif Organs*).
  `hq_b` is unchanged; with it the corrected head reproduces the published PediVAS operating points
  (0.6 L/min @ 2800 rpm, 0.8 L/min @ 3200 rpm, 10 Fr return cannula). The class default, the standby
  `BloodPump` default and the six scenarios that set `pump_hq_a` explicitly were updated too. Those six
  (`fetus_30wk`, `term_fetus`, `tof*`) also embedded a full copy of the `pumps`/`oxygenators` libraries,
  which `init_model` copies over the class library and so pinned the old value. The copies were otherwise
  identical to the class libraries and have been removed, so these scenarios now inherit the library.
- Effect: in VA mode the centrifugal pump is non-occlusive, so flow reverses (aorta → circuit → RA)
  below the rpm whose zero-flow head equals the arterial–venous pressure difference:
  rpm_crossover = 1000·√(ΔP / hq_a). In `term_neonate` (ΔP ≈ 57 mmHg) that moved from ≈ 2400 to
  ≈ 1750 rpm. (Rotaflow, `hq_a` 28: ≈ 1430 rpm.)
- Not changed, noted: with drainage from `RASVC`, ECLS flow plateaus around 0.4–0.45 L/min above
  ≈ 2800 rpm. Native output plus ECLS is then at the venous-return limit (RASVC empties, Pra ≈ −3 mmHg).
  More flow needs volume, which is realistic for neonatal full VA support. Atrial collapse around the
  cannula ("chatter") is not modelled, so the venous-line pressure keeps falling with rpm (−150 mmHg at
  4000, −370 mmHg at 5500) instead of the flow becoming unstable.

### Off by default (2026-10-01)

- All 39 scenarios now ship `ecls_running: false`. A clamped circuit is inert, and ECLS volume isn't
  counted in `Circulation.calc_blood_volumes`, so patient values are unchanged. Checked headlessly on
  `term_neonate`: HR, MAP, SaO₂, pH and total blood volume are identical at 60 s.
- The stop branch now resolves its sub-model refs, so the circuit really is disabled from step 1, not
  only after its first run. It also zeroes the circuit resistors' flows on stop (no stale flow for the
  monitor or the diagram animation).

An audit of the ECLS model on 2026-07-21 fixed a set of correctness bugs and raised the physiological
fidelity of the pump, oxygenator, and cannula library. The audit was completed in a single session that
day (commits span 21:00–23:29), so this one date covers every change below. Commit hashes are on `main`.

### Correctness fixes (`298124e`, docs `c8abc7f`)

- **Pump-mode switch leak (A2).** Each `pump_mode` branch now zeroes the *inactive* vessel's external
  pressures, so switching centrifugal↔roller at runtime no longer leaves the previous mode's drive
  stuck on (double drive).
- **Roller-mode backward flow.** Roller mode drove the oxygenator's *upstream* node and pushed the
  circuit backward; it now drives the downstream node (`ECLS_OXY.p2_ext`), mirroring the centrifugal
  case, so it drives forward.
- **Heater-cooler residual state (A3).** The compartment's own `blood_temp_tc` is captured before the
  override and restored (via `_release_heater_cooler`) when the heater-cooler is disabled or ECLS stops,
  instead of leaving the fast device tc stuck on `ECLS_OXY`.
- **Sweep-gas inlet-valve controller (A4).** Replaced the fragile heuristic with the closed-form
  `R_insp = ΔP/Q − R_exp`, recomputed every update, reading the live expiratory-valve resistance, and
  shutting the sweep off (`no_flow`) when `gas_flow ≤ 0` instead of dividing by zero.
- **Expiratory sweep-gas valve (A5).** `ECLS_GAS_EXP_VALVE` is now resolved, enabled/disabled with the
  circuit, and its back-flow blocked so the fixed-pressure `ECLS_GAS_OUT` reservoir cannot back-fill the
  oxygenator gas side.
- **Inlet-tubing dead code (A1).** Removed the inert `r_for`/`r_back` write to `ECLS_TUBING_IN` (a
  `BloodCapacitance` that owns no resistor); `tubing_in_res` was vestigial. No behaviour change.
- `probe_ecls.mjs` gained sections D–F (pump mode, heater-cooler, sweep-gas controller).

### Pump physics (`bbd3ad8`, coefficients `7784c97`)

- Replaced the flow-independent `pump_pressure = −pump_rpm/25` with a real **head-flow (H-Q)
  characteristic** (`head = hq_a·(rpm/1000)² − hq_b·(rpm/1000)·Q`), a **roller flow-source** controller,
  and a **pump device library** (PediMag, CentriMag, Rotaflow RF-32, Bio-Pump BP-50, generic roller).
- H-Q coefficients **fit to published characteristics** — `hq_a` from the rpm²-scaled deadhead
  (Rotaflow anchored by two independent points), `hq_b` from rated flow. See [BloodPump](./BloodPump.md).

### Oxygenator gas transfer (`494bb15`, `9602a13`, `bd22b0a`)

- **Rated-flow membrane limit (C1).** `GasExchanger` gained optional `o2_cap`/`co2_cap` ceilings
  (default 0 = legacy; the native lung `GASEX_LL`/`GASEX_RL` keep the exact old physics). ECLS drives
  them from an **oxygenator device library**, so post-oxygenator saturation now falls once blood flow
  exceeds the oxygenator's rated flow instead of pinning at ~100%.
- **Post-oxy blood-gas taps (C2).** `sat_postoxy_o2` / `pco2_postoxy` are read from `ECLS_OXY` (the true
  membrane compartment) rather than the downstream `ECLS_TUBING_OUT`.
- **Hyperoxia runaway fix (`bd22b0a`).** When an oxygenator drove blood O₂ content above the po₂ the
  composition solver could bracket, the solver left po₂ at the −1 sentinel; `GasExchanger` then read
  `po2_blood = −1` and pumped O₂ in at the capped rate every step — a self-sustaining runaway that
  inflated `to2` and pinned post-oxy saturation at −1 (seen on the adult scenarios, whose lower Hb
  reaches a higher po₂). Fixed by skipping the flux while a partial pressure is the −1 sentinel and
  raising the solver's po₂ ceiling 800 → 1000 mmHg. Native-lung ABG unchanged.

### Cannula library (`d47538e`, `c3f4278`)

- Added adult sizes (venous 21/23/25 Fr, arterial 15/17/19/21 Fr) and fixed the `Bio-Medicus` →
  `Biomedicus` key-naming mismatch so selections resolve.
- **Centralized** the catalogue in the constructor and removed the per-scenario embedded copies, so
  every scenario sees the full catalogue and any cannula can be selected in any scenario
  (behaviour-neutral: all scenarios resolve to their shipped resistances).
