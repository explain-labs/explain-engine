# Tetralogy of Fallot at 72 h: literature reference values

Reference values for validating four tetralogy of Fallot (ToF) scenarios built from `term_neonate_72h`:
a term neonate of 3.545 kg at 72 h postnatal age, with the RVOT obstruction graded from mild to atresia.
Compiled 2026-10-30 from Rudolph's *Congenital Diseases of the Heart* (chapter 14, kept out of the
repository) and a PubMed search.

| Scenario | Lesion | Duct | Reference set |
|---|---|---|---|
| `tof_pink` | mild RVOT obstruction, net L→R VSD, acyanotic | closed | [`tof_pink.json`](../scripts/reference/tof_pink.json) |
| `tof` | moderate RVOT obstruction, bidirectional VSD | closed | [`tof.json`](../scripts/reference/tof.json) |
| `tof_severe` | severe RVOT obstruction, R→L VSD, duct-dependent | 2.2 mm on PGE1 | [`tof_severe.json`](../scripts/reference/tof_severe.json) |
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
- **PA pressure and gradient at 72 h (revised in step 3.2).** With a non-restrictive VSD the RV peak is the
  systemic peak, so the gradient is simply systemic minus PA systolic pressure, and the PA pressure is set
  by the pulmonary flow through the pulmonary vascular resistance. At 72 h that resistance is still high:
  the healthy baby has PA 36/13 (mean 25) at normal flow (Kang 2016). Fig 14.2, which the first targets
  for `tof_pink` and `tof` were scaled from, is an older infant whose PVR has fallen, so its PA pressure is
  lower and its gradient higher than a 72 h baby's at the same saturation. The `tof_pink` and `tof` PA and
  gradient targets are therefore derived from the term PA pressure and the pulmonary flow (grade C).
  Consistent with this, the model gives a gradient of ~54 mmHg at SpO₂ 72 %, as Mini 2024 measured in
  cyanotic infants of five weeks (50 mmHg at 70 %).
- **The RVOT gradient is a weak severity measure here.** With a non-restrictive VSD the RV cannot exceed
  systemic pressure, so the gradient is capped; and in the first days a high PVR makes it underestimate
  the obstruction. Saturation follows the RVOT resistance, not the gradient. In `tof_severe` the
  gradient is reported only.
- **RVOT velocity.** The model's RVOT is an orifice (see below), so the probe reports its jet velocity at the
  per-beat peak flow, as Doppler measures it. The velocity targets are derived from the gradient bands
  with the modified Bernoulli equation (v = √(ΔP/4)); the peak-to-peak (catheter) gradient is lower than
  the peak instantaneous Doppler gradient, so the jet velocity reads ~0.2–0.3 m/s above the derived value.
- **The RVOT in the model** is `RV_PA` with an orifice term: `r_k` is the Bernoulli coefficient of an
  effective RVOT diameter (valve and infundibulum lumped, discharge coefficient 0.7; `helpers/Orifice.js`),
  so the pressure drop rises with the square of the flow (ΔP = r·Q + r_k·Q², solved exactly per step by
  the Resistor); `r_for` keeps the baseline valve resistance. At a matched operating point it gives the
  same pressures as a linear resistance; it is used because the obstruction is then a diameter, it
  behaves like a stenosis when the flow changes (crying, a spell), and it yields a Doppler velocity.
- **Model read-outs.** The Monitor's SvO₂ reads the PA, which in ToF is not mixed venous blood, so the
  venous saturation is the systemic venous return entering the RV (RAIVCI and RASVC, weighted by their
  tricuspid flows); the PA saturation is a row of its own. With the aorta overriding, R→L blood leaves the
  RV straight into the aorta (`RV_AA`), so the ventricular shunt is the RV→PA output minus the systemic
  venous inflow (L→R positive), not the VSD resistor flow alone (reported as `vsd_flow`).
