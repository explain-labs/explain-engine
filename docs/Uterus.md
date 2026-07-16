# Uterus

The `Uterus` model turns the otherwise-passive uterine vascular bed (`UT_ART → UT_CAP → UT_VEN`)
into a living organ. Like [`Placenta`](./Placenta.md), [`MaternalPlacenta`](./MaternalPlacenta.md) and
`Kidneys`, it is a **controller / process model**: it extends `BaseModelClass`, owns no blood of its
own, and instead operates each step on the existing uterine compartments and resistors that
`Circulation` supplies. It does three things: (1) imposes a dedicated uterine oxygen consumption on
`UT_CAP`; (2) applies pregnancy adaptation — gestational-age scaling of bed resistance, unstressed
volume and VO₂ that grows uterine blood flow from ~50 mL/min toward 500–700 mL/min at term; and
(3) models uterine contractions / labor via a periodic intrauterine-pressure (IUP) waveform that
compresses and throttles the bed. It is calibration-neutral at its defaults (non-pregnant, no
contractions).

## Inheritance

```
BaseModelClass
  └── Uterus   (uterine bed controller: metabolism + pregnancy scaling + contractions)
```

## What it models

The uterine circulation is the bed `UT_ART → UT_CAP → UT_VEN`, fed by the inflow resistor
`AD_UT_ART` (off the abdominal aorta `AD`) and drained by `UT_VEN_VLB` (into the lower-body venous
bed `VLB`). `Uterus` does not hold blood; it modulates the components by reference name:

| Reference | Default name | Role |
|---|---|---|
| `_ut_art` | `UT_ART` | arteriolar inflow vessel |
| `_ut_cap` | `UT_CAP` | capillary — metabolism / gas-exchange site (myometrium) |
| `_ut_ven` | `UT_VEN` | venular outflow vessel |
| `_ut_in_res` | `AD_UT_ART` | inflow resistor — the uterine blood-flow source (read for flow) |
| `_ut_out_res` | `UT_VEN_VLB` | venular drainage resistor (owned by `VLB`; scaled here in pregnancy) |
| `_pl_mat` | `PL_MAT` | maternal placental pool — driven only when `couple_placenta` is on |

All references are resolved **lazily** in `calc_model()` (build-order independent), because the
Circulation compartments may be instantiated after this controller.

Three behaviours, all gated:

- **Uterine metabolism** — a dedicated uterine VO₂ (`ut_vo2`, mL O₂/kg/min) applied directly to
  `UT_CAP` using the same molar conversion as the whole-body `Metabolism` model
  (`0.039 mmol O₂/mL` at 37 °C). It is deliberately **not** registered in
  `Metabolism.metabolic_active_models`, so the calibrated whole-body VO₂ map is untouched and the
  uterus carries an independent, pregnancy-scalable O₂ demand.
