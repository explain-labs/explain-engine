# Tetralogy of Fallot at 72 h: literature reference values

Reference values for validating four tetralogy of Fallot (ToF) scenarios built from `term_neonate_72h`:
a term neonate of 3.545 kg at 72 h postnatal age, with the RVOT obstruction graded from mild to atresia.
Compiled 2026-10-30 from Rudolph's *Congenital Diseases of the Heart* (chapter 14, kept out of the
repository) and a PubMed search.

| Scenario | Lesion | Duct | Reference set |
|---|---|---|---|
| `tof_pink` | mild RVOT obstruction, net L→R VSD, acyanotic | closed | [`tof_pink.json`](../scripts/reference/tof_pink.json) |
| `tof` | moderate RVOT obstruction, bidirectional VSD | closed | [`tof.json`](../scripts/reference/tof.json) |
| `tof_severe` | severe RVOT obstruction, R→L VSD, duct-dependent | 2.5 mm on PGE1 | [`tof_severe.json`](../scripts/reference/tof_severe.json) |
| `tof_pa` | pulmonary atresia, no MAPCAs, duct the sole Qp | 2.5 mm on PGE1 | [`tof_pa.json`](../scripts/reference/tof_pa.json) |

Each JSON has one entry per variable, in the same format as
[`term_neonate_72h.json`](../scripts/reference/term_neonate_72h.json) (value, range, method, age,
sources, grade, model read-out).

**Grades**
- **A**: neonatal ToF primary data, or the clinical definition of the group
- **B**: infant ToF, a textbook catheter figure, or fetal echo
- **C**: derived (Fick, Bernoulli), interpolated between figures, or borrowed from `term_neonate_72h`

## What the evidence is (and is not)

Quantitative neonatal ToF haemodynamics are almost absent from the literature: the papers group the
babies by saturation and duct dependence, and measure the pulmonary valve before birth. The backbone of
this set is therefore Rudolph's chapter 14, whose three circulation diagrams give typical catheter
pressures and saturations at every site:

| | Fig 14.2: moderate RVOT, small L→R | Fig 14.3: severe, newborn, duct open | Fig 14.4: severe, duct closed |
|---|---|---|---|
| Aortic saturation | 95 % | 80 % | 50 % |
| RV / systemic venous | 75 / 65–70 % | 58 / 55–60 % | 40 / 40 % |
| PA / pulmonary venous | 80 / 98 % | 58 / 96 % | 40 / 96 % |
| RV = LV systolic | 90 mmHg | 85 | 85 |
| PA pressure | 40/20, mean 28 | 20/10, mean 15 | 15/10, mean 12 |
| Aorta | 90/65, mean 72 | 85/50, mean 62 | 85/45, mean 58 |
| RV − PA systolic | 50 | 65 | 70 |
| Qp:Qs (Fick, derived) | ≈ 1.5 | ≈ 0.6 | ≈ 0.2 |

Fig 14.2 is labelled "moderate", but with an aortic saturation of 95 % and a net L→R shunt it is the
physiology of the pink tetralogy, and is used for `tof_pink`.

**Rules from Rudolph's text** (catheterization and physiology sections), used across the set:
- The VSD is non-restrictive: RV and LV systolic pressures are identical and the RV trace is square-topped.
- The RV ejects according to the relative afterloads: RVOT + pulmonary resistance above systemic
  resistance gives a R→L shunt; below it, a L→R shunt (pink tetralogy). Milder stenosis gives
  bidirectional ventricular shunting.
- In the first days the still-high PVR limits the L→R shunt of a pink tetralogy and may even cause mild
  cyanosis.
- With hypoxaemia, PA pressure is low with an almost flat trace (mean 6–8 mmHg).
- RA mean pressure is normal; the a wave may reach 8–10 mmHg.
- Systemic flow is usually normal, rising to 5–6 L/min/m² when hypoxaemia is marked. Qp:Qs may fall to 0.5.
- The ToF ductus is small and its closure is often delayed. On an open duct, saturation may reach
  85–92 %; rapid closure with severe stenosis drops it to 35–40 % (PO₂ 20–30 mmHg) with acidaemia.
- In pulmonary atresia all venous returns mix in the aorta, so the saturation is set by Qp:Qs alone.
- PCO₂ is usually normal or decreased to ~35 mmHg (hyperventilation).

## Measurement method matters

