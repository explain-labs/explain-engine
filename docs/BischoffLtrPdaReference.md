# Bischoff 2021 left-to-right PDA patient (25.8 wk, 720 g) at 72 h: reference values

Reference values for validating `bischoff_ltr_pda`: a virtual patient matching the **left-to-right PDA group** (n = 15)
of Bischoff et al. 2021 (Echocardiography 38:1524-33, Tables 1 and 2). Compiled 2026-10-22. Every judgement call was
made by the model's author (see the decisions log).

The set is the no-PDA set ([`BischoffNoPdaReference.md`](BischoffNoPdaReference.md)) with this group's values swapped
in where the paper measured them, plus values derived from them. What the paper does not report keeps the no-PDA /
25-week reference; the tables mark each row's origin. Machine-readable:
[`scripts/reference/bischoff_ltr_pda.json`](../scripts/reference/bischoff_ltr_pda.json).

## The reference state

- 25.8 weeks (Bischoff 25.77 ± 2.18), current weight 0.72 kg (median; birth weight 716 g), 40 % male
- **Age 72 h** = the group's median (day 3, IQR 1–4)
- **Respiratory support:** 80 % HFJV, 20 % CPAP/non-invasive NAVA, at mean airway pressure 7 [6, 10] and FiO₂ 0.26
  [0.24, 0.35]. Represented as in the no-PDA patient: spontaneous breathing, a recruited lung plus the inspired FiO₂.
- **Ductus:** haemodynamically significant, left-to-right, 2.1 ± 0.5 mm (modified PDA score 9 ± 1); diastolic flow
  reversal in the post-ductal descending aorta in 80 %.
- **Atrial communication:** open in all 15, left-to-right in 14.
- **Heart:** no LV or RV dysfunction; high LVO (> 250) in 47 %.
- Blood, nutrition and environment as preterm_25wk.

## Range convention

Bischoff values carry Bischoff's spread (mean ± 1 SD, or the IQR); rows from the earlier sets keep their ranges.

## Balance rules

- **Ductal shunt:** LVO − RVO = duct − PFO = 89; with the PFO ~10 left-to-right the duct carries ~100 mL/kg/min.
  Qp ≈ RVO + duct ≈ 260, Qs ≈ LVO − duct ≈ 150: Qp:Qs ≈ 1.7.
- **Aortic side:** LVO 250 = SVC 65 + descending aorta ~75 (net, with diastolic reversal) + duct ~100 + coronaries ~12.
- **O₂:** OI 3.98 at MAP 7 / FiO₂ 0.26 gives PaO₂ ~46, SpO₂ ~91 %. Fick with systemic flow ~150 gives a systemic venous
  saturation of ~69 %. **SvO₂ is read as mixed right-atrial blood** (both RA halves as they enter the RV,
  `svo2_ra` in the probe), because the pulmonary artery also receives the ductal aortic blood (~77 %).
- **Acid–base:** pH 7.34 and pCO₂ 49 are fitted; BE follows (their medians imply ~+0.8, inside the BE range).
- **Stroke volumes:** LV 1.54 mL/kg (volume-loaded, EDV 2.37 at EF 65 %), RV 0.99 mL/kg.

## Reference values

### Hemodynamics

| Variable | Reference | Range | Grade | Origin | Sources |
|---|---|---|---|---|---|
| Heart rate | **163** bpm | 150–175 (±1 SD) | A | Bischoff L→R | Bischoff 2021 |
| Systolic BP | **45** mmHg | 39–58 (P5-P95) | A | 25 wk set | Elsayed 2023, van Zadelhoff 2023 |
| Diastolic BP | **26** mmHg | 22–31 (P5-P95) | A | 25 wk set | Elsayed 2023, van Zadelhoff 2023 |
| Mean arterial pressure | **34** mmHg | 27–42 (P5-P95) | A | 25 wk set | Elsayed 2023, van Zadelhoff 2023, Vesoulis 2016 |
| Pulse pressure | **19** mmHg | — | B | 25 wk set | Elsayed 2023 |
| Central venous pressure | **3.5** mmHg | 1.3–5.7 | B | 25 wk set | Choi 2015, Trevor Inglis 2007, Siassi 1980, Abdel-Hady 2008 |
| Pulmonary artery pressure, systolic | **37** mmHg | 30–43 | C | Bischoff L→R | Neocardiolab 2025, Shen 1997 |
| Pulmonary artery pressure, mean | **31** mmHg | 26–33 | C | Bischoff L→R | Neocardiolab 2025, Shen 1997 |
| Pulmonary artery pressure, diastolic | — | — | C | Bischoff L→R | Neocardiolab 2025 |