- **RV saturation is mixed in the model.** The VSD exchanges blood both ways every beat (3–4 mL LV→RV,
  1–2 mL back), as Doppler shows. In a real heart the LV blood crossing in systole streams into the
  overriding aorta without mixing in the body of the RV; the model's RV is one well-mixed compartment, so
  its saturation reads ~11–12 % above the venous blood in `tof` and `tof_severe` (Rudolph's severe newborn:
  RV = venous). It does not depend on the override resistance or the VSD size, and it does not move the
  other targets; it does make the RV and PA look more oxygenated in the diagram. The step-up is therefore
  reported only for those two; in `tof_pink` the L→R step-up is the real physiology and stays a target.
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
| Systemic venous sat (%) | 70 (65–75) | 65 (60–70) | 60 (55–65) | 60 (55–65) |
| PA sat (%) | 80 (75–85) | reported | reported | = aortic |
| Qp:Qs | 1.5 (1.2–2.0) | 1.0 (0.8–1.2) | 0.8 (0.6–1.1) | 1.0 (0.8–1.3) |
| PA systolic / mean (mmHg) | 47 (40–55) / 33 (28–38) | 36 (30–42) / 24 (20–28) | 28 (20–36) / 22 (16–28) | 28 (20–36) / 22 (16–28) |
| RVOT gradient (mmHg) | 25 (15–35) | 38 (30–45) | ~55, reported | – |
| RVOT velocity (m/s) | 2.5 (1.9–3.0) | 3.1 (2.7–3.35) | ~3.7, reported | – |
| RV − venous sat step-up (%) | 8 (3–15) | small, reported | 0, reported | – |
| Net ventricular shunt | L→R (> 0) | ≈ 0 (±30 mL/kg/min) | R→L (< 0) | R→L, whole venous return |
| Antegrade RVOT flow | = Qp | = Qp | small | 0 (atresia) |
| Duct | closed | closed | 2.2 mm, Ao→PA | 2.5 mm, Ao→PA = Qp |
| Pulmonary valve z (fetal) | often normal annulus | −2.6 ± 1.6 | −5.3 ± 2.4 | – |
| Duct closed (test) | – | – | SpO₂ 50 (35–60); Qp:Qs reported | SpO₂ < 40, collapse |

Grades and sources per value:

- **SpO₂ bands** (A, definition): Reddy 1995, groups SaO₂ > 90 % (pink, n = 9), 75–90 % (n = 11)
  and duct-dependent (5 atresia, 5 severe stenosis). `tof_severe`: Rudolph Fig 14.3 (80 %) and text
  (85–92 % on an open duct); Li 2023, 75 ± 17 % before RVOT stenting. `tof_pa`: Matter 2012,
  75.1 ± 13.2 % on PGE1 before duct stenting (n = 33, 20 PA-VSD); the abstract also quotes "45–61 %",
  which contradicts the mean and is not used.
- **Venous saturation, step-up** (B/C): Rudolph Figs 14.2–14.4, scaled; `tof` is interpolated between
  Figs 14.2 and 14.3; `tof_pa` by analogy. PA pressures: see the next item.
- **Qp:Qs** (C): Fick from the figures; `tof_pa` from the complete-mixing relation at SaO₂ 80 %.
- **PA pressure and RVOT gradient** (C for `tof_pink`/`tof`, B/C for `tof_severe`): derived for 72 h from the
  term PA pressure (Kang 2016) and the pulmonary flow; `tof_severe` from Rudolph Fig 14.3 (a newborn).
  Context, not targets: Mini 2024, mean gradient 50 (32–72) mmHg in 19 cyanotic ToF infants (median
  35 days, 3.3 kg; postnatal PV z −3.7, SpO₂ 70 %); Doppler convention mild < 36, moderate 36–64,
  severe > 64 mmHg (older infants and children).
- **Pulmonary valve z** (B, fetal): Vetten 2025, −2.6 ± 1.6 later intervention vs −5.3 ± 2.4
  PGE1-dependent / intervention ≤ 7 days, cut-off ≤ −3.5; Arya 2014, −5.38 ± 2.95 duct-dependent vs
  −3.51 ± 1.66; Hirji 2010, −3.0 ± 2.0 whole cohort, PV/AoV 0.65 ± 0.10.
