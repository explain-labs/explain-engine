# HeartFunction — Load-Induced Ventricular Contractility Compromise

`HeartFunction` models how a ventricle becomes **compromised** when it labors against a very high
pressure (afterload) or is over-dilated by too much volume (preload). It is a feedback controller in
the same family as `Mob` and `Ans`: it runs in the step loop, reads the per-beat metrics that
`Heart.analyze()` already produces, and writes multiplier **factors** onto the `LV` and `RV`
`HeartChamber`s. It owns no sub-models and touches no base parameters directly.

## Physiology — why a single signal (wall stress)

The healthy Frank–Starling response (more filling → more stroke volume) and afterload sensitivity
(higher ejection pressure → higher end-systolic volume, lower stroke volume) are **already emergent**
in the time-varying elastance core (`TimeVaryingElastance.calc_pressure`): the ESPVR
(`el_max` = Ees = contractility) and the EDPVR coupled to the circuit reproduce them with no extra
code. What `HeartFunction` adds is the **pathological** part — sustained load actually *degrading*
contractility rather than just shifting the operating point on a fixed curve.

The unifying signal is the **Laplace wall stress** of a thin-walled sphere:

```
sigma = P · r / (2 · h)
```

A single quantity captures both mechanisms:

- **Afterload** raises `sigma` through the pressure `P` (end-systolic wall stress `sigma_es`).
- **Dilation** raises `sigma` through the cavity radius `r` (end-diastolic wall stress `sigma_ed`).

This is more faithful than driving off raw pressure/volume, and unlike an Ea/Ees ratio it captures
pure volume overload. Note the modern physiology: there is **no true sarcomere "descending limb" in
vivo** (titin caps sarcomere length ~2.2 µm). High-afterload decompensation is **afterload mismatch**
(Ross 1976) — stroke volume falls when preload reserve is exhausted or Ees is low — and dilation harm
is the Laplace wall-stress / energetic mismatch, not overstretch. The model is built around that view.

## Geometry

Per ventricle, from the end-systolic and end-diastolic cavity volumes (`Heart.lv_esv/lv_edv`,
`rv_esv/rv_edv`):

```
r      = (3 · V_cav / 4π)^(1/3)                                  cavity radius  (V in mL → r in cm)
R_out  = (3 · (V_cav + V_wall) / 4π)^(1/3)                       outer radius
h      = R_out − r                                               wall thickness
```

Wall volume scales with heart weight (reusing Mob's relation), split by a configurable LV/RV mass
fraction, so it tracks body weight automatically:

```
hw       = hw_intercept + hw_slope · weight_kg · 1000            [g]
V_wall_x = wall_volume_x  (if > 0)  else  hw · wall_frac_x / wall_density   [mL]
```

Wall stress uses the chamber transmural recoil pressure (`pres_in`) and the per-phase volume:
`sigma_es = lv_esp · r_es / (2·h_es)`, `sigma_ed = lv_edp · r_ed / (2·h_ed)`.

## Setpoints (auto-calibration)

Baseline wall stress depends on each scenario's geometry, so the setpoints `sigma_*_ref_{lv,rv}`
auto-calibrate: during an initial window (`setpoint_warmup` seconds **of elapsed model time since the
model started** — not the absolute engine clock, since scenarios are saved with a non-zero
`model_time_total`) the model tracks the resting peak wall stress and freezes the reference to it.
While warming up, all factors are held at `1.0` (no effect). Provide a positive `sigma_*_ref` in the
definition to override and skip auto-learning.

## Acute layer (reversible, seconds–minutes)

When end-systolic stress (afterload) or end-diastolic stress (over-dilation) exceeds its setpoint,
contractility is depressed, smoothed by a first-order lag toward the target:

```
excess_es  = max(0, sigma_es − ref_es)
excess_ed  = max(0, sigma_ed − ref_ed)
target     = clamp(1 − g_es·excess_es − g_ed·excess_ed, cont_floor, 1)
load_factor += dt · (1/cont_tc) · (target − load_factor)
```

`load_factor` is written to the chamber's `el_max_load_factor`. It fully recovers to `1.0` within
~`cont_tc` when the load normalizes (afterload mismatch is reversible / inotrope-correctable).

## Chronic layer (remodeling, slow)

A slow wall-stress average (time constant `stress_avg_tc`) drives two remodeling integrators with the
time constant `remodel_tc` (default ~1 day; compress it to observe remodeling within a short run):

- **Concentric** `rc` (sustained high `sigma_es`, pressure overload): thickens the wall (raises the
  effective `V_wall`, lowering `sigma` — compensation) with a maladaptive tail of diastolic
  stiffening and a mild contractility decline.
- **Eccentric** `re` (sustained high `sigma_ed`, volume overload): dilates the cavity and declines
  contractility.

These map onto chamber factors:

```
el_max_remodel_factor = clamp(1 − mal_conc·rc − mal_ecc·re, remodel_floor, 1)
el_k_remodel_factor   = 1 + stiff_conc · rc      (concentric diastolic stiffening)
u_vol_remodel_factor  = 1 + dil_ecc · re         (eccentric cavity dilation)
```

## Wiring into the chamber

`HeartChamber.calc_elastances()` adds the two `el_max` terms and the `el_k` term, and
`HeartChamber.calc_volumes()` (overridden) adds the `u_vol` term — all following the existing additive
`+ (factor − 1) · base` convention, so they compose cleanly with the ANS inotropic term and Mob's
`el_max_mob_factor`. The existing `el_max_eff < el_min_eff` clamp protects the lower bound. Atria are
left untouched (factors stay `1.0`).

## Verification

`scripts/probe_heartfunction.mjs` builds `term_neonate`, warms up, then applies an afterload challenge
and a volume-overload challenge, printing wall stress, the acute factor, and the remodeling state.
Observed behavior: at baseline factors stay ≈1.0; a transfusion drives `sigma_ed`/`sigma_es` well above
setpoint, collapses ejection fraction, depresses `el_max_load_factor` to its floor, and—on a
time-compressed run—dilates `u_vol_remodel_factor` and drops `el_max_remodel_factor` (the full
both-timescale decompensation cascade). An afterload challenge raises `sigma_es` and depresses
contractility directionally; note that the `term_neonate` circulation has a low-resistance runoff, so
forcing severe *pure* pressure overload is hard in that scenario (a model-of-circulation property, not
a `HeartFunction` limitation).

## Key parameters

| Parameter | Meaning |
| --- | --- |
| `hf_active`, `remodel_active` | master switches for the acute and chronic layers |
| `wall_frac_lv/rv`, `wall_volume_lv/rv`, `wall_density` | wall-volume geometry |
| `g_es_lv/rv`, `g_ed_lv/rv` | acute contractility-depression gains (afterload / dilation) |
| `cont_tc`, `cont_floor` | acute response time constant and lower bound |
| `remodel_tc`, `stress_avg_tc` | chronic remodeling and stress-averaging time constants |
| `k_conc`, `k_ecc`, `mal_conc`, `mal_ecc`, `stiff_conc`, `dil_ecc`, `remodel_floor` | remodeling gains and bound |
| `setpoint_warmup`, `sigma_*_ref_*` | setpoint auto-calibration window / overrides |
