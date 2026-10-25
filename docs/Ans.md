# Ans

`Ans` is the autonomic nervous system: the reflex network that keeps blood pressure and blood gases near their set-points. It is a small manager. It owns the reflex arcs as sub-models, switches them all on or off together, and solves the blood gases the chemoreceptors read. The reflexes themselves are [AnsAfferent](./AnsAfferent.md) receptors feeding [AnsEfferent](./AnsEfferent.md) effector pathways.

## Physiology

The autonomic nervous system adjusts the body continuously, without conscious control:
- **Baroreflex.** Stretch receptors in the aortic arch and carotid sinus sense blood pressure. A fall in pressure raises heart rate, contractility and vascular tone (sympathetic) within seconds; a rise does the opposite (vagal).
- **Chemoreflex.**
  - Central chemoreceptors (mainly pCO2/pH) and peripheral ones in the carotid body (mainly pO2) raise ventilation when CO2 rises or O2 falls.
  - In the newborn, hypoxaemia also slows the heart: the diving-reflex-like bradycardia that follows an apnoea.

Each reflex is an arc: a receptor that fires faster or slower as its input moves from its set-point, a central integration, and efferent nerves that change an organ's behaviour.

## Inheritance

```
BaseModelClass
  └── Ans
```

## Properties

### Config (set in the definition JSON)

| Property | Unit | Default | Description |
|---|---|---|---|
| `ans_active` | boolean | `true` | Master switch, copied onto every sub-model; an inactive efferent outputs 1 (no effect). |
| `blood_composition_models` | list | `[]` | Compartments whose blood gases are solved for the chemoreceptors (`["AA"]` in every scenario). |
| `components` | object | `{}` | The afferents and efferents (built by the base class). |

## Calculation

Every 50 ms:
1. `ans_active` is written onto every component.
2. While active, [`calc_blood_composition`](./BloodComposition.md) runs on each `blood_composition_models` entry, so the chemoreceptors read current pO2, pCO2 and pH.

The reflexes run in the components: each afferent turns its input into a firing rate (0–1, 0.5 at the set-point) and passes it to its efferents. Each efferent adds the deviations of its afferents, maps the result to an effect factor (1 at rest) and writes it onto its target.

## The reflex network in the scenarios

Every scenario (term_neonate values; the set-points are re-anchored per scenario to its calibrated rest):

| Afferent | Input | min / set / max | → Efferent(s) |
|---|---|---|---|
| `BR_MAP` (baroreceptor) | `AAR.pres` | 25 / 57.8 / 100 mmHg | `EF_HR`, `EF_SVR`, `EF_HEART` |
| `CR_PCO2` (central chemoreceptor) | `AA.pco2` | 15 / 39.7 / 75 mmHg | `EF_MV` |
| `CR_PO2` (peripheral chemoreceptor, weight −0.15) | `AA.po2` | 30 / 75.5 / 150 mmHg | `EF_MV` |
| `CR_PH` | `AA.ph` | 6.9 / 7.36 / 7.7 | none |

| Efferent | Target | Effect at firing 0 / 1 | Time constant |
|---|---|---|---|
| `EF_HR` | `Heart.ans_activity_hr` | 1.5 / 0.43 | 2 s |
| `EF_SVR` | `Circulation.ans_activity` (vascular tone) | 2.0 / 0.5 | 10 s |
| `EF_HEART` | `Heart.ans_activity` (contractility) | 1.15 / 0.85 | 10 s |
| `EF_MV` | `Breathing.mv_ans_factor` | 0.1 / 10 | 5 s |

So a fall in pressure (low baroreceptor firing) raises heart rate, vascular tone and contractility, and a rise in pCO2 raises minute ventilation. A fall in pO2 raises it too, through the negative weight on `CR_PO2`.

**Hypoxic bradycardia** (added by `scripts/_add_apnea.mjs`; it was in the preterm scenarios, removed on 2026-10-25 to be rebuilt): `CR_PO2_HR` (`AA.po2`, set-point a few mmHg below the resting pO2) → `EF_HR_CHEMO` → `Heart.hr_chemo_factor`, with effect 0.5 at firing 0 and 1 at 1, so it only slows the heart. See [Apnea](./Apnea.md).

## Factor system

None of its own; the efferents write the targets' ANS inputs (`ans_activity`, `ans_activity_hr`, `mv_ans_factor`, `hr_chemo_factor`), which the targets apply in their own way (e.g. [BloodVessel](./BloodVessel.md) through `ans_sens`).

## Inputs and outputs

- **Reads:** the `blood_composition_models` compartments (solved).
- **Writes:** `ans_active` of its components; the solved blood gases of `AA`.
- **Written by:** the user (`ans_active`); the scenario generators (set-points, wiring).
- **Read by:** its components.

## Assumptions and limitations

- **One receptor per reflex, set-points fixed.** No baroreceptor resetting over hours, no adaptation of the chemoreceptors to chronic hypercapnia.
- **Afferent deviations add in the efferent**, so two afferents on one efferent can drive its firing rate outside 0–1 (see [AnsEfferent](./AnsEfferent.md)).
- **`CR_PH` is computed but drives nothing** in every scenario.
- **Switching off is abrupt:** an inactive efferent jumps to 1 without its time constant.
- **A component name that does not resolve throws** in the `ans_active` copy (the components are built from the definition, so this only happens with hand-edited state).
- **Lag of up to one interval:** the afferents and efferents update every 15 ms and Ans every 50 ms, so the loop carries up to one interval of delay. This is intended and stable.

## Example definition (JSON)

From `term_neonate.json`, `models.Ans` (trimmed; `components` holds the eight sub-models above):

```json
{
  "name": "Ans",
  "model_type": "Ans",
  "is_enabled": true,
  "ans_active": true,
  "blood_composition_models": ["AA"]
}
```

## Usage in the scenarios

One instance in every scenario, with the network above. No shipped scenario has the hypoxic-bradycardia arc at present (the preterm scenarios that had it were removed on 2026-10-25 to be rebuilt).

## References

No literature values; set-points are each scenario's calibrated rest, ranges and gains are model choices.
