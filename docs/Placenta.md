# Placenta

`Placenta` is the coordinator of the fetal placental circulation:
- **the cord:** umbilical arteries from the descending aorta, umbilical vein back to the IVC;
- **the fetal placenta:** arteries, villous capillaries, veins;
- **the maternal blood pool** the villi exchange gases with.

It switches the unit on (fetal life) and off (after birth), clamps the cord, sets the resistances, the maternal gas content and the exchange constants. The blood and the gas transfer live in its sub-models.

## Physiology

In the fetus the placenta is the lung. About 40 % of the combined ventricular output leaves the descending aorta through the two umbilical arteries. It flows through the villous capillaries, where it takes up oxygen and gives off CO2 by diffusion with the mother's blood in the intervillous space, and returns oxygenated through the umbilical vein. That vein's blood reaches the IVC (in reality largely through the ductus venosus) and, by preferential streaming, crosses the foramen ovale to the left heart and the brain.

At birth the cord is clamped: placental flow stops, the low-resistance placental bed is lost (systemic resistance rises), and gas exchange must move to the lungs.

## Inheritance

```
BaseModelClass
  └── Placenta
```

## Properties

### Config (set in the definition JSON)

| Property | Unit | Default | Description |
|---|---|---|---|
| `placenta_running` | boolean | `false` | Enables the whole unit (flow and gas exchange). `true` in a fetus. |
| `umb_clamped` | boolean | `true` | Stops flow in the cord and placenta (`no_flow`) while the unit stays enabled, e.g. cord occlusion. `false` in a fetus. |
| `umb_art_res`, `umb_art_res_factor` | mmHg·s/L, – | 800, 1.0 | Resistance of the umbilical arteries `PL_UMB_ART`. |
| `umb_ven_res`, `umb_ven_res_factor` | mmHg·s/L, – | 100, 1.0 | Resistance of the umbilical vein `PL_UMB_VEN`. |
| `plf_res`, `plf_res_factor` | mmHg·s/L, – | 2000, 1.0 | Resistance of each fetal-placenta vessel (`PL_FETAL_ART`, `_CAP`, `_VEN`). |
| `mat_to2`, `mat_tco2` | mmol/L | 6.85, 23 | Total O2 and CO2 content of the maternal pool `PL_MAT`. |
| `dif_o2`, `dif_co2` | mmol/(mmHg·s) | 0.0005, 0.001 | Diffusion constants given to the exchanger `PL_GASEX`. |
| `skip_mat_gas_write` | boolean | `false` | Leave `PL_MAT`'s gases alone (when `Uterus` drives the maternal pool, see [Uterus](./Uterus.md)). |

The `*_factor` props are plain persistent multipliers; nothing resets them.

## Calculation

Every 15 ms, if all seven sub-models exist (otherwise skipped):

1. `is_enabled` of all of them, and of the return resistor `PL_UMB_VEN_IVCI`, follows `placenta_running`. Stopping the placenta therefore stops flow *and* exchange.
2. If running:
   - `no_flow` of the cord and placenta vessels and of `PL_UMB_VEN_IVCI` = `umb_clamped`;
   - base resistances: `PL_UMB_ART` = `umb_art_res·factor`, `PL_UMB_VEN` = `umb_ven_res·factor`, the three fetal-placenta vessels = `plf_res·factor` each;
   - `PL_MAT.to2/tco2` = `mat_to2/mat_tco2` (unless `skip_mat_gas_write`);
   - `PL_GASEX.dif_o2/dif_co2` = `dif_o2/dif_co2`.

These are the levers. Writing `PL_GASEX.dif_o2`, `PL_MAT.to2` or the vessels' `r_for` directly is overwritten within 15 ms.

## Factor system