- **Figures scaled to 72 h.** Rudolph's diagrams have aortic systolic pressures of 85–90 mmHg; at 72 h
  this baby's systolic is ~74. Because RV systolic = aortic systolic, PA pressures and gradients are
  scaled to that.
- **The RVOT gradient is a weak severity measure here.** With a non-restrictive VSD the RV cannot exceed
  systemic pressure, so the gradient is capped; and in the first days a high PVR makes it underestimate
  the obstruction. Saturation follows the RVOT resistance, not the gradient. In `tof_severe` the
  gradient is reported only.
- **RVOT velocity is derived.** `RV_PA` is a linear resistor without a Doppler read-out, so the velocity
  is computed from the peak-to-peak gradient with the modified Bernoulli equation (v = √(ΔP/4)).
  Peak-to-peak (catheter) is lower than the peak instantaneous Doppler gradient.
- **Qp:Qs is derived** with the Fick principle from the figure saturations:
  Qp:Qs = (SaO₂ − SvO₂) / (SpvO₂ − SpaO₂). No neonatal catheter or MRI series was found.
- **Pulmonary valve z-scores are fetal** (28–32 weeks) and have no model counterpart: `RV_PA` lumps
  valve and infundibulum into one resistance. They are listed for the scenario descriptions.
- **Borrowed values.** HR, blood pressure, pH, PCO₂, glucose, lactate, Hb/Hct and temperature come from
  `term_neonate_72h` (a compensated neonate; user decision 2026-10-30). Rudolph: blood pressure is well
  maintained until acidaemia develops; tachycardia is usual in the severely cyanosed.

## Targets per scenario

All four share: RV − LV peak systolic 0 (−5 to +5) mmHg; RA mean 5 (2–8) mmHg; systemic output
196 (108–284) mL/kg/min; and the borrowed term values above. The aortic override (RV share of aortic
inflow) and the VSD diameter are reported only: no quantitative source was found.

| Variable | `tof_pink` | `tof` | `tof_severe` | `tof_pa` |
|---|---|---|---|---|
| SpO₂ pre-ductal (%) | **93** (90–97) | **84** (75–90) | **82** (75–90) | **80** (70–88) |
| Mixed venous sat (%) | 70 (65–75) | 65 (60–70) | 60 (55–65) | 60 (55–65) |
| Qp:Qs | 1.5 (1.2–2.0) | 1.0 (0.8–1.2) | 0.8 (0.6–1.1) | 1.0 (0.8–1.3) |
| PA systolic / mean (mmHg) | 35 (30–40) / 25 (20–30) | 25 (20–30) / 18 (14–22) | 20 (15–25) / 15 (12–18) | 20 (15–28) / 15 (10–20) |
| RVOT gradient (mmHg) | 42 (35–50) | 52 (45–60) | ~55, reported | – |
| RVOT velocity, derived (m/s) | 3.2 (3.0–3.5) | 3.6 (3.4–3.9) | ~3.7, reported | – |
| RV − venous sat step-up (%) | 8 (3–15) | 2 (0–5) | 0 (−3 to +3) | – |
| VSD net flow | L→R (> 0) | ≈ 0 (±30 mL/kg/min) | R→L (< 0) | R→L, whole RV output |
| Antegrade RVOT flow | = Qp | = Qp | small | 0 (atresia) |
| Duct | closed | closed | 2.5 mm, Ao→PA | 2.5 mm, Ao→PA = Qp |
| Pulmonary valve z (fetal) | often normal annulus | −2.6 ± 1.6 | −5.3 ± 2.4 | – |
| Duct closed (test) | – | – | SpO₂ 50 (35–60), Qp:Qs 0.2 | SpO₂ < 40, collapse |

Grades and sources per value:

- **SpO₂ bands** (A, definition): Reddy 1995, groups SaO₂ > 90 % (pink, n = 9), 75–90 % (n = 11)
  and duct-dependent (5 atresia, 5 severe stenosis). `tof_severe`: Rudolph Fig 14.3 (80 %) and text
  (85–92 % on an open duct); Li 2023, 75 ± 17 % before RVOT stenting. `tof_pa`: Matter 2012,
  75.1 ± 13.2 % on PGE1 before duct stenting (n = 33, 20 PA-VSD); the abstract also quotes "45–61 %",
  which contradicts the mean and is not used.
