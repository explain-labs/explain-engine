# Fetus (25 wk, 0.7 kg) in utero: literature reference values

Reference values for validating a fetal scenario (`fetus_25wk`): a healthy human fetus in utero at 25+0 weeks,
0.7 kg, the same weight as [`preterm_25wk`](Preterm25wkReference.md), so fetus and 72-hour neonate compare one to
one. Compiled 2026-10-19 with the method, the 61 variables and most sources of
[`Fetus30wkReference.md`](Fetus30wkReference.md) and [`TermFetusReference.md`](TermFetusReference.md). Every
judgement call was made by the model's author (see the decisions log).

The machine-readable version is [`scripts/reference/fetus_25wk.json`](../scripts/reference/fetus_25wk.json).

## The reference state

- 25+0 weeks, 0.7 kg, appropriate for gestational age, singleton
- Mother at rest, breathing air, **not in labour** (undisturbed in-utero values)
- The placenta is the gas exchanger; the lungs are fluid-filled; no fetal breathing movements in the model
- Ductus arteriosus and foramen ovale wide open (right-to-left); heart rate = CTG baseline
- Environment: amniotic fluid, ~37.3 °C

**Grades**
- **A**: human fetal data at about 25 weeks
- **B**: human fetal data from a wider gestational band, a pooled synthesis, or a short interpolation
- **B/C**: extrapolated from a synthesis (the gases)
- **C**: derived, carried over from the 30-week set, method-dependent, or animal data; **C ovine**: fetal sheep

## Measurement method matters

