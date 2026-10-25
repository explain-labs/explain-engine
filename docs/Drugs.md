# Drugs

`Drugs` is the pharmacology controller (PK/PD).
- **Dosing:** IV boluses and weight-based infusions add drug to a central vein.
- **Transport:** the drug spreads with the blood through every compartment's `drugs` dictionary.
- **Elimination:** a whole-body term everywhere plus organ clearance in the kidney, liver and gut capillaries.
- **Effects:** each drug acts on heart rate, contractility, relaxation, vascular resistance and ductal patency through sigmoid Emax curves, summed over the drugs.

It holds no blood. With no drug present it does nothing and its effects sit at 1.

## Physiology

An IV drug mixes into the central venous blood, reaches the heart and arterial tree within seconds, and is cleared by metabolism, mostly in the liver, kidney and the vessel walls. The plasma concentration settles where the infusion rate equals clearance; its half-life sets how fast it rises and falls.

The effect follows the concentration at the receptor along a sigmoid dose–response curve (Emax, EC50, Hill slope):
- **Adrenaline:** β1 (heart rate, contractility, faster relaxation) at low doses, plus α1 vasoconstriction at higher ones.
- **Noradrenaline:** mainly α1 vasoconstriction.
- **Prostaglandin E1:** keeps the ductus arteriosus open in duct-dependent heart disease. It is cleared largely in one pass through the lungs, hence the continuous infusion.

## Inheritance

```
BaseModelClass
  └── Drugs
```

## Properties

### Config (set in the definition JSON)

| Property | Unit | Default | Description |
|---|---|---|---|
| `drugs_running` | boolean | `true` | Effect switch (off releases the effects once; clearance keeps running). |
| `injection_site` | – | `"IVCI"` | Compartment receiving boluses and infusions. |
| `effect_site` | – | `"AA"` | Compartment whose concentration drives the effects. |
| `heart_name`, `circulation_name` | – | `"Heart"`, `"Circulation"` | Effect targets. |
| `drug_defs` | {drug: definition} | 3 drugs | Per-drug PK/PD (below). Built-in drugs a scenario lacks, and parameters a stored definition predates, are filled in from the code at build. |
| `infusions` | {drug: mcg/kg/min} | `{}` | Running infusions (saved with the state). |

**A drug definition:**
- `enabled`;
- `clearance.global`: 1/s, on every compartment;
- `clearance.sites`: {compartment: 1/s}, organ clearance;
- `ke0`: 1/s, effect-compartment rate; 0 = none;
- per effect `x` (`hr`, `cont`, `lus`, `svr`, `pda`): `x_emax` (maximal fractional change), `x_ec50` (ng/mL) and `x_hill`.

| Drug | Clearance global / sites (1/s) | HR | Inotropy | Lusitropy | SVR | Duct |
|---|---|---|---|---|---|---|
| adrenaline | 0.00383 / KID 0.104, LS 0.157, INT 0.070 | +0.9 @ 5.7 | +2.4 @ 18 | −0.75 @ 18 | +1.5 @ 18 | – |
| noradrenaline | 0.0036 / KID 0.12, LS 0.2, INT 0.08 | +0.2 @ 5.7 | +0.56 @ 18 | −0.19 @ 18 | +1.44 @ 18 | – |
| pge1 | 0.08 / – | – | – | – | – | +1.5 @ 0.02 |

(emax @ EC50 in ng/mL; Hill 1 throughout.)

### Outputs

| Property | Unit | Description |
|---|---|---|
| `concentrations` | {drug: ng/mL} | Effect-site concentration. |
| `biophase` | {drug: ng/mL} | The concentration driving the effect (the effect compartment when `ke0` > 0). |
| `conc_inj`, `conc_eff` | ng/mL | Adrenaline at the injection and effect sites (convenience read-outs). |
| `hr_drug_factor`, `cont_drug_factor`, `lus_drug_factor`, `svr_drug_factor`, `pda_drug_factor` | – | Summed effects (1 = none). |

## Calculation

Each step (ng/mL = mcg/L throughout):
1. **Idle check.** With no infusion and no drug in the blood, nothing is computed (the blood is re-scanned every 1 s, since drug can also arrive another way).
2. **Infusions:** `rate · weight / 60 · dt` mcg into the injection site.
3. **Elimination** (also while `drugs_running` is off): every compartment loses `clearance.global · c · dt`; the clearing organs lose their site rate as well. That organ clearance depends on how much drug the perfusion brings, so it falls with organ blood flow. Values below 1e-6 ng/mL are zeroed.
4. **Effects** (while running), per enabled drug, from the effect-site concentration (lagged by `ke0` when set):
   ```
   effect = emax · cⁿ / (EC50ⁿ + cⁿ),     factor = 1 + Σ over drugs
   ```
   - `Heart.hr_drug_factor`;
   - each chamber's `el_max_drug_factor` (inotropy) and `el_min_drug_factor` (lusitropy; < 1 = faster relaxation);
   - `Circulation.svr_factor_drug` (its own SVR channel, see [Circulation](./Circulation.md));
   - `Pda.diameter_drug_factor`.

**Dosing API:**
- `administer_bolus(drug, dose_mcg)`: adds `dose / volume` to the injection site;
- `set_infusion(drug, rate)`: mcg/kg/min, 0 stops it;
- `set_drug_param(drug, "path", value)`: e.g. `"hr_emax"`, `"clearance.global"`.

## Factor system