### Heart

| Variable | Reference | Range | Grade | Origin | Sources |
|---|---|---|---|---|---|
| LV end-diastolic volume | **2.37** mL/kg | 1.95–2.85 | B | Bischoff L→R | Groves 2011 |
| LV end-systolic volume | **0.83** mL/kg | 0.5–1.2 | B | Bischoff L→R | Groves 2011 |
| LV stroke volume | **1.54** mL/kg | 1.25–1.85 | B | Bischoff L→R | Bischoff 2021 |
| LV ejection fraction | **65** % | 58–80 | B | 25 wk set | Groves 2011, Homedi 2026 |
| RV end-diastolic volume | **1.98** mL/kg | 1.6–2.4 | C | Bischoff L→R | Levy 2015 |
| RV end-systolic volume | **0.99** mL/kg | 0.7–1.3 | C | Bischoff L→R | Levy 2015 |
| RV stroke volume | **0.99** mL/kg | 0.75–1.25 | C | Bischoff L→R | Bischoff 2021 |
| RV ejection fraction | **50** % | 45–60 | B/C | 25 wk set | Toyoshima 2024, Levy 2015 |
| RV fractional area change | **31** % | 24–40 | A | 25 wk set | Levy 2015, James 2015, Homedi 2026 |
| TAPSE | **0.4** cm | 0.3–0.55 | B | 25 wk set | Koestenberger 2011, Sehgal 2022, Sehgal 2019, Homedi 2026 |

### Flows

| Variable | Reference | Range | Grade | Origin | Sources |
|---|---|---|---|---|---|
| Left ventricular output | **250** mL/kg/min | 204–296 (±1 SD) | B | Bischoff L→R | Bischoff 2021 |
| Right ventricular output | **161** mL/kg/min | 124–198 (±1 SD) | B | Bischoff L→R | Bischoff 2021 |
| LVO/RVO ratio | **1.44** | 1.34–1.77 (IQR) | B | Bischoff L→R | Bischoff 2021 |
| SVC flow | **65** mL/kg/min | 30–100 (±1 SD) | B | Bischoff L→R | Bischoff 2021 |
| Descending aorta flow | **75** mL/kg/min | 50–100 | C | Bischoff L→R | Bischoff 2021 |
| Cerebral blood flow | **28** mL/kg/min | 15–40 | C | 25 wk set | Greisen 1986, Lundstrøm 1995, Pryds 1989, Pereira 2021, Chock 2022 |
| Intestinal (SMA) flow | **22** mL/kg/min | 12–35 | C | 25 wk set | van Bel 1990, Thompson 2013, Gursoy 2015, Hsu 2019 |
| Renal blood flow | **6** mL/kg/min | 4–9 | C | 25 wk set | Vieux 2010, Visser 1992 |
| Coeliac (liver + spleen) flow | **20** mL/kg/min | 12–30 | C | 25 wk set | El-Khuffash 2008 |

### Shunts

