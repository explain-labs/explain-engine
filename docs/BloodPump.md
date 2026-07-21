# BloodPump

A `BloodPump` is a [`BloodCapacitance`](./BloodCapacitance.md) that adds a mechanical pump. It inherits all blood-volume and composition behaviour and overrides `calc_pressure` to generate a pump pressure proportional to RPM, which it applies as an external pressure on its inlet or outlet [Resistor](./Resistor.md) to drive flow — modelling a centrifugal or roller pump.

## Inheritance

```
BaseModelClass
  └── Capacitance
        └── BloodCapacitance       (blood volume + composition mixing)
              └── BloodPump        (adds pump pressure)
```

It inherits the full capacitance cycle, the blood-composition mixing in [`BloodCapacitance.volume_in`](./BloodCapacitance.md), and the `fixed_composition` / empty-compartment guards. It overrides only `calc_pressure`.

## What it models

A pumped blood chamber. Its own recoil/transmural pressure is computed exactly as a `BloodCapacitance`, but in addition it imposes a **pump pressure** on a connected resistor: a flow-dependent head-flow (H-Q) characteristic in centrifugal mode, or an integral flow-source controller in roller mode. The negative external pressure creates the pressure gradient that moves blood through the resistor, i.e. the pump head.

## Properties

### Configuration (unique to BloodPump)

| Property | Unit | Description |
|---|---|---|
| `pump_rpm` | rpm | Pump speed (rotations per minute) |
| `pump_mode` | enum | `0` = centrifugal (drives the **inlet** resistor), `1` = roller (drives the **outlet** resistor) |
| `pump_hq_a` / `pump_hq_b` / `pump_hq_c` | — | Centrifugal head-flow coefficients (see below) |
| `roller_ml_per_rev` / `roller_kp` / `roller_drive_max` | mL/rev, —, mmHg | Roller flow-source parameters |
| `inlet` | name | Name of the inlet `BloodResistor` |
| `outlet` | name | Name of the outlet `BloodResistor` |
| `pres_cc` | mmHg | External pressure from chest compressions (reset to 0 each step) |
| `pres_mus` | mmHg | External muscle pressure (reset to 0 each step) |

Plus the inherited capacitance configuration (`u_vol`, `el_base`, `el_k`, `pres_ext`, `fixed_composition`, …) and the [factor tiers](./BloodCapacitance.md).

### Computed / dependent

| Property | Unit | Description |
|---|---|---|
| `pump_pressure` | mmHg | Pump drive = `−head` (centrifugal H-Q) or `−`roller-controller output |
| `pres_in` | mmHg | Recoil pressure |
| `pres_tm` | mmHg | Transmural pressure |
| `pres` | mmHg | Total pressure incl. external pressures |

### Local references (`_`-prefixed)

`_inlet`, `_outlet` — resolved each step from `model.models[inlet/outlet]`.

## Pump pressure (`calc_pressure`)

`BloodPump` overrides `calc_pressure` (it does not override `calc_model`, so it inherits the elastance/volume steps from Capacitance):

```
pres_in = el_k_eff·(vol − u_vol_eff)² + el_eff·(vol − u_vol_eff)
pres_tm = pres_in − pres_ext
pres    = pres_in + pres_ext + pres_cc + pres_mus
                                                  # then pres_ext, pres_cc, pres_mus reset to 0

# flow input Q = short EMA of the outlet resistor flow (L/min)
centrifugal (pump_mode 0):  head = hq_a·(rpm/1000)² − hq_b·(rpm/1000)·Q − hq_c·Q²   (clamped ≥ 0)
                            pump_pressure = −head
                            inlet.p2_ext = pump_pressure;  outlet.p1_ext = p2_ext = 0
roller      (pump_mode 1):  _roller_drive += roller_kp·(roller_ml_per_rev·rpm/1000 − Q)   (clamped [0,max])
                            pump_pressure = −_roller_drive
                            outlet.p2_ext = pump_pressure;  inlet.p1_ext = p2_ext = 0
```

This mirrors the live [`Ecls`](./Ecls.md) pump: a flow-dependent head-flow (H-Q) characteristic for
centrifugal (afterload sensitive) and an integral flow-source controller for roller (afterload
independent), driving the driven resistor's **downstream** node. The connector writes are
**null-guarded** (`if (this._inlet)` / `if (this._outlet)`) so an unwired pump does not crash.

## Status

> ⚠️ **Currently unused.** No scenario instantiates a `BloodPump`. The ECLS pump (`ECLS_PUMP`) is a [`BloodVessel`](./BloodVessel.md) driven directly by the [`Ecls`](./Ecls.md) device, which carries the same H-Q pump-pressure logic (kept in sync with this class). The class is registered (exported in `ModelIndex.js`) and UI-exposed, and was made defensively correct — it declares `pres_cc`/`pres_mus`/`inlet`/`outlet`, null-guards the connectors and computes `pres_tm` — so it will not crash or produce `NaN` if instantiated, but it is legacy/standby code.

## Example definition (JSON)

No scenario contains a `BloodPump`, so the following is **illustrative** (the inherited capacitance fields plus the pump-specific fields):

```json
{
  "name": "PUMP",
  "description": "blood pump",
  "model_type": "BloodPump",
  "is_enabled": true,
  "vol": 0.05,
  "u_vol": 0.05,
  "el_base": 5000,
  "el_k": 0,
  "fixed_composition": false,
  "pump_rpm": 3000,
  "pump_mode": 0,
  "inlet": "PUMP_IN",
  "outlet": "PUMP_OUT"
}
```

## Usage in the model

- Intended for an extracorporeal pump chamber wired between an inlet and outlet `BloodResistor`.
- In practice the live ECLS circuit does not use it — see [Ecls](./Ecls.md). Prefer that path for new extracorporeal work unless this class is brought back into active use.
</content>
