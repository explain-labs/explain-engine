# Fluids

`Fluids` gives fluids into the blood: timed **boluses and infusions** of named fluids (saline, Ringer's lactate, packed red cells, albumin, dextrose), and a continuous **maintenance** intake that replaces what the kidneys excrete. It also takes whole blood out: a timed **loss** (haemorrhage, blood sampling). Each fluid is a composition (solutes in mmol/L, albumin in g/L, and for red cells an O₂ and CO₂ content) mixed into a blood compartment through its normal `volume_in`, so everything it carries spreads with the circulation.

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
| `maintenance_rate` | mL/kg/h | 0 | Continuous maintenance intake. term_neonate_72h 1.35. |
| `maintenance_fluid` | – | `"maintenance"` | Its composition (a key in `fluids`; missing = water). |
| `maintenance_site` | – | `"IVCI"` | Compartment receiving it. |

### State (saved with the state)

| Property | Description |
|---|---|
| `running_fluids` | Boluses and infusions in progress: `{vol, time_left, delta, site, to2, tco2, temp, solutes, drugs}` each. A state saved mid-bolus finishes it after reload. |
| `running_losses` | Blood losses in progress: `{vol, time_left, delta, site}` each. Saved the same way. |

### The fluid library (every scenario)

| Fluid | Composition |
|---|---|
| `normal_saline` | Na 154, Cl 154 |
| `ringers_lactate` | Na 130, Cl 109, K 4, Ca 1.4, lactate 28 |
| `packed_cells` | Hb 12 mmol/L (~19 g/dL), Na 140, K 4.5, Cl 105, glucose 25: a fresh unit with a plasma-equivalent base; gas content `to2` 7.2 (SO₂ 60 %), `tco2` 26 mmol/L |
| `albumin_20%` | albumin 200 g/L, Na 130, Cl 42, unmeasured anions 32 (the caprylate and tryptophan stabilisers) |
| `d5`, `d10` | glucose 278, 555 |
| `maintenance` | per scenario: the resting urine composition (term Na 69, K 20.6, Cl 64, …), so intake balances output |

## Calculation

**`add_volume(volume, in_time = 10, fluid_in = "normal_saline", site = "VLB")`** (mL, s) queues a fluid: `delta = volume / (in_time / 0.015)` per update, with the fluid's composition copied from the library (an unknown name gives pure water). The entry's `to2` and `tco2` keys (mmol/L, default 0) become the fluid's gas content; every other key is a solute.

**Why red cells carry gas.** With O₂ and CO₂ at 0, a unit with a plasma-like strong ion difference made the recipient hypocapnic and alkalotic. 20 mL/kg after a 35 % bleed in term_neonate_72h gave PaCO₂ 13 mmHg and pH 7.83, ventilation fell to a quarter and SpO₂ to 72 %. Saline is unaffected: its chloride lowers the strong ion difference along with the CO₂ content. The unit now has the CO₂ content of mixed venous blood (26 mmol/L), consistent with its plasma-like ions, and the saturation of a ~6-day unit (60 %). SO₂ is 43–51 % at donation and rises to 95–100 % within three weeks, as O₂ diffuses through the bag. Real units are also acidic (pH 6.7–7.05, lactate ~9, K ~12 mmol/L, HCO₃⁻ ~5 at 1–3 weeks); that storage lesion is not represented.

**`remove_volume(volume, out_time = 10, site = "AD")`** (mL, s) queues a whole-blood loss, the counterpart of `add_volume`: `delta = volume / (out_time / 0.015)` per update, taken with `site.volume_out`, so the blood leaves with its own composition.

**Every 15 ms:**
1. Finished entries are dropped. Each running loss takes its `delta` out of its site. For each running entry, `site.volume_in(delta, fluid)` mixes the increment in, then `time_left` counts down. A missing site is skipped.
2. **Maintenance:** `maintenance_rate · weight / 1000 · Δt / 3600` L of the maintenance fluid into `maintenance_site`.

**Effects** (term_neonate_72h, 20 mL/kg over 10 min, read 1 min later):

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
- **Writes:** the target compartment, through `volume_in` (volume and composition) or `volume_out` (a loss).
- **Written by:** the user and bot (`add_volume`, `remove_volume`, rates); the scenario generators (maintenance rate and composition).
- **Read by:** `DataCollector` watchers.

## Assumptions and limitations

- **Where a fluid goes depends on the scenario.** With an [Interstitium](./Interstitium.md) (term_neonate_72h) a crystalloid bolus leaves the blood within minutes (21 % of 20 mL/kg saline left at 30 min) and albumin draws fluid in. Without one (the ToF scenarios) everything stays intravascular, so dilution and its acid–base effect are stronger than in vivo.
- **A loss needs the Interstitium to refill.** Without it the shed volume is not restored at all; with it, ~45 % of a 14 % bleed is back at 30 min.
- **Gas-free fluids:** a bolus dilutes O2 and CO2 content and haemoglobin (and so viscosity), as intended.
- **Packed cells are a fresh unit:** no storage lesion (high K, low pH, lactate), no citrate effect on calcium.
- **Ringer's lactate's lactate is cleared by [Lactate](./Lactate.md)** toward its baseline (half-life ~6 min), standing in for hepatic metabolism; no bicarbonate is generated beyond what the lower lactate implies.
- **Timing:** boluses run on the 15 ms update; the last increment can overshoot by a fraction of a step (< 0.1 %).

## Example definition (JSON)

From `term_neonate_72h.json`, `models.Fluids` (trimmed to two fluids):

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

One instance in every scenario with the library above; maintenance 1.35 mL/kg/h in term_neonate_72h, matching its resting urine output.

## References

Standard product compositions. 20 % albumin's anions are an estimate from its charge at 200 g/L plus the stabilisers.

Red-cell unit O₂ saturation and storage:
- Yoshida T et al. Enhancing uniformity and overall quality of red cell concentrate with anaerobic storage. Blood Transfus 2017;15:172–181. [doi:10.2450/2017.0325-16](https://doi.org/10.2450/2017.0325-16): SO₂ 45.9 ± 17.5 % within 24 h of collection, ~95–100 % by three weeks.
- Bardyn M et al. Oxygen in red blood cell concentrates: influence of donors' characteristics and blood processing. Front Physiol 2020;11:616457. [doi:10.3389/fphys.2020.616457](https://doi.org/10.3389/fphys.2020.616457): SO₂ 51.2 ± 18.5 % before storage (1701 units).
- Yoshida T et al. The oxygen saturation of red blood cell concentrates. Transfusion 2021;62:183–193. [doi:10.1111/trf.16715](https://doi.org/10.1111/trf.16715): mean 43 % at donation (20–93 %), ~1.3-fold over 6 weeks.
- Zürn C et al. Risk assessment of red cell transfusion in congenital heart disease. Thorac Cardiovasc Surg 2022;70:e15–e20. [doi:10.1055/s-0042-1756493](https://doi.org/10.1055/s-0042-1756493): paediatric units median 6 days; pH 6.7, K 11.9, lactate 9.0 mmol/L (≤7 days).
- Garg P et al. Hemodiafiltration of priming solution in pediatric cardiac surgery. Artif Organs 2017;41:773–778. [doi:10.1111/aor.12830](https://doi.org/10.1111/aor.12830): units 3–20 days, pH 7.05, HCO₃⁻ 4.8 mmol/L.
