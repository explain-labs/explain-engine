# Term fetus (40 wk, 3.545 kg) in utero: literature reference values

Reference values for validating a fetal scenario (`term_fetus`): a healthy human fetus in utero at 40+0 weeks,
3.545 kg, the same weight as [`term_neonate`](TermNeonateReference.md), so fetus and 72-hour neonate compare one
to one. Compiled 2026-10-19 with the method and most of the sources of
[`Fetus30wkReference.md`](Fetus30wkReference.md) (PubMed and the web; no fetal PDFs in the reference folder),
plus term-specific sources. Every judgement call was made by the model's author (see the decisions log).

The machine-readable version is [`scripts/reference/term_fetus.json`](../scripts/reference/term_fetus.json), in
the same schema and with the same 61 variables as the 30-week set.

## The reference state

- 40+0 weeks, 3.545 kg, appropriate for gestational age, singleton
- Mother at rest, breathing air, **not in labour** (undisturbed in-utero values, not cord gases at birth)
- The placenta is the gas exchanger; the lungs are fluid-filled; no fetal breathing movements in the model
- Ductus arteriosus and foramen ovale wide open (right-to-left); heart rate = CTG baseline
- Environment: amniotic fluid, ~37.3 °C

**Grades**
- **A**: human fetal data at term
- **B**: human fetal data from late gestation (36–38 wk), a pooled synthesis, or a short extrapolation
- **C**: derived, method-dependent (4D-echo volumes), or animal data; **C ovine**: fetal sheep near term

## Measurement method matters

- **Cordocentesis is rare at term.** The gases come from Siggaard-Andersen & Huch's week-40 column, extrapolated
  from data mostly ≤ 38 wk. MRI at 36–37 wk (Prsa 2014, Sun 2015) gives flows and saturations in the same
  fetuses; its umbilical-vein saturation (79 %) is higher than the cordocentesis one (72 %). The reference takes 75 %.
- **Placental share:** MRI 29 % vs Doppler ~21 % after 32 wk (Kiserud 2006). The reference takes 25 %.
- **Ventricular volumes** are derived from the MRI output split and 4D-echo ejection fractions (grade C).
- **Arterial pressure** is ovine: fetal sheep at 140 d have their baroreflex centred on 54 mmHg (Segar 2002).
- **The placenta no longer reaches equilibrium at term:** blood leaving the maternal side has pO₂ ~39 mmHg against
  31.5 in the umbilical vein (~30 % apparent shunt, Siggaard-Andersen); at 30 weeks the two were equal.

## Balance rules

- **Right ventricle:** RV 58 % = duct 40 + lungs 18
- **Left ventricle:** LV 42 % = foramen 24 + pulmonary venous return 18
- **Aorta:** LV 42 + duct 40 = 82 % = SVC 30 + coronaries ~3 + descending aorta ~49 (MRI 55)
- **Placenta:** 25 % of 450 ≈ 112 mL/kg/min ≈ the umbilical-vein reference 110
- **Upper body:** SVC ~135 mL/kg/min = brain ~100 + rest ~35
- **CO₂:** VCO₂ 0.95 × 6.5 ≈ 6.2 mL/kg/min over ~110 mL/kg/min of umbilical blood needs a ~2.5 mmol/L CO₂-content
  gap, which a ~5 mmHg pCO₂ gap provides
- **O₂ (Fick), an open conflict (as at 30 weeks):** Hb 15 with UV 75 % and UA 52 % gives a content gap of
  ~2.1 mmol/L; × 110 mL/kg/min = **~5.2 mL/kg/min**, below VO₂ 6.5. VO₂ 6.5 needs ~140–145 mL/kg/min of umbilical
  blood, a wider saturation gap, or VO₂ nearer its low end. Settled in step 5.

## Reference values