- **Ductus** (B): Matter 2012, narrowest diameter 1.9 ± 0.6 mm (0.8–2.9), length 12.2 ± 3.7 mm before
  stenting; 2.5 mm chosen by the user for an open duct on PGE1, then set by the step 3.3 duct sweep to
  2.2 mm (`tof_severe`) and 2.5 mm (`tof_pa`).
- **Duct-closure test** (B/C): SpO₂ from Rudolph Fig 14.4 and text; Jo 2018 defines "severe" as SpO₂ < 70 %.
  Qp:Qs after closure is reported only (step 3.3).

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
- 2026-10-30 (step 3.1): RV free wall as thick as the LV's (`HeartFunction.wall_frac_rv` = `wall_frac_lv`,
  0.35 instead of the term baby's 0.15). The ToF RV has worked at systemic pressure since fetal life and
  does not thin after birth; with the thin postnatal wall HeartFunction read the systemic RV pressure as an
  afterload mismatch and cut RV contractility to 0.2–0.6 (blood pressure and output fell with severity, the
  atresia baby decompensated). Contractility itself is unchanged (a ×1.5 RV `el_max` was prototyped and
  not taken: no source for the number).
- 2026-10-30 (step 3.2): PA pressure and gradient targets of `tof_pink` and `tof` re-derived for 72 h
  (see "PA pressure and gradient at 72 h"); the RVOT is an orifice with an effective diameter (6 mm pink,
  4.5 mm moderate, 2 mm severe) instead of a linear resistance.
- 2026-10-30 (step 3.3): duct sweep (1.5–3 mm). `tof_severe` duct 2.2 mm (SpO₂ 78, Qp:Qs 1.0; 2.5 mm gave
  Qp:Qs 1.2), `tof_pa` duct 2.5 mm (SpO₂ 75, Qp:Qs 1.0; below 2 mm the atresia baby collapses). PA pressure
  targets of both re-derived from their pulmonary flow at 72 h by the step 3.2 rule (Fig 14.3's PA 20/10
  has Qp:Qs ~0.6). Qp:Qs after duct closure is reported only: after an acute closure the systemic output
  falls with the pulmonary flow, so the ratio stays ~0.4–0.5; Fig 14.4's 0.18 is an older infant.
- 2026-10-30 (step 3.4): RV step-up reported only for `tof` and `tof_severe` (lumped-RV mixing of the
  to-and-fro VSD flow; no engine change, a streaming mechanism would be needed).
- 2026-10-30: accepted exception: `tof_pa` systemic venous saturation ~53 % (band 55–65). The arterial–venous
  gap (~21 points, set by oxygen use, systemic flow and Hb) is the same in all four grades and in Fig 14.3;
  the band was copied from Fig 14.3 at SpO₂ 80 %, and at the atresia baby's 74 % the same gap gives ~53 %.
  A 2.8 mm duct would lift it to 56 % at the cost of Qp:Qs 1.2 and PA mean 29; the 2.5 mm duct was kept.
- 2026-10-30: breathing adapted to the chronic hypoxaemia. The hypoxic ventilatory depression
  (`Breathing.hvd_*`, threshold 70 mmHg, tuned to the term baby resting at ~72) held every ToF baby at its
  floor (factor 0.2), the chemoreflex wound up against it (EF_MV 3–5.6), ventilation stayed at the term
  level and PaCO₂ rose to ~44 (pH 7.32), where cyanotic babies are hyperpnoeic with a PaCO₂ normal or
  ~35. `_make_tof.mjs` re-anchors `hvd_po2_threshold` to 0.95 × the resting PaO₂ (the depression is an
  acute response; an acute fall such as duct closure still triggers it); the chemoreflex keeps the term
  setpoints. Result: PaCO₂ 31–34, pH 7.42–7.45, MV 318–398 mL/kg/min, EF_MV 1.3–1.9, SpO₂ unchanged.
  `tof_severe` with the duct closed for 3–10 min now recovers when it is reopened.

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
