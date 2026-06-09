# TimeVaryingElastance

A `TimeVaryingElastance` is a volume compartment whose stiffness **varies over the cardiac cycle** —
the base for contractile chambers (`HeartChamber`, `BloodTimeVaryingElastance`). It interpolates each
step between a relaxed (diastolic) and a contracted (systolic) pressure–volume relation, driven by an
activation factor.

## Inheritance

```
BaseModelClass
  └── TimeVaryingElastance        (el_min/el_max, act_factor)
        ├── HeartChamber               (+ blood composition, ANS/MOB contractility)
        └── BloodTimeVaryingElastance  (+ blood composition)
```

## Two elastances

- `el_min` — **end-diastolic** elastance (relaxed wall; the non-linear EDPVR).
- `el_max` — **end-systolic** elastance (contracted wall; the linear ESPVR).

Both use the [factor / effective-value pattern](./Capacitance.md) (`el_min_factor`/`_ps`/
`_scaling_ps`, likewise `el_max`, `el_k`, `u_vol`). `calc_elastances` also clamps `el_max_eff` to be
≥ `el_min_eff`.

## Pressure (`calc_pressure`)

```
p_ms = (vol − u_vol_eff) · el_max_eff                                  (end-systolic, linear)
p_ed = el_k_eff · (vol − u_vol_eff)² + el_min_eff · (vol − u_vol_eff)  (end-diastolic, non-linear)
pres_in = (p_ms − p_ed) · act_factor + p_ed
pres    = pres_in + pres_ext
```

`act_factor` runs 0 → 1 over a contraction: at 0 the chamber sits on its diastolic curve (`p_ed`), at
1 on its systolic curve (`p_ms`), interpolating in between. The non-linear `el_k` term lives only in
the diastolic relation (the EDPVR stiffens at high filling), which is the physiologically expected
shape.

`act_factor` is supplied by the `Heart` model (the atrial/ventricular activation functions `aaf`/
`vaf`); see [HeartChamber.md](./HeartChamber.md) for the ANS/MOB contractility coupling layered on
top of `el_max`.

## Volume flow

`volume_in`/`volume_out` behave as in [Capacitance](./Capacitance.md): `volume_out` clamps at 0 and
returns the un-removed volume; subclasses extend `volume_in` to mix the incoming blood composition
(guarded against an empty compartment and `fixed_composition`).

## Notes

- The `volume_out` negative-volume guard (`vol < 0 && vol < u_vol`) is functionally equivalent to
  `vol < 0` for any non-negative `u_vol`.
- Heart chambers can fall below their unstressed volume during ejection (ventricular suction), which
  the formula handles naturally.
