# Lactate

The `Lactate` model turns the previously-**static** `lact` blood solute into a **hypoxia-driven
product** — a slow process/controller in the same family as [`Hormones`](./Hormones.md) and
[`Glucose`](./Glucose.md). It holds no compartment of its own, resolves references to other models
lazily, runs on an `_update_interval`, and is **NEUTRAL at rest**: with tissues adequately oxygenated
there is no O₂ debt (no production), and lactate already sitting at its baseline produces no net
clearance flux. A scenario shipping a `Lactate` model therefore keeps its baseline ABG and only
diverges when tissue oxygenation falls (shock, asphyxia, severe hypoxia).

## Inheritance

```
BaseModelClass
  └── Lactate   (hypoxia-driven lactate → Stewart SID → metabolic acidosis)
```

Lactate extends `BaseModelClass` directly. Like [`Metabolism`](./Metabolism.md) and the other process
models it owns no compartment; it only writes `solutes.lact` onto existing blood compartments.

## What it models

Anaerobic lactate production under tissue O₂ debt, plus first-order whole-body clearance toward a
resting baseline. It reuses [`Metabolism`](./Metabolism.md)'s tissue consumption map and whole-body
VO₂ to locate the sites and size the O₂ demand, captures each site's resting tissue `to2` over a
warm-up window, and produces lactate in proportion to the unmet O₂ demand when `to2` falls below a
fraction of that resting level.

## Why it changes pH with no solver change

`Lactate` writes **only** `solutes.lact` on the blood compartments. The existing Stewart acid-base
solver in [`BloodComposition`](./BloodComposition.md) already consumes `lact` as a strong anion when
it forms the strong-ion difference:

```js
sid = sol["na"] + sol["k"] + 2 * sol["ca"] + 2 * sol["mg"] - sol["cl"] - sol["lact"];
```

Raising `lact` lowers the SID → lower pH / HCO3 / BE — i.e. a **lactic metabolic acidosis** — with no
change whatsoever to the solver. The coupling is one-directional (the O₂ sensors in `Mob`/`Ans` read
`to2`, not pH), so there is no oscillation risk.

