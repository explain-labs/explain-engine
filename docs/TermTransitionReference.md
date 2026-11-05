# Term neonate in transition: reference values at 12 h

Reference values for `term_neonate_12h`: the **same baby as `term_neonate_72h`, 60 h younger**. It is a
healthy term neonate of about 3.5 kg after an uncomplicated vaginal birth, breathing room air, dressed at
room temperature, with breastfeeding started. The machine-readable set is
[`term_neonate_12h.json`](../scripts/reference/term_neonate_12h.json). Check it with
`node scripts/probe_term_reference.mjs term_neonate_12h --ref scripts/reference/term_neonate_12h.json`.
Compiled 2026-11-05 from PubMed, the engine's `reference-value-papers` and NeoCardioLab.

## How the targets are made

**The rule (user decision, 2026-11-05):** a 12 h target is the 72 h target times the change between ~12 h and
~72 h measured *within one longitudinal study*, in the same cohort with the same method. The 72 h baby is
calibrated to its own sources (Groves MRI output, van Zadelhoff BP, ...). Absolute 12 h values from other cohorts
and methods would mix their offsets into the change: echo LV output 290 against MRI 196 looks like +48 %, while
within Agata the change is +13 %. So:
- **within-study pair → 72 h × ratio** (the "× change" column; grade A, or B with interpolation, an age proxy
  such as 48 or 96 h, or two studies that disagree);
- **no pair → the 72 h value is kept** ("kept", grade C), with other cohorts' 12 h values as cross-checks in the
  JSON notes;
- **absolute values only where the 72 h baby has no counterpart**: the open duct.

**The longitudinal studies used:**
- Taiwo 2022 (BP at birth, 6, 12, 24, 36, 48 h; arm, oscillometric)
- Kang 2016 (duct and ductal-gradient PA pressure at 2, 6, 12, 24, 48, 72 h)
- Agata 1994 (HR, stroke volume, LV output, MCA, coeliac, SMA and renal flow at 1, 4–8, 24, 96 h; values at
  12 h interpolated between 4–8 and 24 h)
- Ha 2018 (duct, BP, HR, SVC flow, LV output, EF in 12-hour bins from 0 to 72 h)
- Smeets 2022 (GFR on days 1 and 3), GLOW 2021 (lactate), Lee 1999 (FRC at 4–6 and 24 h)
- Zoppi 1998 (RQ at 6 and 30 h), Nelle 1993 (Hct at 2 h, 24 h, day 5)

**Groves 2011**, the 72 h output source, scanned at a median of 11 days, with ranges by corrected gestational
age, so it gives no 12 h change. **Jhaveri 2023** (MRI at 31.8 ± 14 h, LV output 177 mL/kg/min) is a
same-method cross-check: by MRI, the output on day 1–2 is not clearly above Groves' term values.

**Methods behind the 72 h base, and what that means for the 12 h changes.** The 72 h baby is MRI-based
for its heart and central flows; the rest comes from other methods, because MRI does not measure it.

| Part of the 72 h base | Method | Source | The 12 h change from |
|---|---|---|---|
| LV and RV volumes, stroke volume, EF; LV and RV output; SVC and descending aorta flow | MRI (cine and phase contrast) | Groves 2011, Jhaveri 2023 | echo (Agata, Ha): **different method, the weakest link** |
| Cerebral blood flow | phase-contrast MRA (carotids + basilar) | Kooi 2019, Liu 2014 | Agata Doppler (MCA): different method |
| Gut, kidney and liver flow | Doppler volume flow | Agata 1994, van Bel 1990 | Agata Doppler: same method and study |
| Blood pressure, heart rate | oscillometric cuff, monitor pulse | van Zadelhoff 2023, Satoh 2016 | Taiwo cuff; Agata, Ha: same kind of method |
| PA pressure | echo, ductal gradient + arm BP | Kang 2016 | Kang: same study |
| GFR | measured clearance | Smeets 2022 | Smeets: same study |
| Coronary flow | echo (LAD), scaled | Aburawi 2012 | none (kept) |
| Breathing, lung volumes | pneumotachography, helium dilution, occlusion | Schmalisch, Yüksel, Katier | Lee 1999 (FRC); otherwise none (kept) |
| Gases, glucose, lactate, Hb | capillary / heel-prick samples | Cousineau 2005, GLOW, Jopling | GLOW (lactate), Nelle (Hct); otherwise none (kept) |
| SvO2, VO2, blood volume, CVP, temperature | catheter data in preterms, derived, textbook | grade C | none (kept), Nelle (blood volume) |