| Variable | Reference | Range | Grade | Origin | Sources |
|---|---|---|---|---|---|
| Ductal shunt flow (L->R) | **100** mL/kg/min | 60–140 | C | Bischoff L→R | Bischoff 2021 |
| Ductal diameter | **2.1** mm | 1.6–2.6 (±1 SD) | B | Bischoff L→R | Bischoff 2021 |
| Ductal right-to-left time | **0** % of cycle | < 10 | B | Bischoff L→R | Bischoff 2021 |
| Ductal Doppler peak systolic velocity | **2.4** m/s | 1.5–3 | C | Bischoff L→R | Neocardiolab 2025 |
| Ductal Doppler end-diastolic velocity | **0.7** m/s | 0.3–1 | C | Bischoff L→R | Neocardiolab 2025 |
| Foramen ovale shunt (L->R) | **10** mL/kg/min | 0–20 | C | Bischoff L→R | Bischoff 2021 |

### Breathing (spontaneous, CPAP-style)

| Variable | Reference | Range | Grade | Origin | Sources |
|---|---|---|---|---|---|
| Respiratory rate | **65** /min | 50–85 | B | 25 wk set | Welty 2018, Liew 2020, Dimitriou 1995 |
| Tidal volume | **5** mL/kg | 4.2–6 | B | 25 wk set | Liew 2020, Reiterer 1993, Kraaijenga 2015 |
| Minute ventilation | **325** mL/kg/min | 250–400 | B | 25 wk set | Liew 2020 |
| Inspiratory time fraction (Ti/Ttot) | **0.38** | 0.33–0.44 | B | 25 wk set | Reiterer 1993, Dimitriou 1995 |
| Respiratory system compliance | **0.39** mL/cmH2O | 0.25–0.6 | C | 25 wk set | Bhutani 1988, Davis 1988, Gerhardt 1980, Dassios 2024 |
| Lung compliance (both lungs) | **0.6** mL/cmH2O/kg | 0.4–0.9 | C | 25 wk set | Bhutani 1988, Davis 1988, Dassios 2024, Sehgal 2019 |
| Chest wall compliance | **7** mL/cmH2O/kg | 4–10 | C | 25 wk set | Gerhardt 1980, Stoecklin 2024, Rehan 2001 |
| Respiratory system resistance | **90** cmH2O/L/s | 65–140 | C | 25 wk set | Reiterer 1993, Bhutani 1988 |
| Functional residual capacity | **22** mL/kg | 17–28 | C | 25 wk set | da Silva 1994 |
| Anatomic dead space | **3.2** mL/kg | 2.4–3.8 | B/C | 25 wk set | Numa 1996, Murthy 2015, Dassios 2024, Liew 2020 |
| Physiological dead space fraction (Vd/Vt) | **0.65** | 0.55–0.75 | B | 25 wk set | Williams 2021, Dassios 2024 |
| Inspired O2 fraction | **0.26** | 0.24–0.35 (IQR) | state | Bischoff L→R | Bischoff 2021 |
| Apnoea / periodic breathing | — | — | C | 25 wk set | Pre-Vent 2023 |

### Gases and oxygen

| Variable | Reference | Range | Grade | Origin | Sources |
|---|---|---|---|---|---|
| SpO2 (pre-ductal) | **91** % | 88–94 | C | Bischoff L→R | Bischoff 2021, De Halleux 2002 |
| pH | **7.34** | 7.31–7.35 (IQR) | A | Bischoff L→R | Bischoff 2021 |
| pCO2 | **49** mmHg | 42–53 (IQR) | A | Bischoff L→R | Bischoff 2021 |
| HCO3 | **26** mmol/L | 23–28 | B | Bischoff L→R | Bischoff 2021 |
| Base excess | **-2.6** mmol/L | -6.7–1.5 (±1 SD) | A | Bischoff L→R | Bischoff 2021 |
| PaO2 | **46** mmHg | 40–55 | B | Bischoff L→R | Bischoff 2021 |
| Hb-O2 P50 (standard) | **18.5** mmHg | 17.7–19.3 | A | 25 wk set | De Halleux 2002 |
| Mixed venous O2 saturation (right atrium) | **69** % | 63–75 | C | Bischoff L→R | Yapakci 2014 |

### Metabolism and thermal

