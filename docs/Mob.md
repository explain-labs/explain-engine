# Mob — Myocardial Oxygen Balance

`Mob` models the **oxygen economy of the heart muscle**: how much O₂ the myocardium consumes, how
that O₂ is drawn from the coronary blood pool, and how myocardial **hypoxia** feeds back onto cardiac
function (rate, contractility, autonomic drive). It is the cardiac analogue of
[`Metabolism`](./Metabolism.md) — but where Metabolism is a passive tissue sink, `Mob` also closes a
regulatory loop with the `Heart`.

## Inheritance

```
BaseModelClass
  └── Mob   (myocardial O₂ consumption + coronary draw + hypoxia feedback)
```

Mob extends `BaseModelClass` directly. It **owns the coronary sub-network** (`COR`, `AA_COR`,
`COR_RAIVCI`, `COR_RASVC`) declared under its `components` block; the base `init_model` instantiates
those into `model.models` so they participate in the global step loop.

## What it models

Myocardial VO₂ as the sum of a basal term and a stroke-work term (both natively in mmol O₂ per gram
of heart tissue), the per-step consumption of that O₂ from the coronary blood pool with CO₂ added
back via the respiratory quotient, and three first-order-smoothed hypoxia feedback channels onto the
Heart (rate, contractility, autonomic activity).

## Properties

### Configuration (independent)

| Property | Unit | Description |
|---|---|---|
| `mob_active` | bool | Master on/off; `calc_model` returns immediately when false |
| `to2_ref` | mmol/L | Upper edge of the coronary-O₂ hypoxia window (no effect at/above) |
| `to2_min` | mmol/L | Lower edge of the hypoxia window (floor of activation) |
| `resp_q` | unitless | Respiratory quotient (CO₂ produced / O₂ consumed), default `0.1` |
| `bm_vo2_per_g` | mmol/(g·s) | Basal myocardial O₂ cost per gram of myocardium |
| `sw_vo2_per_g` | mmol/(g·mmHg·mL) | Stroke-work O₂ cost per gram per unit P-V loop area |
| `hw_intercept`, `hw_slope` | g, g/g | Heart-mass-from-body-weight regression: `hw = hw_intercept + hw_slope · weight_kg · 1000` |
| `hr_factor_min/max`, `hr_tc` | unitless, s | Heart-rate hypoxia channel bounds + time constant |
| `cont_factor_min/max`, `cont_tc` | unitless, s | Contractility hypoxia channel bounds + time constant |
| `ans_factor_min/max`, `ans_tc` | unitless, s | Autonomic hypoxia channel bounds + time constant |

### Computed / read-out (dependent)

| Property | Unit | Description |
|---|---|---|
| `hw` | g | Heart weight derived from body weight |
| `bm_vo2` | mmol/s | Basal myocardial O₂ consumption rate |
| `sw_vo2` | mmol/s | Stroke-work O₂ consumption rate |
| `mob_vo2` | mmol/s | Total myocardial O₂ consumption (`bm_vo2 + sw_vo2`) |
| `mvo2_step` | mmol | O₂ consumed this step (`mob_vo2 · Δt`) |
| `stroke_work_lv` / `stroke_work_rv` / `stroke_work_total` | mmHg·mL | Per-beat P-V loop area (left / right / sum) |
| `hr_factor` / `cont_factor` / `ans_activity_factor` | unitless | Current values of the three hypoxia channels (1.0 = no effect) |
| `mob` | — | Rough instantaneous O₂-balance reporter (not dimensionally meaningful — see caveats) |

## Oxygen consumption

Two physiologically explicit terms, both in **mmol O₂ / s**, scaled by heart weight `hw`:

```
hw      = hw_intercept + hw_slope · weight_kg · 1000           [g]   (heart mass from body weight)
bm_vo2  = bm_vo2_per_g · hw                                    [mmol/s]   basal metabolism
sw_vo2  = sw_vo2_per_g · hw · stroke_work_total / cycle_time   [mmol/s]   contractile (stroke) work
mob_vo2 = bm_vo2 + sw_vo2
```

### Stroke work (`calc_sw_vo2`)

**Stroke work** is the area of the ventricular pressure–volume loop, accumulated by trapezoidal `P·dV`
integration each step and split by flow direction:

- filling (dV > 0) accumulates into `_pv_area_*_inc`
- ejection (dV < 0) accumulates into `_pv_area_*_dec`
- at the rising edge of `Heart.cardiac_cycle_running` (start of a new cycle):
  `stroke_work = _pv_area_dec − _pv_area_inc` (the enclosed loop area), the per-beat O₂ cost
  `_sw_vo2_per_beat = sw_vo2_per_g · hw · stroke_work_total` is computed, and the accumulators reset.

The per-beat stroke-work cost is then amortized over the current `cardiac_cycle_time` to give the
`sw_vo2` rate.

## Coronary pool update

Per step, `mvo2_step = mob_vo2 · Δt` is drawn from the coronary blood pool `COR`, with CO₂ added back
via the respiratory quotient `resp_q`:

```
COR.to2  := (to2·vol − mvo2_step) / vol
COR.tco2 := (tco2·vol + mvo2_step·resp_q) / vol
```

The update is applied only when it keeps `to2 ≥ 0` (see caveats).

## Hypoxia feedback to the Heart (`calc_hypoxia_effects`)

