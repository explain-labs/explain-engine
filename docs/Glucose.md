# Glucose (blood-glucose / insulin controller)

The `Glucose` model is a **slow blood-glucose process controller** — same family as
[`Hormones`](./Hormones.md), [`Kidneys`](./Kidneys.md) and [`Drugs`](./Drugs.md): it holds no
compartment of its own, resolves references to other models lazily, runs on an `_update_interval`,
and **owns its source/sink while enabled** (releasing them once on disable). Default config is
**neutral at rest** — the set-point auto-seeds to the resting arterial glucose, `insulin` and
`counterreg` sit at `1.0`, and because the default `hgp_rate == glu_use_rate` hepatic production
exactly balances peripheral utilization, so total body glucose mass is conserved. A scenario that
ships it behaves identically at rest and only diverges on perturbation.

`glucose` is a **new blood solute (mmol/L)**. It advects through the whole circuit for free via the
engine's existing `volume_in` solute mixing in `BloodCapacitance`/`HeartChamber`, exactly like Na/K
— the controller only seeds the key and adjusts its source/sink. (A scenario should also list
`"glucose"` in [`Blood`](./Blood.md)`.solutes` so every compartment starts seeded; `_seed_keys()`
below is a lazy safety net that mirrors [`Drugs`](./Drugs.md).)

## Causal loop

```
SENSE                      CONTROL (1.0 = baseline)        EFFECTORS (owned, default-neutral)
AA.solutes.glucose ──┬──► insulin     (hyperglycemia ↑) ──► uptake_factor      → peripheral SINK ↑
   (plasma_model)    │                                  └─► production_factor  → hepatic SOURCE ↓
                     └──► counterreg   (hypoglycemia  ↑) ──► production_factor  → hepatic SOURCE ↑

SOURCE  hepatic glucose production → IVCI (injection_site):  prod = (hgp_rate/60)·weight·u·production_factor  [mmol]
SINK    peripheral utilization, split over Metabolism.metabolic_active_models by fvo2:
                                                            use  = (glu_use_rate/60)·weight·u·uptake_factor   [mmol]
```

- **SOURCE** — endogenous hepatic glucose output added straight to the central vein `IVCI`
  (`_inject.solutes.glucose += prod_total / _inject.vol`), modulated by `production_factor`.
- **SINK** — peripheral utilization distributed over the *same* compartments and fractions
  [`Metabolism`](./Metabolism.md) uses for O₂ (`metabolic_active_models`, a `site → fvo2` map),
  scaled by `uptake_factor`. A `MicroVascularUnit` site redirects to its `<site>_CAP` compartment;
  sites with `vol <= 0` are skipped, and concentration is floored at 0.
- **CONTROL** — `insulin` rises with hyperglycemia (↑uptake, ↓hepatic output); `counterreg` rises
  with hypoglycemia (↑hepatic output). At the set-point both `== 1.0`.

## Dynamics

Every `_update_interval` (default `1.0 s`), `_update_glucose(u)` runs (`u` = elapsed):

```
glu_err            = (glucose − glucose_setpoint) / glucose_setpoint
insulin_target     = clamp(1 + insulin_gain·glu_err,     hormone_min, hormone_max)
counterreg_target  = clamp(1 − counterreg_gain·glu_err,  hormone_min, hormone_max)
insulin            = lag(insulin, insulin_target, u, insulin_tc)          # x += u·(1/tc)·(−x+target)
counterreg         = lag(counterreg, counterreg_target, u, counterreg_tc)
uptake_factor      = clamp(1 + uptake_insulin_gain·(insulin−1),  uptake_factor_min, uptake_factor_max)
production_factor  = clamp(1 − hgp_insulin_gain·(insulin−1) + hgp_counterreg_gain·(counterreg−1),
                           production_factor_min, production_factor_max)
```

**Auto-seed.** After a `_warmup_delay` (30 s, to let the arterio-venous gradient settle), the
set-point is pinned once to the then-current sensed `glucose` (`_seeded = true`) — this is what makes
a shipped scenario neutral regardless of its resting glucose. The master gate `glucose_running`
(false) calls `_release()` once, pinning every read-out back to neutral, then idles.

## IV dextrose — no extra code

IV dextrose works through the existing [`Fluids`](./Fluids.md) mechanism with **zero** changes here:
a `d5`/`d10` fluid type simply carries `glucose` in its `solutes`, so infusing it raises compartment
glucose the same way any fluid raises Na/K. The controller then senses the rise and responds
(insulin↑, hepatic output↓). Likewise, `glucose` is deliberately **not** in
[`Kidneys`](./Kidneys.md)`.filterable_solutes` — there is **no glucosuria** in this version.

## Read-outs
| Read-out | Meaning |
|---|---|
| `glucose` | sensed arterial glucose (mmol/L, from `plasma_model.solutes.glucose`) |
| `insulin` / `counterreg` | controller activity (1.0 = baseline) |
| `uptake_factor` / `production_factor` | applied SINK / SOURCE multipliers |
| `glucose_use_step` / `glucose_prod_step` | last-update total utilization / production (mmol) |

## Key parameters (defaults / units)
| Param | Default | Meaning |
|---|---|---|
| `glu_use_rate` | `0.03` mmol/kg/min | peripheral utilization (~5.4 mg/kg/min) |
| `hgp_rate` | `0.03` mmol/kg/min | hepatic production (`== glu_use_rate` → neutral at rest) |
| `glucose_setpoint` | `4.0` mmol/L (~72 mg/dL) | controller target (auto-seeded to resting value) |
| `insulin_gain` / `counterreg_gain` | `6.0` / `6.0` | drive per fractional glucose excess / deficit |
| `insulin_tc` / `counterreg_tc` | `120 s` / `120 s` | controller lag time constants |
| `uptake_insulin_gain` | `1.0` | uptake-factor rise per `(insulin−1)` |
| `hgp_insulin_gain` / `hgp_counterreg_gain` | `0.8` / `2.0` | hepatic suppression / rise per hormone |
| `hormone_min/max` | `0.0` / `10.0` | insulin & counterreg clamps |
| `uptake_factor_min/max` | `0.1` / `5.0` | SINK clamp |
| `production_factor_min/max` | `0.0` / `8.0` | SOURCE clamp |
| `glucose_default` | `4.0` mmol/L | value used to seed the solute key where missing |
| `metabolism_name` / `injection_site` / `plasma_model` | `Metabolism` / `IVCI` / `AA` | lazy wiring refs |

## Wiring & related models
- [`Metabolism`](./Metabolism.md) — supplies `metabolic_active_models` (the `site → fvo2`
  consumption map the SINK reuses, so glucose use tracks O₂ use).
- [`Fluids`](./Fluids.md) — IV dextrose enters via a `glucose`-carrying fluid type (no glucose code).
- [`Hormones`](./Hormones.md) / [`Drugs`](./Drugs.md) — same controller pattern (lazy refs, update
  interval, owned effectors, lazy key-seeding for new solutes).
