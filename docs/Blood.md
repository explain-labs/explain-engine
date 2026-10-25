# Blood

`Blood` manages the circulating blood as a whole; it is not a compartment. It holds the reference composition (haemoglobin and the other solutes, O2 and CO2 content, temperature), seeds it into every blood compartment at build, sets the blood-wide properties (O2–Hb affinity, Haldane effect, viscosity), and once per second solves the blood gases at the sites a clinician samples. The chemistry itself is in [BloodComposition](./BloodComposition.md).

## Physiology

Blood carries oxygen bound to haemoglobin, CO2 mostly as bicarbonate, and the electrolytes and buffers that set its pH. A few properties belong to the blood as a whole:
- **O2–Hb affinity (P50).** Fetal haemoglobin binds oxygen more tightly (P50 ~18–19 mmHg) than adult haemoglobin (~27 mmHg), so a fetus or newborn is more saturated at the same pO2.
- **Haldane effect.** Deoxygenated blood carries more CO2, which helps unload CO2 in the tissues and the lungs.
- **Viscosity** rises steeply with the haematocrit. Polycythaemia raises vascular resistance; anaemia or haemodilution lowers it.
- **Temperature.** Blood is warmed or cooled by the tissues it passes through.

The clinician samples blood gases at fixed sites: **pre-ductal** (right arm, ascending aorta), **post-ductal** (umbilical artery, descending aorta) and **mixed venous** (pulmonary artery). A pre/post-ductal difference signals right-to-left shunting across the duct.

## Inheritance

```
BaseModelClass
  └── Blood
```

## Properties

### Config (set in the definition JSON)

| Property | Unit | Default | Description |
|---|---|---|---|
| `to2`, `tco2` | mmol/L | 0, 0 | Total O2 and CO2 content seeded into fresh compartments. |
| `solutes` | object | `{}` | Solute set seeded into fresh compartments (mmol/L; `albumin` g/L): `na`, `k`, `ca`, `cl`, `mg`, `lact`, `phosphates`, `uma` (unmeasured anions), `albumin`, `hemoglobin`, `glucose`. |
| `temp` | °C | 37.0 | Temperature seeded into fresh compartments (not the live temperature, see `set_temperature`). |
| `blood_temp_tc` | s | 10 | Time constant with which each compartment relaxes toward its perfusion target `body_temp`. |
| `P50_0` | mmHg | 20.0 | O2–Hb affinity at standard conditions, given to every compartment that has none: fetal ~18.8, neonatal 20, adult 26.7. Scenarios 18.5–20. |
| `haldane_coeff` | – | 1.0 | Haldane-effect strength in the CO2 solver (0 = off), given to every compartment. **2.2 in every scenario.** |
| `viscosity_plasma` | cP | 1.3 | Plasma viscosity. |
| `viscosity_hct_k` | per unit Hct | 3.13 | Exponential haematocrit coefficient (low-shear, in vivo). |
| `blood_containing_modeltypes` | list | 4 types | Model types treated as blood compartments: `BloodVessel`, `HeartChamber`, `BloodCapacitance`, `BloodTimeVaryingElastance`. |

### Outputs

| Property | Unit | Description |
|---|---|---|
| `viscosity` | cP | Viscosity at the build-time haemoglobin (a definition value is overwritten at build); changed by `set_viscosity`. |
| `viscosity_ref` | cP | Viscosity the vessel resistances are calibrated at: from the volume-weighted Hb of the circulating blood at build, copied onto every compartment. |
| `preductal_art_bloodgas` | object | `{ph, pco2, po2, hco3, be, so2}` of `AA`, every 1 s. |
| `art_bloodgas` | object | Same for `AD` (post-ductal). |
| `art_solutes` | object | Copy of `AD.solutes`. |

## Calculation

**Build (`init_model`).** For every model of one of the four types (except those with `blood_pool: false`):
- `haldane_coeff` is set, and `P50_0` if the compartment has none (so `PL_MAT` keeps its adult 26.7);
- a fresh compartment (empty `solutes`) gets `to2`, `tco2`, `solutes`, `temp` and `viscosity`. A loaded state keeps its own composition;
- the thermal fields are added if missing: `body_temp` (= its temperature), `blood_temp_tc`, `temp_ext_override` (false).

Then `viscosity_ref` is computed from the volume-weighted Hb of the enabled compartments and copied to all.

**Every step**, for every compartment except `fixed_composition` ones:
```
temp      += (body_temp − temp) · min(1, dt / blood_temp_tc)
viscosity  = viscosity_plasma · exp(viscosity_hct_k · Hct),   Hct = Hb[mmol/L] / 0.6206 / 33,  clamped 0–0.9
```
A neonatal Hb of 10 mmol/L gives Hct 0.49 and ~6 cP. [BloodVessel](./BloodVessel.md) scales its resistance with `viscosity / viscosity_ref`, so a change in Hb moves the resistances.

