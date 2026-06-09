# Ecls

The `Ecls` device model simulates an **extracorporeal life support** (ECMO/ECLS) circuit: blood is
drained from the patient, pumped through a membrane oxygenator, and returned. It is a coordinator —
it owns the circuit sub-models (cannulas, tubing, pump, oxygenator, gas side) and drives their
resistances, pressures and gas exchange each update tick.

## Circuit topology

```
patient(drainage_site) ──[ECLS_DRAINAGE]──► ECLS_TUBING_IN ──[pump]──► ECLS_PUMP ──► ECLS_OXY ──► ECLS_TUBING_OUT ──[ECLS_RETURN]──► patient(return_site)
                                                                          │
                                                              [ECLS_GASEX: GasExchanger]
                                                                          │
                              ECLS_GAS_SOURCE ─[ECLS_GAS_INSP_VALVE]─► ECLS_GAS_OXY ─► ECLS_GAS_OUT   (sweep gas)
```

- **Blood path:** drainage cannula → inflow tubing → centrifugal/roller pump → oxygenator → outflow
  tubing → return cannula. `drainage_site` (default `RA`) and `return_site` (default `AAR`) name the
  patient compartments the cannulas connect to.
- **Gas path:** a fresh sweep gas (`gas_fio2`/`gas_fico2`) flows through the oxygenator; `ECLS_GASEX`
  exchanges O₂/CO₂ between the oxygenator blood and the sweep gas.

## Cannula library

`drainage_cannulas` / `return_cannulas` are dictionaries of real devices (Bio-Medicus, Medtronic
Crescent) with inner diameter, length and a measured resistance. Selecting a `*_cannula_type` copies
its geometry and resistance into the active parameters (in the constructor and re-checked each tick).

## Calculation cycle (`calc_model`)

When `ecls_running` is **false**: zero the reported pressures/flows, reset the moving-average
filters, and **disable all circuit sub-models** (so a stopped circuit stops conducting).

When **running**, every `_update_interval` (0.015 s):

1. Rebuild the moving-average windows if their sizes changed.
2. Resolve the circuit sub-model references (skip the tick if any is missing).
3. Apply drainage/return sites and the selected cannula resistances/geometry.
4. Sync every sub-model's `is_enabled` to `ecls_running`; set `no_flow = ecls_clamped` on the blood
   path; enable the gas exchanger only when unclamped.
5. Push resistances (cannulas, tubing, pump, oxygenator — each with its `*_res_factor`).
6. Recompute the sweep-gas composition when `gas_fio2`/`gas_fico2` changes, and the inspiratory-valve
   resistance when `gas_flow` changes.
7. **Pump drive:** `pump_pressure = −pump_rpm / 25`, applied as an external pressure across the pump
   (centrifugal, `pump_mode 0`) or the oxygenator (roller, `pump_mode 1`).
8. Read out filtered venous / interface / arterial pressures and circuit flow; once per second,
   recompute blood composition on the tubing to report venous & post-oxygenator saturations and
   post-oxygenator pCO₂.

## Configuration (model-definition fields)

| Field | Meaning |
|---|---|
| `ecls_running`, `ecls_clamped` | circuit on/off and clamp |
| `drainage_site`, `return_site` | patient compartments for the cannulas |
| `*_cannula_type` | selected device from the cannula library |
| `*_res_factor` | per-component resistance multipliers (drainage/return/tubing/pump/oxy) |
| `oxy_res_*`, `oxy_vol` | oxygenator resistance / volume |
| `pump_rpm`, `pump_mode` | pump speed and type (0 = centrifugal, 1 = roller) |
| `gas_flow`, `gas_fio2`, `gas_fico2`, `gas_humidity`, `gas_temp` | sweep-gas settings |
| `dif_o2`, `dif_co2` | gas-exchanger diffusion constants |
| `pressure_avg_window`, `flow_avg_window` | moving-average sample counts |

## Notes & caveats

- **Stopping the circuit now disables it.** The `is_enabled` sync used to run only while
  `ecls_running` was true, so a stopped ECLS left its sub-models enabled and able to conduct passive
  flow; the off-branch now disables them.
- **Sub-model references are resolved lazily** (each tick while running) and the tick is skipped if
  any is missing, rather than dereferencing undefined.
- **Pump logic is duplicated.** The pump-pressure computation here mirrors `BloodPump.calc_pressure`;
  the circuit's `ECLS_PUMP` is a `BloodVessel` driven externally rather than a `BloodPump`.
- **Minor:** `flow` is reported in L/min (`× 60`) though the property comment says L/s; the
  `_ecls_gasexchanger` field is declared but unused (the code uses `_ecls_gasex`).
