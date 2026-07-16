# MaternalPlacenta

The `MaternalPlacenta` model is a **controller/process model** (extends `BaseModelClass`) for the
**maternal** side of the placenta: the perfused **intervillous space** (`PL_IVS`), a low-resistance
blood lake fed by the **spiral arteries** off the uterine arterial supply (`UT_ART`) and draining to
the uterine veins (`UT_VEN`), in parallel with the non-placental uterine tissue (`UT_CAP`). Like
[Uterus](./Uterus.md) and [Placenta](./Placenta.md) it owns no blood of its own — it operates on the
existing `PL_IVS` compartment that `Circulation` supplies, gating and scaling it from a single set of
parameters. Its perfusion grows from ~0 (non-pregnant: the placenta does not exist) to the
**dominant share** of uterine flow at term, driven entirely by the `Uterus`'s pregnancy gestational
age (`preg_ga`).

> **Maternal vs fetal — do not confuse the two placenta models.** [`Placenta`](./Placenta.md) is the
> **fetal** placental circulation: fetal blood runs through the umbilical vessels to the fetal-side
> capillary (`PL_FETAL_CAP`) and exchanges gas across the membrane with a *fixed-composition* maternal
> pool (`PL_MAT`). `MaternalPlacenta` is the **maternal** side: a real, perfused intervillous bed
> (`PL_IVS`) carrying maternal blood off the uterine circulation, with its own flow, metabolism, and
> contraction response. The legacy `PL_MAT` fixed pool used by the fetal `Placenta` is left untouched
> by this model; the two are not yet coupled (see *Usage in the model*).

## Inheritance

```
BaseModelClass
  └── MaternalPlacenta   (maternal intervillous-space controller)
```

## What it models

`MaternalPlacenta` runs once per step (`calc_model`) and, when the bed is active, does five things to
the `PL_IVS` compartment and its connecting resistors:

1. **Growth with gestation.** The spiral arteries dilate as pregnancy advances. The model scales
   `PL_IVS`'s input resistance down with GA via the persistent `r_factor_scaling_ps` layer, so
   maternal placental blood flow grows from near-zero early to the dominant share of uterine flow at
   term. The spiral-artery resistor *is* `PL_IVS`'s own input resistor.
2. **Gating.** When not pregnant (or stopped) the bed is held `no_flow` on both the spiral inflow and
   the drainage, so it adds zero perturbation to the calibrated uterine baseline. `PL_IVS` stays
   `is_enabled` (an inert pool with a defined pressure).
3. **Placental metabolism.** A dedicated placental VO2 is applied to `PL_IVS` using the same molar
   conversion as `Metabolism`/`Uterus` (`0.039 mmol O2/mL`), giving real O₂ extraction across the
   intervillous space.
4. **Contraction compression.** The uterine intrauterine pressure (`Uterus.iup`) is applied as
   external pressure on `PL_IVS`, so contractions throttle placental perfusion.
5. **Read-outs.** Placental blood flow (mL/min), its share of uterine flow (%), DO2, VO2, O2ER, and
   the arterio-venous O₂ content difference.

The spiral-artery resistor (`UT_ART_PL_IVS`) hangs off `UT_ART` in **parallel** with the
non-placental myometrial capillary (`UT_CAP`); both beds drain into the common `UT_VEN`:

```
            ┌──[UT_ART_PL_IVS]──► PL_IVS ──[PL_IVS_UT_VEN]──┐
UT_ART ─────┤   (spiral arteries)  (intervillous bed)        ├──► UT_VEN
            └──────────────────► UT_CAP ─────────────────────┘
                                 (non-placental myometrium)
```

## Properties

### Configuration (independent parameters)