Coronary O₂ (`COR.to2`) drives a one-sided `activation_function`: at/above `to2_ref` there is no
effect; below it the activation goes negative, reaching its floor at `to2_min`. The per-channel gain
is rebuilt each step (`(factor_max − factor_min) / (to2_ref − to2_min)`) so live edits to the
bounds take effect. Three independent channels each low-pass the activation with their own time
constant (`hr_tc`, `cont_tc`, `ans_tc`) and map it onto a factor in `[*_min, *_max]`:

| Channel | Computed factor | Written to | Effect |
|---|---|---|---|
| Heart rate | `hr_factor` | `Heart.hr_mob_factor` | lowers heart rate (bradycardia) |
| Contractility | `cont_factor` | each chamber's `el_max_mob_factor` (LV, RV, LA, and RAIVCI/RASVC if present) | lowers `el_max` (negative inotropy) |
| Autonomic | `ans_activity_factor` | `Heart.ans_activity_factor` | scales the sympathetic drive the Heart propagates to the chambers |

At normal coronary O₂ all three factors are 1.0 (no effect); under severe coronary hypoxia each drives
toward its `*_min` (default 0.01), i.e. profound suppression of rate, contractility and autonomic
responsiveness — the model of an ischemic, failing myocardium.

### How the channels reach the physics

- **`hr_mob_factor`** is read in `Heart.calc_model` (heart-rate sum).
- **`el_max_mob_factor`** is read in `HeartChamber.calc_elastances` as an additive factor on `el_max`
  (alongside `el_max_factor`, `el_max_factor_ps`, …).
- **`ans_activity_factor`** is read in `Heart.calc_varying_elastance`: the chambers receive
  `ans_activity · ans_activity_factor` instead of `ans_activity`, so it scales the sympathetic
  inotropy/lusitropy term in `HeartChamber.calc_elastances`.

## Notes & caveats

- **Contractility and autonomic channels compound.** Because the autonomic channel also acts on
  contractility (it scales `ans_activity`, which drives `el_max`/`el_min`), hypoxia suppresses
  contractility through **two** channels; the combined strength should be validated/tuned (via
  `cont_factor_min` and `ans_factor_min`) against expected behaviour in the host app.
- **O₂-debt handling freezes the pool.** When a step's consumption would drive `COR.to2` negative, the
  whole coronary update is skipped (O₂ not floored to 0, no CO₂ added), so `COR.to2` cannot fall below
  one step's consumption. Under extreme ischemia the hypoxia signal therefore plateaus rather than
  reaching `to2_min`.
- **`mob` is a rough reporter only.** The published `mob` value mixes a rate balance (mmol/s) with a
  concentration (`to2_cor`, mmol/L) and is not dimensionally meaningful; do not use it as a true
  balance.
- **Negative stroke work is not guarded.** If the filling-phase P·dV area exceeds the ejection-phase
  area (`stroke_work_total < 0`), `sw_vo2` and hence `mob_vo2` can go negative, which would *add* O₂ to
  the coronary pool. This does not occur for a normally ejecting ventricle.
- **Model references are not null-guarded.** `AA`, `AA_COR`, `COR`, `Heart`, `LV`, `RV` and the
  Heart's `_lv`/`_rv`/`_la` are dereferenced directly; a configuration lacking any of them throws.

## Example definition (JSON)

From `term_neonate.json` (coronary sub-components abbreviated):

```json
{
  "name": "Mob",
  "description": "myocardial oxygen balance v2 (basal + stroke-work, mmol O2/g)",
  "is_enabled": true,
  "model_type": "Mob",
  "components": {
    "COR":        { "model_type": "BloodTimeVaryingElastance", "u_vol": 0.00028, "el_min": 30000, "el_max": 90000, "...": "..." },
    "AA_COR":     { "model_type": "Resistor", "comp_from": "AA",  "comp_to": "COR", "r_for": 75000, "...": "..." },
    "COR_RAIVCI": { "model_type": "Resistor", "comp_from": "COR", "comp_to": "RAIVCI", "...": "..." },
    "COR_RASVC":  { "model_type": "Resistor", "comp_from": "COR", "comp_to": "RASVC",  "...": "..." }
  },
  "mob_active": true,
  "to2_min": 0.0002,
  "to2_ref": 0.2,
  "resp_q": 0.1,
  "bm_vo2_per_g": 3.7e-5,
  "sw_vo2_per_g": 2.0e-7,
  "hw_intercept": 7.799,
  "hw_slope": 0.004296,
  "hr_factor_max": 1, "hr_factor_min": 0.01, "hr_tc": 5,
  "cont_factor_max": 1, "cont_factor_min": 0.01, "cont_tc": 5,
  "ans_factor_max": 1, "ans_factor_min": 0.01, "ans_tc": 5
}
```

## Usage in the model

- One Mob instance per scenario carrying a heart; it is the only consumer of coronary-pool O₂ and the
  sole source of myocardial hypoxia feedback.
- The coronary network it owns (`COR` + connecting resistors) is *not* listed in
  [`Metabolism`](./Metabolism.md)'s `metabolic_active_models` — the heart's O₂ economy is handled
  exclusively here.
- Its hypoxia channels reach the `Heart`/`HeartChamber` physics through `hr_mob_factor`,
  `el_max_mob_factor` and `ans_activity_factor` (see above).
