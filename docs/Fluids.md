# Fluids

The `Fluids` model administers **intravenous fluids** — boluses and infusions — into a blood
compartment over a set time. It is a small scheduler: a call queues a fluid, and each update step it
drips a fraction of that fluid's volume (with its solute composition) into the target compartment via
the compartment's `volume_in`. It holds no volume itself; it pushes volume and composition onto an
existing blood compartment.

## Inheritance

```
BaseModelClass
  └── Fluids   (IV fluid/infusion scheduler)
```

Fluids extends `BaseModelClass` directly. It owns no compartment and declares no `components`; it
mutates the blood compartments named as infusion sites through their `volume_in` method (see
[`BloodCapacitance`](./BloodCapacitance.md)).

## What it models

A queue of in-progress infusions. Each queued fluid carries a target site, a per-step volume
increment, a remaining time, and a solute composition drawn from the `fluids` library. Every update
interval the scheduler delivers each fluid's increment and advances its timer, removing fluids whose
time has elapsed.

## Properties

### Configuration (independent)

| Property | Unit | Description |
|---|---|---|
| `fluids_temp` | °C | Temperature stamped on every administered fluid (default 37.0) |
| `fluids` | object | Library `{ fluidType: { solute: concentration, … } }` of available fluids |
| `default_volume` | mL | Default bolus volume offered to the UI |

### Local / internal (`_`-prefixed)

| Property | Unit | Description |
|---|---|---|
| `_update_interval` | s | Processing cadence (`0.015`) |
| `_update_counter` | s | Accumulates `_t` toward `_update_interval` |
| `_running_fluid_list` | array | Queue of in-progress fluid objects |
| `_default_time` | s | Vestigial default infusion time (unused) |
| `_default_type` | string | Vestigial default fluid type (unused) |

Fluids publishes no dependent read-out properties.

## Administering a fluid — `add_volume(volume, in_time, fluid_in, site)`

| Argument | Default | Meaning |
|---|---|---|
| `volume` | — | volume to give, in **mL** |
| `in_time` | 10 | duration over which to give it, in **seconds** |
| `fluid_in` | `"normal_saline"` | fluid type — key into the `fluids` dictionary for the solute mix |
| `site` | `"VLB"` | name of the target blood compartment |

It builds a fluid object and pushes it onto the running list:

```
vol       = volume / 1000                                  (mL → L)
time_left = in_time                                        (s)
delta     = (volume/1000) / (in_time / _update_interval)   (L delivered per processing step)
solutes   = { ...fluids[fluid_in] }                        (composition of the chosen fluid)
to2 = tco2 = 0,  temp = fluids_temp,  viscosity = 1,  drugs = {}
```

`delta` is sized so the full volume is delivered across the `in_time / _update_interval` processing
steps. An unknown `fluid_in` yields empty solutes (`{...undefined}` → `{}`), i.e. a solute-free
fluid, rather than an error.

## Processing — `process_fluid_list` (every `_update_interval`, 0.015 s)

`calc_model` accumulates `_t` into `_update_counter`; once it exceeds `_update_interval` the counter
resets and `process_fluid_list` runs:

1. **Drop finished fluids** — `removeByProperty` filters out any with `time_left ≤ 0`.
2. **For each remaining fluid:**
   - Deliver this step's increment: `models[site]?.volume_in(delta, fluid)` — the compartment adds
     `delta` litres and mixes in the fluid's composition (solutes, temperature, viscosity) by volume
     fraction. (See [`BloodCapacitance`](./BloodCapacitance.md)'s `volume_in` mixing logic.)
   - Decrement `vol` by `delta` and advance the timer (`time_left -= _update_interval`); when it
     reaches 0, zero the delta so no further volume is added before the fluid is removed next cycle.

The delivery happens **before** the timer/zeroing, so the final increment is actually administered.

## Notes & caveats

- **Full dose is delivered.** The increment is applied before the timer is zeroed; an earlier ordering
  zeroed the last `delta` before delivering it, losing one step's worth — negligible for a long
  infusion but significant for a short bolus (a one-step bolus delivered nothing).
- **Missing target site is skipped** (optional-chaining guard) rather than throwing.
- **Composition is gas-free and low-viscosity.** Administered fluid carries `to2 = tco2 = 0` and
  `viscosity = 1`, so a large bolus dilutes the compartment's oxygen/CO₂ content and lowers its
  viscosity — the intended haemodilution effect.
- **Vestigial fields.** `fluid.vol` is decremented but not used as a stop condition (delivery is
  timer-driven); `_default_time` / `_default_type` are unused.

## Example definition (JSON)

From `term_neonate.json`:

```json
{
  "name": "Fluids",
  "description": "fluids model",
  "is_enabled": true,
  "model_type": "Fluids",
  "components": {},
  "fluids_temp": 37,
  "fluids": {
    "normal_saline":  { "na": 154, "cl": 154 },
    "ringers_lactate":{ "na": 130, "cl": 109, "ca": 1.4, "k": 4 },
    "packed_cells":   { "hemoglobin": 12 },
    "albumin_20%":    { "albumin": 20 },
    "d5":             { "glucose": 278 },
    "d10":            { "glucose": 555 }
  },
  "default_volume": 10
}
```

(The adult `adult_female.json` scenario ships the same library with `default_volume: 250`.)

## Usage in the model

- One Fluids instance per scenario; the UI exposes `add_volume` (via the model-interface registry) so
  the user can give boluses/infusions interactively, and scenario events can schedule infusions.
- Targets any blood compartment by name; the default site `VLB` is the lower-body venous pool.
- Solute keys in the `fluids` library must match the solute names tracked on the target compartment
  (`na`, `cl`, `ca`, `k`, `hemoglobin`, `albumin`, `glucose`, …) so they mix correctly through
  [`BloodCapacitance`](./BloodCapacitance.md)'s composition mixing.
