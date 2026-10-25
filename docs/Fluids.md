# Fluids

`Fluids` gives fluids into the blood: timed **boluses and infusions** of named fluids (saline, Ringer's lactate, packed red cells, albumin, dextrose), and a continuous **maintenance** intake that replaces what the kidneys excrete. Each fluid is a composition (solutes in mmol/L, albumin in g/L, no O2 or CO2) mixed into a blood compartment through its normal `volume_in`, so everything it carries spreads with the circulation.

## Physiology

Fluid therapy changes the blood in three ways:
- **volume:** preload, cardiac output, blood pressure;
- **dilution:** haemoglobin, albumin and everything the fluid lacks;
- **composition:**
  - normal saline (154 mmol/L Na and Cl) lowers the strong ion difference and causes a hyperchloraemic acidosis;
  - Ringer's lactate is "balanced" (its lactate is metabolised to bicarbonate);
  - packed red cells raise haemoglobin;
  - 20 % albumin raises the oncotic pressure;
  - dextrose provides glucose.

A newborn's maintenance intake (feeds or IV fluid) replaces urine, insensible losses and growth.

## Inheritance

```
BaseModelClass
  └── Fluids
```

## Properties

### Config (set in the definition JSON)

| Property | Unit | Default | Description |
|---|---|---|---|
| `fluids` | {name: {solute: value}} | `{}` | The fluid library (see the table below). |
| `fluids_temp` | °C | 37 | Temperature of given fluids. |
| `maintenance_rate` | mL/kg/h | 0 | Continuous maintenance intake. term 1.35, preterm and fetal 3. |
| `maintenance_fluid` | – | `"maintenance"` | Its composition (a key in `fluids`; missing = water). |
| `maintenance_site` | – | `"IVCI"` | Compartment receiving it. |

### State (saved with the state)

| Property | Description |
|---|---|
| `running_fluids` | Boluses and infusions in progress: `{vol, time_left, delta, site, to2, tco2, temp, solutes, drugs}` each. A state saved mid-bolus finishes it after reload. |

### The fluid library (every scenario)

| Fluid | Composition |
|---|---|
| `normal_saline` | Na 154, Cl 154 |
| `ringers_lactate` | Na 130, Cl 109, K 4, Ca 1.4, lactate 28 |
| `packed_cells` | Hb 12 mmol/L (~19 g/dL), Na 140, K 4.5, Cl 105, glucose 25: a fresh unit with a plasma-equivalent base |
| `albumin_20%` | albumin 200 g/L, Na 130, Cl 42, unmeasured anions 32 (the caprylate and tryptophan stabilisers) |
| `d5`, `d10` | glucose 278, 555 |
| `maintenance` | per scenario: the resting urine composition (term Na 69, K 20.6, Cl 64, …), so intake balances output |

## Calculation

**`add_volume(volume, in_time = 10, fluid_in = "normal_saline", site = "VLB")`** (mL, s) queues a fluid: `delta = volume / (in_time / 0.015)` per update, with the fluid's composition copied from the library (an unknown name gives pure water).

**Every 15 ms:**
1. Finished entries are dropped. For each running entry, `site.volume_in(delta, fluid)` mixes the increment in, then `time_left` counts down. A missing site is skipped.
2. **Maintenance:** `maintenance_rate · weight / 1000 · Δt / 3600` L of the maintenance fluid into `maintenance_site`.

**Effects** (term_neonate, 20 mL/kg over 10 min, read 1 min later):

| Fluid | Hb (mmol/L) | Albumin (g/L) | Na | Lactate | BE | MAP |
|---|---|---|---|---|---|---|
| before | 10.0 | 25 | 138 | 1.5 | −2.4 | 58 |
| normal saline | 8.0 | 20 | 141 | 1.3 | **−7.1** | 62 |
| Ringer's lactate | 8.0 | 20 | 137 | **4.2** | −4.3 | 61 |
| 20 % albumin, 5 mL/kg | 9.4 | **35** | 138 | 1.5 | −3.7 | 59 |
| packed cells, 15 mL/kg | 10.3 | 21 | 139 | 1.4 | +0.2 | 66 |

## Factor system

None.

## Inputs and outputs

- **Reads:** the fluid library; `model.weight`.
- **Writes:** the target compartment, through `volume_in` (volume and composition).
- **Written by:** the user and bot (`add_volume`, rates); the scenario generators (maintenance rate and composition).
- **Read by:** `DataCollector` watchers.

## Assumptions and limitations

- **Everything stays in the blood.** There is no interstitial compartment, so all of a crystalloid bolus stays intravascular, where in vivo most leaves within minutes. Dilution and its acid–base effect are therefore stronger than in vivo, and albumin draws no fluid in.
- **Gas-free fluids:** a bolus dilutes O2 and CO2 content and haemoglobin (and so viscosity), as intended.
- **Packed cells are a fresh unit:** no storage lesion (high K, low pH, lactate), no citrate effect on calcium.
- **Ringer's lactate's lactate is cleared by [Lactate](./Lactate.md)** toward its baseline (half-life ~6 min), standing in for hepatic metabolism; no bicarbonate is generated beyond what the lower lactate implies.
- **Timing:** boluses run on the 15 ms update; the last increment can overshoot by a fraction of a step (< 0.1 %).

## Example definition (JSON)

From `term_neonate.json`, `models.Fluids` (trimmed to two fluids):

```json
{
  "name": "Fluids",
  "model_type": "Fluids",
  "is_enabled": true,
  "fluids_temp": 37,
  "fluids": {
    "normal_saline": { "na": 154, "cl": 154 },
    "ringers_lactate": { "na": 130, "cl": 109, "ca": 1.4, "k": 4, "lact": 28 }
  },
  "maintenance_rate": 1.352,
  "maintenance_fluid": "maintenance",
  "maintenance_site": "IVCI"
}
```

## Usage in the scenarios

One instance in every scenario with the library above; maintenance 1.35 mL/kg/h (term, fetus_term) or 3 mL/kg/h (preterm, fetal 25/30 wk), each matching its resting urine output.

## References

Standard product compositions. 20 % albumin's anions are an estimate from its charge at 200 g/L plus the stabilisers.
