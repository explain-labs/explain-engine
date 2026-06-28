# Lactate

The `Lactate` model turns the previously-**static** `lact` blood solute into a **hypoxia-driven
product** — a slow process/controller in the same family as [`Hormones`](./Hormones.md) and
[`Glucose`](./Glucose.md). It holds no compartment of its own, resolves references to other models
lazily, runs on an `_update_interval`, and is **NEUTRAL at rest**: with tissues adequately
oxygenated there is no O2 debt (no production), and lactate already sitting at its baseline produces
no net clearance flux. A scenario shipping a `Lactate` model therefore keeps its baseline ABG and
only diverges when tissue oxygenation falls (shock, asphyxia, severe hypoxia).

## Why it changes pH with no solver change

`Lactate` writes **only** `solutes.lact` on the blood compartments. The existing Stewart acid-base
solver in [`BloodComposition`](./BloodComposition.md) already consumes `lact` as a strong anion when
it forms the strong-ion difference:

```js
sid = sol["na"] + sol["k"] + 2 * sol["ca"] + 2 * sol["mg"] - sol["cl"] - sol["lact"];
```

Raising `lact` lowers the SID → lower pH / HCO3 / BE — i.e. a **lactic metabolic acidosis** — with
no change whatsoever to the solver. The coupling is one-directional (the O2 sensors in `Mob`/`Ans`
read `to2`, not pH), so there is no oscillation risk.

**Insertion order matters.** It must run **after** [`Metabolism`](./Metabolism.md) (which sets each
tissue's `to2` for the step) and **before** `Blood` (which solves composition). This is handled by
the model's position in the scenario JSON `models` map — insert it just after `Metabolism`.

## Per-tissue-site mechanism

`Lactate` reuses `Metabolism.metabolic_active_models` (the tissue consumption map, per-site VO2
fraction `fvo2`) plus the whole-body `vo2`. For each active site (a `MicroVascularUnit` is followed
to its `_CAP` compartment):

```
threshold = threshold_frac * resting_to2          (resting captured at warm-up, see below)
anaerobic = clamp((threshold − to2) / threshold, 0, 1)        (the Mob activation idiom)

local_o2_demand = (0.039 * vo2 * vo2_factor * vo2_temp_factor * weight / 60) * dt * fvo2   [mmol O2]
lactate_produced (mmol) = anaerobic * local_o2_demand * lact_per_o2_deficit * prod_gain
   → comp.solutes.lact += lactate_produced / comp.vol
```

`lact_per_o2_deficit ≈ 0.33` reflects ~2 lactate per glucose / 6 O2 per glucose ⇒ ~0.33 mmol
lactate per mmol of unmet O2 demand.

**Clearance** runs every update on every blood compartment carrying a `lact` solute, relaxing
first-order toward `lact_baseline` (Cori cycle / hepatic + renal handling):

```
comp.solutes.lact += (lact_baseline − comp.solutes.lact) * lact_clearance * dt
```

## The robustness trick: minimum-over-warm-up threshold

The per-site anaerobic `threshold` auto-seeds from the running **MINIMUM** tissue `to2` captured
across a warm-up window (`_warmup_delay`, 90 s) — **not** a single instant. Using the trough makes
the threshold sit below the operating low point, so the model stays neutral at rest even in
**chronically hypoxic** scenarios (cyanotic CHD, fetus) whose steady-state tissue `to2` is low and
swings cyclically near the threshold. Production is gated off entirely until `_seeded` is set
(`_warmup_counter >= _warmup_delay`); before that the model only settles compartments toward
baseline.

## Parameters
| Parameter | Default | Meaning |
|---|---|---|
| `lactate_running` | `true` | master gate — `false` stops production (clearance still settles once toward baseline) |
| `lact_baseline` | `1.0` mmol/L | resting blood lactate; the clearance target |
| `threshold_frac` | `0.5` | anaerobic threshold as a fraction of each site's resting-MINIMUM `to2` |
| `lact_per_o2_deficit` | `0.33` | mmol lactate produced per mmol unmet O2 demand |
| `lact_clearance` | `0.002` 1/s | first-order clearance rate toward baseline (t½ ≈ 6 min) |
| `prod_gain` | `1.0` | overall scaler on production (clinical-tuning convenience) |
| `metabolism_name` | `"Metabolism"` | name of the model supplying the tissue map + VO2 |
| `_update_interval` | `1.0` s | controller cadence |
| `_warmup_delay` | `90.0` s | window over which the resting-MINIMUM site `to2` is captured |

## Read-outs
| Read-out | Meaning |
|---|---|
| `arterial_lactate` | `AA.solutes.lact` (mmol/L) |
| `total_production_step` | total lactate produced in the last update (mmol) |
| `anaerobic_fraction_max` | worst-site anaerobic fraction this update (0..1) |

## See also
- [`Metabolism`](./Metabolism.md) — supplies the tissue consumption map and VO2; sets `to2` each step.
- [`BloodComposition`](./BloodComposition.md) — the Stewart solver that turns `lact` into a pH shift.
- [`Mob`](./Mob.md) — the myocardial O2 balance model whose `clamp` activation idiom is reused here.
- [`Glucose`](./Glucose.md) — sibling slow-process solute model.
