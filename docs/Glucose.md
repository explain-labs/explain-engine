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
| `insulin_gain`, `counterreg_gain` | – | 6, 6 | Drive per fractional glucose excess and deficit. |
| `insulin_tc`, `counterreg_tc` | s | 120, 120 | Time constants. |
| `uptake_insulin_gain` | – | 1.0 | Uptake rise per (insulin − 1). |
| `hgp_insulin_gain`, `hgp_counterreg_gain` | – | 0.8, 2.0 | Hepatic-output suppression by insulin and rise by counter-regulation. |
| `hormone_min`, `hormone_max` | – | 0, 10 | Clamp on insulin and counter-regulation. |
| `uptake_factor_min`, `uptake_factor_max` | – | 0.1, 5 | Clamp on the uptake factor. |
| `production_factor_min`, `production_factor_max` | – | 0, 8 | Clamp on the production factor. |
| `glucose_default` | mmol/L | 4.0 | Seed for any blood compartment without a glucose key. |

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
   insulin    → clamp(1 + insulin_gain · e)          (tc 120 s)
   counterreg → clamp(1 − counterreg_gain · e)       (tc 120 s)
   uptake_factor     = clamp(1 + uptake_insulin_gain · (insulin − 1))
   production_factor = clamp(1 − hgp_insulin_gain · (insulin − 1) + hgp_counterreg_gain · (counterreg − 1))
   ```
4. **Sink:** `glu_use_rate · weight / 60 · Δt · uptake_factor` mmol, split over Metabolism's beds by their shares (each bed floored at 0).
5. **Source:** `hgp_rate · weight / 60 · Δt · production_factor` mmol into `IVCI`.

**IV dextrose needs no extra code:** a dextrose fluid in [Fluids](./Fluids.md) carries `glucose` in its solutes, and the controller responds to the rise.

## Factor system

None; its own uptake and production factors.

## Inputs and outputs

- **Reads:** `AA.solutes.glucose`; Metabolism's `metabolic_active_models`; `model.weight`.
- **Writes:** `solutes.glucose` of the beds and of `IVCI` (and the seed in every blood compartment).
- **Written by:** the user (rates, switch); Fluids (dextrose, indirectly).
- **Read by:** `DataCollector` watchers, the Monitor.

## Assumptions and limitations

- **Glucose lives only in the blood.** Real glucose distributes through the extracellular fluid, 3–4× the blood volume, so changes here run 3–4× too fast. With hepatic output set to 0 in term_neonate, arterial glucose falls 4.0 → 3.6 mmol/L in the first minute (~9 %/min). Listed for the re-validation.
- **Insulin scales all uptake, the brain's included.** With hepatic output at 0, insulin falls to 0.01 within 10 min and total uptake to its 0.1 floor, so glucose levels off at ~2.8 mmol/L. That happens because the brain's use has fallen tenfold, which real brain uptake doesn't do. Listed for the re-validation (an insulin-independent brain share).
- **Use doesn't depend on the glucose level** above the 0 floor (no Michaelis–Menten kinetics), and a depleted bed's missing use is not reported.
- **No glucosuria** (`glucose` isn't in the Kidneys' `filterable_solutes`), no glycogen store, no lactate–glucose cycle.
- **Hepatic output enters `IVCI`;** in the fetus that is also where the placental supply arrives through the umbilical vein, so the same parameters stand in for the placental glucose supply.

## Example definition (JSON)

From `term_neonate.json`, `models.Glucose` (trimmed to the config props; gains are the defaults):

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

One instance in every scenario, running with use = production = 0.03 mmol/kg/min. The set-points equal each scenario's `Blood.solutes.glucose`: term 4.0, fetus 3.7–4.2, preterm 5.5–7.0, Bischoff 7.0 mmol/L.

## References

No literature values; the rate is the textbook neonatal glucose use (4–6 mg/kg/min), the gains are model choices.