**Every 1 s:** `calc_blood_composition` on `AA` and `AD` (stored in the two blood gas objects), and on `IVCI`, `SVC`, `RAIVCI` and `PA`. The Monitor reads SvO2 from `PA`, the true mixed-venous blood.

## Methods

| Method | Effect |
|---|---|
| `set_solute(solute, value, site = "")` | One compartment, or every compartment plus the reference `solutes`. |
| `set_to2(value, site = "")`, `set_tco2(value, site = "")` | One compartment or all; the reference `to2`/`tco2` is not updated. A perturbation: gas exchange and metabolism take over from there. |
| `set_P50(p50)` | Every compartment and `P50_0`. |
| `set_haldane_coeff(k)` | Every compartment and `haldane_coeff`. |
| `set_viscosity(cP)` | Scales `viscosity_plasma` so the viscosity at the current reference becomes `cP` (plasma proteins, cold agglutinins); resistances follow. |
| `set_temperature(t, site = "")` | A **cold or warm blood bolus**: stamps `temp` on all compartments (or one), which then relax back to `body_temp`. 37 → 34 °C in term_neonate is back to 36.6 °C within 30 s and cools the core 0.3 °C. Lasting changes go through Thermoregulation. |
| `set_perfusion_target(core)` | Called by Thermoregulation: `body_temp` of every compartment not under device control (`temp_ext_override`). |
| `get_thermal_state(density, cp)` | Heat capacity and mean temperature of the enabled, non-fixed blood, for Thermoregulation's heat balance. |
| `calc_viscosity(hb)` | The viscosity law above. |

## Factor system

None. Viscosity reaches the resistances through `BloodVessel`'s viscosity term.

## Inputs and outputs

- **Reads:** `AA`, `AD`, `IVCI`, `SVC`, `RAIVCI`, `PA` (composition); every blood compartment's Hb, volume and temperature.
- **Writes:**
  - every blood compartment: `temp`, `viscosity`; at build also `haldane_coeff`, `P50_0`, `viscosity_ref`, the seed composition and the thermal fields;
  - the solved composition of the six sampling sites.
- **Written by:** `Thermoregulation` (`set_perfusion_target`); the user (the setters); scenario generators (`set_solute`, `set_P50`).
- **Read by:** `Monitor`, scripts and `DataCollector` watchers (`art_bloodgas`, `preductal_art_bloodgas`).

## Assumptions and limitations

- **Setters reach every blood compartment, the maternal pool included.** `set_solute`, `set_P50`, `set_to2` and `set_tco2` without a site also change `PL_MAT` and the ECLS circuit. See [Placenta](./Placenta.md#assumptions-and-limitations) for why the generators restore `PL_MAT`.
- **Membership is by `model_type` string.** A custom subclass of a blood compartment with its own `model_type` must be added to `blood_containing_modeltypes`, or it is never seeded, warmed or given a viscosity.
- **Fixed sampling sites.** The scenario must have `AA` and `AD`; `IVCI`, `SVC`, `RAIVCI` and `PA` are used when present. Other compartments' gases are solved only by whoever needs them.
- **Blood gases are refreshed once per second.**
- **Viscosity is low-shear** and depends on haematocrit only: no shear-thinning, no Fåhræus effect in small vessels. Hct is derived from Hb with a fixed MCHC of 33 g/dL.
- **`haldane_coeff` 2.2** is a calibration value of the model's own CO2 formulation (see [BloodComposition](./BloodComposition.md)), not a measured quantity.

## Example definition (JSON)

From `term_neonate.json`, `models.Blood` (trimmed to the config props):

```json
{
  "name": "Blood",
  "model_type": "Blood",
  "is_enabled": true,
  "viscosity_plasma": 1.3,
  "viscosity_hct_k": 3.13,
  "temp": 37,
  "blood_temp_tc": 10,
  "to2": 7,
  "tco2": 25.5,
  "P50_0": 20,
  "haldane_coeff": 2.2,
  "solutes": {
    "na": 138, "k": 3.5, "ca": 1, "cl": 106, "lact": 1.5, "mg": 0.75,
    "albumin": 25, "phosphates": 1.64, "uma": 5.5933, "hemoglobin": 10, "glucose": 4
  }
}
```

## Usage in the scenarios

One instance in every scenario.

| Scenario | `P50_0` (mmHg) | Hb (mmol/L) |
|---|---|---|
| term_neonate | 20 | 10 |

## References

No literature is cited in the code for the viscosity constants; they are calibration choices (k = 3.13 gives ~6 cP at a neonatal haematocrit of 0.49). Per-scenario P50 and Hb come from the scenario validations (see the `*Reference.md` pages).
