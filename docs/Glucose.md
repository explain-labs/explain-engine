# Glucose

`Glucose` is the blood-glucose and insulin controller. Glucose is a blood solute (mmol/L) that flows with the blood like sodium. `Glucose` adds the liver's production into the central vein and removes the tissues' use from the same beds and shares as [Metabolism](./Metabolism.md). Insulin (rising with hyperglycaemia) and counter-regulation (rising with hypoglycaemia) adjust both. It holds no compartment and is neutral at rest.

## Physiology

A newborn uses about 4–6 mg glucose/kg/min, much of it in the brain. After the umbilical cord is cut, glucose comes from the liver (glycogen breakdown and gluconeogenesis) and from feeds or IV dextrose. Insulin, released as glucose rises, increases uptake by muscle and fat and suppresses hepatic output. Counter-regulatory hormones (glucagon, catecholamines, cortisol), released as glucose falls, raise hepatic output. Brain uptake does **not** depend on insulin, which is why hypoglycaemia injures the brain. Preterm and stressed infants are prone to both hypo- and hyperglycaemia.

## Inheritance

```
BaseModelClass
  └── Glucose
```

## Properties

### Config (set in the definition JSON)

| Property | Unit | Default | Description |
|---|---|---|---|
| `glucose_running` | boolean | `true` | Switch. Off stops source and sink and resets insulin and counter-regulation to 1. |
| `metabolism_name` | – | `"Metabolism"` | Supplies the consumption beds and shares. |
| `injection_site` | – | `"IVCI"` | Central vein receiving the hepatic output. |
| `plasma_model` | – | `"AA"` | Arterial blood whose glucose drives the controller. |
| `glu_use_rate` | mmol/kg/min | 0.03 | Tissue glucose use (5.4 mg/kg/min). |
| `hgp_rate` | mmol/kg/min | 0.03 | Hepatic glucose production (equal to use, so neutral at rest). |
| `glucose_setpoint` | mmol/L | 0 | Set-point; ≤ 0 = captured 30 s after build. Stored in every scenario. |
| `insulin_gain` | – | 0.54 | Insulin rise per fractional glucose excess (blunted newborn secretion: a dextrose load decays at ~1.5 %/min). |
| `insulin_suppression_gain` | – | 6 | Insulin fall per fractional glucose deficit (suppression stays prompt). |
| `counterreg_gain` | – | 6 | Counter-regulation rise per fractional glucose deficit (it does not fall above the set-point). |
| `insulin_tc`, `counterreg_tc` | s | 120, 120 | Time constants. |
| `uptake_insulin_gain` | – | 1.0 | Uptake rise per (insulin − 1). |
| `hgp_insulin_gain`, `hgp_counterreg_gain` | – | 0.8, 2.0 | Hepatic-output suppression by insulin and rise by counter-regulation. |
| `hormone_min`, `hormone_max` | – | 0, 10 | Clamp on insulin and counter-regulation. |
| `uptake_factor_min`, `uptake_factor_max` | – | 0.1, 5 | Clamp on the uptake factor. |
| `production_factor_min`, `production_factor_max` | – | 0, 8 | Clamp on the production factor. |
| `glucose_default` | mmol/L | 4.0 | Seed for any blood compartment without a glucose key. |
| `isf_volume` | L/kg | 0.31 | Interstitial glucose pool (term ECF ~0.40 L/kg minus the blood). |
| `isf_tc` | s | 300 | Time constant of the pool's equilibration with the blood. |
| `isf_glucose` | mmol/L | 0 | Interstitial glucose (state, saved); ≤ 0 = seeded at the consumption sites' mean. |
| `insulin_independent_sites` | list | `["BR_CAP"]` | Beds whose uptake insulin does not scale (brain: GLUT1/3). |
| `independent_km` | mmol/L | 1.0 | Saturation of their uptake: × (G/(Km+G)) / (Gs/(Km+Gs)), Gs the set-point. |

### Outputs

| Property | Unit | Description |
|---|---|---|
| `glucose` | mmol/L | Sensed arterial glucose. |
| `insulin`, `counterreg` | – | Activities (1 = rest). |
| `uptake_factor`, `production_factor` | – | Applied factors. |
| `glucose_use_step`, `glucose_prod_step` | mmol | Use and production in the last update. |

## Calculation

Every 1 s:

1. **Seed** a `glucose` key into every blood compartment that lacks one (once).
2. **Sense** `AA.solutes.glucose`. If no set-point is stored, capture it after 30 s.
3. **Controller**, with `e = (glucose − set-point) / set-point`:
   ```
   insulin    → clamp(1 + insulin_gain · e)   e > 0;   clamp(1 + insulin_suppression_gain · e)   e < 0   (tc 120 s)
   counterreg → clamp(1 − counterreg_gain · min(e, 0))                                           (tc 120 s)
   uptake_factor     = clamp(1 + uptake_insulin_gain · (insulin − 1))
   production_factor = clamp(1 − hgp_insulin_gain · (insulin − 1) + hgp_counterreg_gain · (counterreg − 1))
   ```