Absolute echo outputs scatter around MRI in both directions (Agata ~30 % above, Ha ~10 % below; Groves: repeated
echo LV output agrees only within ±109 mL/kg/min, MRI within ±50). Each echo study's own 12 h / 72 h ratio
cancels most of its offset, but the size of the change is still uncertain. So the LV output change takes the low
end (×1.13, Agata 1994; user decision 2026-11-05), and the ductal shunt derived from it inherits that uncertainty.
There is no MRI at 12 h. Jhaveri's MRI at ~32 h (stroke volume 1.75 vs 1.6 mL/kg) is compatible with the small
excess Agata predicts at that age (~+5 %). Jhaveri's mean birth weight, 3545 g, is the model's weight.

**Gaps (72 h kept for now):** blood gases (no longitudinal 12 h and ~72 h study found), CVP, RV volumes,
breathing pattern, compliance (direction only: lower on day 0), SpO2, temperature, glucose (GLOW and the 72 h
Cousineau value are different methods), urine (direction only), VO2 and SvO2. The earlier 12 h rows for VO2 and
SvO2 came from the brown-fat derivation of 2026-10-27, not from a within-study pair.

**Grades**
- **A**: within-study pair, healthy term babies, at the two ages
- **B**: within-study pair with interpolation, an age proxy, or two studies that disagree
- **C**: no pair (72 h kept), derived, or carried

## The duct at 12 h

The duct is the main feature of this scenario. At 12 h it is still open in every baby and is
constricting fast:
- **Diameter:** Kang 2016 measured 4.6 mm at 2 h, 3.4 at 6 h, 2.47 ± 0.49 at 12 h and 1.9 at 24 h. Other
  cohorts are a little smaller: 2.1 ± 0.6 at 12 h (Tohoku 2002), and medians of 2.24 over 0–12 h and
  1.34 over 12–24 h (Ha 2018).
- **Where it narrows:** narrowing starts as a focal intraluminal protrusion at the pulmonary end
  (30 % of babies within 1 h, 96 % by 8 h, all by 24 h), with a high-velocity jet in and beyond it. It
  then spreads along the duct (Hiraishi 1987). The ampulla at the aortic end stays (Rudolph). In
  the model, `Pda.constriction_length` is the short pulmonary-end cone.
- **Direction:** flow is left-to-right only in 88 % of babies at 12 h; 12 % are still bidirectional,
  against 100 % at 2 h and 55 % at 6 h (Kang 2016). Bidirectional flow turns into continuous
  left-to-right flow before closure, and only 3 of 19 babies were still bidirectional at 12–24 h
  (Shiraishi 1991). Where right-to-left flow persists, it is systolic: RV ejection carries blood
  through the duct while PVR is still raised (Rudolph).
- **Velocity:** the peak left-to-right velocity is 1.43 (1.07–1.78) m/s over 0–12 h and
  2.02 (1.49–2.26) m/s over 12–24 h (Ha 2018). It rises from 1.5 ± 0.7 m/s at the first exam to
  2.3 ± 0.6 m/s just before closure (Mandorla 1990). The spectrum is continuous or diastolic, and either
  flat or with a protosystolic or protodiastolic peak.
- **Pressures behind it:** Kang's ductal-gradient PA pressure at 12 h is 52.5/23.4 (mean 40.9) mmHg. With
  Taiwo's BP of 69.8/40.4, both the systolic and the end-diastolic aorta-to-PA gradients are
  ~17 mmHg (~2.1 m/s). That is a flat, "closing" spectrum; it is derived, so grade C.
- **Pattern class** (van Laere 2018, after Su): closing means peak / end-diastolic velocity < 2;
  pulsatile means ≥ 2; growing means right-to-left for < 30 % of the cycle.
