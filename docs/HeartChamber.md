# HeartChamber

A `HeartChamber` is a heart chamber: a [`TimeVaryingElastance`](./TimeVaryingElastance.md) that holds blood (composition mixed like a [`BloodCapacitance`](./BloodCapacitance.md)). Its contractility and relaxation respond to the autonomic nervous system, drugs, myocardial oxygen balance, load and remodelling. The atria and ventricles (`LA`, `LV`, `RV` and the two halves of the right atrium) are HeartChambers.

## Physiology

Each chamber stiffens when activated and relaxes in between (see [TimeVaryingElastance](./TimeVaryingElastance.md#physiology)). Two numbers describe it:
- **`el_max`, contractility:** how stiff it gets at peak contraction.
- **`el_min`, diastolic stiffness:** how easily it fills.

Several influences change those two numbers, and HeartChamber adds them up:

- **Sympathetic (β1) stimulation** raises contractility (*inotropy*) and speeds relaxation, lowering diastolic stiffness (*lusitropy*).
- **Inotropes and lusitropes** (adrenaline, milrinone, …) do the same through the `Drugs` model.
- **Myocardial hypoxia** (oxygen supply below demand) depresses contractility through `Mob`.
- **Load and remodelling.** An acutely overloaded ventricle loses contractility (afterload mismatch). A chronically overloaded one remodels: it dilates (larger unstressed volume), stiffens and loses contractility. `HeartFunction` models both.
- **The clinician or scenario** sets contractility and relaxation per side of the heart through `Heart` (`cont_factor_*`, `relax_factor_*`).

## Inheritance

```
BaseModelClass
  └── TimeVaryingElastance
        └── HeartChamber      (own factor composition with ANS/drug/Mob/load/remodel terms; blood mixing)
```

HeartChamber overrides `calc_elastances` and `calc_volumes` (extra terms, floors) and `volume_in` (blood mixing). `calc_pressure` is inherited unchanged. Its sibling [`BloodTimeVaryingElastance`](./BloodTimeVaryingElastance.md) (the coronary bed) has the mixing but none of the extra terms.

## Properties

Elastance, volume, activation and factor props are inherited: see [TimeVaryingElastance → Properties](./TimeVaryingElastance.md#properties).

### Config (set in the definition JSON)

| Property | Unit | Default | Description |
|---|---|---|---|
| `temp` | °C | 37.0 | Blood temperature; mixed on inflow, relaxed toward `body_temp` by `Blood`. |
| `viscosity` | cP | 6.0 | Overwritten by `Blood` from the chamber's haemoglobin every step; not mixed. |
| `solutes` | object | `{}` | Solute concentrations, seeded from `Blood` when empty. |
| `drugs` | object | `{}` | Drug concentrations (`Drugs`). |

### Set by other models

| Property | Unit | Default | Written by | Effect |
|---|---|---|---|---|
| `ans_sens` | – | 1.0 | `Heart` (its own `ans_sens`), every step | Sensitivity to `ans_activity`. |
| `ans_activity` | – | 1.0 | `Heart`: `ans_activity · ans_activity_factor` (`EF_HEART` drive scaled by `Mob`), every step | > 1 raises `el_max` and lowers `el_min`. |
| `el_max_mob_factor` | – | 1.0 | `Mob` (all chambers) | Hypoxic contractility depression. |
| `el_max_drug_factor` | – | 1.0 | `Drugs` (all chambers) | Inotropy. |
| `el_min_drug_factor` | – | 1.0 | `Drugs` (all chambers) | Lusitropy; < 1 = better relaxation. |
| `el_max_load_factor` | – | 1.0 | `HeartFunction` (LV, RV) | Acute load-induced contractility depression. |
| `el_max_remodel_factor` | – | 1.0 | `HeartFunction` (LV, RV) | Chronic remodelling: contractility. |
| `el_k_remodel_factor` | – | 1.0 | `HeartFunction` (LV, RV) | Chronic remodelling: diastolic stiffening. |
| `u_vol_remodel_factor` | – | 1.0 | `HeartFunction` (LV, RV) | Chronic remodelling: dilation. |
| `act_factor` | – | 0.0 | `Heart` | Activation (inherited; see [TimeVaryingElastance](./TimeVaryingElastance.md#set-by-other-models)). |

These factors are not reset each step; their writers hold them. The props `Blood` and `BloodComposition` write onto every blood compartment (`haldane_coeff`, `P50_0`, `viscosity_ref`, `body_temp`, `blood_temp_tc`, `temp_ext_override`, `prev_ph`, `prev_po2`) are described on [BloodCapacitance](./BloodCapacitance.md#set-by-other-models).

### Outputs

| Property | Unit | Default | Description |
|---|---|---|---|
| `to2`, `tco2` | mmol/L | 0.0 | Total O2 and CO2 content; mixed on inflow. |
| `ph`, `pco2`, `po2`, `so2`, `hco3`, `be` | as in [BloodCapacitance](./BloodCapacitance.md#outputs) | -1 | Blood gases, `-1` = not calculated. `Blood` solves them for `RAIVCI` (once per second). |

## Calculation

`calc_model()` (inherited) runs `calc_elastances()` → `calc_volumes()` → `calc_pressure()`.

1. **`calc_elastances`** composes every term **additively** against the base value:
   ```
   el_min_eff = el_min · (1 + (el_min_factor − 1) + (el_min_factor_ps − 1) + (el_min_factor_scaling_ps − 1)
                            + (el_min_drug_factor − 1)
                            − (ans_activity − 1)·ans_sens)                      ← subtracted: lusitropy
   el_max_eff = el_max · (1 + (el_max_factor − 1) + (el_max_factor_ps − 1) + (el_max_factor_scaling_ps − 1)
                            + (el_max_mob_factor − 1) + (el_max_drug_factor − 1)
                            + (el_max_load_factor − 1) + (el_max_remodel_factor − 1)
                            + (ans_activity − 1)·ans_sens)                      ← added: inotropy
   el_k_eff   = el_k · (1 + (el_k_factor − 1) + (el_k_factor_ps − 1) + (el_k_factor_scaling_ps − 1)
                          + (el_k_remodel_factor − 1)
                          + (the el_min modulation above: relaxation, drug lusitropy, ANS))
   ```
   The diastolic modulation scales the **whole** diastolic curve, `el_min` and `el_k` alike, so relaxation, lusitropy and the ANS still act on a chamber whose diastolic stiffness is quadratic.
   Then:
   - `el_min_eff` and `el_k_eff` are floored at 0 (the subtracted terms could take them below);
   - `el_max_eff` is raised to `el_min_eff` if it falls below it;
   - the non-persistent factors are reset.
2. **`calc_volumes`**: `u_vol_eff = u_vol · (1 + the three layers + (u_vol_remodel_factor − 1))`, floored at 0. `u_vol_factor` is reset.
3. **`calc_pressure`** (inherited): `pres_in = p_ed + (p_es − p_ed)·act_factor` (see [TimeVaryingElastance → Calculation](./TimeVaryingElastance.md#calculation)), plus the pericardial `pres_ext`.

**`volume_in(dvol, comp_from)`** adds the volume and mixes the incoming blood with [`mix_blood_in`](./BloodMixing.md): `to2`, `tco2`, solutes, drugs and temperature.

## Factor system

All layers and terms are **additive**, unlike `BloodVessel`'s multiplicative composition (see [ARCHITECTURE §7a](./ARCHITECTURE.md#7a-the-factor--effective-value-pattern)). Two consequences:

- **Effects add, they don't compound.** For example, `Heart` contractility +20 % and an inotrope +20 % give +40 %, not +44 %.
- **One sign is reversed.** The ANS term is *subtracted* for `el_min`: more sympathetic drive means a lower diastolic stiffness.

The persistent layers are written by `Heart`:
- `set_contractility` → `el_max_factor_ps`;
- `set_relaxation` → `el_min_factor_ps`, left and right separately.

The scaling layers are written by `ModelScaler`, and the `Calibrator` also writes `el_max_factor_ps`.

## Inputs and outputs

- **Reads:** the upstream compartment on inflow (composition).
- **Written by:**
  - `Heart` (activation, ANS, contractility and relaxation factors);
  - `Mob`, `Drugs`, `HeartFunction` (the terms above);
  - `Blood` (temperature, viscosity, seed composition);
  - `PERICARDIUM` (`pres_ext`);
  - the valves and connectors (volume).
- **Read by:**
  - the valves and connectors (`pres`);
  - `Heart` (volumes and `pres_in` for the per-beat analysis);
  - `Mob` (LV/RV pressure and volume for stroke work);
  - `Monitor`, `Blood` (`RAIVCI` blood gas);
  - `DataCollector` watchers (PV loops).

## Assumptions and limitations

- **Additive composition.** Large simultaneous effects add linearly. Several large negative terms together can only be stopped by the floor at 0.
- **One ANS signal, all chambers.** The atria and both ventricles get the same `ans_activity` and `ans_sens`.
- **Quadratic diastolic relation** (see [The diastolic relation](#the-diastolic-relation)): steeper than linear but less steep than the measured power law.
- **One unstressed volume** for the diastolic and systolic relations (inherited).
- **Right-ventricle unstressed volume: 1.64× the LV's in every scenario.** `u_vol` is also the volume intercept of the end-systolic relation, so it sets how stiff the contracting RV is. Until the re-validation the postnatal scenarios had 5.46× (term 4.0 vs 0.73 mL), which made the RV's end-systolic elastance about the LV's (term 28 vs 30 mmHg/mL), where real RVs have roughly ⅓–½ of it, and left the RV almost insensitive to afterload. They now use the fetal scenarios' ratio, with `el_max` and `el_k` refitted (`scripts/_fix_rv_unstressed.mjs`) so the resting RV end-diastolic and end-systolic volumes are unchanged:

  | Scenario | RV `u_vol` (mL) | RV / LV `el_max` (mmHg/mL) | Pulmonary arterioles ×2, RV SV (reflexes off) |
  |---|---|---|---|
  | term_neonate | 4.0 → 1.20 | 9.8 / 30.5 (was 28.1) | −5.7 % (was −3.4 %) |

  The resting state moved ≤0.5 %. An open duct offloads the pulmonary artery, so in the PDA patients of the (since removed) Bischoff scenarios the RV felt less of a pulmonary resistance rise (−2 to −3 %).

## Example definition (JSON)

From `term_neonate.json`, `models.Heart.components.LV` (trimmed to the config props):

```json
{
  "name": "LV",
  "model_type": "HeartChamber",
  "is_enabled": true,
  "vol": 0.00606,
  "u_vol": 0.000733,
  "el_min": 0,
  "el_max": 30477.7,
  "el_k": 156107,
  "ans_sens": 1
}
```

## The diastolic relation

Normal hearts stiffen steeply as they fill. Volume-normalised end-diastolic pressure–volume curves share one shape across human, dog and rat hearts, `EDP ∝ V^2.79` (Klotz 2006). The engine's diastolic term is `el_min·S + el_k·S²` (`S = vol − u_vol`). The closest it gets is a **pure quadratic**, `el_min` 0 with all the stiffness in `el_k`: local stiffness at rest is then 2× the average, against 2.8× for the power law.

In every scenario all five chambers use the pure quadratic, with `el_k` from `scripts/_fix_chamber_edpvr.mjs`:
- **Fit:** the resting end-diastolic (ventricles) and mean (atria) volumes are unchanged, and so are the resting vitals.
- **Right atrium:** the two halves share one `el_k`, and their connector `RAIVCI_RASVC` is `implicit`. With stiffening atria the explicit scheme of that low-resistance connector oscillated.
- **Effect:** in term_neonate with the reflexes off, +30 mL of blood raises stroke volume +17 % (linear: +34 %) and LV EDP +5.6 mmHg (linear: +3.6). That is the limited preload reserve of the newborn heart.

The since-removed `preterm_25wk` and `bischoff_ltr_pda`, small babies with a left-to-right duct, were not fitted. Their resting atrial pressures and ventricular volumes are set by the circulation around the heart and hardly respond to chamber stiffness, so fitting the atria on volume drove the LA soft until its pressure collapsed (preterm_25wk LA 3.2 → −1.4 mmHg). They use the unfitted start, `el_k = el_min_old / S₀` (`--iter 1 --force`), within 2–4 % of every resting volume and pressure. Against their reference pages nothing moves more than 1.5 % (HR, MAP, SpO2, SvO2, outputs), preterm_25wk's foramen ovale flow returns to left-to-right (−0.9 → +2.4 mL/kg/min) and mitral E/A rises from 0.35/0.42 to 0.69.

## Usage in the scenarios

Five chambers in every scenario, all owned by `Heart` and inside `PERICARDIUM`. Their elastances and activations are listed on [TimeVaryingElastance → Usage](./TimeVaryingElastance.md#usage-in-the-scenarios).

### The split right atrium

The right atrium is two chambers:
- `RAIVCI` receives the IVC and the coronary sinus (`COR_RAIVCI`);
- `RASVC` receives the SVC.

Each has its own tricuspid half (`RAIVCI_RV`, `RASVC_RV`, both `HeartValve`s) and foramen-ovale half (`LA_RAIVCI`, `LA_RASVC`, owned by `Shunts`). The two halves are joined by the `RAIVCI_RASVC` resistor (in `Heart.components`):

| Scenarios | `RAIVCI_RASVC` | Effect |
|---|---|---|
| Fetal (no shipped scenario at present) | `no_flow: true` (sealed; `mix_flow` inactive) | Preferential streaming: ductus venosus/IVC blood → foramen ovale → LA; SVC blood → RV. |
| Postnatal (term_neonate) | open both ways, `r_for`/`r_back` 13 mmHg·s/L, `mix_flow` 0.01 L/s | One atrium in pressure (the halves within ≈ 0.01 mmHg) but only **partly mixed**, as IVC/SVC streaming is in a real atrium. `mix_flow` was chosen in the engine review to bring the RA SO2 gap between the halves from 6.1 to 1.5 %. |

Constraints on the resistance and mixing:
- **Stable resistance.** The postnatal resistance follows `R = max(1, ⌈2·dt·(E₁max + E₂max)⌉)`. R must stay above `dt·(E₁ + E₂)`, about 6 at dt 0.0005, or the explicit integration oscillates; the factor 2 covers ANS-raised elastance.
- **Not weight-scaled.** `RAIVCI_RASVC` isn't in the scaler config.
- **Mixed venous saturation.** `Blood` solves both `RAIVCI` and `PA`, the true mixed venous blood; the Monitor reads SvO2 from `PA` (see [Monitor](./Monitor.md)).

## References

- Klotz S, Hay I, Dickstein ML, et al. Single-beat estimation of end-diastolic pressure-volume relationship: a novel method with potential for noninvasive application. *Am J Physiol Heart Circ Physiol* 2006;291(1):H403–H412. [doi:10.1152/ajpheart.01240.2005](https://doi.org/10.1152/ajpheart.01240.2005)

Otherwise this class introduces no literature-derived values. For the time-varying elastance concept see [TimeVaryingElastance](./TimeVaryingElastance.md#references). Chamber elastances are scenario calibrations (see [TermNeonateReference](./TermNeonateReference.md)).
