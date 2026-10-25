# HeartFunction

`HeartFunction` models how a ventricle becomes compromised when it works against too high a pressure (afterload) or is stretched by too much volume (preload). It watches each ventricle's wall stress beat by beat:
- **Acute:** stress well above the resting level depresses contractility quickly and reversibly.
- **Chronic:** stress that stays high remodels the ventricle slowly.

It acts on the `LV` and `RV` [`HeartChamber`](./HeartChamber.md)s through factor props only. It owns no sub-models.

## Physiology

The healthy responses to load need no extra code; they emerge from the time-varying elastance:
- **Frank–Starling:** more filling gives more stroke volume.
- **Afterload sensitivity:** higher ejection pressure gives a larger end-systolic volume and less stroke volume.

HeartFunction adds the **pathological** part: sustained load that actually *degrades* the ventricle.

The common signal is the **wall stress** (Laplace's law for a sphere): `σ = P · r / (2h)`.
- **Afterload** raises it through the pressure `P` (end-systolic stress).
- **Dilation** raises it through the cavity radius `r` (end-diastolic stress).

So one signal covers both pressure and volume overload.

- **Acute: afterload mismatch and over-distension (seconds to minutes).** When the stress rises well above its resting level, contractility falls. This follows Ross's afterload mismatch concept (stroke volume falls once the preload reserve is used up), not a sarcomere "descending limb", which does not exist in vivo. It recovers fully when the load normalises.
- **Chronic: remodelling (hours to days).** Sustained pressure overload (concentric remodelling) stiffens the ventricle and lowers contractility slightly. Sustained volume overload (eccentric remodelling) dilates the cavity and lowers contractility.

## Inheritance

```
BaseModelClass
  └── HeartFunction
```

## Properties

### Config: switches and geometry

| Property | Unit | Default | Description |
|---|---|---|---|
| `hf_active` | boolean | `true` | Master switch (both layers). |
| `remodel_active` | boolean | `true` | Chronic layer switch. |
| `hw_intercept`, `hw_slope` | g, g/g | 7.799, 0.004296 | Heart weight `hw = hw_intercept + hw_slope · weight_kg · 1000` (the same relation as `Mob`). |
| `wall_density` | g/mL | 1.05 | Myocardial density. |
| `wall_frac_lv`, `wall_frac_rv` | – | 0.35, 0.15 | Share of heart mass in the LV and RV free walls. |
| `wall_volume_lv`, `wall_volume_rv` | mL | 0.0 | Explicit wall volumes; ≤ 0 derives them from heart weight. |

### Config: acute layer

| Property | Unit | Default | Description |
|---|---|---|---|
| `stress_deadband` | – | 1.5 | The response starts above this multiple of the resting setpoint. |
| `g_es_lv`, `g_ed_lv` | 1/mmHg | 0.00125, 0.005 | LV contractility loss per mmHg of end-systolic / end-diastolic stress above the dead-band. |
| `g_es_rv`, `g_ed_rv` | 1/mmHg | 0.002, 0.0075 | The same for the RV (thinner wall, more load-sensitive). |
| `cont_tc` | s | 30 | Time constant of the response. |
| `cont_floor` | – | 0.2 | Lowest acute factor. |

### Config: chronic layer

| Property | Unit | Default | Description |
|---|---|---|---|
| `remodel_tc` | s | 86400 | Remodelling time constant (~1 day; shorten it to see remodelling in a short run). |
| `stress_avg_tc` | s | 300 | Time constant of the slow stress average that drives remodelling. |
| `k_conc`, `k_ecc` | 1/mmHg | 0.01, 0.02 | Concentric / eccentric drive per mmHg of sustained stress above the setpoint. |
| `mal_conc`, `mal_ecc` | – | 0.15, 0.25 | Contractility loss per unit concentric / eccentric remodelling. |
| `stiff_conc` | – | 0.5 | Diastolic stiffening (`el_k`) per unit concentric remodelling. |
| `dil_ecc` | – | 0.4 | Cavity dilation (`u_vol`) per unit eccentric remodelling. |
| `remodel_floor` | – | 0.3 | Lowest chronic contractility factor. |

### Config: setpoints

| Property | Unit | Default | Description |
|---|---|---|---|
| `sigma_es_ref_lv`, `sigma_ed_ref_lv`, `sigma_es_ref_rv`, `sigma_ed_ref_rv` | mmHg | 0.0 | Resting end-systolic / end-diastolic wall stress per ventricle. A value > 0 is kept as given. A value ≤ 0 is learned during the warm-up. |
| `setpoint_warmup` | s | 60 | Learning window, in elapsed model time since the model started (not the engine clock; saved scenarios have a non-zero `model_time_total`). |

### Outputs

| Property | Unit | Description |
|---|---|---|
| `hw` | g | Heart weight. |
| `wall_stress_es_lv`, `wall_stress_ed_lv`, `wall_stress_es_rv`, `wall_stress_ed_rv` | mmHg | Wall stress at end-systole and end-diastole. |
| `radius_es_lv`, `radius_ed_lv`, `radius_es_rv`, `radius_ed_rv` | cm | Cavity radius of the equivalent sphere. |
| `wall_thickness_lv`, `wall_thickness_rv` | cm | Wall thickness at end-diastole. |
| `el_max_load_factor_lv`, `el_max_load_factor_rv` | – | Acute factor (also written to the chamber). |
| `remodel_concentric_lv`, `remodel_eccentric_lv`, `remodel_concentric_rv`, `remodel_eccentric_rv` | – | Remodelling state. |

## Calculation

`calc_model()` (when `hf_active`) computes the heart weight and the two wall volumes, then for each ventricle:

1. **Geometry** (thin-walled sphere, volumes in mL ≙ cm³):
   ```
   r = (3·V_cav / 4π)^(1/3)        h = (3·(V_cav + V_wall) / 4π)^(1/3) − r
   σ_es = esp · r_es / (2·h_es)     σ_ed = edp · r_ed / (2·h_ed)
   ```
   `esp`, `esv`, `edp`, `edv` come from `Heart` (latched each beat); the pressures are transmural.
2. **Setpoints.** During the warm-up each setpoint not given in the definition tracks the highest stress seen. While a ventricle is still learning, both of its layers are held at no effect.
3. **Acute layer:**
   ```
   excess = max(0, σ − stress_deadband · σ_ref)          (end-systolic and end-diastolic)
   target = clamp(1 − g_es·excess_es − g_ed·excess_ed, cont_floor, 1)
   load_factor += dt/cont_tc · (target − load_factor)
   ```
4. **Chronic layer.** Slow averages of `σ_es` and `σ_ed` (time constant `stress_avg_tc`) drive:
   ```
   rc → k_conc · max(0, σ_es,slow − σ_es,ref)            (time constant remodel_tc)
   re → k_ecc  · max(0, σ_ed,slow − σ_ed,ref)
   ```
5. **Write the chamber factors:**
   ```
   el_max_load_factor    = load_factor
   el_max_remodel_factor = max(remodel_floor, 1 − mal_conc·rc − mal_ecc·re)
   el_k_remodel_factor   = 1 + stiff_conc·rc
   u_vol_remodel_factor  = 1 + dil_ecc·re
   ```

## Factor system

None of its own. It writes four of [`HeartChamber`'s](./HeartChamber.md#set-by-other-models) additive terms on the LV and RV; the atria are untouched.

## Inputs and outputs

- **Reads:** `Heart.lv_esp`, `lv_esv`, `lv_edp`, `lv_edv` and the `rv_*` equivalents; `model.weight`.
- **Writes:** `el_max_load_factor`, `el_max_remodel_factor`, `el_k_remodel_factor`, `u_vol_remodel_factor` on `LV` and `RV`, every step.
- **Read by:** `DataCollector` watchers; `scripts/probe_heartfunction.mjs`.

## Assumptions and limitations

- **The dead-band keeps normal loading out.** The response starts only above 1.5 × the resting stress. Without it, any preload rise above rest depressed contractility; the depressed ventricle dilated, which raised the stress further, and a normal +8 % volume load ran away to `cont_floor`. In term_neonate (reflexes off), 1.5 × is reached at:
  - a MAP of ~80 mmHg (LV afterload);
  - LA ~9 mmHg (LV over-dilation);
  - a doubled PVR (RV).

  The gains are a quarter of their first values, so the depression is graded and stable. For example:
  - +50 mL blood volume → LV factor 0.84 (LA 17.6);
  - PVR ×4 → RV 0.81;
  - arterioles ×3 → LV 0.96.
- **Concentric remodelling does not thicken the wall.** The wall volume is fixed by heart weight, so there is no compensating fall in stress. Its diastolic stiffening acts on `el_k`, which is the whole diastolic stiffness of the chambers in every scenario.
- **Spherical geometry for both ventricles.** The crescent-shaped RV is treated as a sphere with 15 % of the heart mass.
- **The heart-weight relation has a large intercept** (7.8 g), so small infants get relatively thick walls and low wall stress. The stress values compare within a scenario, not between sizes.
- **One-beat start-up transient.** Right after a scenario loads, the first latched beat can exceed the dead-band briefly (LV end-diastolic up to 1.54 × in a 25-week PDA patient). The effect on the load factor is about 10⁻⁵.
- **Remodelling is slow by design** (`remodel_tc` one day). Over a normal session it stays at its saved value.

## Example definition (JSON)

From `term_neonate.json`, `models.HeartFunction` (trimmed to the main config props):

```json
{
  "name": "HeartFunction",
  "model_type": "HeartFunction",
  "is_enabled": true,
  "hf_active": true,
  "remodel_active": true,
  "stress_deadband": 1.5,
  "setpoint_warmup": 60,
  "sigma_es_ref_lv": 78.1419,
  "sigma_ed_ref_lv": 21.6036,
  "sigma_es_ref_rv": 127.4271,
  "sigma_ed_ref_rv": 56.9684
}
```

## Usage in the scenarios

One instance in every scenario, enabled, with resting setpoints learned for that scenario. Use `scripts/_relearn_heartfunction.mjs <scenario> --write` to re-learn them after re-calibrating a scenario.

| Scenario | LV σ_es / σ_ed | RV σ_es / σ_ed |
|---|---|---|
| term_neonate | 78.1 / 21.6 | 127.4 / 57.0 |

`scripts/probe_heartfunction.mjs` exercises it on term_neonate with an afterload and a volume challenge.

## References

- Ross J Jr. Afterload mismatch and preload reserve: a conceptual framework for the analysis of ventricular function. *Prog Cardiovasc Dis* 1976;18(4):255–264. [doi:10.1016/0033-0620(76)90021-9](https://doi.org/10.1016/0033-0620(76)90021-9)

The gains, dead-band and time constants are model choices, tuned for graded, stable behaviour (see [Assumptions](#assumptions-and-limitations)).