- **Shunt volume:** no study measures it at 12 h. The target, ~35 (25–47) mL/kg/min, is the extra LV
  output at 12 h over the closed-duct output, measured within one study, times the 72 h LV output (196). It
  assumes the systemic flow is the same at both ages, which Ha's unchanged SVC flow supports. Agata 1994:
  ~291 at 12 h vs 258 at 96 h (+12.8 %, i.e. 25). Ha 2018: 205.5 vs 165–175 (+17–24 %, i.e. 34–47). Drayton
  1987 (62 shortly after birth, "decreased rapidly over the first 12 h") gives the direction. Two earlier
  targets were dropped: 5–40, scaled from Drayton by duct area alone, and 60–100, which subtracted an MRI
  output (~200) from an echo output (290). **Open conflict:** at the 12 h pressures, the model's 2.47 mm
  pulmonary end (Kang) carries ~90–106 mL/kg/min, two to three times this target.
- **Not found:** NeoCardioLab has no page on the healthy term transition, and no study reports a
  measured end-diastolic velocity at 12 h.

The expected 12 h picture is therefore a constricting duct of ~2.2–2.5 mm with continuous
left-to-right flow. The peak is ~1.5–2 m/s, the end-diastolic velocity is high, and peak/ED sits at
the closing/pulsatile border. A short systolic right-to-left component is a minority finding.

**Early-systolic dip (cross-check, not a target).** The dip in a restrictive duct is parked for the
preterm rebuild ([Pda.md](./Pda.md)). At 12 h the aorta-PA gradient (~17 mmHg) is about the size of
NeoCardioLab's restrictive example. But on day 0 (2–12 h) the aortic valve opens before the pulmonary
valve (Shiraishi 1987: RPEP 94 > LPEP 77 ms), which argues against a dip. The probe reports the beat
minimum as `pda_v_ed`, so a dip would show there.

## Blood volume and haematocrit

The 12 h baby is the same baby as the 72 h scenario (user decision, 2026-11-05). Its red cell mass (~42 mL/kg) is held. After a placental transfusion, plasma leaves within ~2 h and Hct peaks. Plasma then slowly returns, and Hct drifts down: 58 → 56 → 54 % at 2 h, 24 h and day 5 (Nelle 1993, 3-min clamping), and 63 → 59 % at 2 h and 24 h (Linderkamp 1992). Interpolated, Hct is ~57.1 % at 12 h and ~55.0 % at 72 h, a ratio of 1.038. The 12 h targets are the 72 h ones scaled by it: Hct 51.4 %, Hb 17.6 g/dL, blood volume ~82 mL/kg. Blood volume is lowest in the first hours and rises slightly by day 3, by ~4 mL/kg, not 8. An earlier derivation (1-min delayed clamping, Hct 57 %, 77 mL/kg) compared two clamping strategies, not one baby at two ages, and was dropped.

## Reference values

### Hemodynamics

| Variable | Unit | 12 h | × change | Grade | Sources | 72 h |
|---|---|---|---|---|---|---|
| Heart rate | bpm | 121.5 ± 17.1 (93.73–149.35) | ×1.03 | B | agata1994, ha2018, tveiten2021 | 118 ± 16.6 (91–145) |
| Systolic BP | mmHg | 71.7 (58.13–86.22) | ×0.969 | A | taiwo2022 | 74 (60–89) |
| Diastolic BP | mmHg | 43.5 (29.3–57.65) | ×0.945 | A | taiwo2022 | 46 (31–61) |
| Mean arterial pressure | mmHg | 55.4 (42.99–68.78) | ×0.955 | A | taiwo2022 | 58 (45–72) |
| Pulse pressure | mmHg | 28.1 | ×1 | B | taiwo2022 | 28 |
| Central venous pressure | mmHg | 2–8 | kept | C | textbook | 2–8 |
| Pulmonary artery pressure, systolic | mmHg | 52.51 ± 9.07 (34.4–70.7) | ×1.46 | A | kang2016 | 36 ± 6.48 |
| Pulmonary artery pressure, mean | mmHg | 40.94 ± 9.32 (22.3–59.6) | ×1.62 | A | kang2016 | 25.25 ± 8.29 |
| Pulmonary artery pressure, diastolic | mmHg | 23.43 ± 7.37 (8.7–38.2) | ×1.77 | A | kang2016 | 13.25 ± 6.18 |

### Heart