None of its own. It writes the base `r_for`/`r_back` of its vessels; their own factor layers still apply (they compose multiplicatively, see [BloodVessel](./BloodVessel.md#factor-system)).

## Inputs and outputs

- **Writes:** its sub-models (above).
- **Written by:** the user and the fetal scenario generators (`scripts/_make_fetus*.mjs`, from the per-gestation table in `scripts/_ga_tables.mjs`); `Uterus` sets `skip_mat_gas_write` when coupled.
- **Read by:** nothing reads Placenta directly. The fetal oxygenation follows from its sub-models.

## Assumptions and limitations

- **No gestational age inside.** The constants in the code are term values (cord 55 cm, umbilical-artery cross-section 0.147 cm²). Fetal scenarios set the props per gestation (`_ga_tables.mjs`, see [fetal_circulation](./fetal_circulation.md)).
- **Gas exchange runs at full equilibration.** At the shipped settings fetal capillary blood equilibrates completely with the maternal pool: umbilical-vein pCO2 equals `PL_MAT` pCO2. So `mat_to2`/`mat_tco2` are the effective gas setpoints, and `dif_o2`/`dif_co2` have little authority. Calibrate fetal gases through the maternal contents.
- **The maternal pool is an infinite reservoir.** `PL_MAT` is `fixed_composition` with adult blood (`P50_0` 26.7). `mat_to2`/`mat_tco2` are contents (mmol/L), not partial pressures; they must be consistent with the pool's haemoglobin and P50.
  - **term_neonate_72h** ships haemoglobin 7.5 mmol/L with 3.825 / 24.29 mmol/L. The code defaults (6.85 / 23) date from a pool with neonatal blood.
  - **`Blood` writes to `PL_MAT` too** (`set_solute`, `set_P50`). Changing a fetal haemoglobin changes the maternal pool as well; the generators snapshot and restore it.
- **Not in any scaler group.** `ModelScaler.scale_to_weight` doesn't shrink the placenta; each fetal scenario sets its placental volumes explicitly.
- **The return resistor stays a standalone `Resistor`.** `PL_UMB_VEN_IVCI` must **not** be an entry in `IVCI.inputs`. As a vessel-owned connector, `IVCI` would rewrite its `is_enabled`/`no_flow` every step, and stopping or clamping the placenta would leak placental blood into the fetal IVC. Its resistance (49 mmHg·s/L) is a scenario value that Placenta doesn't set, and it is the same in every fetal scenario. The ductus venosus isn't modelled separately.
- **No placental transfusion.** At clamping, the blood in the cord and placenta (~83 mL at term) stays there; delayed cord clamping and cord milking can't be represented.

## Example definition (JSON)

From `term_neonate_72h.json`, `models.Placenta` (trimmed to the config props; `components` holds the sub-models):

```json
{
  "name": "Placenta",
  "model_type": "Placenta",
  "is_enabled": true,
  "placenta_running": false,
  "umb_clamped": true,
  "umb_art_res": 800,
  "umb_ven_res": 100,
  "plf_res": 2000,
  "mat_to2": 3.825,
  "mat_tco2": 24.29,
  "dif_o2": 0.01,
  "dif_co2": 0.01
}
```

## Usage in the scenarios

One instance in every scenario. It owns `PL_UMB_ART`, `PL_FETAL_ART`, `PL_FETAL_CAP`, `PL_FETAL_VEN`, `PL_UMB_VEN` (BloodVessels), `PL_MAT` (BloodCapacitance) and `PL_GASEX` (BloodDiffusor). The return resistor `PL_UMB_VEN_IVCI` is a top-level resistor.

| Scenario | Running | Resistances art / ven / placenta | `mat_to2` / `mat_tco2` | Fetoplacental blood |
|---|---|---|---|---|
| term_neonate_72h | no (clamped) | – | – | – |

## References

- Umbilical artery cross-section at 37–39 weeks: doi:10.18203/2320-1770.ijrcog20183851.
- Spurway J, Logan P, Pak S. The development, structure and blood flow within the umbilical cord with particular reference to the venous system. *Australas J Ultrasound Med* 2012;15(3):97–102. doi:10.1002/j.2205-0140.2012.tb00013.x.
- Fetal placental (tissue) volume at term: doi:10.7863/jum.2008.27.11.1583.
