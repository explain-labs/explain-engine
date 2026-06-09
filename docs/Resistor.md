# Resistor

A `Resistor` moves volume between two compartments driven by their pressure difference. It is the
flow element of the circuit; `HeartValve` is a thin subclass, and `BloodVessel` creates `Resistor`s
internally.

## What it models

Flow from `comp_from` to `comp_to`, with separate forward/backward resistances and an optional
non-linear (turbulent) term:

```
ΔP = (comp_from.pres + p1_ext) − (comp_to.pres + p2_ext)
forward  (ΔP ≥ 0):  flow = (ΔP − r_k_eff · prev_flow²) / r_for_eff
backward (ΔP < 0):  flow = (ΔP + r_k_eff · prev_flow²) / r_back_eff     (unless no_back_flow)
```

`r_for`, `r_back`, `r_k` all use the [factor / effective-value pattern](./Capacitance.md)
(`r_factor`/`_ps`/`_scaling_ps`, `r_k_factor`/…). The non-linear term uses the **previous** step's
flow (an explicit lagged scheme; at steady state `prev_flow == flow`).

## Calculation cycle (`calc_model`)

1. **`calc_resistance`** — compose `r_for_eff` / `r_back_eff` / `r_k_eff` from the factors; reset the
   non-persistent factors.
2. **`calc_flow`** — compute the inlet/outlet pressures (incl. the non-persistent `p1_ext`/`p2_ext`),
   pick the flow direction, and move the volume:
   - `comp_from.volume_out(flow · Δt)` returns any volume it could not supply;
   - `comp_to.volume_in(flow · Δt − un-supplied, comp_from)` adds the rest and mixes composition.

   This `volume_out` → `volume_in` handshake conserves volume — a resistor never creates volume from
   an empty compartment.

## Flags

| Flag | Effect |
|---|---|
| `no_flow` | block all flow (set `flow = 0` and return) |
| `no_back_flow` | block backward flow (valve behaviour; used by `HeartValve`) |
| `p1_ext` / `p2_ext` | external pressures added at the inlet/outlet (non-persistent) |

## Notes

- **Non-linear term.** It reads `_prev_flow`, not the just-reset `flow`; this is what makes `r_k`
  actually take effect (an earlier version used the zeroed `flow`, so `r_k` was inert). `_prev_flow`
  is cleared to 0 when no flow occurs (no-flow or blocked backflow) so the term stays consistent.
- **Resistance guard.** A non-positive effective resistance is skipped (no flow) to avoid an
  Infinity/NaN flow.
- `r_k` is 0 in the standard scenarios, so the linear Poiseuille term dominates; the non-linear term
  is available for turbulent/stenotic elements.