| Variable | Unit | 12 h | × change | Grade | Sources | 72 h |
|---|---|---|---|---|---|---|
| LV end-diastolic volume | mL/kg | 2.5 ± 0.3 (1.9–3.1) | kept | C | jhaveri2023, groves2011 | 2.5 ± 0.3 (1.9–3.1) |
| LV end-systolic volume | mL/kg | 0.9 ± 0.2 (0.5–1.3) | kept | C | jhaveri2023, groves2011 | 0.9 ± 0.2 (0.5–1.3) |
| LV stroke volume | mL/kg | 1.712 ± 0.11 (1.5–2.03) | ×1.07 | B | agata1994, ha2018 | 1.6 ± 0.1 (1.4–1.9) |
| LV ejection fraction | % | 62.1 ± 3.34 (55.44–68.71) | ×0.983 | A | ha2018, jhaveri2023, groves2011 | 63.2 ± 3.4 (56.4–69.9) |
| RV end-diastolic volume | mL/kg | 3.1 ± 0.3 (2.5–3.7) | kept | C | jhaveri2023 | 3.1 ± 0.3 (2.5–3.7) |
| RV end-systolic volume | mL/kg | 1.5 ± 0.2 (1.1–1.9) | kept | C | jhaveri2023 | 1.5 ± 0.2 (1.1–1.9) |
| RV stroke volume | mL/kg | 1.6 ± 0.2 (1.2–2) | kept | C | jhaveri2023 | 1.6 ± 0.2 (1.2–2) |
| RV ejection fraction | % | 52.5 ± 3.3 (45.9–59.1) | kept | C | jhaveri2023 | 52.5 ± 3.3 (45.9–59.1) |

### Regional and coronary flows

| Variable | Unit | 12 h | × change | Grade | Sources | 72 h |
|---|---|---|---|---|---|---|
| Left ventricular output | mL/kg/min | 221.5 (122–320.9) | ×1.13 | B | agata1994, agata1991, ha2018, jhaveri2023, groves2011 | 196 (108–284) |
| Right ventricular output | mL/kg/min | 199 (100–298) | kept | C | groves2011, jhaveri2023 | 199 (100–298) |
| SVC flow | mL/kg/min | 84.7 (28.56–140.76) | ×1.02 | B | ha2018, lee2009, groves2011 | 83 (28–138) |
| Descending aorta flow | mL/kg/min | 99 (57–141) | kept | C | groves2011 | 99 (57–141) |
| Cerebral blood flow | mL/kg/min | 21.8 (7.51–72) | ×0.766 | B | agata1994 | 28.5 (9.8–94) |
| Intestinal (SMA) flow | mL/kg/min | 29.9 ± 9.03 | ×0.694 | B | agata1994 | 43 ± 13 |
| Renal blood flow | mL/kg/min | 23.8 | ×0.847 | B | agata1994 | ref. only |
| Hepatic arterial / coeliac flow | mL/kg/min | 24.4 | ×0.901 | B | agata1994 | ref. only |
| Coronary flow (whole heart) | mL/min | 22 (18–28) | kept | C | aburawi2012, yasuoka2002 | 22 (18–28) |
| Myocardial O2 use | mL/100 g/min | 14 (10–19) | kept | C | smolich1996 | 14 (10–19) |

### Lungs and breathing