- **Mixed venous, PA pressures, step-up** (B/C): Rudolph Figs 14.2–14.4, scaled; `tof` is
  interpolated between Figs 14.2 and 14.3; `tof_pa` by analogy.
- **Qp:Qs** (C): Fick from the figures; `tof_pa` from the complete-mixing relation at SaO₂ 80 %.
- **RVOT gradient** (B/C): Rudolph figures, scaled; Mini 2024, mean gradient 50 (32–72) mmHg in 19
  cyanotic ToF infants (median 35 days, 3.3 kg; postnatal PV z −3.7, SpO₂ 70 %); Doppler convention
  mild < 36, moderate 36–64, severe > 64 mmHg.
- **Pulmonary valve z** (B, fetal): Vetten 2025, −2.6 ± 1.6 later intervention vs −5.3 ± 2.4
  PGE1-dependent / intervention ≤ 7 days, cut-off ≤ −3.5; Arya 2014, −5.38 ± 2.95 duct-dependent vs
  −3.51 ± 1.66; Hirji 2010, −3.0 ± 2.0 whole cohort, PV/AoV 0.65 ± 0.10.
- **Ductus** (B): Matter 2012, narrowest diameter 1.9 ± 0.6 mm (0.8–2.9), length 12.2 ± 3.7 mm before
  stenting; 2.5 mm chosen by the user for an open duct on PGE1.
- **Duct-closure test** (B/C): Rudolph Fig 14.4 and text; Jo 2018 defines "severe" as SpO₂ < 70 %.

## Gaps

No data were found for: Qp:Qs, LVO/RVO or the RV share of aortic flow in neonatal ToF; neonatal catheter
pressures (the rule only); RVOT Doppler gradients at 72 h by phenotype; ductal Doppler on PGE1; HR, BP,
lactate, SvO₂ and Hb in neonatal ToF; any postnatal quantitative value for the pink tetralogy beyond the
saturation definition.

## Decisions log

- 2026-10-30: base scenario `term_neonate_72h` at 72 h and 3.545 kg (no weight scaling).
- 2026-10-30: `tof_severe` and `tof_pa` have the duct held open on PGE1, 2.5 mm.
- 2026-10-30: HR, BP, Hb and lactate borrowed from the term set.
- 2026-10-30: Rudolph Fig 14.2 (labelled moderate, physiologically pink) used for `tof_pink`.

## References

1. Rudolph AM. *Congenital Diseases of the Heart: Clinical-Physiological Considerations*, 3rd ed.
   Wiley-Blackwell, 2009. Chapter 14: Pulmonary stenosis and atresia with ventricular septal defect
   (tetralogy of Fallot).
2. Reddy VM et al. Routine primary repair of tetralogy of Fallot in neonates and infants less than three
   months of age. *Ann Thorac Surg* 1995;60:S592–6. doi:10.1016/0003-4975(95)00732-6
3. Arya B et al. Fetal echocardiographic measurements and the need for neonatal surgical intervention in
   tetralogy of Fallot. *Pediatr Cardiol* 2014;35:810–6. doi:10.1007/s00246-013-0857-3
4. Vetten Z et al. Prenatal predictors of early intervention in simple tetralogy of Fallot. *Prenat Diagn*
   2025;45:743–51. doi:10.1002/pd.6796
5. Hirji A et al. Outcomes of prenatally diagnosed tetralogy of Fallot. *Can J Cardiol* 2010;26:e1–6.
   doi:10.1016/s0828-282x(10)70330-5
6. Mini N et al. Primary transcatheter dilation of the pulmonary valve in cyanotic patients with tetralogy
   of Fallot. *Front Cardiovasc Med* 2024;11:1489413. doi:10.3389/fcvm.2024.1489413
7. Matter et al. *Pediatr Cardiol* 2012 (ductal stenting in duct-dependent pulmonary blood flow; title not
   verified). doi:10.1007/s00246-012-0608-x
8. Li et al. *Zhong Nan Da Xue Xue Bao Yi Xue Ban* 2023 (RVOT stenting in tetralogy of Fallot; title not verified).
   doi:10.11817/j.issn.1672-7347.2023.230105
9. Jo et al. *Korean J Pediatr* 2018 (PMC6106685; duct-dependent ToF and PA-VSD neonates).
10. The borrowed rows cite the `term_neonate_72h` sources: see [TermNeonateReference](./TermNeonateReference.md).
