# Mob — Myocardial Oxygen Balance

`Mob` models the **oxygen economy of the heart muscle**: how much O₂ the myocardium consumes, how
that O₂ is drawn from the coronary blood pool, and how myocardial **hypoxia** feeds back onto cardiac
function (rate, contractility, autonomic drive). It is the cardiac analogue of `Metabolism` — but
where `Metabolism` is a passive tissue sink, `Mob` also closes a regulatory loop with the `Heart`.

It owns the coronary sub-network (`COR`, `AA_COR`, `COR_RAIVCI`, `COR_RASVC`) declared under its
`components` block.

## Oxygen consumption

Two physiologically explicit terms, both in **mmol O₂ / s**, scaled by heart weight `hw`:

```
hw      = hw_intercept + hw_slope · weight_kg · 1000           [g]   (heart mass from body weight)
bm_vo2  = bm_vo2_per_g · hw                                    [mmol/s]   basal metabolism
sw_vo2  = sw_vo2_per_g · hw · stroke_work_total / cycle_time   [mmol/s]   contractile (stroke) work
mob_vo2 = bm_vo2 + sw_vo2
```

**Stroke work** is the area of the ventricular pressure–volume loop, accumulated by trapezoidal
`P·dV` integration each step and split by flow direction:

- filling (dV > 0) accumulates into `_pv_area_*_inc`
- ejection (dV < 0) accumulates into `_pv_area_*_dec`
- at the start of each cardiac cycle: `stroke_work = _pv_area_dec − _pv_area_inc` (the enclosed loop
  area), the per-beat O₂ cost is computed, and the accumulators reset.

The per-beat stroke-work cost is then amortized over the current `cardiac_cycle_time` to give a rate.

## Coronary pool update

Per step, `mvo2_step = mob_vo2 · Δt` is drawn from the coronary blood pool `COR`, with CO₂ added back
via the respiratory quotient `resp_q`:

```
COR.to2  := (to2·vol − mvo2_step) / vol
COR.tco2 := (tco2·vol + mvo2_step·resp_q) / vol
```

The update is applied only when it keeps `to2 ≥ 0` (see caveats).

## Hypoxia feedback to the Heart

Coronary O₂ (`COR.to2`) drives a one-sided activation: at/above `to2_ref` there is no effect; below
it the activation goes negative, reaching its floor at `to2_min`. Three independent channels each
low-pass the activation with their own time constant (`hr_tc`, `cont_tc`, `ans_tc`) and map it onto a
factor in `[*_min, *_max]`:

| Channel | Computed factor | Written to | Effect |
|---|---|---|---|
| Heart rate | `hr_factor` | `Heart.hr_mob_factor` | lowers heart rate (bradycardia) |
| Contractility | `cont_factor` | each chamber's `el_max_mob_factor` | lowers `el_max` (negative inotropy) |
| Autonomic | `ans_activity_factor` | `Heart.ans_activity_factor` | scales the sympathetic drive the Heart propagates to the chambers |

At normal coronary O₂ all three factors are 1.0 (no effect); under severe coronary hypoxia each
drives toward its `*_min` (default 0.01), i.e. profound suppression of rate, contractility and
autonomic responsiveness — the model of an ischemic, failing myocardium.

### How the channels reach the physics

- **`hr_mob_factor`** is read in `Heart.calc_model` (heart-rate sum).
- **`el_max_mob_factor`** is read in `HeartChamber.calc_elastances` as an additive factor on `el_max`
  (alongside `el_max_factor`, `el_max_factor_ps`, …).
- **`ans_activity_factor`** is read in `Heart.calc_varying_elastance`: the chambers receive
  `ans_activity · ans_activity_factor` instead of `ans_activity`, so it scales the sympathetic
  inotropy/lusitropy term in `HeartChamber.calc_elastances`.

## Configuration (model-definition fields)

| Field | Meaning |
|---|---|
| `mob_active` | master on/off |
| `to2_ref`, `to2_min` | coronary O₂ window over which hypoxia ramps in |
| `resp_q` | respiratory quotient (CO₂/O₂) |
| `bm_vo2_per_g`, `sw_vo2_per_g` | basal and stroke-work O₂ cost per gram of myocardium |
| `hw_intercept`, `hw_slope` | heart-mass-from-body-weight regression |
| `hr_factor_min/max`, `hr_tc` | heart-rate hypoxia channel |
| `cont_factor_min/max`, `cont_tc` | contractility hypoxia channel |
| `ans_factor_min/max`, `ans_tc` | autonomic hypoxia channel |

## Notes & caveats

- **Contractility and autonomic channels were previously inert.** `el_max_mob_factor` had no term in
  `HeartChamber.calc_elastances`, and `Heart` never read `ans_activity_factor` — so only the
  heart-rate channel was wired. Both are now connected (see above). Because the autonomic channel also
  acts on contractility (it scales `ans_activity`, which drives `el_max`/`el_min`), hypoxia now
  suppresses contractility through **two** compounding channels; the combined strength should be
  validated/tuned (via `cont_factor_min` and `ans_factor_min`) against expected behaviour in the host
  app.
- **O₂-debt handling freezes the pool.** When a step's consumption would drive `COR.to2` negative,
  the whole coronary update is skipped (O₂ not floored to 0, no CO₂ added), so `COR.to2` cannot fall
  below one step's consumption. Under extreme ischemia the hypoxia signal therefore plateaus rather
  than reaching `to2_min`.
- **`mob` is a rough reporter only.** The published `mob` value mixes a rate balance (mmol/s) with a
  concentration (`to2_cor`, mmol/L) and is not dimensionally meaningful; do not use it as a true
  balance.
- **Negative stroke work is not guarded.** If the filling-phase P·dV area exceeds the ejection-phase
  area (`stroke_work_total < 0`), `sw_vo2` and hence `mob_vo2` can go negative, which would *add* O₂
  to the coronary pool. This does not occur for a normally ejecting ventricle.
- **Model references are not null-guarded.** `AA`, `AA_COR`, `COR`, `Heart`, `LV`, `RV` and the
  Heart's `_lv`/`_rv`/`_la` are dereferenced directly; a configuration lacking any of them throws.