4. **Sink:** `glu_use_rate · weight / 60 · Δt` mmol, split over Metabolism's beds by their shares; each bed's part × `uptake_factor`, or × the saturable factor for the insulin-independent beds (each bed takes at most what it holds).
5. **Interstitial pool:** each bed exchanges `(V_isf/isf_tc) · share · Δt · (C_bed − isf_glucose)` with the pool (limited per update so neither side overshoots).
6. **Source:** `hgp_rate · weight / 60 · Δt · production_factor` mmol into `IVCI`.

**IV dextrose needs no extra code:** a dextrose fluid in [Fluids](./Fluids.md) carries `glucose` in its solutes, and the controller responds to the rise.

## Factor system

None; its own uptake and production factors.

## Inputs and outputs

- **Reads:** `AA.solutes.glucose`; Metabolism's `metabolic_active_models`; `model.weight`.
- **Writes:** `solutes.glucose` of the beds and of `IVCI` (and the seed in every blood compartment).
- **Written by:** the user (rates, switch); Fluids (dextrose, indirectly).
- **Read by:** `DataCollector` watchers, the Monitor.

## Assumptions and limitations

- **Behaviour in term_neonate_72h** (re-validation (i)):

  | Test | Glucose (mmol/L) |
  |---|---|
  | Rest, 30 min | 4.00 → 4.00; interstitial pool 3.70 |
  | Hepatic output stopped, 1 / 10 / 30 / 60 / 90 min | 3.68 / 3.27 / 2.72 / 1.95 / 1.25 (insulin 0.03 by 10 min; the brain keeps its use) |
  | D10 2 mL/kg (0.2 g/kg) over 1 min, 2 / 10 / 30 / 60 min | 10.1 / 6.1 / 5.6 / 5.0; K 1.54 %/min from 10 to 40 min, no rebound |

  Before the re-validation glucose lived only in the blood (changes 3–4× too fast; hepatic output stopped: 2.82 at 10 min, 0.01 at 90), insulin scaled the brain's uptake too, and a falling counter-regulation added to insulin's hepatic suppression: the same D10 bolus was cleared in ~8 min (K ~10 %/min) with a rebound to 1.99 mmol/L. The newborn insulin response to an IV glucose load is poor (Salle 1976); K ~1.5 %/min is a judgement within the 1–2 %/min usually reported. The brain's share (31 %, Metabolism's map) is near the 37 % of production used by the newborn dog's cerebral cortex, whose uptake stays constant across a wide glucose range (Huang 1989).
- **Only the brain's use depends on the glucose level** (saturable); the other beds' use depends on insulin only. A depleted bed's missing use is counted out of `glucose_use_step`.
- **No glucosuria** (`glucose` isn't in the Kidneys' `filterable_solutes`), no glycogen store, no lactate–glucose cycle.
- **Hepatic output enters `IVCI`;** in the fetus that is also where the placental supply arrives through the umbilical vein, so the same parameters stand in for the placental glucose supply.

## Example definition (JSON)

From `term_neonate_72h.json`, `models.Glucose` (trimmed to the config props; gains are the defaults):

```json
{
  "name": "Glucose",
  "model_type": "Glucose",
  "is_enabled": true,
  "glucose_running": true,
  "metabolism_name": "Metabolism",
  "injection_site": "IVCI",
  "plasma_model": "AA",
  "glu_use_rate": 0.03,
  "hgp_rate": 0.03,
  "glucose_setpoint": 3.998
}
```

## Usage in the scenarios

One instance in every scenario, running with use = production = 0.03 mmol/kg/min. The set-points equal each scenario's `Blood.solutes.glucose`: term 4.0, fetus 3.7–4.2, preterm 5.5–7.0 mmol/L.

## References

- Bier DM, Leake RD, Haymond MW, et al. Measurement of "true" glucose production rates in infancy and childhood with 6,6-dideuteroglucose. *Diabetes* 1977;26:1016–23. doi:10.2337/diab.26.11.1016 (term neonates 6.07 ± 0.27 mg/kg/min; production scales with brain size)
- Huang MM, Kliegman RM, Chau K. Partitioning and extraction of glucose regulates cerebral glucose utilization in newborn dogs. *Biol Neonate* 1989;55:290–7. doi:10.1159/000242931 (cortex 37 % of production, uptake constant across glucose levels)
- Salle B, Ruitton-Uglienco A. Glucose disappearance rate, insulin response and growth hormone response in the small for gestational age and premature infant of very low birth weight. *Biol Neonate* 1976;29:1–17. doi:10.1159/000240843 (poor insulin response to an IV glucose load)

The use rate (5.4 mg/kg/min) is close to Bier's; the interstitial volume, its time constant, the K target and the other gains are model choices.