| Property | Unit | Description |
|---|---|---|
| `mp_running` | bool | Master gate. Flow is *additionally* gated by pregnancy (read from the `Uterus`). |
| `pl_ivs_name` | string | Name of the intervillous-space compartment (the blood lake). Default `"PL_IVS"`. |
| `spiral_res_name` | string | Name of the spiral-artery resistor — owned by `PL_IVS`, equals its `r_for_eff`. Default `"UT_ART_PL_IVS"`. |
| `drain_res_name` | string | Name of the drainage resistor (owned by `UT_VEN`). Default `"PL_IVS_UT_VEN"`. |
| `ut_art_name` | string | Arterial source compartment, for arterial O₂-content read-outs. Default `"UT_ART"`. |
| `ut_in_res_name` | string | Total uterine inflow resistor, for the flow-share read-out. Default `"AD_UT_ART"`. |
| `uterus_name` | string | Where `preg_ga` / `pregnant` / `iup` are read from (single source of truth). Default `"Uterus"`. |
| `preg_ga_threshold` | weeks | Below this GA the placenta is treated as absent (no flow). Default `4.0`. |
| `preg_ga_term` | weeks | GA anchor at which the term dilation is reached. Default `40.0`. |
| `spiral_res_term_factor` | unitless | `PL_IVS` resistance multiplier at term (small → large flow). Default `0.01`. |
| `met_active` | bool | Placental O₂ consumption / CO₂ production on/off. Default `true`. |
| `mp_vo2` | mL O₂/kg/min | Placental oxygen use (scenario-calibrated). Default `0.04`. |
| `vo2_factor` | unitless | Non-persistent VO2 multiplier — reset to `1.0` every step. Default `1.0`. |
| `vo2_factor_ps` | unitless | Persistent VO2 multiplier (interventions). Default `1.0`. |
| `resp_q` | unitless | Respiratory quotient (CO₂ produced / O₂ consumed). Default `0.8`. |
| `contraction_pres_gain` | unitless | Fraction of the uterine IUP applied as `pres_ext` on `PL_IVS`. Default `0.6`. |

### Read-outs (dependent parameters)

| Property | Unit | Description |
|---|---|---|
| `mp_blood_flow` | mL/min | Maternal placental blood flow (EMA-smoothed spiral-artery flow). |
| `mp_flow_fraction` | % | Placental flow as a percentage of total uterine inflow. |
| `mp_do2` | mL O₂/min | Oxygen delivery into the intervillous space. |
| `mp_vo2_ml` | mL O₂/min | Oxygen uptake. |
| `mp_o2er` | % | Oxygen extraction ratio (`mp_vo2_ml / mp_do2`). |
| `mp_avo2` | mmol/L | Arterio-venous O₂ content difference (`UT_ART.to2 − PL_IVS.to2`). |
| `mp_active` | bool | Whether the placental bed is perfused (pregnant **and** running). |

### Internal state (not configured)

`_pl_ivs`, `_spiral_res`, `_drain_res`, `_ut_art`, `_ut_in_res`, `_uterus` are lazily-resolved model
references (resolved in `calc_model`, not `init_model`, since they may be built after this controller).
`_flow_ema` / `_ut_in_ema` are exponentially-smoothed flows (L/s) and `_flow_tc` (5.0 s) is the
smoothing time constant.

## `init_model(args)`

Calls `super.init_model(args)` to apply the config args. It does **not** resolve the compartment /
resistor / `Uterus` references — those are resolved lazily inside `calc_model` so the model is
independent of build order.

## `calc_model()`

Runs every step. Steps in order:

1. **Lazy reference resolution.** Resolve any still-null reference (`_pl_ivs`, `_spiral_res`,
   `_drain_res`, `_ut_art`, `_ut_in_res`, `_uterus`) from `model_engine.models`. If `PL_IVS` cannot be
   found, return immediately.

2. **Pregnancy progress.** Read `ga = Uterus.preg_ga` and `pregnant = Uterus.pregnant`. Compute a
   normalized fraction:

   ```
   frac = 0
   if pregnant and ga > preg_ga_threshold:
       frac = (ga - preg_ga_threshold) / (preg_ga_term - preg_ga_threshold)   # clamped to ≤ 1.0
   active = mp_running and frac > 0
   mp_active = active
   ```

3. **Gating.** Re-asserted every step:
   - `PL_IVS.no_flow = !active` and `drain_res.no_flow = !active`. A non-pregnant or stopped placenta
     is perfectly inert (no perturbation of the uterine baseline), but `PL_IVS` stays `is_enabled` so
     it retains a defined pressure.
   - If **not active**: restore `PL_IVS.r_factor_scaling_ps = 1.0` (the layer this model owns), zero
     all read-outs, and return.

