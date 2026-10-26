# Metabolism

`Metabolism` is the body's oxygen consumption and CO2 production. Each step it removes the whole-body O2 uptake (VO2, scaled to weight) from the blood of the tissue beds, split by a fixed fraction per bed, and adds CO2 at the respiratory quotient. That is what makes venous blood desaturated and CO2-rich, which the lungs then reverse. The myocardium has its own balance in [Mob](./Mob.md).

## Physiology

At rest a newborn consumes about 6–7 mL O2/kg/min, roughly twice an adult's per kg, mostly for the brain, heart, liver, kidneys and gut, and for growth and heat. The tissues extract O2 from the capillary blood and give off CO2. The ratio of CO2 produced to O2 used, the respiratory quotient (RQ), depends on the fuel: about 0.7 for fat, 1.0 for carbohydrate, and above 1 when carbohydrate is turned into fat during growth.

Consumption rises with fever and cold (shivering and non-shivering thermogenesis) and falls with hypothermia (about 7 % per °C, Q10 ≈ 2). When a tissue's O2 supply fails, aerobic metabolism stops: no more O2 uptake or aerobic CO2 production, and the tissue switches to anaerobic glycolysis and lactate (see [Lactate](./Lactate.md)).

## Inheritance

```
BaseModelClass
  └── Metabolism
```

## Properties

### Config (set in the definition JSON)

| Property | Unit | Default | Description |
|---|---|---|---|
| `met_active` | boolean | `true` | Switch. |
| `vo2` | mL O2/kg/min | 8.1 | Whole-body O2 use excluding the myocardium (STPD). term 6.14, preterm 5.2–5.7, fetal 5.0–5.5. |
| `vo2_factor` | – | 1.0 | Persistent user/scenario multiplier; no model writes it. |
| `vo2_temp_factor` | – | 1.0 | Q10 temperature effect; written by [Thermoregulation](./Thermoregulation.md). |
| `vo2_bat_factor` | – | 1.0 | O2 cost of brown-fat thermogenesis; written by Thermoregulation. |
| `resp_q` | – | 0.8 | Respiratory quotient. term_neonate_72h 0.8. |
| `metabolic_active_models` | {name: fraction} | `{}` | The beds and their share of VO2 (summing to 1). |
| `bat_site` | name | `"RUB"` | The blood compartment that carries the brown-fat O2 cost: brown fat lies in the neck, between the shoulder blades and in the axillae, i.e. the upper body. `""` (or a name the scenario lacks) spreads it over the beds like the rest of the VO2. |

### Outputs

| Property | Unit | Description |
|---|---|---|
| `o2_deficit` | mmol/s | O2 demand that found no O2 in its bed this step (0 at rest; positive in ischaemia). |

## Calculation

Each step (nothing while `met_active` is off):

```
vo2_step = vo2 · vo2_factor · vo2_temp_factor · weight / 60 · dt / 22.414      (mmol)
bat_step = vo2_step · (vo2_bat_factor − 1)                                       brown fat's O2 cost
```

For each bed with fraction f (a missing or empty bed is skipped):
```
demand = vo2_step · f              (+ bat_step · f when there is no usable bat_site)
used   = min(demand, to2 · V)                 never more O2 than the bed holds
to2   −= used / V
tco2  += resp_q · used / V                    CO2 only from O2 actually used
o2_deficit += (demand − used) / dt
```

The brown-fat cost `bat_step` is then taken, the same way, from `bat_site` alone. Spread over the beds it would also lower the brain's and the gut's venous saturation, which non-shivering thermogenesis does not; taken where the brown fat is, it raises the extraction of the upper body, whose blood flow rises with it (2026-10-26).

STPD conversion as in [Units](./Units.md). Example: with the brain's inflow closed in term_neonate_72h, `BR_CAP` empties of O2 within seconds and `o2_deficit` reads 0.005 mmol/s, the brain's 6.8 mL/min share; its tCO2 stays at ~31 mmol/L. Before v1.0 CO2 kept being added from the missing O2 and reached 225 mmol/L in 2 min.

