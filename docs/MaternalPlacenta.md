# MaternalPlacenta

> **Experimental.** Used only by the archived `adult_female_uterus` scenario (the Pregnancy panel is hidden in the app as unfinished). It builds and runs on the current engine, but its physiology isn't calibrated; see [Assumptions and limitations](#assumptions-and-limitations).

`MaternalPlacenta` is the **mother's** side of the placenta in the adult pregnancy model: the intervillous space (`PL_IVS`), a low-resistance blood lake fed by the spiral arteries off the uterine artery and drained by the uterine veins. It owns no blood. It controls `PL_IVS` and its resistors:
- the spiral arteries dilate with gestational age, so placental flow grows;
- the bed is closed when not pregnant;
- it adds a placental oxygen consumption;
- uterine contractions compress the bed.

It is not the fetal [Placenta](./Placenta.md), which has its own fixed maternal pool `PL_MAT`.

## Physiology

In pregnancy the spiral arteries of the uterus are remodelled into wide, low-resistance channels. Uteroplacental blood flow rises from almost nothing to several hundred mL/min at term, most of it to the placenta, which becomes the dominant share of uterine flow. The placenta itself consumes oxygen. During a contraction the rising pressure inside the uterus compresses the intervillous space and throttles placental perfusion, which is why long or frequent contractions stress the fetus.

## Inheritance

```
BaseModelClass
  └── MaternalPlacenta
```

## Properties

### Config: wiring (model names)

| Property | Default | Description |
|---|---|---|
| `pl_ivs_name` | `"PL_IVS"` | Intervillous space (a BloodVessel). |
| `spiral_res_name` | `"UT_ART_PL_IVS"` | Spiral-artery resistor (PL_IVS's inflow connector). |
| `drain_res_name` | `"PL_IVS_UT_VEN"` | Drainage resistor (owned by `UT_VEN`). |
| `ut_art_name` | `"UT_ART"` | Uterine artery (arterial O2 content for the read-outs). |
| `ut_in_res_name` | `"AD_UT_ART"` | Total uterine inflow (for the flow-share read-out). |
| `uterus_name` | `"Uterus"` | Source of `pregnant`, `preg_ga` and `iup`. |

### Config: physiology

| Property | Unit | Default | Description |
|---|---|---|---|
| `mp_running` | boolean | `true` | Master switch (flow also needs a pregnancy). |
| `preg_ga_threshold` | weeks | 4 | Below this gestational age the placenta is absent (no flow). |
| `preg_ga_term` | weeks | 40 | Age at which the term dilation is reached. |
| `spiral_res_term_factor` | – | 0.01 | `PL_IVS` resistance multiplier at term (archived scenario 0.0075). |
| `met_active` | boolean | `true` | Switches the placental O2 consumption. |
| `mp_vo2` | mL O2/kg/min | 0.04 | Placental O2 consumption at full perfusion, per kg maternal weight (archived scenario 0.33, i.e. ~20 mL/min at 60 kg). |
| `vo2_factor`, `vo2_factor_ps` | – | 1.0 | Non-persistent (reset each step) and persistent VO2 multipliers. |
| `resp_q` | – | 0.8 | Respiratory quotient (CO2 added per O2 used). |
| `contraction_pres_gain` | – | 0.6 | Fraction of the uterine pressure applied to `PL_IVS`. |

### Outputs

| Property | Unit | Description |
|---|---|---|
| `mp_active` | boolean | Pregnant, past the threshold and running. |
| `mp_blood_flow` | mL/min | Placental (spiral-artery) flow, smoothed over 5 s. |
| `mp_flow_fraction` | % | Placental share of total uterine inflow (both smoothed). |
| `mp_do2`, `mp_vo2_ml` | mL O2/min | O2 delivery and consumption. |
| `mp_o2er` | % | O2 extraction ratio. |
| `mp_avo2` | mmol/L | Arterio-venous O2 content difference (`UT_ART` − `PL_IVS`). |

## Calculation

Each step (references resolved lazily, so build order doesn't matter):

1. **Progress through pregnancy:** `frac = (preg_ga − threshold) / (term − threshold)`, clamped to 0–1, and 0 when not pregnant. The placenta is active when `mp_running` and `frac > 0`.
2. **Inactive:** `PL_IVS.no_flow` and the drainage's `no_flow_ext` are set, `PL_IVS.r_factor_scaling_ps` is restored to 1, and the outputs are zeroed. `PL_IVS` stays enabled as an inert pool with a defined pressure.
3. **Spiral-artery dilation:** `PL_IVS.r_factor_scaling_ps = 1 + frac·(spiral_res_term_factor − 1)`.
4. **Contraction compression:** `PL_IVS.pres_ext += Uterus.iup · contraction_pres_gain`.
5. **Placental metabolism.**
   - Consumption scales with perfusion: `vo2_eff = mp_vo2 · factors · (term_factor / res_factor)`, so a small early placenta uses little O2 and the extraction stays physiological.
   - `vo2_eff` is removed from `PL_IVS.to2` (STPD conversion, as in Metabolism), and `resp_q` times that amount is added to `tco2`.
6. **Read-outs:** smoothed flows, the flow share, DO2, VO2, O2ER and the AV difference.

## Factor system

It writes the **scaling layer** `PL_IVS.r_factor_scaling_ps`, the layer that belongs to `ModelScaler`. That is safe only while `PL_IVS` isn't in a scaler group (it isn't in the archived scenario). Its own `vo2_factor`/`vo2_factor_ps` are a simple multiplier pair.

## Inputs and outputs

- **Reads:** `Uterus.pregnant`, `preg_ga`, `iup`; `UT_ART.to2`; the flows of the spiral and uterine inflow resistors; `PL_IVS` volume and contents; `model.weight`.
- **Writes:** `PL_IVS.no_flow`, `r_factor_scaling_ps`, `pres_ext`, `to2`, `tco2`; `PL_IVS_UT_VEN.no_flow_ext`.
- **Written by:** the user (pregnancy settings through `Uterus`).

## Assumptions and limitations

- **Not calibrated.** In the archived scenario at 36 weeks, placental flow is 42 mL/min (28 % of uterine flow). Term uteroplacental flow is roughly 500–750 mL/min, about 80 % placental.
- **No fetal coupling.** Gas exchange between `PL_IVS` and a fetal placental capillary needs a combined mother + fetus scenario; the fetal [Placenta](./Placenta.md) uses its own fixed maternal pool.
- **Linear growth** of spiral-artery conductance with gestational age between the threshold and term.
- **Scaling-layer use** (see [Factor system](#factor-system)), as in [Uterus](./Uterus.md).
- **Consumption is silently capped** when it would make `PL_IVS`'s O2 content negative.

## Example definition (JSON)

From `archive/adult_female_uterus.json`, `models.MaternalPlacenta` (trimmed to the physiology props; the wiring props are the defaults):

```json
{
  "name": "MaternalPlacenta",
  "model_type": "MaternalPlacenta",
  "is_enabled": true,
  "mp_running": true,
  "preg_ga_threshold": 4,
  "preg_ga_term": 40,
  "spiral_res_term_factor": 0.0075,
  "met_active": true,
  "mp_vo2": 0.33,
  "resp_q": 0.8,
  "contraction_pres_gain": 0.6
}
```

## Usage in the scenarios

Only `archive/adult_female_uterus` (60 kg adult female), with `PL_IVS` between `UT_ART` and `UT_VEN` in parallel with the uterine tissue bed (`UT_CAP`). None of the canonical neonatal and fetal scenarios include it.

## References

None calibrated yet.
