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
| adrenaline | 0.022 / KID 0.6, LS 0.9, INT 0.4 | +0.6 @ 20 | +0.8 @ 25 | −0.25 @ 25 | +0.5 @ 40 | – |
| noradrenaline | 0.018 / KID 0.6, LS 1.0, INT 0.4 | +0.1 @ 30 | +0.35 @ 30 | −0.12 @ 30 | +0.9 @ 25 | – |
| pge1 | 0.08 / – | – | – | – | – | +1.5 @ 0.02 |

(emax @ EC50 in ng/mL; Hill 1.5 for the cardiac effects, 2 for SVR, 1 for the duct.)

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

- **The catecholamines are too weak at clinical doses.** Measured in term_neonate, adrenaline for 5 min:

  | Rate | Arterial concentration | HR | MAP |
  |---|---|---|---|
  | 0.1 mcg/kg/min | 0.89 ng/mL | 120 → 121 | unchanged |
  | 0.5 mcg/kg/min | 4.5 ng/mL | 120 → 125 | 59.5 → 60.1 |

  The EC50s (20–40 ng/mL) sit far above these concentrations, and the arterial half-life after stopping is 20 s (adrenaline ~2 min). Both are listed for the re-validation, to recalibrate against neonatal dose–response data.
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

No literature values yet; the PK/PD constants are to be recalibrated in the re-validation.