| Variable | Unit | 12 h | × change | Grade | Sources | 72 h |
|---|---|---|---|---|---|---|
| Respiratory rate | /min | 44 (32–57) | kept | C | hannover2018, schmalisch2005, fleming2011 | 44 (32–57) |
| Tidal volume | mL/kg | 5.57 ± 1.06 | kept | C | schmalisch2005, schmalisch2001 | 5.57 ± 1.06 |
| Minute ventilation | mL/kg/min | 215 ± 51.7 | kept | C | schmalisch2005 | 215 ± 51.7 |
| Inspiratory time fraction (Ti/Ttot) | - | 0.4 | kept | C | schmalisch2005 | 0.4 |
| Peak tidal inspiratory flow | L/min/kg | 0.83 ± 0.2 | kept | C | schmalisch2005 | 0.83 ± 0.2 |
| Peak tidal expiratory flow | L/min/kg | 0.64 ± 0.19 | kept | C | schmalisch2005 | 0.64 ± 0.19 |
| Respiratory system compliance | mL/cmH2O | 3.6 (3.2–4) | kept | C | katier2006, stocks1994, migdal1987, nowotny1998 | 3.6 (3.2–4) |
| Respiratory system resistance | cmH2O/L/s | 52 ± 5.6 | kept | C | nowotny1998, katier2006 | 52 ± 5.6 |
| Functional residual capacity | mL/kg | 25.9 (22.71–30.54) | ×0.954 | B | lee1999 | 27.1 (23.8–32) |
| Anatomic dead space | mL/kg | 2.2 | kept | C | stokes1986 | 2.2 |
| Pleural (oesophageal) pressure swing | cmH2O | 7.3 ± 1.4 | kept | C | gerhardt1987, papastamelos1995, yau1994 | 7.3 ± 1.4 |
| Ventilatory response to CO2 | mL/kg/min per mmHg | 38.7 (12–67) | kept | C | cohen1991, moriette1985, rigatto1991, mortola1996 | 38.7 (12–67) |

### Gases

| Variable | Unit | 12 h | × change | Grade | Sources | 72 h |
|---|---|---|---|---|---|---|
| SpO2 (pre-ductal) | % | 97.3 ± 1.4 | kept | C | brockmann2011, poets1996, hannover2018 | 97.3 ± 1.4 |
| pH | - | 7.395 ± 0.037 (7.312–7.473) | kept | C | cousineau2005 | 7.395 ± 0.037 (7.312–7.473) |
| pCO2 | mmHg | 38.7 ± 5.1 (28.5–48.7) | kept | C | cousineau2005 | 38.7 ± 5.1 (28.5–48.7) |
| HCO3 | mmol/L | 23.4 | kept | C | cousineau2005 | 23.4 |
| Base excess | mmol/L | -4–2 | kept | C | textbook | -4–2 |
| PaO2 | mmHg | 60–90 | kept | C | textbook | 60–90 |
| End-tidal CO2 | mmHg | ref. only | kept | C | lopez2011 | ref. only |
| Mixed venous O2 saturation | % | 76 (70–80) | kept | C | vanderhoeven1996, wolfsberger2023, carmichael2025, liu2014, bailey2013 | 76 (70–80) |
| SpO2 post-ductal | % | ref. only | kept | C |  | – |

### Metabolism

| Variable | Unit | 12 h | × change | Grade | Sources | 72 h |
|---|---|---|---|---|---|---|
| Oxygen consumption | mL/kg/min | 8.4 ± 1.51 (6.3–9.5) | kept | C | photo2001, zoppi1998, vanderhoeven1996 | 8.4 ± 1.51 (6.3–9.5) |
| Core temperature | degC | 37 (36.5–37.5) | kept | C | textbook | 37 (36.5–37.5) |
| Plasma glucose | mmol/L | 4 ± 0.7 | kept | C | glow2020, cousineau2005 | 4 ± 0.7 |
| Lactate | mmol/L | 2 (1.14–4.71) | ×1.43 | B | glow2021 | 1.4 (0.8–3.3) |
| Respiratory quotient | - | 0.889 (0.84–0.94) | ×1.05 | B | zoppi1998 | 0.85 (0.8–0.9) |

### Blood

| Variable | Unit | 12 h | × change | Grade | Sources | 72 h |
|---|---|---|---|---|---|---|
| Hemoglobin | g/dL | 17.6 (13.3–22) | ×1.04 | B | nelle1993 | 17 (12.8–21.2) |
| Hematocrit | % | 51.4 (38.4–64.9) | ×1.04 | B | nelle1993, linderkamp1992 | 49.5 (37–62.5) |
| Blood volume | mL/kg | 82 (77–87) | ×0.963 | B | nelle1993, linderkamp1992 | 80–90 |

### Kidneys

| Variable | Unit | 12 h | × change | Grade | Sources | 72 h |
|---|---|---|---|---|---|---|
| GFR | mL/min/1.73m2 | 19.6 (13.07–26.13) | ×0.653 | A | smeets2022 | 30 (20–40) |
| Urine output | mL/kg/h | 1–3 | kept | C | textbook | 1–3 |

### Shunts

