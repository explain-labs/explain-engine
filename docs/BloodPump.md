# BloodPump

A `BloodPump` is a [`BloodCapacitance`](./BloodCapacitance.md) that adds a pump: it applies a
pump-generated pressure across its inlet/outlet resistors to drive flow (a centrifugal or roller
pump).

## Inheritance

```
BaseModelClass → Capacitance → BloodCapacitance → BloodPump
```

It inherits all blood-composition behaviour (volume mixing, the `fixed_composition`/empty-compartment
guards) and overrides `calc_pressure` to add the pump action.

## Pump pressure (`calc_pressure`)

```
pres_in = el_k_eff·(vol − u_vol_eff)² + el_eff·(vol − u_vol_eff)
pres    = pres_in + pres_ext + pres_cc + pres_mus
pump_pressure = −pump_rpm / 25
centrifugal (pump_mode 0):  inlet.p2_ext  = pump_pressure
roller      (pump_mode 1):  outlet.p1_ext = pump_pressure
```

`inlet`/`outlet` name the connecting resistors; the negative pump pressure on a resistor's external
inlet/outlet pressure creates the gradient that drives flow.

## Status

⚠️ **Currently unused.** No scenario instantiates a `BloodPump`; the ECLS pump (`ECLS_PUMP`) is a
`BloodVessel` driven directly by the [`Ecls`](./Ecls.md) device, which duplicates this pump-pressure
logic. The class is registered and UI-exposed, and was made defensively correct (declared
`pres_cc`/`pres_mus`/`inlet`/`outlet`, a null-guard on the connectors, and `pres_tm`) so it does not
crash or `NaN` if instantiated — but it is legacy/standby code.

## Configuration

`pump_rpm`, `pump_mode`, `inlet`, `outlet`, plus the inherited capacitance fields (`u_vol`, `el_base`,
`el_k`, …).
