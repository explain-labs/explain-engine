# Container

A `Container` is an enclosing compartment that **wraps other compartments** and squeezes them with its
own recoil pressure — the model of the thorax and the pericardium. Its volume is the sum of what it
contains, and its pressure is transmitted to those contents.

## What it models

```
THORAX (Container) ── contains ──► PERICARDIUM (Container) ── contains ──► LV, RV, LA, RA, COR
        ── also contains ──► lungs (ALL, ALR), great vessels, …
```

`THORAX` holds the lungs, heart and intrathoracic vessels; `PERICARDIUM` (inside the thorax) holds the
heart chambers. Containers nest, so pressure propagates inward (thorax → pericardium → chambers).

## Calculation cycle (`calc_model`)

1. **`calc_volumes`** — `vol = vol_extra + Σ contained.vol` (over members that exist and are
   enabled); compute `u_vol_eff` from the [factor pattern](./Capacitance.md).
2. **`calc_pressure`**:
   ```
   pres_in = el_k_eff · (vol − u_vol_eff)² + el_eff · (vol − u_vol_eff)
   pres    = pres_in + pres_ext
   for each contained component:  component.pres_ext += pres
   pres_ext := 0
   ```
   The container's full pressure is **added** to every contained component's `pres_ext`, which those
   components read in their own `calc_pressure`. Because contents reset `pres_ext` each step, the
   contributions compose without accumulating.

`el_base`, `u_vol`, `el_k` use the factor / effective-value pattern. The container itself holds no
flow and is not a flow endpoint — it only aggregates volume and broadcasts pressure.

## Notes

- **Membership is name-based and enable-aware.** Volume is summed and pressure transmitted only for
  members that resolve to a model and are `is_enabled`; missing or disabled members are skipped (so a
  disabled chamber neither adds phantom volume nor accumulates an unbounded `pres_ext`).
- **Sub-unstressed operation matters.** The thorax runs *below* its unstressed volume
  (`vol < u_vol`), so a higher elastance makes `pres_in` more negative — this is how
  `Breathing`'s muscle effort (which raises `THORAX.el_base_factor`) produces inspiratory suction.
- The order of stepping sets whether a content sees this step's container pressure or last step's
  (at most one step of lag) — inherent to sequential stepping, stable at the default step size.