| Variable | Reference | Range | Grade | Origin | Sources |
|---|---|---|---|---|---|
| Oxygen consumption | **6** mL/kg/min | 5–7 | B | 25 wk set | Bauer 1997, Bauer 2003, Bauer 2001, Schulze 2001 |
| Respiratory quotient | **0.95** | 0.85–1 | B | 25 wk set | Bauer 2003, Forsyth 1992 |
| Core temperature | **37** degC | 36.5–37.5 | C | 25 wk set | Sauer 1984 |
| Incubator air temperature | **36** degC | 35–37 | C | 25 wk set | Sauer 1984, Karlsson 2012 |
| Incubator relative humidity | **80** % | 70–90 | B | 25 wk set | Adv Neonatal Care 2021, J Perinatol 2025, Karlsson 2012 |
| Insensible water loss | **40** mL/kg/day | 25–60 | B | 25 wk set | J Perinatol 2025, Karlsson 2012 |
| Plasma glucose | **7** mmol/L | 4–10 | B | 25 wk set | Liu 2026, Alsayigh 2026, Fursule 2026 |
| Lactate | **1.5** mmol/L | 1–2.5 | A | 25 wk set | Liu 2026, Deshpande 1997 |

### Blood

| Variable | Reference | Range | Grade | Origin | Sources |
|---|---|---|---|---|---|
| Hemoglobin | **13.5** g/dL | 12–15 | C | 25 wk set | Jopling 2009, Puia-Dumitrescu 2019, Banerjee 2015 |
| Hematocrit | **41** % | 36–45 | C | 25 wk set | Jopling 2009, Mintzer 2014 |
| Fetal haemoglobin fraction | **93** % | 90–96 | A | 25 wk set | De Halleux 2002 |
| Blood volume | **85** mL/kg | 75–95 | C | 25 wk set | Aladangady 2004, Aladangady 2006, Bauer 1993 |

### Kidneys

| Variable | Reference | Range | Grade | Origin | Sources |
|---|---|---|---|---|---|
| GFR | **4.6** mL/min/1.73m2 | 3.1–7.7 | C | 25 wk set | Vieux 2010, Bueva 1994, Lorenz 1995 |
| Urine output | **3** mL/kg/h | 2–5 | B | 25 wk set | Lorenz 1995 |
| Fractional sodium excretion | **10** % | 5–15 | B/C | 25 wk set | Lorenz 1995 |
| Plasma creatinine | **150** umol/L | 100–220 | B/C | 25 wk set | Miall 1999 |

## Decisions log (2026-10-22)

- Build as a profile of `scripts/_make_preterm_validated.mjs` starting from the calibrated `bischoff_no_pda` profile,
  with the duct opened to 2.1 mm.
- Acid–base: fit pH + pCO₂, BE follows.
- SvO₂: read as mixed right-atrial blood (probe key `svo2_ra`), not at the pulmonary artery.
- Organ flows: keep the 25-week targets; the model shows whatever ductal steal it produces.
- Blood pressure: keep the Elsayed 25-week references; a low-end diastolic pressure is acceptable.
- Step 3.1 revision: Bischoff's L->R group is not pure L->R (the bidirectional group starts at 10 % of time right-to-left). With an unrestrictive duct PA pressure is near-systemic (neocardiolab example, Shen 1997), so the PAP references are near-systemic and the duct is checked by its right-to-left time (< 10 %) and Doppler (peak ~2.4, end-diastolic ~0.7 m/s).

## Sources

