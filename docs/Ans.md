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

Every scenario (term_neonate_72h values; the set-points are re-anchored per scenario to its calibrated rest):

| Afferent | Input | min / set / max | → Efferent(s) |
|---|---|---|---|
| `BR_MAP` (baroreceptor, tc 0.5 s) | `AAR.pres` | 25 / 60.6 / 100 mmHg | `EF_HR`, `EF_SVR`, `EF_HEART` |
| `CR_PCO2` (central chemoreceptor) | `AA.pco2` | 15 / 39.7 / 75 mmHg | `EF_MV` |
| `CR_PO2` (peripheral chemoreceptor, weight −0.4) | `AA.po2` | 30 / 75.5 / 150 mmHg | `EF_MV` |
| `CR_PH` | `AA.ph` | 6.9 / 7.36 / 7.7 | none |

| Efferent | Target | Effect at firing 0 / 1 | Time constant |
|---|---|---|---|
| `EF_HR` | `Heart.ans_activity_hr` | 1.5 / 0.43 | 0.5 s |
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

- **Reflex responses of term_neonate_72h** (re-validation (l), `BR_MAP` and `EF_HR` time constants 4 and 2 s → 0.5 s, `CR_PO2` weight −0.15 → −0.4, baroreflex set-point re-anchored to the resting arch pressure so it is neutral at rest):
  - **Baroreflex sensitivity** (transfer gain from systolic pressure to RR interval at 0.1 Hz, systemic resistance modulated ±5 %): 6.0 ms/mmHg (was 1.5; 0 with the ANS off). Term infants: ~15 ms/mmHg in the first days (Andriessen 2005, LF transfer gain), 6.4 at 2–4 weeks (Yiallourou 2010). The static strength was already ~7 ms/mmHg; the slow receptor smoothing (4 s) and HR efferent (2 s) passed only ~23 % of it at 0.1 Hz, where the real vagal arm acts within about a second.
  - **Hypoxic ventilatory response** (FiO₂ 0.21 → 0.15): minute ventilation +16 % at 30 s, +19 % at 1 min, then +11 % by 5 min as PaCO₂ falls (39.6 → 34.9 mmHg); SaO₂ 97 → 93.4 %. Term newborns: an early rise (~+17 %, Rigatto 1982) then a late fall of ~14 % from the peak (De Boeck 1984). With the central **hypoxic ventilatory depression** ([Breathing](./Breathing.md#hypoxic-ventilatory-depression)) the late fall is 12 % from the peak (+18 % at 1 min, +4 % at 5 min); before it, the hypocapnic brake alone gave ~8 % and severe hypoxia stayed alkalotic.
  - **Hypercapnic response:** gain 0.25 (fractional rise in ventilation per mmHg PaCO₂; neonatal 0.10–0.40, `validate_respiratory.mjs`).
- **One receptor per reflex, set-points fixed.** No baroreceptor resetting over hours, no adaptation of the chemoreceptors to chronic hypercapnia.
- **Afferent deviations add in the efferent**, so two afferents on one efferent can drive its firing rate outside 0–1 (see [AnsEfferent](./AnsEfferent.md)).
- **`CR_PH` is computed but drives nothing** in every scenario.
- **Switching off is abrupt:** an inactive efferent jumps to 1 without its time constant.
- **A component name that does not resolve throws** in the `ans_active` copy (the components are built from the definition, so this only happens with hand-edited state).
- **Lag of up to one interval:** the afferents and efferents update every 15 ms and Ans every 50 ms, so the loop carries up to one interval of delay. This is intended and stable.

## Example definition (JSON)

From `term_neonate_72h.json`, `models.Ans` (trimmed; `components` holds the eight sub-models above):

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

- Andriessen P, et al. Baroreceptor reflex sensitivity in human neonates: the effect of postmenstrual age. *J Physiol* 2005;568:333–41. doi:10.1113/jphysiol.2005.093641
- Yiallourou SR, Sands SA, Walker AM, Horne RSC. Postnatal development of baroreflex sensitivity in infancy. *J Physiol* 2010;588:2193–203. doi:10.1113/jphysiol.2010.187070
- Rigatto H, et al. Ventilatory response to 100% and 15% O2 during wakefulness and sleep in preterm infants. *Early Hum Dev* 1982;7:1–10. doi:10.1016/0378-3782(82)90002-0
- De Boeck C, Van Reempts P, Rigatto H, Chernick V. Naloxone reduces decrease in ventilation induced by hypoxia in newborn infants. *J Appl Physiol* 1984;56:1507–11. doi:10.1152/jappl.1984.56.6.1507

The baroreflex HR dynamics and the peripheral chemoreceptor weight are set from the references above; the set-points are each scenario's calibrated rest, and the other ranges and gains are model choices.