4. **Spiral-artery dilation.** Scale `PL_IVS` input resistance down with GA:

   ```
   res_factor = 1.0 + frac * (spiral_res_term_factor - 1.0)
   PL_IVS.r_factor_scaling_ps = res_factor
   ```

   Written every step (idempotent — the engine recomputes `r_for_eff` from the base each step;
   `BloodVessel` composes `r_factor_scaling_ps` multiplicatively, disjoint from the layers any other
   model writes).

5. **Contraction compression.** Add the uterine IUP as external pressure on the bed:

   ```
   PL_IVS.pres_ext += Uterus.iup * contraction_pres_gain
   ```

   Re-asserted each step (the compartment resets `pres_ext` after use).

6. **Placental metabolism (when `met_active` and `PL_IVS.vol > 0`).** VO2 is scaled by **perfusion**,
   not GA, so a small early-gestation placenta with little flow consumes little O₂ (a full-strength
   VO2 on a tiny early flow would drive O2ER far above 100%):

   ```
   flow_ratio = (res_factor > 0) ? spiral_res_term_factor / res_factor : 0      # 0..1, ~1 at term
   vo2_eff    = mp_vo2 * vo2_factor * vo2_factor_ps * flow_ratio                 # mL O2/kg/min
   vo2_step   = (O2_MMOL_PER_ML * vo2_eff * model.weight / 60.0) * _t            # mmol per step

   PL_IVS.to2  = max(0, (PL_IVS.to2 * vol - vo2_step) / vol)
   PL_IVS.tco2 = max(0, (PL_IVS.tco2 * vol + vo2_step * resp_q) / vol)
   mp_vo2_ml   = vo2_eff * model.weight                                         # mL O2/min
   ```

   where `O2_MMOL_PER_ML = 0.039` and `vol = PL_IVS.vol`. Then `vo2_factor` is reset to `1.0`. When
   inactive metabolism, `mp_vo2_ml = 0`.

7. **Smoothed flows (EMA).** With `alpha = _t / (_flow_tc + _t)`:

   ```
   _flow_ema  += (spiral_res.flow  - _flow_ema)  * alpha     # L/s
   _ut_in_ema += (ut_in_res.flow   - _ut_in_ema) * alpha     # L/s
   mp_blood_flow   = _flow_ema * 60000.0                     # L/s -> mL/min
   mp_flow_fraction = (_ut_in_ema > 0) ? (_flow_ema / _ut_in_ema) * 100.0 : 0   # %
   ```

   Both numerator and denominator of the share are smoothed so the ratio is not polluted by pulsatile
   sampling.

8. **O₂ delivery / extraction read-outs.** Arterial content is taken from `UT_ART` (falls back to
   `PL_IVS` if `_ut_art` is missing); venous content is `PL_IVS`:

   ```
   art_to2    = ut_art ? ut_art.to2 : PL_IVS.to2
   flow_l_min = _flow_ema * 60.0                              # L/min
   mp_do2  = (flow_l_min * art_to2) / O2_MMOL_PER_ML          # mL O2/min
   mp_avo2 = art_to2 - PL_IVS.to2                             # mmol/L
   mp_o2er = (mp_do2 > 0) ? (mp_vo2_ml / mp_do2) * 100.0 : 0  # %
   ```

## Factor system

`MaternalPlacenta` does not expose a base/`_ps`/`_scaling_ps` factor triplet of its own. It is a
controller that **writes** other models' factor layers:

- **`PL_IVS.r_factor_scaling_ps`** — owned and written by this model for spiral-artery dilation. It is
  the *scaling* layer, disjoint from the ANS (`r_factor`/`r_factor_ps`) layers, and composes
  multiplicatively in `BloodVessel`. When the bed is inactive this model restores it to `1.0`.
- **`vo2_factor` / `vo2_factor_ps`** — multipliers on the placental VO2 (non-persistent and persistent
  respectively), mirroring the `Uterus` / `Metabolism` convention. `vo2_factor` is reset to `1.0`
  every step.