### Hemodynamics

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Heart rate (CTG baseline) | **136** bpm | 120–160 | A | Pildner von Steinburg 2013, Boito 2004, Amorim-Costa 2016 |
| Systolic arterial pressure | **60** mmHg | — | C ovine | Segar 2002 |
| Diastolic arterial pressure | **40** mmHg | — | C ovine | Segar 2002 |
| Mean arterial pressure | **50** mmHg | 42–58 | C ovine | Segar 2002, Unno 1999, Schröder 2000 |
| Pulse pressure | **20** mmHg | — | C ovine | Segar 2002 |
| PA minus aorta, mean pressure | **0** mmHg | 0–2 | B | Johnson 2000 |
| Atrial (central venous) pressure | **3** mmHg | 1–5 | C | Johnson 2000 |

### Heart

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| LV end-diastolic volume | **1.95** mL/kg | 1.5–2.5 | C | Prsa 2014, Hamill 2011 |
| LV end-systolic volume | **0.6** mL/kg | 0.4–0.85 | C | Prsa 2014, Hamill 2011 |
| LV stroke volume | **1.35** mL/kg | 1.1–1.6 | C | Prsa 2014, Mielke 2001 |
| LV ejection fraction | **70** % | 60–78 | C | Hamill 2011, Simioni 2012, Esh-Broder 2004 |
| RV end-diastolic volume | **3** mL/kg | 2.4–3.7 | C | Prsa 2014, Zhang 2016 |
| RV end-systolic volume | **1.15** mL/kg | 0.8–1.5 | C | Prsa 2014, Zhang 2016 |
| RV stroke volume | **1.85** mL/kg | 1.5–2.2 | C | Prsa 2014, Mielke 2001 |
| RV ejection fraction | **62** % | 55–70 | C | Zhang 2016, Hamill 2011 |
| TAPSE | **8.7** mm | 6–11 | B | Messing 2013, Peixoto 2020 |

### Flows and distribution

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Combined ventricular output | **450** mL/kg/min | 350–580 | A/B | Prsa 2014, Sun 2015, Kiserud 2006, Mielke 2001 |
| RV share of combined output | **58** % | 55–62 | A | Prsa 2014, Rasanen 1996, Mielke 2001 |
| Pulmonary blood flow, share of CVO | **18** % | 10–30 | B | Prsa 2014, Rasanen 1996 |
| Foramen ovale flow (R->L), share of CVO | **24** % | 15–35 | B | Prsa 2014, Rasanen 1996 |
| Ductus arteriosus flow (PA->Ao), share of CVO | **40** % | 30–50 | B | Prsa 2014, Rasanen 1996 |
| Placental (umbilical) share of CVO | **25** % | 18–35 | B | Prsa 2014, Kiserud 2006 |
| Umbilical vein flow | **110** mL/kg/min | 70–155 | A/B | Prsa 2014, Sun 2015, Acharya 2005, Boito 2004 |
| SVC flow, share of CVO | **30** % | 20–40 | B | Sun 2015, Prsa 2014 |
| Descending aorta flow, share of CVO | **55** % | 35–75 | B | Prsa 2014 |
| Cerebral blood flow | **100** mL/kg/min | 75–125 | C | Sun 2015 |
| Ductus venosus shunt fraction of UV flow (reference only) | **20** % | — | B | Kiserud 2006b |

### Shunt anatomy

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Ductus arteriosus diameter | **3.95** mm | 3.3–4.6 | B | Szpinda |
| Foramen ovale diameter | — | — | C | Phillipos 1994 |