| Variable | Unit | 12 h | × change | Grade | Sources | 72 h |
|---|---|---|---|---|---|---|
| Ductal net left-to-right flow | mL/kg/min | 35 (25–47) | derived | B | agata1994, ha2018, jhaveri2023 | 4 |
| Foramen ovale | mL/kg/min | ref. only | kept | C | he2011, hiraishi1991, jhaveri2023, groves2011 | ref. only |
| Ductal diameter | mm | 2.47 ± 0.49 (1.49–3.45) |  | A | kang2016, tohoku2002, ha2018 | – |
| Ductal right-to-left time | % of steps | 0–10 |  | A | kang2016, shiraishi1991, walther1993 | – |
| Ductal peak L->R velocity | m/s | 1.7 (1.1–2.3) |  | A/B | ha2018, mandorla1990, kang2016 | – |
| Ductal end-diastolic L->R velocity | m/s | 0.8–2 |  | C | kang2016, taiwo2022, mandorla1990 | – |
| Ductal peak / end-diastolic velocity | - | 1–2.2 |  | C | vanlaere2018, kang2016 | – |

## Sources

- `aburawi2012`: Aburawi EH et al. Coronary flow in neonates with impaired intrauterine growth. J Am Soc Echocardiogr 2012;25:313-8 ([doi](https://doi.org/10.1016/j.echo.2011.11.019))
- `agata1991`: Agata Y, Hiraishi S, Oguchi K et al. Changes in left ventricular output from fetal to early neonatal life. J Pediatr 1991;119:441-5 (34 term, fetal, 1, 24, 96 h) ([doi](https://doi.org/10.1016/s0022-3476(05)82060-8))
- `agata1994`: Agata Y, Hiraishi S, Misawa H et al. Regional blood flow distribution and left ventricular output during early neonatal life: a quantitative ultrasonographic assessment. Pediatr Res 1994;36:805-10 (23 term, pulsed Doppler at 1, 4-8, 24, 96 h; PDF in reference-value-papers) ([doi](https://doi.org/10.1203/00006450-199412000-00022))
- `bailey2013`: Bailey SM et al. Am J Perinatol 2014;31:339-44 ([doi](https://doi.org/10.1055/s-0033-1349894))
- `brockmann2011`: Brockmann PE et al. Arch Dis Child Fetal Neonatal Ed 2011;96:F335-8 ([doi](https://doi.org/10.1136/adc.2010.196758))
- `carmichael2025`: Carmichael TG et al. The application of magnetic susceptibility separation for measuring cerebral oxygenation in preterm neonates. Pediatr Res 2025;98:715-22 ([doi](https://doi.org/10.1038/s41390-025-03966-6))
- `cohen1991`: Cohen G, Xu C, Henderson-Smart D. Ventilatory response of the sleeping newborn to CO2 during normoxic rebreathing. J Appl Physiol 1991;71:168-74 ([doi](https://doi.org/10.1152/jappl.1991.71.1.168))
- `cousineau2005`: Cousineau J et al. Clin Biochem 2005;38:905-7 ([doi](https://doi.org/10.1016/j.clinbiochem.2005.07.006))
- `fleming2011`: Fleming S et al. Lancet 2011;377:1011-8 ([doi](https://doi.org/10.1016/S0140-6736(10)62226-X))
- `gerhardt1987`: Gerhardt T, Reifenberg L, Hehre D, Feller R, Bancalari E. Pulmonary mechanics in normal infants and young children during first 5 years of life. Pediatr Pulmonol 1987;3:309-16 ([doi](https://doi.org/10.1002/ppul.1950030506))
- `glow2020`: Harris DL et al. Glucose profiles in healthy term infants in the first 5 days (GLOW). J Pediatr 2020;223:34-41 ([doi](https://doi.org/10.1016/j.jpeds.2020.02.079))
- `glow2021`: Harris DL et al. Lactate, ketones and glucose in healthy term infants (GLOW). J Pediatr 2021 ([doi](https://doi.org/10.1016/j.jpeds.2020.12.063))
- `groves2011`: Groves AM et al. Arch Dis Child Fetal Neonatal Ed 2011;96:F86-91 ([doi](https://doi.org/10.1136/adc.2010.189142))
- `ha2018`: Ha KS et al. J Korean Med Sci 2018;33:e155 ([doi](https://doi.org/10.3346/jkms.2018.33.e155))
- `hannover2018`: Healthy term neonates during quiet sleep, Hannover. Acta Paediatr 2019;108:231-8 ([doi](https://doi.org/10.1111/apa.14470))
- `he2011`: He SR et al. Chin Med J 2011;124:2284-9, PMID 21933558
- `hiraishi1991`: Hiraishi S et al. Interatrial shunt flow profiles in newborn infants. Br Heart J 1991;65:41-5 ([doi](https://doi.org/10.1136/hrt.65.1.41))
- `jhaveri2023`: Jhaveri S et al. J Cardiovasc Magn Reson 2023;25:26 ([doi](https://doi.org/10.1186/s12968-023-00932-1))
- `kang2016`: Kang C et al. Pulmonary artery pressure and ductus arteriosus closure in term neonates. Medicine 2016;95:e2599 ([doi](https://doi.org/10.1097/MD.0000000000002599))
- `katier2006`: Katier N et al. Pediatr Pulmonol 2006;41:1058-64 ([doi](https://doi.org/10.1002/ppul.20492))
- `lee1999`: Lee S et al. Functional residual capacity after vaginal and caesarean delivery. Pediatr Pulmonol 1999;27:318-21 ([doi](https://doi.org/10.1002/(sici)1099-0496(199905)27:5<318::aid-ppul4>3.0.co;2-e))
- `lee2009`: Lee A et al. Superior vena cava flow in healthy term infants. Arch Dis Child Fetal Neonatal Ed 2010 ([doi](https://doi.org/10.1136/adc.2009.176883))
- `linderkamp1992`: Linderkamp O et al. The effect of early and late cord-clamping on blood viscosity and other hemorheological parameters in full-term neonates. Acta Paediatr 1992;81:745-50 ([doi](https://doi.org/10.1111/j.1651-2227.1992.tb12095.x))
- `liu2014`: Liu P et al. NMR Biomed 2014;27:332 ([doi](https://doi.org/10.1002/nbm.3067))
- `lopez2011`: Lopez E et al. Pediatr Pulmonol 2011;46:896-902 ([doi](https://doi.org/10.1002/ppul.21445))
- `mandorla1990`: Mandorla S et al. The ductus arteriosus in healthy newborn infants studied by continuous Doppler. G Ital Cardiol 1990 (abstract), PMID 2272416
- `migdal1987`: Migdal M et al. Pediatr Pulmonol 1987;3:214-8 ([doi](https://doi.org/10.1002/ppul.1950030404))
- `moriette1985`: Moriette G, Van Reempts P, Moore M, Cates D, Rigatto H. The effect of rebreathing CO2 on ventilation and diaphragmatic electromyography in newborn infants. Respir Physiol 1985;62:387-97 ([doi](https://doi.org/10.1016/0034-5687(85)90093-3))
- `mortola1996`: Mortola JP, Lanthier C. The ventilatory and metabolic response to hypercapnia in newborn mammalian species. Respir Physiol 1996;103:263-70 ([doi](https://doi.org/10.1016/0034-5687(95)00093-3))
- `nelle1993`: Nelle M et al. The effect of Leboyer delivery on blood viscosity and other hemorheologic parameters in term neonates. Am J Obstet Gynecol 1993;169:189-93 ([doi](https://doi.org/10.1016/0002-9378(93)90161-b))
- `nowotny1998`: Nowotny T et al. Pediatr Pulmonol 1998;26:138-44 (9 term controls) ([doi](https://doi.org/10.1002/(sici)1099-0496(199808)26:2<138::aid-ppul12>3.0.co;2-2))
- `papastamelos1995`: Papastamelos C, Panitch HB, England SE, Allen JL. Developmental changes in chest wall compliance in infancy and early childhood. J Appl Physiol 1995;78:179-84 ([doi](https://doi.org/10.1152/jappl.1995.78.1.179))
- `photo2001`: Oxygen consumption during phototherapy, Arch Dis Child Fetal Neonatal Ed 2001;85:F49-52 ([doi](https://doi.org/10.1136/fn.85.1.f49))
- `poets1996`: Poets CF et al. Eur J Pediatr 1996;155:219-23 ([doi](https://doi.org/10.1007/BF01953942))
- `rigatto1991`: Rigatto H, Kwiatkowski KA, Hasan SU, Cates DB. The ventilatory response to endogenous CO2 in preterm infants. Am Rev Respir Dis 1991;143:101-4 ([doi](https://doi.org/10.1164/ajrccm/143.1.101))
- `schmalisch2001`: Schmalisch G et al. Eur Respir J 2001;17:108-14 ([doi](https://doi.org/10.1183/09031936.01.17101080))
- `schmalisch2005`: Schmalisch G et al. BMC Pediatr 2005;5:36 ([doi](https://doi.org/10.1186/1471-2431-5-36))
- `shiraishi1991`: Shiraishi H, Yanagisawa M. Bidirectional flow through the ductus arteriosus in normal newborns. Pediatr Cardiol 1991;12:201 ([doi](https://doi.org/10.1007/BF02310566))
- `smeets2022`: Smeets NJL et al. J Am Soc Nephrol 2022;33:1277-92 ([doi](https://doi.org/10.1681/ASN.2021101326))
- `smolich1996`: Smolich JJ, Berger PJ, Walker AM. Interrelation between ventricular function, myocardial blood flow, and O2 consumption changes at birth in lambs. Am J Physiol 1996;270:H741-9 ([doi](https://doi.org/10.1152/ajpheart.1996.270.2.H741))
- `stocks1994`: Stocks J et al. Eur Respir J 1994;7:11-6 ([doi](https://doi.org/10.1183/09031936.94.07010011))
- `stokes1986`: Stokes GM et al. Pediatr Pulmonol 1986;2:89-93 ([doi](https://doi.org/10.1002/ppul.1950020206))
- `taiwo2022`: Taiwo AB et al. Blood pressure profile and trends in the neonatal transitioning period. Glob Pediatr Health 2022;9:2333794X221099263 ([doi](https://doi.org/10.1177/2333794X221099263))
- `textbook`: General neonatal textbook range; no healthy-term primary source found
- `tohoku2002`: Left ventricular systolic and diastolic function during early neonatal period. Tohoku J Exp Med 2002;197:151 ([doi](https://doi.org/10.1620/tjem.197.151))
- `tveiten2021`: Tveiten L et al. Heart rate during the first 24 hours in term-born infants. Arch Dis Child Fetal Neonatal Ed 2021 ([doi](https://doi.org/10.1136/archdischild-2020-320761))
- `vanderhoeven1996`: van der Hoeven MA, Maertzdorf WJ, Blanco CE. Continuous central venous oxygen saturation (ScvO2) measurement using a fibre optic catheter in newborn infants. Arch Dis Child Fetal Neonatal Ed 1996;74:F177-81 ([doi](https://doi.org/10.1136/fn.74.3.f177))
- `vanlaere2018`: van Laere D et al. Application of NPE in the assessment of a patent ductus arteriosus. Pediatr Res 2018;84:S46 ([doi](https://doi.org/10.1038/s41390-018-0077-x))
- `walther1993`: Walther FJ, Benders MJ, Leighton JO. Early changes in the neonatal circulatory transition. J Pediatr 1993;123:625 ([doi](https://doi.org/10.1016/s0022-3476(05)80966-7))
- `wolfsberger2023`: Wolfsberger CH et al. Peripheral muscle fractional tissue oxygen extraction in stable term and preterm neonates during the first 24 h after birth. Front Pediatr 2023;11:1276769 ([doi](https://doi.org/10.3389/fped.2023.1276769))
- `yasuoka2002`: Yasuoka K et al. Left anterior descending coronary artery flow and its relation to age in children. J Am Soc Echocardiogr 2002;15:69-75 ([doi](https://doi.org/10.1067/mje.2002.115537))
- `yau1994`: Yau KI, Fang LJ. Pulmonary mechanics and the energetics of breathing in healthy infants. J Formos Med Assoc 1994;93:110-6, PMID 7912580
- `zoppi1998`: Zoppi G et al. Respiratory quotient changes in full term newborn infants within 30 hours from birth before start of milk feeding. Eur J Clin Nutr 1998;52:360-2 ([doi](https://doi.org/10.1038/sj.ejcn.1600564))