## Example definition (JSON)

From `public/model_definitions/adult_female_uterus.json`:

```json
{
  "name": "MaternalPlacenta",
  "description": "maternal placenta: perfused intervillous space fed by spiral arteries off the uterine bed",
  "is_enabled": true,
  "model_type": "MaternalPlacenta",
  "components": {},
  "mp_running": true,
  "pl_ivs_name": "PL_IVS",
  "spiral_res_name": "UT_ART_PL_IVS",
  "drain_res_name": "PL_IVS_UT_VEN",
  "ut_art_name": "UT_ART",
  "ut_in_res_name": "AD_UT_ART",
  "uterus_name": "Uterus",
  "preg_ga_threshold": 4,
  "preg_ga_term": 40,
  "spiral_res_term_factor": 0.0075,
  "met_active": true,
  "mp_vo2": 0.33,
  "vo2_factor": 1,
  "vo2_factor_ps": 1,
  "resp_q": 0.8,
  "contraction_pres_gain": 0.6,
  "mp_blood_flow": 0,
  "mp_flow_fraction": 0,
  "mp_do2": 0,
  "mp_vo2_ml": 0,
  "mp_o2er": 0,
  "mp_avo2": 0
}
```

The scenario also defines the compartment and resistors this model drives: `PL_IVS`
(a `BloodCapacitance`/`BloodVessel` intervillous lake), `UT_ART_PL_IVS` (spiral-artery resistor off
`UT_ART`), and `PL_IVS_UT_VEN` (drainage to `UT_VEN`). The scenario value
`spiral_res_term_factor = 0.0075` is slightly lower than the class default (`0.01`) to hit the target
term placental flow.

## Usage in the model

- **Scenario:** ships in `adult_female_uterus`, the maternal pregnancy scenario built on
  `adult_female`. It is the *maternal placenta (Part 5)* layer on top of the uterine bed (Part 1) and
  the [`Uterus`](./Uterus.md) organ (Parts 2–4).

- **Coupling with the [Uterus](./Uterus.md).** The `Uterus` is the single source of truth for
  pregnancy state. `MaternalPlacenta` reads `Uterus.preg_ga` and `Uterus.pregnant` (to gate and scale
  flow) and `Uterus.iup` (to compress the bed during contractions). The `Uterus` itself dilates the
  *conduit* and *myometrial* (`UT_CAP`) beds via its own `preg_*` scaling; note its
  `preg_cap_res_term_factor` lets the non-placental myometrium stay a modest minority while the
  intervillous bed carries the dominant share at term. Both `UT_CAP` and `PL_IVS` drain into the
  **common `UT_VEN`**, which is why the `Uterus`'s `ut_o2er` read-out is computed from the
  arterio-venous content difference rather than a single bed's VO2/DO2.

- **Spiral arteries off `UT_ART`, parallel to `UT_CAP`.** The spiral-artery resistor `UT_ART_PL_IVS`
  taps the same arterial source as the myometrial capillary, so dilating `PL_IVS`'s input resistance
  (lowering `spiral_res_term_factor`) shifts the share of uterine inflow toward the placenta — the
  `mp_flow_fraction` read-out tracks this share.

- **Contrast with the fetal [Placenta](./Placenta.md).** The fetal `Placenta` model exchanges gas
  across the membrane with a fixed-composition maternal pool (`PL_MAT`) — an infinite reservoir held
  at `mat_to2`/`mat_tco2`, not a perfused bed. `MaternalPlacenta` models the maternal blood lake
  (`PL_IVS`) as a *real* perfused compartment with its own inflow, metabolism, and venous drainage.
  The two are **not yet coupled**: there is no `PL_GASEX`-style diffusor between `PL_IVS` and a fetal
  capillary in this version (that requires a combined mother+fetus scenario with a fetal circulation).
  The legacy fixed `PL_MAT` pool is left untouched, and `MaternalPlacenta` runs standalone on the
  maternal side. The `Uterus`'s `couple_placenta` hook drives `PL_MAT` (the fetal-`Placenta` pool)
  from uterine arterial blood — that is a separate mechanism and does not feed `PL_IVS`.