It owns the drug channels above: `hr_drug_factor`, `el_max_drug_factor`, `el_min_drug_factor`, `svr_factor_drug` and `diameter_drug_factor`. Effects of several drugs add.

## Inputs and outputs

- **Reads:** the compartments' `drugs`; `model.weight`.
- **Writes:** the compartments' `drugs` (seeded with every drug key, dosing, clearance); the channels above.
- **Written by:** the user and bot (dosing, parameters).
- **Read by:** Heart, the chambers, Circulation, Pda (the channels); `DataCollector` watchers.

## Assumptions and limitations

- **Catecholamine calibration** (re-validation (j), term_neonate, 20-min infusions, closed loop with the reflexes):

  | Infusion (mcg/kg/min) | Arterial conc (ng/mL) | HR | MAP | LV output |
  |---|---|---|---|---|
  | adrenaline 0.05 / 0.1 / 0.3 | 2.0 / 4.0 / 11.8 | +11 / +16 / +24 % | +14 / +24 / +42 % | +15 / +25 / +45 % |
  | adrenaline 0.6 / 1.0 | 23.6 / 39.2 | +28 / +31 % | +54 / +62 % | +53 / +58 % |
  | noradrenaline 0.1 / 0.3 / 0.5 / 1.0 | 4.0 / 12.0 / 20.1 / 40.2 | 0 / −3 / −5 / −8 % | +9 / +18 / +22 / +28 % | +2 / +4 / +3 / +5 % |

  - **Clearance** 25 mL/kg/min for both, so the arterial half-life after stopping is ~2.2 min (130 s): Oualha 2014 (2 L/h·kg^0.75, i.e. 24 mL/kg/min at 3.5 kg, volume = blood volume, t½ ~2.3 min), Fisher 1993 (29 ± 16 mL/kg/min; 0.03–0.2 mcg/kg/min gave 0.67–9.4 ng/mL). Before: 116 mL/kg/min and t½ 20 s, so 0.1 mcg/kg/min reached only 0.9 ng/mL.
  - **Adrenaline** EC50s from Oualha 2014 (heart rate 5.7 ng/mL; the stroke volume × SVR product 18 ng/mL, used here for inotropy, lusitropy and SVR), Emax values fitted so the closed-loop response matches that study's model: 0.1 mcg/kg/min HR +15 %, MAP +24 %; up to 1.0 mcg/kg/min within a few percent of it. Before, the EC50s were 20–40 ng/mL and 0.5 mcg/kg/min raised HR by 5 bpm.
  - **Noradrenaline**: no neonatal PK/PD data. Clearance as adrenaline; mainly vascular, fitted to the neonatal cohorts (MAP +15–20 % at 0.1–0.5 mcg/kg/min, e.g. 30.6 → 37.8 and 34.4 → 39.4 mmHg; heart rate unchanged or lower).
  - **Boluses overshoot briefly.** With `ke0` 0 the effect follows the arterial concentration at once, and a bolus reaches the aorta unmixed: 5 mcg (1.4 mcg/kg) peaks at ~50 ng/mL and MAP ~156 mmHg for a few seconds, before mixing brings it to ~15 ng/mL. Real adrenaline takes tens of seconds to act; a `ke0` (biophase lag) would model that.
- **PGE1 cannot reopen a closed duct** (see [Pda](./Pda.md)); its systemic vasodilation and apnoea are not modelled.
- **No receptor down-regulation, no tachyphylaxis;** effects add without interaction.
- **Effect at the arterial concentration** by default (no biophase lag unless `ke0` is set).
- **Drugs live in the blood only** (no tissue distribution volume).

## Example definition (JSON)

From `term_neonate.json`, `models.Drugs` (trimmed to one drug):

```json
{
  "name": "Drugs",
  "model_type": "Drugs",
  "is_enabled": true,
  "drugs_running": true,
  "injection_site": "IVCI",
  "effect_site": "AA",
  "drug_defs": {
    "pge1": {
      "enabled": true,
      "clearance": { "global": 0.08, "sites": {} },
      "ke0": 0,
      "pda_ec50": 0.02, "pda_emax": 1.5, "pda_hill": 1
    }
  },
  "infusions": {}
}
```

## Usage in the scenarios

One instance in every scenario with adrenaline, noradrenaline and PGE1 defined and no infusion running.

## References

- Oualha M, Urien S, Spreux-Varoquaux O, et al. Pharmacokinetics, hemodynamic and metabolic effects of epinephrine to prevent post-operative low cardiac output syndrome in children. *Crit Care* 2014;18:R23. doi:10.1186/cc13707
- Fisher DG, Schwartz PH, Davis AL. Pharmacokinetics of exogenous epinephrine in critically ill children. *Crit Care Med* 1993;21:111–7. doi:10.1097/00003246-199301000-00021
- Heckmann M, Trotter A, Pohlandt F, Lindner W. Epinephrine treatment of hypotension in very low birthweight infants. *Acta Paediatr* 2002;91:566–70. doi:10.1080/080352502753711704
- Kallimath A, et al. Hemodynamic effects of noradrenaline in neonatal septic shock. *J Trop Pediatr* 2024;70. doi:10.1093/tropej/fmae001
- Gupta S, et al. The effect of norepinephrine on clinical and hemodynamic parameters in neonates with shock. *Eur J Pediatr* 2022;181:2379–87. doi:10.1007/s00431-022-04437-4
- Lu P, et al. Use of norepinephrine in preterm neonates with dopamine-resistant shock. *BMJ Paediatr Open* 2023;7. doi:10.1136/bmjpo-2022-001804