### Gases and oxygen

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Umbilical vein SO2 | **75** % | 65–85 | B | Siggaard-Andersen 1995, Sun 2015 |
| Umbilical vein pO2 | **31.5** mmHg | 25–38 | B | Siggaard-Andersen 1995, Nicolaides 1989, Soothill 1986 |
| Umbilical vein pCO2 | **38** mmHg | 34–42 | B | Siggaard-Andersen 1995, Nicolaides 1989 |
| Umbilical vein pH | **7.38** - | 7.34–7.42 | B | Siggaard-Andersen 1995, Nicolaides 1989 |
| Umbilical vein base excess | **-2.3** mmol/L | -5–0 | B | Siggaard-Andersen 1995, Soothill 1986 |
| Umbilical artery SO2 | **52** % | 40–65 | B | Siggaard-Andersen 1995, Nicolaides 1989 |
| Umbilical artery pO2 | **23** mmHg | 17–29 | B | Siggaard-Andersen 1995, Nicolaides 1989 |
| Umbilical artery pCO2 | **43** mmHg | 39–48 | B | Siggaard-Andersen 1995, Nicolaides 1989 |
| Umbilical artery pH | **7.35** - | 7.31–7.39 | B | Siggaard-Andersen 1995, Nicolaides 1989 |
| UA minus UV pCO2 | **5** mmHg | 3–9 | B | Siggaard-Andersen 1995 |
| Ascending aorta (pre-ductal) SO2 | **60** % | 50–70 | B/C | Sun 2015, Siggaard-Andersen 1995 |
| Thoracic IVC SO2 | **66** % | — | C | Siggaard-Andersen 1995 |
| SVC SO2 | **40** % | 30–50 | C | Siggaard-Andersen 1995 |
| Descending aorta SO2 | **52** % | 40–65 | B/C | Siggaard-Andersen 1995 |
| Hb-O2 P50 (standard) | **20** mmHg | 19–21.5 | B | Siggaard-Andersen 1995 |

### Blood

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Hemoglobin | **15** g/dL | 13–17 | B | Siggaard-Andersen 1995, Nicolaides 1988 |
| Hematocrit | **45** % | 39–51 | C | Nicolaides 1988 |
| Fetal haemoglobin fraction | **80** % | 70–90 | B | Siggaard-Andersen 1995 |
| Fetoplacental blood volume | **105** mL/kg | 90–125 | C | MacGregor 1988 |
| Fetal body blood volume | **85** mL/kg | — | C | MacGregor 1988 |
| Placental share of fetoplacental blood | **22** % | 15–30 | C | MacGregor 1988 |

### Metabolism and thermal

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Oxygen consumption | **6.5** mL/kg/min | 5.4–8.1 | B | Sun 2015, VO2 review (Cetin) |
| Respiratory quotient | **0.95** - | 0.9–1 | C ovine | VO2 review (Cetin) |
| Core temperature | **37.5** degC | 37.3–37.9 | B | Asakura 2004 |
| Plasma glucose (UV) | **3.7** mmol/L | 3–4.5 | B/C | Marconi 1996, Economides 1989 |
| Lactate | **1** mmol/L | 0.6–1.8 | C | Nicolaides 1989, Soothill 1986 |

### Kidneys

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Fetal urine production (reference only) | **20** mL/kg/h | 10–35 | B | Touboul 2008, Rabinowitz 1989 |
| Plasma creatinine | **50** umol/L | 40–65 | C | Moniz 1985 |
| GFR | — | — | - | — |
| Cystatin C (reference only) | **1.66** mg/L | 1.26–2.06 | B | Bökenkamp 2001 |

### Body

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Crown-heel length (reference only) | **51** cm | — | C | — |
| Placental weight (reference only) | **500** g | — | C | — |

## Decisions log (2026-10-19)

- Gestational age 40+0 wk (pairs with `term_neonate`); weight 3.545 kg (= `term_neonate`).
- Same 61 variables, reference-only rows and read-outs as the 30-week set; the literature step was done in two groups.
- Heart rate 136 (Pildner von Steinburg 2013); MAP 50 (ovine, Segar 2002).
- Ventricular volumes derived from the MRI output split; placental share 25 % (between MRI 29 and Doppler 21).
- Umbilical-vein saturation 75 % (between cordocentesis 72 and MRI 79); VO₂ 6.5 kept as the literature value, the Fick
  conflict to be settled in step 5.
- Sheep data allowed where no human value exists (grade C ovine); ductus venosus and fetal urine reference only.

## Open items

- The O₂ balance conflict above.
- Johnson 2000 (scanned PDF): absolute human intracardiac pressures (≤ 29 wk only).
- A ductus venosus route (would lift the IVC stream and the aortic saturation).

## Sources