- **This set is thinner than the 30-week and term sets.** There is no fetal MRI at this age; the flow split
  comes from Doppler (Rasanen's 20 → 30-week trends interpolated at 25, Mielke, Kiserud).
- **Gases:** no week-25 table was found (Soothill 1986 and Nicolaides 1989 give their regressions only in
  figures). The values extend Siggaard-Andersen's week-30 → week-40 slope back to 25 weeks (grade B/C); the
  direction (higher pO₂ and pH, lower pCO₂ earlier) is what those papers report.
- **Arterial pressure** is ovine (0.6 gestation; Wassink equates it with human 26–28 wk). Johnson 2000's direct
  human intracardiac pressures cover exactly 16–29 weeks but are only in a scanned PDF.
- **Ventricular volumes, SVC and descending-aorta shares** are carried over per kg from the 30-week set.

## Balance rules

- **Right ventricle:** RV 59 % = duct 40 + lungs 19
- **Left ventricle:** LV 41 % ≈ foramen 26 + pulmonary venous return 15–19 (the interpolated shares overlap by
  ~4 points; the model's identity LV = FO + pulmonary return decides)
- **Placenta:** 32 % of 425 ≈ 136 mL/kg/min ≈ the umbilical-vein reference 135
- **O₂ (Fick), an open conflict as at 30 weeks and term:** Hb 12.8 with UV 90 % and UA 70 % gives a content gap of
  ~1.6 mmol/L; × 135 mL/kg/min = **~5.0 mL/kg/min**, below VO₂ 6.0. Settled in step 5.

## Reference values

### Hemodynamics

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Heart rate (CTG baseline) | **144** bpm | 130–160 | A/B | Pildner von Steinburg 2013, Amorim-Costa 2016, Serra 2009 |
| Systolic arterial pressure | **42** mmHg | — | C ovine | Wassink 2014, Booth 2008 |
| Diastolic arterial pressure | **28** mmHg | — | C ovine | Wassink 2014, Booth 2008 |
| Mean arterial pressure | **35** mmHg | 30–42 | C ovine | Wassink 2014, Booth 2008, Johnson 2000 |
| Pulse pressure | **14** mmHg | — | C ovine | Wassink 2014 |
| PA minus aorta, mean pressure | **0** mmHg | 0–2 | B | Johnson 2000 |
| Atrial (central venous) pressure | **3** mmHg | 1–5 | C | Johnson 2000 |

### Heart

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| LV end-diastolic volume | **1.7** mL/kg | 1.3–2.2 | C | Hamill 2011, Zhang 2016 |
| LV end-systolic volume | **0.45** mL/kg | 0.3–0.7 | C | Hamill 2011, Zhang 2016 |
| LV stroke volume | **1.2** mL/kg | 1–1.4 | C | Mielke 2001, Hamill 2011 |
| LV ejection fraction | **70** % | 60–78 | C | Hamill 2011, Simioni 2012, Esh-Broder 2004 |
| RV end-diastolic volume | **2.4** mL/kg | 1.8–3 | C | Zhang 2016 |
| RV end-systolic volume | **0.9** mL/kg | 0.6–1.2 | C | Zhang 2016 |
| RV stroke volume | **1.5** mL/kg | 1.3–1.75 | C | Zhang 2016, Mielke 2001 |
| RV ejection fraction | **62** % | 55–70 | C | Zhang 2016, Hamill 2011 |
| TAPSE | **4.7** mm | 3–6.5 | B | Messing 2013, Peixoto 2020 |

### Flows and distribution

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Combined ventricular output | **425** mL/kg/min | 340–510 | A/B | Mielke 2001, Kiserud 2006 |
| RV share of combined output | **59** % | 55–62 | A | Mielke 2001 |
| Pulmonary blood flow, share of CVO | **19** % | 11–27 | B | Rasanen 1996, Mielke 2001 |
| Foramen ovale flow (R->L), share of CVO | **26** % | 18–35 | B | Rasanen 1996, Mielke 2001 |
| Ductus arteriosus flow (PA->Ao), share of CVO | **40** % | 30–46 | B | Rasanen 1996, Mielke 2001 |
| Placental (umbilical) share of CVO | **32** % | 25–40 | B | Kiserud 2006 |
| Umbilical vein flow | **135** mL/kg/min | 95–170 | A/B | Kiserud 2006, Acharya 2005 |
| SVC flow, share of CVO | **30** % | 20–40 | C | Sun 2015, Prsa 2014 |
| Descending aorta flow, share of CVO | **55** % | 35–75 | C | Prsa 2014 |
| Cerebral blood flow | **95** mL/kg/min | 70–120 | C | Sun 2015 |
| Ductus venosus shunt fraction of UV flow (reference only) | **28** % | — | B | Kiserud 2006b |

### Shunt anatomy

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Ductus arteriosus diameter | **2.54** mm | 2.1–3 | B | Szpinda |
| Foramen ovale diameter | — | — | C | Phillipos 1994 |

### Gases and oxygen

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Umbilical vein SO2 | **90** % | 82–95 | B/C | Siggaard-Andersen 1995, Nicolaides 1989, Soothill 1986 |
| Umbilical vein pO2 | **44** mmHg | 34–52 | B/C | Siggaard-Andersen 1995, Nicolaides 1989, Soothill 1986 |
| Umbilical vein pCO2 | **34.5** mmHg | 30–39 | B/C | Siggaard-Andersen 1995, Nicolaides 1989 |
| Umbilical vein pH | **7.41** - | 7.37–7.45 | B/C | Siggaard-Andersen 1995, Nicolaides 1989 |
| Umbilical vein base excess | **-2.5** mmol/L | -5–0 | B/C | Siggaard-Andersen 1995, Soothill 1986 |
| Umbilical artery SO2 | **70** % | 58–80 | B/C | Siggaard-Andersen 1995, Nicolaides 1989 |
| Umbilical artery pO2 | **28.5** mmHg | 22–35 | B/C | Siggaard-Andersen 1995, Nicolaides 1989 |
| Umbilical artery pCO2 | **40** mmHg | 36–45 | B/C | Siggaard-Andersen 1995, Nicolaides 1989 |
| Umbilical artery pH | **7.38** - | 7.34–7.42 | B/C | Siggaard-Andersen 1995, Nicolaides 1989 |
| UA minus UV pCO2 | **5** mmHg | 3–9 | B/C | Siggaard-Andersen 1995 |
| Ascending aorta (pre-ductal) SO2 | **70** % | 60–78 | C | Siggaard-Andersen 1995 |
| Thoracic IVC SO2 | **76** % | — | C | Siggaard-Andersen 1995 |
| SVC SO2 | **46** % | 36–56 | C | Siggaard-Andersen 1995 |
| Descending aorta SO2 | **70** % | 58–80 | B/C | Siggaard-Andersen 1995 |
| Hb-O2 P50 (standard) | **18.5** mmHg | 17.5–19.5 | B | Siggaard-Andersen 1995 |

### Blood

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Hemoglobin | **12.8** g/dL | 10.8–14.8 | B | Nicolaides 1988, Siggaard-Andersen 1995 |
| Hematocrit | **39** % | 33–45 | C | Nicolaides 1988 |
| Fetal haemoglobin fraction | **95** % | 90–98 | B | Siggaard-Andersen 1995 |
| Fetoplacental blood volume | **120** mL/kg | 100–140 | C | MacGregor 1988 |
| Fetal body blood volume | **85** mL/kg | — | C | MacGregor 1988 |
| Placental share of fetoplacental blood | **30** % | 22–38 | C | MacGregor 1988 |

### Metabolism and thermal

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Oxygen consumption | **6** mL/kg/min | 5–8 | C | Sun 2015, VO2 review (Cetin) |
| Respiratory quotient | **0.95** - | 0.9–1 | C ovine | VO2 review (Cetin) |
| Core temperature | **37.5** degC | 37.3–37.9 | B | Asakura 2004 |
| Plasma glucose (UV) | **4.2** mmol/L | 3.5–5 | B/C | Marconi 1996, Economides 1989 |
| Lactate | **1** mmol/L | 0.6–1.8 | C | Nicolaides 1989, Soothill 1986 |

### Kidneys

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Fetal urine production (reference only) | **11** mL/kg/h | 5–18 | B | Touboul 2008, Rabinowitz 1989 |
| Plasma creatinine | **50** umol/L | 40–65 | C | Moniz 1985 |
| GFR | — | — | - | — |
| Cystatin C (reference only) | **1.66** mg/L | 1.26–2.06 | B | Bökenkamp 2001 |

### Body

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Crown-heel length (reference only) | **33** cm | — | C | — |
| Placental weight (reference only) | **180** g | — | C | — |

## Decisions log (2026-10-19)

- Gestational age 25+0 wk; weight 0.7 kg (= `preterm_25wk`).
- Same 61 variables, reference-only rows and read-outs as the 30-week and term sets; the literature step in two groups.
- Heart rate 144; MAP 35 (ovine).
- Flow shares interpolated from Rasanen; ventricular volumes, SVC and descending-aorta shares carried over per kg.
- Gases back-extrapolated from Siggaard-Andersen's 30 → 40-week slope (grade B/C); VO₂ 6.0 (grade C).
- Sheep data allowed where no human value exists (grade C ovine); ductus venosus and fetal urine reference only.

## Open items

- The O₂ balance conflict above.
- The original Soothill 1986 / Nicolaides 1989 regressions (figures) would replace the extrapolated gases.
- Johnson 2000 (scanned PDF): direct human intracardiac pressures at 16–29 weeks.

## Sources

- **Acharya 2005**: Acharya G et al. Reference ranges for umbilical vein blood flow in the second half of pregnancy based on longitudinal data. Prenat Diagn 2005;25:99-111. doi:10.1002/pd.1091; PMID 15712315
- **Amorim-Costa 2016**: Amorim-Costa C et al. Gender-specific reference charts for cardiotocographic parameters throughout normal pregnancy (9701 fetuses). Eur J Obstet Gynecol Reprod Biol 2016;199:102-7. doi:10.1016/j.ejogrb.2016.01.036; PMID 26921476
- **Asakura 2004**: Asakura H. Fetal and neonatal thermoregulation. J Nippon Med Sch 2004;71:360-70.
- **Booth 2008**: Booth LC et al. Is baroreflex control of sympathetic activity and heart rate active in the preterm fetal sheep? (102 d, term 140). Am J Physiol Regul Integr Comp Physiol 2009;296:R603-9 (ovine). doi:10.1152/ajpregu.90624.2008; PMID 19109368
- **Bökenkamp 2001**: Bökenkamp A et al. Fetal serum concentrations of cystatin C and beta2-microglobulin as predictors of postnatal kidney function. Am J Obstet Gynecol 2001;185:468-75. doi:10.1067/mob.2001.115283; PMID 11518911
- **Economides 1989**: Economides DL, Nicolaides KH. Blood glucose and oxygen tension levels in small-for-gestational-age fetuses. Am J Obstet Gynecol 1989;160:385-9. doi:10.1016/0002-9378(89)90453-5; PMID 2916623
- **Esh-Broder 2004**: Esh-Broder E et al. Free-hand 3D echocardiography in the evaluation of fetal cardiac ejection fraction. Ultrasound Obstet Gynecol 2004;23:546-51. doi:10.1002/uog.1059; PMID 15170793
- **Hamill 2011**: Hamill N et al. Fetal cardiac ventricular volume, cardiac output, and ejection fraction determined with 4D ultrasound (STIC/VOCAL). Am J Obstet Gynecol 2011;205:76.e1-10. doi:10.1016/j.ajog.2011.02.028; PMID 21531373
- **Johnson 2000**: Johnson P, Maxwell DJ, Tynan MJ, Allan LD. Intracardiac pressures in the human fetus. Heart 2000;84:59-63. doi:10.1136/heart.84.1.59; PMID 10862590
- **Kiserud 2006**: Kiserud T et al. Fetal cardiac output, distribution to the placenta and impact of placental compromise. Ultrasound Obstet Gynecol 2006;28:126-36. doi:10.1002/uog.2832; PMID 16826560
- **Kiserud 2006b**: Kiserud T et al. Ductus venosus shunting in growth-restricted fetuses and the effect of umbilical circulatory compromise. Ultrasound Obstet Gynecol 2006;28:143-9. doi:10.1002/uog.2784; PMID 16770753
- **MacGregor 1988**: MacGregor SN et al. Prediction of fetoplacental blood volume in isoimmunized pregnancy. Am J Obstet Gynecol 1988;159:1493-7. doi:10.1016/0002-9378(88)90581-9; PMID 3207128
- **Marconi 1996**: Marconi AM et al. The impact of gestational age and fetal growth on the maternal-fetal glucose concentration difference. Obstet Gynecol 1996;87:937-42. doi:10.1016/0029-7844(96)00048-8; PMID 8649702
- **Messing 2013**: Messing B et al. Fetal tricuspid annular plane systolic excursion (f-TAPSE). Ultrasound Obstet Gynecol 2013;42:182-8. doi:10.1002/uog.12375; PMID 23288668
- **Mielke 2001**: Mielke G, Benda N. Cardiac output and central distribution of blood flow in the human fetus. Circulation 2001;103:1662-8. doi:10.1161/01.cir.103.12.1662; PMID 11273994
- **Moniz 1985**: Moniz CF et al. Normal reference ranges for biochemical substances relating to renal, hepatic, and bone function in fetal and maternal plasma throughout pregnancy. J Clin Pathol 1985;38:468-72.
- **Nicolaides 1988**: Nicolaides KH et al. Fetal haemoglobin by gestational age (mean and -2 SD table, 18-34 wk), as reproduced in clinical-trial protocol NCT03842189.
- **Nicolaides 1989**: Nicolaides KH, Economides DL, Soothill PW. Blood gases, pH, and lactate in appropriate- and small-for-gestational-age fetuses. Am J Obstet Gynecol 1989;161:996-1001. doi:10.1016/0002-9378(89)90770-9; PMID 2801852
- **Peixoto 2020**: Peixoto AB et al. Reference ranges for fetal MAPSE, TAPSE and SAPSE between 20 and 36+6 weeks. J Perinat Med 2020;48:601-8. doi:10.1515/jpm-2020-0002; PMID 32609650
- **Phillipos 1994**: Phillipos EZ et al. The echocardiographic assessment of the human fetal foramen ovale. J Am Soc Echocardiogr 1994;7:257-63. doi:10.1016/s0894-7317(14)80396-9; PMID 8060642
- **Pildner von Steinburg 2013**: Pildner von Steinburg S et al. What is the 'normal' fetal heart rate? PeerJ 2013;1:e82 (78,852 CTGs; mean baseline by gestational week). doi:10.7717/peerj.82; PMID 23761161
- **Prsa 2014**: Prsa M et al. Reference ranges of blood flow in the major vessels of the normal human fetal circulation at term by phase-contrast MRI. Circ Cardiovasc Imaging 2014;7:663-70. doi:10.1161/CIRCIMAGING.113.001859; PMID 24874055
- **Rabinowitz 1989**: Rabinowitz R et al. Measurement of fetal urine production in normal pregnancy by real-time ultrasonography. Am J Obstet Gynecol 1989;161:1264-6. doi:10.1016/0002-9378(89)90679-0; PMID 2686448
- **Rasanen 1996**: Rasanen J et al. Role of the pulmonary circulation in the distribution of human fetal cardiac output during the second half of pregnancy. Circulation 1996;94:1068-73. doi:10.1161/01.cir.94.5.1068; PMID 8790048
- **Serra 2009**: Serra V et al. Computerized analysis of normal fetal heart rate pattern throughout gestation. Ultrasound Obstet Gynecol 2009;34:74-9. doi:10.1002/uog.6365; PMID 19489020
- **Siggaard-Andersen 1995**: Siggaard-Andersen O, Huch R. The oxygen status of fetal blood. Acta Anaesthesiol Scand 1995;39 Suppl 107:129-35 (week-30 synthesis of cordocentesis data; http://www.siggaard-andersen.dk/FetalBlood.pdf).
- **Simioni 2012**: Simioni C et al. Fetal cardiac output and ejection fraction by STIC: male vs female fetuses. Rev Bras Cir Cardiovasc 2012;27:275-82. doi:10.5935/1678-9741.20120058; PMID 22996979
- **Soothill 1986**: Soothill PW et al. Effect of gestational age on fetal and intervillous blood gas and acid-base values in human pregnancy. Fetal Ther 1986;1:168-75. doi:10.1159/000262264; PMID 3454532
- **Sun 2015**: Sun L et al. Reduced fetal cerebral oxygen consumption is associated with smaller brain size in fetuses with congenital heart disease (30 normal controls at 36 wk). Circulation 2015;131:1313-23. doi:10.1161/CIRCULATIONAHA.114.013051; PMID 25762062
- **Szpinda**: Szpinda M, ductus arteriosus morphometry regression (diameter 0.2072 + 0.0935 x GA mm), as quoted in component_models/Pda.js.
- **Touboul 2008**: Touboul C et al. Normal fetal urine production rate estimated with 3D ultrasonography (VOCAL). Am J Obstet Gynecol 2008;199:57.e1-5. doi:10.1016/j.ajog.2007.12.012; PMID 18295175
- **VO2 review (Cetin)**: Human fetal VO2 estimates as quoted in Cetin I et al., 'The hypoxic fetus as a patient: adaptations to the intrauterine environment' (Univ. Milan): Bonds 1986 calorimetry 6.8 mL/min/kg; Acharya & Sitras umbilical uptake 0.29 mmol/min/kg; Radaelli 0.24 mmol/min/kg; fetal lamb (Philipps) 8.1 mL/min/kg.
- **Wassink 2014**: Wassink G et al. Does maturity affect cephalic perfusion and T/QRS ratio during prolonged umbilical cord occlusion in fetal sheep? Obstet Gynecol Int 2014:314159 (ovine). doi:10.1155/2014/314159; PMID 24693290
- **Zhang 2016**: Zhang J et al. Evaluation of right ventricular function in fetal hypoplastic left heart syndrome using STIC (151 normal controls, mean 30.2 wk). Cardiovasc Ultrasound 2016;14:12. doi:10.1186/s12947-016-0056-5; PMID 27066831
