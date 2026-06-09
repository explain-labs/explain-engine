# Fluids

The `Fluids` model administers **intravenous fluids** — boluses and infusions — into a blood
compartment over a set time. It is a small scheduler: a call queues a fluid, and each update step it
drips a fraction of that fluid's volume (with its solute composition) into the target compartment via
the compartment's `volume_in`.

It holds no volume itself; it pushes volume and composition onto an existing blood compartment.

## Administering a fluid — `add_volume(volume, in_time, fluid_in, site)`

| Argument | Default | Meaning |
|---|---|---|
| `volume` | — | volume to give, in **mL** |
| `in_time` | 10 | duration over which to give it, in **seconds** |
| `fluid_in` | `"normal_saline"` | fluid type — key into the `fluids` dictionary for the solute mix |
| `site` | `"VLB"` | name of the target blood compartment |

It builds a fluid object and pushes it onto the running list:

```
vol       = volume / 1000                       (mL → L)
time_left = in_time                             (s)
delta     = (volume/1000) / (in_time / update_interval)   (L delivered per processing step)
solutes   = { ...fluids[fluid_in] }             (composition of the chosen fluid)
to2 = tco2 = 0,  temp = fluids_temp,  viscosity = 1,  drugs = {}
```

`delta` is sized so the full volume is delivered across the `in_time / update_interval` processing
steps. An unknown `fluid_in` yields empty solutes (`{...undefined}` → `{}`), i.e. solute-free fluid,
rather than an error.

## Processing — `process_fluid_list` (every `_update_interval`, 0.015 s)

1. **Drop finished fluids** — `removeByProperty` filters out any with `time_left ≤ 0`.
2. **For each remaining fluid:**
   - Deliver this step's increment: `models[site].volume_in(delta, fluid)` — the compartment adds
     `delta` litres and mixes in the fluid's composition (solutes, temperature, viscosity) by volume
     fraction.
   - Advance the timer (`time_left -= update_interval`); when it reaches 0, zero the delta so no
     further volume is added before the fluid is removed next cycle.

The delivery happens **before** the timer/zeroing, so the final increment is actually administered
(see notes).

## Configuration (model-definition fields)

| Field | Meaning |
|---|---|
| `fluids` | dictionary `{ fluidType: { solute: concentration, … } }` — e.g. `normal_saline: {na:154, cl:154}`, `ringers_lactate`, `packed_cells`, `albumin_20%` |
| `fluids_temp` | temperature of administered fluid (°C) |
| `default_volume` | default bolus volume for the UI |

`add_volume` is exposed in the model-interface registry, so the UI can give boluses interactively.

## Notes & caveats

- **Full dose is now delivered.** The increment is applied before the timer is zeroed; an earlier
  ordering zeroed the last `delta` before delivering it, losing one step's worth — negligible for a
  long infusion but significant for a short bolus (a one-step bolus delivered nothing).
- **Missing target site is skipped** (optional-chaining guard) rather than throwing.
- **Composition is gas-free and low-viscosity.** Administered fluid carries `to2 = tco2 = 0` and
  `viscosity = 1`, so a large bolus dilutes the compartment's oxygen/CO₂ content and lowers its
  viscosity — the intended haemodilution effect.
- **Vestigial fields.** `fluid.vol` is decremented but not used as a stop condition (delivery is
  timer-driven); `_default_time` / `_default_type` are unused.