- **Acharya 2005**: Acharya G et al. Reference ranges for umbilical vein blood flow in the second half of pregnancy based on longitudinal data. Prenat Diagn 2005;25:99-111. doi:10.1002/pd.1091; PMID 15712315
- **Amorim-Costa 2016**: Amorim-Costa C et al. Gender-specific reference charts for cardiotocographic parameters throughout normal pregnancy (9701 fetuses). Eur J Obstet Gynecol Reprod Biol 2016;199:102-7. doi:10.1016/j.ejogrb.2016.01.036; PMID 26921476
- **Asakura 2004**: Asakura H. Fetal and neonatal thermoregulation. J Nippon Med Sch 2004;71:360-70.
- **Boito 2004**: Boito SME et al. Umbilical venous volume flow and fetal behavioral states in the normally developing fetus (36-40 wk). Ultrasound Obstet Gynecol 2004;23:138-42. doi:10.1002/uog.956; PMID 14770392
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
- **Schröder 2000**: Schröder HJ et al. Unloading of baroreceptors by carotid occlusion does not increase heart rate in fetal sheep. Eur J Obstet Gynecol Reprod Biol 2000;92:265-72 (ovine). doi:10.1016/s0301-2115(99)00285-7; PMID 10996692
- **Segar 2002**: Segar JL et al. Effects of fetal ovine adrenalectomy on sympathetic and baroreflex responses at birth (fetal sheep 140-141 d). Am J Physiol Regul Integr Comp Physiol 2002;283:R460-7 (ovine). doi:10.1152/ajpregu.00056.2002; PMID 12121859
- **Siggaard-Andersen 1995**: Siggaard-Andersen O, Huch R. The oxygen status of fetal blood. Acta Anaesthesiol Scand 1995;39 Suppl 107:129-35 (week-30 synthesis of cordocentesis data; http://www.siggaard-andersen.dk/FetalBlood.pdf).
- **Simioni 2012**: Simioni C et al. Fetal cardiac output and ejection fraction by STIC: male vs female fetuses. Rev Bras Cir Cardiovasc 2012;27:275-82. doi:10.5935/1678-9741.20120058; PMID 22996979
- **Soothill 1986**: Soothill PW et al. Effect of gestational age on fetal and intervillous blood gas and acid-base values in human pregnancy. Fetal Ther 1986;1:168-75. doi:10.1159/000262264; PMID 3454532
- **Sun 2015**: Sun L et al. Reduced fetal cerebral oxygen consumption is associated with smaller brain size in fetuses with congenital heart disease (30 normal controls at 36 wk). Circulation 2015;131:1313-23. doi:10.1161/CIRCULATIONAHA.114.013051; PMID 25762062
- **Szpinda**: Szpinda M, ductus arteriosus morphometry regression (diameter 0.2072 + 0.0935 x GA mm), as quoted in component_models/Pda.js.
- **Touboul 2008**: Touboul C et al. Normal fetal urine production rate estimated with 3D ultrasonography (VOCAL). Am J Obstet Gynecol 2008;199:57.e1-5. doi:10.1016/j.ajog.2007.12.012; PMID 18295175
- **Unno 1999**: Unno N et al. Blood pressure and heart rate in the ovine fetus: ontogenic changes and effects of fetal adrenalectomy. Am J Physiol 1999;276:H248-56 (ovine). doi:10.1152/ajpheart.1999.276.1.H248; PMID 9887039
- **VO2 review (Cetin)**: Human fetal VO2 estimates as quoted in Cetin I et al., 'The hypoxic fetus as a patient: adaptations to the intrauterine environment' (Univ. Milan): Bonds 1986 calorimetry 6.8 mL/min/kg; Acharya & Sitras umbilical uptake 0.29 mmol/min/kg; Radaelli 0.24 mmol/min/kg; fetal lamb (Philipps) 8.1 mL/min/kg.
- **Zhang 2016**: Zhang J et al. Evaluation of right ventricular function in fetal hypoplastic left heart syndrome using STIC (151 normal controls, mean 30.2 wk). Cardiovasc Ultrasound 2016;14:12. doi:10.1186/s12947-016-0056-5; PMID 27066831