`set_metabolic_active_model(site, fraction)` changes or adds one bed's share.

## Factor system

Its own multipliers on `vo2`: `vo2_factor` (user), `vo2_temp_factor` and `vo2_bat_factor` (Thermoregulation). They multiply; the part `vo2_bat_factor` adds is used at `bat_site`.

## Inputs and outputs

- **Reads:** each bed's `vol`, `to2`, `tco2`; `model.weight`.
- **Writes:** each bed's `to2`, `tco2`.
- **Written by:** Thermoregulation (`vo2_temp_factor`, `vo2_bat_factor`); the user and scenario scripts (`vo2`, `resp_q`, the fractions).
- **Read by:**
  - [Lactate](./Lactate.md) and [Glucose](./Glucose.md), which reuse the bed map (Lactate must follow Metabolism in the `models` map);
  - Thermoregulation (metabolic heat).

## Assumptions and limitations

- **Fixed shares.** A bed's O2 use doesn't depend on its flow or on its own O2 (no supply dependence above the zero floor), and doesn't follow organ activity (seizures, feeding, work of breathing).
- **The myocardium is separate** ([Mob](./Mob.md)), so lung uptake = Metabolism + Mob (term: 6.14 + ~0.8 = 7.0 mL/kg/min).
- **The beds stand for whole organs and regions:** `RLB`/`RUB` the lumped lower and upper body, `AA`/`AD` the aortic wall.

### term_neonate_72h calibration (2026-10)

- **Whole-body uptake.** `vo2` 6.1396 gives a lung uptake of 7.0 mL/kg/min, slightly above quiet rest. First-week references are 6.26 ± 1.51 at thermoneutral rest and 45–50 kcal/kg/d, ~6.5–7.2 mL/kg/min. Knock-on changes:
  - CO2 production fell, so `Breathing.minute_volume_ref` and the chemoreceptor set-points were re-anchored;
  - by Fick, SvO2 is ~81–85 % (scenario 81.5 %);
  - Thermoregulation re-seeds its heat-loss trim at load.

  See `scripts/_fix_term_vo2.mjs`.
- **Brain share 0.313** (was 0.42–0.45, a Holliday-type estimate from adult CMRO2 per gram). Neonatal MRI finds a term CBF of 106 mL/min (Kooi 2019) and CMRO2 well below adult values (Liu 2014). Brain flow and O2 use were brought down together, keeping its extraction at ~35 %: CBF 144 → 106 mL/min, brain VO2 11.0 → 8.1 mL/min. The other beds took over the rest proportionally. See `scripts/_fix_term_brain_mri.mjs` and [TermNeonateReference](./TermNeonateReference.md).
- **The since-removed fetal scenarios** gave the brain 0.65 (see [fetal_circulation](./fetal_circulation.md)).

## Example definition (JSON)

From `term_neonate_72h.json`, `models.Metabolism` (trimmed to the config props):

```json
{
  "name": "Metabolism",
  "model_type": "Metabolism",
  "is_enabled": true,
  "met_active": true,
  "vo2": 6.1396,
  "vo2_factor": 1,
  "resp_q": 0.8,
  "metabolic_active_models": {
    "BR_CAP": 0.31311, "RLB": 0.16754, "INT_CAP": 0.16754,
    "LS_CAP": 0.11169, "KID_CAP": 0.11169, "RUB": 0.11169,
    "AA": 0.00558, "AD": 0.01117
  }
}
```

## Usage in the scenarios

One instance in every scenario, with the same eight beds.

| Scenario | `vo2` | `resp_q` | Brain share |
|---|---|---|---|
| term_neonate_72h | 6.14 | 0.80 | 0.313 |

## References

Kooi 2019 and Liu 2014 (cerebral flow and CMRO2) and the term VO2 references are cited with details in [TermNeonateReference](./TermNeonateReference.md).
