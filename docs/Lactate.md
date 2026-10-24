# Lactate

`Lactate` makes blood lactate a product of tissue hypoxia. When a tissue bed's O2 content falls below an anaerobic threshold, the bed produces lactate in proportion to its unmet O2 demand. Lactate is cleared back toward its baseline everywhere. Lactate is a strong anion in the [BloodComposition](./BloodComposition.md) acid-base solver, so a rise lowers pH, bicarbonate and base excess, a lactic acidosis, with no change to the solver. It holds no compartment and is neutral at rest.

## Physiology

When tissue oxygen delivery falls below need (shock, asphyxia, severe hypoxaemia, anaemia), cells switch to anaerobic glycolysis. Each glucose then yields 2 lactate instead of being oxidised with 6 O2, so roughly 0.33 mmol lactate is made per mmol O2 not delivered. Lactate and its hydrogen ion acidify the blood. The liver (and kidney) clear it, with a half-life of minutes once perfusion is restored. A rising lactate is a key marker of perinatal asphyxia and shock; a falling one marks successful resuscitation.

## Inheritance

```
BaseModelClass
  └── Lactate
```

## Properties

### Config (set in the definition JSON)

| Property | Unit | Default | Description |
|---|---|---|---|
| `lactate_running` | boolean | `true` | Production switch (clearance always runs). |
| `metabolism_name` | – | `"Metabolism"` | Supplies the beds, their shares and VO2. |
| `lact_baseline` | mmol/L | 1.0 | Resting lactate, the clearance target. 1.5 in every scenario. |
| `threshold_frac` | – | 0.5 | Anaerobic threshold as a fraction of each bed's resting O2 content. |
| `lact_per_o2_deficit` | mmol/mmol | 0.33 | Lactate per mmol of unmet O2 demand. |
| `lact_clearance` | 1/s | 0.002 | First-order clearance toward baseline (half-life ~6 min). |
| `prod_gain` | – | 1.0 | Overall production scaler. |

### Baseline (captured, saved with the state)

| Property | Unit | Description |
|---|---|---|
| `baseline_captured` | boolean | The thresholds have been captured. |
| `baseline_to2` | {bed: mmol/L} | Each bed's resting O2 content: the minimum over the first 90 s after a fresh build. |

### Outputs

| Property | Unit | Description |
|---|---|---|
| `arterial_lactate` | mmol/L | `AA` lactate. |
| `total_production_step` | mmol | Lactate produced in the last update. |
| `anaerobic_fraction_max` | 0–1 | Worst bed's anaerobic fraction in the last update. |

## Calculation

Every 1 s:

1. **Baseline** (fresh build only): for 90 s each bed's lowest O2 content is recorded; then production is armed. The minimum puts the threshold below the operating trough, so even chronically hypoxic scenarios (cyanotic heart disease) stay neutral at rest.
2. **Production**, per bed with share f:
   ```
   threshold  = threshold_frac · baseline_to2
   anaerobic  = clamp((threshold − to2) / threshold, 0, 1)
   O2 demand  = vo2 · factors · weight / 60 / 22.414 · Δt · f                (mmol, as Metabolism)
   lactate   += anaerobic · O2 demand · lact_per_o2_deficit · prod_gain      (mmol, into that bed)
   ```
3. **Clearance:** every blood compartment's `lact` relaxes toward `lact_baseline` by `lact_clearance · Δt`.

**Example** (term_neonate, FiO2 0.08): after 3 min SaO2 is 48 %, the worst bed is 42 % anaerobic and lactate 1.6 mmol/L; 3 min later it is 3.2 mmol/L with the worst bed fully anaerobic.

## Factor system

None.

## Inputs and outputs

- **Reads:** Metabolism (`metabolic_active_models`, `vo2` and its factors); each bed's `to2`, `vol`; `model.weight`.
- **Writes:** `solutes.lact` of the beds (production) and of every blood compartment (clearance).
- **Written by:** the user (rates, switch).
- **Read by:** BloodComposition (as a strong anion, through `solutes.lact`); `DataCollector` watchers, the Monitor.

## Assumptions and limitations

- **Threshold on content, not on delivery or the deficit.** Production starts when a bed's O2 content falls below half its resting value. It is separate from [Metabolism](./Metabolism.md)'s `o2_deficit` (O2 demand that found no O2 at all), so lactate rises well before the deficit appears.
- **Lactate lives only in the blood,** as glucose does (see [Glucose](./Glucose.md)): real lactate distributes through total body water, so concentration changes here run faster than in vivo.
- **Clearance is first-order and constant:** it doesn't fall with liver hypoperfusion or hypothermia, and it also raises a value below baseline (e.g. after dilution) back to baseline.
- **No glucose coupling:** producing lactate consumes no glucose, and clearing it makes none (no Cori cycle).
- **Order:** it must follow Metabolism in the scenario's `models` map, so it reads the O2 contents Metabolism just set.

## Example definition (JSON)

From `term_neonate.json`, `models.Lactate` (trimmed to the config props):

```json
{
  "name": "Lactate",
  "model_type": "Lactate",
  "is_enabled": true,
  "lactate_running": true,
  "metabolism_name": "Metabolism",
  "lact_baseline": 1.5,
  "threshold_frac": 0.5,
  "lact_per_o2_deficit": 0.33,
  "lact_clearance": 0.002,
  "prod_gain": 1
}
```

## Usage in the scenarios

One instance in every scenario, with the values above (baseline 1.5 mmol/L, matching `Blood.solutes.lact`).

## References

No literature values; 0.33 mmol lactate per mmol O2 is the glycolysis stoichiometry (2 lactate per glucose, 6 O2 per glucose), the clearance half-life is a model choice.