**Insertion order matters.** Lactate must run **after** [`Metabolism`](./Metabolism.md) (which sets
each tissue's `to2` for the step) and **before** `Blood` (which solves composition). This is handled
by the model's position in the scenario JSON `models` map — insert it just after `Metabolism`.

## Properties

### Configuration (independent)

| Property | Unit | Default | Description |
|---|---|---|---|
| `lactate_running` | bool | `true` | Master gate — `false` stops production (clearance still settles once toward baseline) |
| `metabolism_name` | string | `"Metabolism"` | Name of the model supplying the tissue map + VO₂ |
| `lact_baseline` | mmol/L | `1.0` | Resting blood lactate; the clearance target |
| `threshold_frac` | unitless | `0.5` | Anaerobic threshold as a fraction of each site's resting-MINIMUM `to2` |
| `lact_per_o2_deficit` | mmol/mmol | `0.33` | Lactate produced per mmol of unmet O₂ demand (~2 lactate per glucose / 6 O₂ per glucose) |
| `lact_clearance` | 1/s | `0.002` | First-order clearance rate toward baseline (t½ ≈ 6 min) |
| `prod_gain` | unitless | `1.0` | Overall scaler on production (clinical-tuning convenience) |

### Computed / read-out (dependent)

| Property | Unit | Description |
|---|---|---|
| `arterial_lactate` | mmol/L | `AA.solutes.lact` arterial read-out |
| `total_production_step` | mmol | Total lactate produced in the last update |
| `anaerobic_fraction_max` | 0..1 | Worst-site anaerobic fraction this update |

### Local / internal (`_`-prefixed)

| Property | Unit | Description |
|---|---|---|
| `_update_interval` | s | Controller cadence (`1.0`) |
| `_warmup_delay` | s | Window over which the resting-MINIMUM site `to2` is captured (`90.0`) |
| `_seeded` | bool | Set once warm-up completes; production stays gated off until then |
| `_baseline_to2` | object | Per-site resting (minimum) `to2` captured at warm-up |
| `_blood_components` | array | Cached list of compartments carrying a `lact` solute |
| `_metabolism` | ref | Cached reference to the Metabolism model |

## Per-tissue-site mechanism (`_update_lactate`)

`Lactate` reuses `Metabolism.metabolic_active_models` (the tissue consumption map, per-site VO₂
fraction `fvo2`) plus the whole-body `vo2`, `vo2_factor` and `vo2_temp_factor`. For each active site
(a `MicroVascularUnit` is followed to its `_CAP` compartment):

```
threshold = threshold_frac * resting_to2          (resting captured at warm-up, see below)
anaerobic = clamp((threshold − to2) / threshold, 0, 1)        (the Mob activation idiom)

local_o2_demand = (0.039 · vo2 · vo2_factor · vo2_temp_factor · weight / 60) · u · fvo2   [mmol O₂]
lactate_produced (mmol) = anaerobic · local_o2_demand · lact_per_o2_deficit · prod_gain
   → comp.solutes.lact += lactate_produced / comp.vol
```

(`u` is the elapsed time since the last update, normally `_update_interval`.) `lact_per_o2_deficit
≈ 0.33` reflects ~2 lactate per glucose / 6 O₂ per glucose ⇒ ~0.33 mmol lactate per mmol of unmet O₂
demand.

**Clearance** runs every update on every blood compartment carrying a `lact` solute, relaxing
first-order toward `lact_baseline` (Cori cycle / hepatic + renal handling):

```
comp.solutes.lact += (lact_baseline − comp.solutes.lact) · lact_clearance · u
```

## The hypoxia threshold: minimum-over-warm-up capture

The per-site anaerobic `threshold` auto-seeds from the running **MINIMUM** tissue `to2` captured
across the warm-up window (`_warmup_delay`, 90 s) — **not** a single instant. Each warm-up step,
`_baseline_to2[site]` is set to `min(previous, comp.to2)`. Using the trough makes the threshold
(`threshold_frac · resting`, i.e. 50 % of the resting minimum at the default `threshold_frac`) sit
below the operating low point, so the model stays neutral at rest even in **chronically hypoxic**
scenarios (cyanotic CHD, fetus) whose steady-state tissue `to2` is low and swings cyclically near the
threshold.

Production is gated off entirely until `_seeded` becomes true (`_warmup_counter >= _warmup_delay`);
before that the model only settles compartments toward baseline via clearance. This is what makes a
freshly built scenario neutral at rest: no spurious lactate surge during the startup transient.

## Calculation cadence (`calc_model`)

`calc_model` accumulates `_t` into `_update_counter` and, once it reaches `_update_interval` (1 s),
calls `_update_lactate(u)` with the elapsed interval `u` and resets the counter. References are
resolved lazily in `_resolve_refs` (the Metabolism model and the list of `lact`-carrying
compartments) on first use.

## Example definition (JSON)

From `term_neonate.json`:

```json
{
  "name": "Lactate",
  "description": "hypoxia-driven lactate production",
  "is_enabled": true,
  "model_type": "Lactate",
  "components": {},
  "lactate_running": true,
  "metabolism_name": "Metabolism",
  "lact_baseline": 1,
  "threshold_frac": 0.5,
  "lact_per_o2_deficit": 0.33,
  "lact_clearance": 0.002,
  "prod_gain": 1
}
```

## Usage in the model

- Insert immediately after [`Metabolism`](./Metabolism.md) in the scenario `models` map (after the
  tissue `to2` is set for the step, before `Blood` solves composition).
- Neutral at rest in every shipping scenario; it diverges only under tissue O₂ debt, where it produces
  a lactic metabolic acidosis through the Stewart SID with no solver change.

## See also
- [`Metabolism`](./Metabolism.md) — supplies the tissue consumption map and VO₂; sets `to2` each step.
- [`BloodComposition`](./BloodComposition.md) — the Stewart solver that turns `lact` into a pH shift.
- [`Mob`](./Mob.md) — the myocardial O₂ balance model whose `clamp` activation idiom is reused here.
- [`Glucose`](./Glucose.md) — sibling slow-process solute model.