- **Pregnancy adaptation** — `preg_ga` (pregnancy gestational age, weeks; distinct from the
  engine-level `model.gestational_age`, which is the mother's own birth GA) drives a linear ramp that
  drops bed resistance and raises unstressed volume + VO₂ from the non-pregnant baseline to term
  anchors, expanding uterine flow.
- **Contractions / labor** — a periodic IUP waveform (resting tone + half-sine contraction every
  `contraction_period` s) that throttles the bed by both physical compression (`pres_ext`) and a
  transient resistance rise (`r_factor`), with MVU / activity read-outs.

## Properties

### Config (independent — set in JSON)

| Property | Unit | Description |
|---|---|---|
| `uterus_running` | bool | Master gate for uterine organ function. When false, the pregnancy scaling layers this model owns are restored to 1.0 and outputs zeroed. |
| `ut_art_name` | string | Name of the arteriolar inflow vessel (`UT_ART`). |
| `ut_cap_name` | string | Name of the capillary / metabolism site (`UT_CAP`). |
| `ut_ven_name` | string | Name of the venular outflow vessel (`UT_VEN`). |
| `ut_in_res_name` | string | Name of the inflow resistor read for blood flow (`AD_UT_ART`). |
| `ut_out_res_name` | string | Name of the venular drainage resistor scaled in pregnancy (`UT_VEN_VLB`). |
| `met_active` | bool | Uterine O₂ consumption on/off. |
| `ut_vo2` | mL O₂/kg/min | Uterine oxygen use applied to `UT_CAP` (scenario-calibrated, ~25 % O2ER at baseline). |
| `vo2_factor` | unitless | Non-persistent VO₂ multiplier — reset to 1.0 every step (transient interventions). |
| `vo2_factor_ps` | unitless | Persistent VO₂ multiplier (interventions / scaling). |
| `resp_q` | unitless | Respiratory quotient (CO₂ produced / O₂ consumed). |
| `perfusion_factor` | unitless | Transient vaso-tone knob written to `UT_ART.r_factor`. <1 = vasodilation (more flow), >1 = vasoconstriction. |
| `pregnant` | bool | Master pregnancy gate (default false → preserves the non-pregnant calibration). |
| `preg_ga` | weeks | Pregnancy gestational age (0 = non-pregnant … 40 = term). |
| `preg_ga_threshold` | weeks | Below this GA the bed is treated as non-pregnant (no scaling). |
| `preg_ga_term` | weeks | GA anchor at which the term multipliers are reached. |
| `preg_res_term_factor` | unitless | Conduit (`UT_ART`/`UT_VEN`) resistance multiplier at term. |
| `preg_cap_res_term_factor` | unitless | `UT_CAP` (myometrium) resistance multiplier at term — dilates separately from the conduits. Defaults to the conduit factor unless overridden. |
| `preg_vol_term_factor` | unitless | Bed unstressed-volume multiplier at term (engorgement). |
| `preg_vo2_term_factor` | unitless | Uterine / conceptus VO₂ multiplier at term. |
| `couple_placenta` | bool | When pregnant and true, drive the `PL_MAT` pool gas content from uterine arterial blood. |
| `pl_mat_name` | string | Name of the maternal placental pool driven when coupling (`PL_MAT`). |
| `contractions_running` | bool | Master gate for contractions (default false → bed untouched). |
| `contraction_period` | s | Seconds between contraction onsets (active labor ≈ every 180 s / 3 min). |
| `contraction_duration` | s | Duration of each contraction's rise + fall. |
| `resting_tone` | mmHg | Baseline IUP between contractions. |
| `contraction_amplitude` | mmHg | Peak IUP above resting tone. |
| `contraction_pres_gain` | unitless (0..1) | Fraction of IUP applied as `pres_ext` to the bed. |
| `contraction_r_peak` | unitless (≥1) | Bed resistance multiplier at peak contraction. |

### Computed (dependent — read-outs)

| Property | Unit | Description |
|---|---|---|
| `ut_blood_flow` | mL/min | Smoothed uterine blood flow (EMA of the inflow resistor flow). |
| `ut_do2` | mL O₂/min | Oxygen delivery. |
| `ut_vo2_ml` | mL O₂/min | Oxygen uptake (rate). |
| `ut_o2er` | % | Oxygen extraction ratio, from the actual arterio-venous content difference. |
| `ut_avo2` | mmol/L | Arterio-venous O₂ content difference (whole-uterus). |
| `iup` | mmHg | Current intrauterine pressure. |
| `contraction_active` | bool | True while inside a contraction. |
| `montevideo_units` | — | MVU = peak amplitude × contractions per 10 min (labor adequacy). |

### Internal state (not config)

`_flow_ema` (smoothed inflow, L/s), `_flow_tc` (smoothing time constant, 5.0 s),
`_contraction_timer` (s elapsed within the current contraction cycle). `_t` is the modeling
step-size (s) inherited from the base.

## `calc_model()` — calculation cycle

After lazy reference resolution and the gating guards (`uterus_running`; presence of `UT_ART`,
`UT_CAP`, `UT_VEN`; and `UT_CAP.vol > 0`), the step runs in order:

### Pregnancy bed scaling

A normalised pregnancy progress `frac ∈ [0, 1]` is computed by `_preg_frac()`:

```
frac = 0                                                       if !pregnant or preg_ga ≤ preg_ga_threshold
frac = (preg_ga - preg_ga_threshold) / (preg_ga_term - preg_ga_threshold)   otherwise, clamped to 1
```

Term-anchored multipliers are then linearly interpolated from 1.0 (non-pregnant) toward each
`*_term_factor`:

```
res_factor     = 1 + frac · (preg_res_term_factor     - 1)   // conduits UT_ART / UT_VEN / drainage
cap_res_factor = 1 + frac · (preg_cap_res_term_factor - 1)   // UT_CAP (myometrium)
vol_factor     = 1 + frac · (preg_vol_term_factor     - 1)   // bed unstressed volume
```

These are written **every step** to the persistent scaling layers (idempotent — the engine
recomputes each `*_eff` from the base each step, so re-asserting never compounds):

```
UT_ART.r_factor_scaling_ps = UT_VEN.r_factor_scaling_ps = res_factor
UT_CAP.r_factor_scaling_ps = cap_res_factor
UT_ART/UT_CAP/UT_VEN.u_vol_factor_scaling_ps = vol_factor
UT_VEN_VLB.r_factor_scaling_ps = res_factor          // drainage resistor, if present
```

Scaling the `UT_VEN_VLB` drainage resistor matters: it is owned by `VLB` (which re-asserts its base
`r_for` each step), but its `r_factor_scaling_ps` layer is free. Without scaling it, the unscaled
drainage resistance becomes the dominant series resistor at term, capping flow at ~385 mL/min and
pinning `UT_VEN` pressure high.

### VO₂ scaling (tied to flow, not GA)

VO₂ expansion tracks the **flow** expansion (`~1/cap_res_factor`), not GA linearly — because flow is
convex in GA (flow ~ 1/R, R linear in GA), a GA-linear VO₂ would outpace perfusion mid-gestation and
push O2ER unphysiologically high:

```
flow_factor      = 1 / cap_res_factor
flow_factor_term = 1 / preg_cap_res_term_factor
preg_vo2 = 1 + ((flow_factor - 1) / (flow_factor_term - 1)) · (preg_vo2_term_factor - 1)   if flow_factor_term > 1
preg_vo2 = 1                                                                                otherwise
```

`preg_vo2` reaches `preg_vo2_term_factor` exactly when flow reaches its term expansion.

### Uterine contractions

When `contractions_running`, the cycle timer advances by `_t` and wraps at `contraction_period`. The
contraction intensity is a smooth half-sine over the active window, flat between contractions:

```
intensity = sin(π · _contraction_timer / contraction_duration)   for _contraction_timer < contraction_duration
intensity = 0                                                     otherwise
contraction_active = intensity > 0
iup = resting_tone + contraction_amplitude · intensity
```

The IUP throttles the bed two ways:

```
pres_ext += iup · contraction_pres_gain          // physical compression on UT_ART, UT_CAP, UT_VEN
contraction_r_factor = 1 + intensity · (contraction_r_peak - 1)   // controllable flow reduction
montevideo_units = contraction_amplitude · (600 / contraction_period)
```

When contractions are off, the timer/`iup`/`montevideo_units` are zeroed and `contraction_r_factor`
stays 1.0.

### Resistance composition (transient layer)

The transient perfusion knob and the contraction factor are written to the **non-persistent**
`r_factor` layer (the vessels reset it to 1.0 each step, so it is re-asserted every step):

```
UT_ART.r_factor = perfusion_factor · contraction_r_factor
UT_CAP.r_factor = contraction_r_factor
UT_VEN.r_factor = contraction_r_factor
```

### Uterine O₂ consumption / CO₂ production

When `met_active`, applied to `UT_CAP` (same molar conversion as `Metabolism`):

```
vo2_eff  = ut_vo2 · vo2_factor · vo2_factor_ps · preg_vo2                       (mL O₂/kg/min)
vo2_step = (O2_MMOL_PER_ML · vo2_eff · model.weight / 60) · _t                  (mmol per step)

UT_CAP.to2  = max(0, (to2·vol  − vo2_step)        / vol)
UT_CAP.tco2 = max(0, (tco2·vol + vo2_step·resp_q) / vol)
ut_vo2_ml   = vo2_eff · model.weight                                            (mL O₂/min)
```

with `O2_MMOL_PER_ML = 0.039`. `vo2_factor` is then reset to 1.0 (the non-persistent layer).

### Flow & oxygen read-outs

Inflow is exponentially smoothed (`_flow_tc = 5.0 s`, long enough to average several cardiac cycles)
to tame the pulsatile resistor flow:

```
alpha = _t / (_flow_tc + _t)
_flow_ema += (AD_UT_ART.flow − _flow_ema) · alpha
ut_blood_flow = _flow_ema · 60000                       (L/s → mL/min)

flow_l_min = _flow_ema · 60                             (L/s → L/min)
ut_do2  = (flow_l_min · UT_ART.to2) / O2_MMOL_PER_ML    (mL O₂/min)
ut_avo2 = UT_ART.to2 − UT_VEN.to2                       (mmol/L)
ut_o2er = (ut_avo2 / UT_ART.to2) · 100                  (%, 0 if UT_ART.to2 ≤ 0)
```

O2ER is derived from the actual content difference `(Ca − Cv)/Ca`, which is flow- and
VO₂-source-independent — important because `UT_VEN` is the **common outflow** of both the myometrial
(`UT_CAP`) and placental (`PL_IVS`, via [`MaternalPlacenta`](./MaternalPlacenta.md)) beds. At baseline
this equals the older VO₂/DO₂ form.

### Maternal-placental coupling

When `pregnant && couple_placenta`, the maternal placental pool `PL_MAT` gas content is driven from
uterine arterial blood so the placental maternal supply tracks uterine perfusion:

```
PL_MAT.to2  = UT_ART.to2
PL_MAT.tco2 = UT_ART.tco2
```

`Placenta` is the other writer of `PL_MAT`; its `skip_mat_gas_write` flag must be set so exactly one
model is authoritative per step. (Note: this is the legacy fixed `PL_MAT` pool of the fetal
[`Placenta`](./Placenta.md) — distinct from the perfused `PL_IVS` intervillous space owned by
[`MaternalPlacenta`](./MaternalPlacenta.md).)

### Helper methods

- `_preg_frac()` — normalised pregnancy progress, as above.
- `_reset_preg_scaling()` — restores the pregnancy scaling layers this model owns
  (`r_factor_scaling_ps`, `u_vol_factor_scaling_ps` on `UT_ART/UT_CAP/UT_VEN`, plus the drainage
  resistor's `r_factor_scaling_ps`) to 1.0; called when `uterus_running` is false so disabling the
  organ doesn't strand the scaled bed.
- `_zero_outputs()` — zeroes all read-outs (used when gated off or `UT_CAP.vol ≤ 0`).

## Factor system

`Uterus` is a controller, so it does not carry the `el_*`/`r_*` factor triplets itself — instead it
**writes into** the factor layers of the bed components it controls, and the math above relies on
those layers being disjoint so they compose multiplicatively:

| Layer it writes | On | Purpose |
|---|---|---|
| `r_factor_scaling_ps` | `UT_ART`, `UT_CAP`, `UT_VEN`, `UT_VEN_VLB` | persistent pregnancy resistance scaling (idempotent each step) |
| `u_vol_factor_scaling_ps` | `UT_ART`, `UT_CAP`, `UT_VEN` | persistent pregnancy volume (engorgement) scaling |
| `r_factor` (non-persistent) | `UT_ART`, `UT_CAP`, `UT_VEN` | transient `perfusion_factor` × contraction resistance, re-asserted each step |
| `pres_ext` (additive) | `UT_ART`, `UT_CAP`, `UT_VEN` | contraction physical compression, re-added each step |

These layers are deliberately disjoint from the ANS (`ans_*`), the SVR layer (`r_factor_ps`) and each
other, so the uterine controller stacks cleanly on top of the rest of the circulation. For its own
metabolism, `Uterus` exposes the standard `vo2_factor` (non-persistent, reset each step) /
`vo2_factor_ps` (persistent) pair on the VO₂ rate.

## Example definition (JSON)

From `adult_female_uterus.json` (`model_definition.models.Uterus`):

```json
{
  "name": "Uterus",
  "description": "uterine organ: perfusion + oxygen consumption read-outs",
  "is_enabled": true,
  "model_type": "Uterus",
  "components": {},
  "uterus_running": true,
  "ut_art_name": "UT_ART",
  "ut_cap_name": "UT_CAP",
  "ut_ven_name": "UT_VEN",
  "ut_in_res_name": "AD_UT_ART",
  "ut_out_res_name": "UT_VEN_VLB",
  "met_active": true,
  "ut_vo2": 0.04,
  "vo2_factor": 1,
  "vo2_factor_ps": 1,
  "resp_q": 0.8,
  "perfusion_factor": 1,
  "pregnant": false,
  "preg_ga": 0,
  "preg_ga_threshold": 4,
  "preg_ga_term": 40,
  "preg_res_term_factor": 0.083,
  "preg_cap_res_term_factor": 0.43,
  "preg_vol_term_factor": 3,
  "preg_vo2_term_factor": 2,
  "couple_placenta": false,
  "pl_mat_name": "PL_MAT",
  "contractions_running": false,
  "contraction_period": 180,
  "contraction_duration": 60,
  "resting_tone": 8,
  "contraction_amplitude": 50,
  "contraction_pres_gain": 0.6,
  "contraction_r_peak": 2
}
```

At these defaults (non-pregnant, contractions off) the bed runs at its calibrated baseline:
`ut_blood_flow ≈ 49 mL/min`, `ut_vo2_ml = 2.4 mL O₂/min`, `ut_o2er ≈ 28 %`. Note this scenario
overrides `preg_cap_res_term_factor` to `0.43` (so the myometrial capillary stays a modest minority
of uterine flow once a maternal placenta carries the dominant share) and `preg_vo2_term_factor` to
`2` rather than the constructor defaults of `0.083` / `8.0`.

## Usage in the model

- **Scenario:** `adult_female_uterus.json` (the maternal/pregnancy line built on `adult_female`).
- **Bed it drives:** the `UT_ART → UT_CAP → UT_VEN` uterine vascular bed, fed by `AD_UT_ART` (off the
  abdominal aorta) and drained by `UT_VEN_VLB` (into the lower-body venous bed).
- **Couples to** [`MaternalPlacenta`](./MaternalPlacenta.md): both organs read pregnancy progress from
  the same `preg_ga`, and `UT_VEN` is the common outflow of both the myometrial (`UT_CAP`) and
  placental intervillous (`PL_IVS`) beds, so the whole-uterus O2ER read-out stays correct once the
  placenta carries flow. `MaternalPlacenta` reads `Uterus.preg_ga`, `Uterus.pregnant` and
  `Uterus.iup` (for spiral-artery dilation and contraction compression) — `Uterus` is the single
  source of truth for pregnancy state.
- **Distinct from** the fetal [`Placenta`](./Placenta.md): `Placenta` models the **fetal** side
  (umbilical circulation + the fixed `PL_MAT` reservoir); `Uterus` and `MaternalPlacenta` model the
  **maternal** uterine circulation. When `couple_placenta` is enabled, `Uterus` drives the legacy
  `PL_MAT` pool from uterine arterial blood.