- **Elsayed 2023**: Elsayed Y, Ahmed F. Blood pressure normative values in preterm infants during postnatal transition. Pediatr Res 2024;95:698-704. doi:10.1038/s41390-023-02788-8; PMID 37667035
- **van Zadelhoff 2023**: van Zadelhoff AC et al. Age-dependent changes in arterial blood pressure in neonates during the first week of life. Br J Anaesth 2023;130:585-94. doi:10.1016/j.bja.2023.01.024; PMID 36858885
- **Vesoulis 2016**: Vesoulis ZA et al. Empirical estimation of the normative blood pressure in infants <28 weeks gestation. J Perinatol 2016;36:291-5. doi:10.1038/jp.2015.185; PMID 26633144
- **Bischoff 2021**: Bischoff AR et al. Assessment of superior vena cava flow and cardiac output in different patterns of PDA shunt. Echocardiography 2021;38:1524-33. doi:10.1111/echo.15163; PMID 34309068
- **Groves 2011**: Groves AM et al. Functional cardiac MRI in preterm and term newborns. Arch Dis Child Fetal Neonatal Ed 2011;96:F86-91. doi:10.1136/adc.2010.189142; PMID 20971721
- **Levy 2015**: Levy PT et al. Right ventricular function in preterm and term neonates: RV areas and fractional area change. J Am Soc Echocardiogr 2015;28:559-69. doi:10.1016/j.echo.2015.01.024; PMID 25753503
- **Koestenberger 2011**: Koestenberger M et al. Systolic right ventricular function in preterm and term neonates: TAPSE reference values. Neonatology 2011;100:85-92. doi:10.1159/000322006; PMID 21273793
- **Toyoshima 2024**: Toyoshima K et al. Biventricular function in preterm infants with PDA ligation: a 3D echocardiographic study. Pediatr Res 2024. doi:10.1038/s41390-024-03180-w; PMID 38615076
- **Trevor Inglis 2007**: Trevor Inglis GD, Dunster KR, Davies MW. Establishing normal values of central venous pressure in very low birth weight infants. Physiol Meas 2007;28:1283-91. doi:10.1088/0967-3334/28/10/012; PMID 17906394
- **Choi 2015**: Choi YS et al. Central venous pressure and renal function in very low birth weight infants during the early neonatal period. J Matern Fetal Neonatal Med 2015. doi:10.3109/14767058.2014.1002766; PMID 25612465
- **Siassi 1980**: Siassi B et al. Central venous pressure in preterm infants. Biol Neonate 1980;37:285-90. doi:10.1159/000241288; PMID 7388082
- **Greisen 1986**: Greisen G. Cerebral blood flow in preterm infants during the first week of life. Acta Paediatr Scand 1986;75:43-51. doi:10.1111/j.1651-2227.1986.tb10155.x; PMID 2420149
- **Pereira 2021**: Pereira SS, Sinha AK, Shah DK, Kempley ST. Common carotid artery blood flow volume in extremely preterm infants. Acta Paediatr 2021;110:1157-65. doi:10.1111/apa.15655; PMID 33145798
- **van Bel 1990**: van Bel F et al. Superior mesenteric artery blood flow velocity and estimated volume flow: duplex Doppler US. Radiology 1990;174:165-9. doi:10.1148/radiology.174.1.2403678; PMID 2403678
- **Visser 1992**: Visser MO et al. Renal blood flow in neonates: quantification with color flow and pulsed Doppler US. Radiology 1992;183:441-4. doi:10.1148/radiology.183.2.1561347; PMID 1561347
- **El-Khuffash 2008**: El-Khuffash A et al. Coeliac flow / LVO ratio and the haemodynamically significant PDA. Neonatology 2008;93:206-12. doi:10.1159/000110869; PMID 17992021
- **Welty 2018**: Welty SE et al. PLoS One 2018;13:e0193807 (bubble CPAP, 29.6 wk, 44 h). doi:10.1371/journal.pone.0193807; PMID 29590143
- **Liew 2020**: Liew Z et al. Physiological effects of high-flow nasal cannula vs CPAP in preterm infants. Arch Dis Child Fetal Neonatal Ed 2020;105:87-93. doi:10.1136/archdischild-2018-316773; PMID 31123057
- **Dimitriou 1995**: Dimitriou G, Greenough A, Chan V. Early Hum Dev 1995;41:61-8. doi:10.1016/0378-3782(94)01609-s; PMID 7781569
- **Reiterer 1993**: Reiterer F, Sivieri E, Abbasi S, Bhutani VK. Pediatr Pulmonol 1993;15:117-21. doi:10.1002/ppul.1950150209; PMID 8474783
- **Bhutani 1988**: Bhutani VK et al. Pediatr Pulmonol 1988;4:150-8. doi:10.1002/ppul.1950040306; PMID 3374983
- **Davis 1988**: Davis JM et al. Changes in pulmonary mechanics after surfactant replacement. N Engl J Med 1988;319:476-9. doi:10.1056/NEJM198808253190804; PMID 3405254
- **Gerhardt 1980**: Gerhardt T, Bancalari E. Chestwall compliance in full-term and premature infants. Acta Paediatr Scand 1980;69:359-64. doi:10.1111/j.1651-2227.1980.tb07093.x; PMID 7376862
- **da Silva 1994**: da Silva WJ, Abbasi S, Pereira G, Bhutani VK. Role of PEEP in preterm infants with RDS: FRC. Pediatr Pulmonol 1994;18:89-92. doi:10.1002/ppul.1950180206; PMID 7970924
- **Numa 1996**: Numa AH, Newth CJ. Anatomic dead space in infants and children. J Appl Physiol 1996;80:1485-9. doi:10.1152/jappl.1996.80.5.1485; PMID 8727530
- **Williams 2021**: Williams E et al. Pediatr Res 2021 (volumetric capnography, ventilated RDS day 3). doi:10.1038/s41390-021-01388-8; PMID 33603211
- **Kraaijenga 2015**: Kraaijenga JV et al. Effect of caffeine on diaphragmatic activity and tidal volume. J Pediatr 2015;167:70-5. doi:10.1016/j.jpeds.2015.04.040; PMID 25982138
- **Pre-Vent 2023**: Weese-Mayer DE et al. (Pre-Vent). Pediatr Res 2023. doi:10.1038/s41390-023-02839-0; PMID 37857848
- **De Halleux 2002**: De Halleux V et al. Effect of transfusion on the Hb-O2 dissociation curve of very early preterm infants. Semin Perinatol 2002;26:411-5. doi:10.1053/sper.2002.37313; PMID 12537312
- **Bauer 1997**: Bauer K et al. Body temperatures and oxygen consumption during skin-to-skin care. J Pediatr 1997;130:240-4. doi:10.1016/s0022-3476(97)70349-4; PMID 9042126
- **Bauer 2003**: Bauer J et al. Longitudinal evaluation of energy expenditure in preterm infants <1000 g. Br J Nutr 2003;89:533-7. doi:10.1079/BJN2002816; PMID 12654172
- **Bauer 2001**: Bauer J et al. Effect of caffeine on oxygen consumption in VLBW infants. Pediatrics 2001;107:660-3. doi:10.1542/peds.107.4.660; PMID 11335740
- **Schulze 2001**: Schulze A et al. Pulmonary oxygen consumption in ventilated preterm infants. Intensive Care Med 2001;27:1636-42. doi:10.1007/s001340101074; PMID 11685305
- **Forsyth 1992**: Forsyth JS, Crighton A. Arch Dis Child 1992;67:315-9. doi:10.1136/adc.67.3.315; PMID 1575556
- **Yapakci 2014**: Yapakci E et al. IVC oxygen saturation in the first 3 postnatal days in preterms. Balkan Med J 2014;31:230-4. doi:10.5152/balkanmedj.2014.13197; PMID 25337418
- **Jopling 2009**: Jopling J et al. Reference ranges for hematocrit and blood hemoglobin concentration during the neonatal period. Pediatrics 2009;123:e333-7. doi:10.1542/peds.2008-2654; PMID 19171584
- **Banerjee 2015**: Banerjee J et al. Haemoglobin level at birth and outcomes in preterm infants. BMC Med 2015;13:16. doi:10.1186/s12916-014-0247-6; PMID 25622597
- **Puia-Dumitrescu 2019**: Puia-Dumitrescu M et al. Patterns of phlebotomy blood loss and transfusions in ELBW infants. J Perinatol 2019;39:1670-5. doi:10.1038/s41372-019-0515-6; PMID 31582812
- **Mintzer 2014**: Mintzer JP et al. Monitoring regional tissue oxygen extraction in neonates <1250 g. J Neonatal Perinatal Med 2014;7:89-100. doi:10.3233/NPM-1477213; PMID 25104129
- **Aladangady 2004**: Aladangady N et al. Arch Dis Child Fetal Neonatal Ed 2004;89:F344-7. doi:10.1136/adc.2003.039008; PMID 15210672
- **Aladangady 2006**: Aladangady N et al. Infants' blood volume in a controlled trial of placental transfusion at preterm delivery. Pediatrics 2006;117:93-8. doi:10.1542/peds.2004-1773; PMID 16396865
- **Bauer 1993**: Bauer K, Linderkamp O, Versmold HT. Systolic blood pressure and blood volume in preterm infants. Arch Dis Child 1993;69:521-2. doi:10.1136/adc.69.5_spec_no.521; PMID 8285757
- **Liu 2026**: Liu et al. REACT substudy: glucose and lactate in very preterm infants. Arch Dis Child Fetal Neonatal Ed 2026;111:F196-202. doi:10.1136/archdischild-2025-328701; PMID 41087081
- **Deshpande 1997**: Deshpande SA, Platt MP. Association between blood lactate and acid-base status and mortality in ventilated babies. Arch Dis Child Fetal Neonatal Ed 1997;76:F15-20. doi:10.1136/fn.76.1.f15; PMID 9059180
- **Vieux 2010**: Vieux R et al. Glomerular filtration rate reference values in very preterm infants. Pediatrics 2010;125:e1186-92. doi:10.1542/peds.2009-1426; PMID 20368313
- **Bueva 1994**: Bueva A, Guignard JP. Renal function in preterm neonates. Pediatr Res 1994;36:572-7. doi:10.1203/00006450-199411000-00005; PMID 7877873
- **Lorenz 1995**: Lorenz JM et al. Phases of fluid and electrolyte homeostasis in the extremely low birth weight infant. Pediatrics 1995;96:484-9.; PMID 7651782
- **Miall 1999**: Miall LS et al. Plasma creatinine rises dramatically in the first 48 hours of life in preterm infants. Pediatrics 1999;104:e76. doi:10.1542/peds.104.6.e76; PMID 10586010
- **Sauer 1984**: Sauer PJ, Dane HJ, Visser HK. New standards for neutral thermal environment of healthy very low birthweight infants in week one of life. Arch Dis Child 1984;59:18-22. doi:10.1136/adc.59.1.18; PMID 6696489
- **Adv Neonatal Care 2021**: Systematic review of incubator humidity in preterm infants. Adv Neonatal Care 2021. doi:10.1097/ANC.0000000000000791; PMID 33009156
- **J Perinatol 2025**: Insensible water loss at 70 % vs 90 % incubator humidity, 22-28 wk. J Perinatol 2025. doi:10.1038/s41372-025-02261-w; PMID 40089583
- **Homedi 2026**: Homedi A et al. Early targeted neonatal echocardiography in infants born before 29 weeks. Front Pediatr 2026;14:1782985. doi:10.3389/fped.2026.1782985; PMID 41948700
- **Sehgal 2022**: Sehgal A et al. Cardiorespiratory adaptation to low-dose dexamethasone in extremely preterm infants. J Physiol 2022;600:4361-73. doi:10.1113/JP282973; PMID 36068678
- **James 2015**: James AT et al. Clinical utility of right ventricular fractional area change in preterm infants. Early Hum Dev 2015;92:19-23. doi:10.1016/j.earlhumdev.2015.10.015; PMID 26619069
- **Abdel-Hady 2008**: Abdel-Hady H et al. Hemodynamic changes during weaning from nasal CPAP. Pediatrics 2008;122:e1086-90. doi:10.1542/peds.2008-1193; PMID 18977958
- **Lundstrøm 1995**: Lundstrom KE, Pryds O, Greisen G. Oxygen at birth and prolonged cerebral vasoconstriction in preterm infants. Arch Dis Child Fetal Neonatal Ed 1995;73:F81-6. doi:10.1136/fn.73.2.f81; PMID 7583611
- **Pryds 1989**: Pryds O, Greisen G. Effect of PaCO2 and haemoglobin concentration on day to day variation of CBF in preterm neonates. Acta Paediatr Scand Suppl 1989;360:33-6. doi:10.1111/j.1651-2227.1989.tb11279.x; PMID 2518395
- **Chock 2022**: Chock VY et al. Early brain and abdominal oxygenation in extremely low birth weight infants. Pediatr Res 2022;92:1034-41. doi:10.1038/s41390-022-02082-z; PMID 35513716
- **Thompson 2013**: Thompson A et al. Intestinal blood flow by Doppler ultrasound: impact of gestational age and first enteral feeding. Am J Perinatol 2013;31:261-8. doi:10.1055/s-0033-1347365; PMID 23729284
- **Gursoy 2015**: Gursoy T et al. Effects of antenatal magnesium exposure on intestinal blood flow in preterm neonates. Am J Perinatol 2015;32:1064-9. doi:10.1055/s-0035-1548541; PMID 25825964
- **Hsu 2019**: Hsu KH et al. Effects of PDA on organ blood flow in infants born very preterm. J Pediatr 2019;216:95-100. doi:10.1016/j.jpeds.2019.08.057; PMID 31610928
- **Dassios 2024**: Dassios T et al. Invasive ventilation at the boundary of viability: 22-24 vs 25-27 weeks. Respir Physiol Neurobiol 2024;331:104339. doi:10.1016/j.resp.2024.104339; PMID 39237069
- **Murthy 2015**: Murthy V et al. Prematurely born infants' response to resuscitation via an endotracheal tube or a face mask. Early Hum Dev 2015;91:235-8. doi:10.1016/j.earlhumdev.2015.02.004; PMID 25706318
- **Stoecklin 2024**: Stoecklin B et al. Respiratory and chest wall mechanics in very preterm infants. J Appl Physiol 2024;136:1499-1506. doi:10.1152/japplphysiol.00561.2023; PMID 38634505
- **Rehan 2001**: Rehan VK et al. Diaphragm dimensions of the healthy preterm infant. Pediatrics 2001;108:e91. doi:10.1542/peds.108.5.e91; PMID 11694675
- **Sehgal 2019**: Sehgal A et al. Cardiorespiratory physiology following minimally invasive surfactant therapy in preterm infants. Neonatology 2019;116:278-85. doi:10.1159/000502040; PMID 31487729
- **Alsayigh 2026**: Alsayigh SMGA et al. Early neonatal hyperglycemia in extremely preterm infants. Children 2026;13:387. doi:10.3390/children13030387; PMID 41897099
- **Fursule 2026**: Fursule A et al. Outcomes of extremely preterm infants with neonatal hyperglycemia and hypernatremia. J Perinatol 2026;46:1657-64. doi:10.1038/s41372-026-02683-0; PMID 41975202
- **Karlsson 2012**: Karlsson V et al. Early skin-to-skin care in extremely preterm infants: thermal balance and care environment. J Pediatr 2012;161:422-6. doi:10.1016/j.jpeds.2012.02.034; PMID 22497906
- **Neocardiolab 2025**: Neocardiolab. Left to right unrestrictive ductus example (TnECHO and neonatal hemodynamics, patent ductus arteriosus), 2025-09-03. https://www.neocardiolab.com/tnecho-and-neonatal-hemodynamics/patent-ductus-arteriosus/left-to-right-unrestrictive-ductus-example.
- **Shen 1997**: Shen CT, Kua KE, Wang NK. Prognostic value of color Doppler echocardiographic findings in premature newborns with patent ductus arteriosus. Zhonghua Min Guo Xiao Er Ke Yi Xue Hui Za Zhi 1997;38:104-10.; PMID 9151462
