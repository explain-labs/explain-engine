# Fetus (30 wk, 1.5 kg) in utero: literature reference values

Reference values for validating a fetal scenario (`fetus_30wk`): a healthy human fetus in utero at 30+0 weeks,
about 1.5 kg. Compiled 2026-10-19 from a PubMed and web search (there are no fetal PDFs in the reference
folder). Every judgement call was made by the model's author (see the decisions log). It is the in-utero
counterpart of [`Preterm30wkReference.md`](Preterm30wkReference.md): same gestation and weight, so fetus and
72-hour neonate can be compared one to one.

The machine-readable version is [`scripts/reference/fetus_30wk.json`](../scripts/reference/fetus_30wk.json),
in the same schema as the term and preterm sets. Each variable has one entry: value, range, method, age,
sources (DOI/PMID), grade, and the model read-out to compare against. Entries marked *reference only* have
no model read-out.

## The reference state

- 30+0 weeks, 1.5 kg, appropriate for gestational age, singleton
- Mother at rest, breathing air, **not in labour**: the gases are undisturbed in-utero values from
  cordocentesis, not cord gases at birth (labour lowers pH and raises lactate)
- The placenta is the gas exchanger; the lungs are fluid-filled; no fetal breathing movements in the model
- Ductus arteriosus and foramen ovale wide open (right-to-left)
- Heart rate is the CTG baseline, which averages the quiet and active sleep states
- Environment: amniotic fluid, ~37.3 °C

**Grades**
- **A**: human fetal data at about 30 weeks
- **B**: human fetal data from a wider gestational band, a pooled synthesis, or a short extrapolation
- **C**: derived from other variables, method-dependent (4D-echo volumes), or animal data
- **C ovine**: no human value exists; fetal sheep at a matched gestation (0.7–0.8 of term)

## Measurement method matters

- **Arterial pressure** has never been measured directly in a healthy human fetus. MAP comes from fetal sheep
  at 0.7 gestation (Wassink 2014, which equates it to human 28–32 wk neurologically); Johnson 2000's direct
  human intracardiac pressures (16–29 wk) support PA ≈ Ao and equal atrial pressures, but their absolute
  values are in a scanned PDF we could not read.
- **Flow distribution:** Mielke 2001 pools 13–41 weeks, so its lung (11 %) and foramen (33 %) shares are a mix
  of ages. Rasanen 1996 is GA-specific and shows lung flow peaking (25 %) and foramen flow at its minimum
  (18 %) at 30 weeks, which Kiserud & Acharya 2004 confirm. The 30-week shares follow Rasanen. The MRI data
  (Prsa 2014, Sun 2015) are from 36–37 weeks.
- **Gases** come from Siggaard-Andersen & Huch 1995, which pooled the King's College (Nicolaides, Soothill)
  and Weiner cordocentesis data and read off one consistent set at week 30. pO₂ varies widely between fetuses
  (SD ~1 kPa), so its ranges are wide. MRI oximetry reads lower than blood-gas analysis.
- **Ventricular volumes** come from 4D echo (STIC), which underestimates output against Doppler and disagrees
  between studies on which ventricle has the higher ejection fraction. All volumes are grade C.
- **Blood volume** is only measured in isoimmunised (anaemic) fetuses, by transfusion dilution.

## Balance rules

- **Right ventricle:** RV 59 % = duct 39 + lungs 20
- **Left ventricle:** LV 41 % = foramen 21 + pulmonary venous return 20 (the model's own identity)
- **Aorta:** LV 41 + duct 39 = 80 % = upper body (SVC) 30 + coronaries ~3 + descending aorta ~47
  (MRI at term: 55 %, with a lower lung share)
- **Placenta:** umbilical flow 28 % of output (~120 mL/kg/min) leaves through the descending aorta, about
  half of its flow
- **Upper body:** SVC ~125 mL/kg/min = brain ~95 + rest ~30
- **CO₂:** VCO₂ = 0.95 × 6.5 ≈ 6.2 mL/kg/min removed by ~120 mL/kg/min of umbilical blood needs a
  ~2.3 mmol/L CO₂-content gap, which a 5.5 mmHg pCO₂ gap provides
- **O₂ (Fick) — an open conflict:** Hb 13.6 g/dL with UV 85 % and UA 64 % gives a content gap of
  1.8 mmol/L; × 120 mL/kg/min = **4.8 mL/kg/min**, below the VO₂ target of 6.5. The set cannot be met
  exactly: either umbilical flow is ~165 mL/kg/min (39 % of output), the saturation gap is wider (UA ~57 %),
  or fetal VO₂ is at its human low end (5.4, umbilical uptake). This is decided in the first look (step 5).

## Reference values

### Hemodynamics

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Heart rate (CTG baseline) | **145** bpm | 130–160 | A/B | Suwanrath 2009, Amorim-Costa 2016, Serra 2009 |
| Systolic arterial pressure | **46** mmHg | — | C ovine | Wassink 2014, Schröder 2000 |
| Diastolic arterial pressure | **30** mmHg | — | C ovine | Wassink 2014, Schröder 2000 |
| Mean arterial pressure | **38** mmHg | 32–45 | C ovine | Wassink 2014, Schröder 2000, Unno 1999, Johnson 2000 |
| Pulse pressure | **16** mmHg | — | C ovine | Wassink 2014 |
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
| TAPSE | **6.2** mm | 4–8.5 | B | Messing 2013, Peixoto 2020 |

### Flows and distribution

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Combined ventricular output | **420** mL/kg/min | 340–500 | A/B | Mielke 2001, Kiserud 2006, Prsa 2014, Sun 2015 |
| RV share of combined output | **59** % | 55–62 | A | Mielke 2001, Rasanen 1996 |
| Pulmonary blood flow, share of CVO | **20** % | 11–30 | B | Rasanen 1996, Mielke 2001, Prsa 2014, Kiserud 2004 |
| Foramen ovale flow (R->L), share of CVO | **21** % | 15–35 | B | Rasanen 1996, Mielke 2001, Prsa 2014 |
| Ductus arteriosus flow (PA->Ao), share of CVO | **39** % | 30–46 | B | Rasanen 1996, Mielke 2001, Prsa 2014 |
| Placental (umbilical) share of CVO | **28** % | 20–35 | A/B | Kiserud 2006, Prsa 2014 |
| Umbilical vein flow | **120** mL/kg/min | 85–155 | A/B | Rigano 2008, Gerada 2006, Acharya 2005, Sun 2015 |
| SVC flow, share of CVO | **30** % | 20–40 | B | Sun 2015, Prsa 2014 |
| Descending aorta flow, share of CVO | **55** % | 35–75 | B | Prsa 2014 |
| Cerebral blood flow | **95** mL/kg/min | 70–120 | C | Sun 2015 |
| Ductus venosus shunt fraction of UV flow (reference only) | **25** % | — | B | Kiserud 2006b |

### Shunt anatomy

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Ductus arteriosus diameter | **3** mm | 2.5–3.8 | B | Szpinda |
| Foramen ovale diameter | — | — | C | Phillipos 1994 |

### Gases and oxygen

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Umbilical vein SO2 | **85** % | 75–92 | B | Siggaard-Andersen 1995, Nicolaides 1989, Soothill 1986 |
| Umbilical vein pO2 | **40** mmHg | 30–48 | B | Siggaard-Andersen 1995, Nicolaides 1989, Soothill 1986 |
| Umbilical vein pCO2 | **36** mmHg | 32–40 | B | Siggaard-Andersen 1995, Nicolaides 1989 |
| Umbilical vein pH | **7.4** - | 7.36–7.44 | B | Siggaard-Andersen 1995, Nicolaides 1989 |
| Umbilical vein base excess | **-2.4** mmol/L | -5–0 | B | Siggaard-Andersen 1995, Soothill 1986 |
| Umbilical artery SO2 | **64** % | 50–75 | B | Siggaard-Andersen 1995, Nicolaides 1989 |
| Umbilical artery pO2 | **27** mmHg | 20–34 | B | Siggaard-Andersen 1995, Nicolaides 1989 |
| Umbilical artery pCO2 | **41** mmHg | 37–46 | B | Siggaard-Andersen 1995, Nicolaides 1989 |
| Umbilical artery pH | **7.37** - | 7.33–7.41 | B | Siggaard-Andersen 1995, Nicolaides 1989 |
| UA minus UV pCO2 | **5** mmHg | 3–9 | B | Siggaard-Andersen 1995 |
| Ascending aorta (pre-ductal) SO2 | **67** % | 58–75 | B/C | Siggaard-Andersen 1995, Sun 2015 |
| Thoracic IVC SO2 | **72** % | — | C | Siggaard-Andersen 1995 |
| SVC SO2 | **43** % | 35–55 | C | Siggaard-Andersen 1995 |
| Descending aorta SO2 | **64** % | 50–75 | B/C | Siggaard-Andersen 1995 |
| Hb-O2 P50 (standard) | **19** mmHg | 18–20.5 | B | Siggaard-Andersen 1995 |

### Blood

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Hemoglobin | **13.6** g/dL | 11.6–15.6 | B | Nicolaides 1988, Siggaard-Andersen 1995, Forestier 1986 |
| Hematocrit | **41** % | 36–46 | C | Nicolaides 1988 |
| Fetal haemoglobin fraction | **93** % | 88–97 | B | Siggaard-Andersen 1995 |
| Fetoplacental blood volume | **115** mL/kg | 90–130 | C | MacGregor 1988 |
| Fetal body blood volume | **85** mL/kg | — | C | MacGregor 1988 |
| Placental share of fetoplacental blood | **26** % | 20–32 | C | MacGregor 1988 |

### Metabolism and thermal

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Oxygen consumption | **6.5** mL/kg/min | 5.4–8.1 | B | Sun 2015, VO2 review (Cetin) |
| Respiratory quotient | **0.95** - | 0.9–1 | C ovine | VO2 review (Cetin) |
| Core temperature | **37.5** degC | 37.3–37.9 | B | Asakura 2004 |
| Plasma glucose (UV) | **4** mmol/L | 3.3–4.8 | B/C | Marconi 1996, Economides 1989 |
| Lactate | **1** mmol/L | 0.6–1.8 | C | Nicolaides 1989, Soothill 1986 |

### Kidneys

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Fetal urine production (reference only) | **13** mL/kg/h | 8–25 | B | Touboul 2008, Rabinowitz 1989 |
| Plasma creatinine | **50** umol/L | 40–65 | C | Moniz 1985 |
| GFR | — | — | - | — |
| Cystatin C (reference only) | **1.66** mg/L | 1.26–2.06 | B | Bökenkamp 2001 |

### Body

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Crown-heel length (reference only) | **40** cm | — | C | — |
| Placental weight (reference only) | **320** g | — | C | — |

## First look at the model (step 4, 2026-10-19)

`node scripts/_make_fetus_validated.mjs --profile 30` (term_neonate + the fetal transform + the 30-week
profile, reseeded 300 s), probed with `node scripts/probe_term_reference.mjs fetus_30wk --ref
scripts/reference/fetus_30wk.json` (settle 180 s, window 20 s): **40 graded rows in range, 11 out**. The fetal
invariants hold after the bake.

- **In range first time:** HR 149, MAP 36.6 (46.6/28.6), PA − Ao 0.3 mmHg, LV volumes and EF, RV EF 62,
  combined output 351 mL/kg/min (low end), lungs 18 %, foramen 30 %, duct 34 %, placenta 28 %, SVC 31 %,
  brain 83 mL/kg/min, Hb/Hct, blood volumes (fetoplacental 111, placenta 28 %), VO₂ 6.4 (umbilical Fick),
  RQ 0.93, glucose, lactate 1.5, core 37.3 °C.
- **Oxygenation ordering holds:** UV 89 > IVC 64 > AA 54 > DAo 54 %.
- **Out of range:**
  - CVP 6.4 (ref 3); RV stroke volume 1.23 (ref 1.5) and RV share 52 % (ref 59): the split is still
    LV-leaning (`CONT_RIGHT` 1.2).
  - Umbilical vein pO₂ 48 / pCO₂ 47 / pH 7.30 and artery pCO₂ 60 / pH 7.21, UA − UV pCO₂ 12 mmHg (ref 5):
    the maternal pool sits at pCO₂ 47 / pH 7.26 with `MAT_TCO2` 23, and the umbilical vein follows it.
  - Ascending aorta SO₂ 54 % (ref 67): the Fick conflict of the balance rules resolved itself through a
    wide UV − UA saturation gap (89 − 54) at an umbilical flow of 97 mL/kg/min.
  - Duct diameter 4.6 mm vs anatomy 3.0 mm: the lever that keeps PA ≈ Ao (decided; flagged by design).
- **Controllers:** baroreflex mildly active (MAP 36.6 below its set-point 38: HR ×1.04, SVR ×1.09); brain
  autoregulation at its floor (0.15, fully dilated: the bed cannot reach the 95 mL/kg/min set-point).
- Fetal urine (3 mL/kg/h) is reference only by decision.

## Recalibrations made from this reference (step 5)

- **5.1 Preferential streaming (2026-10-19).** A third of the foramen flow came from the SVC part of the
  right atrium (34 of 105 mL/kg/min), so SVC and IVC blood mixed in the left atrium and the ascending aorta
  was only 0.9 saturation points above the pulmonary artery. New engine parameter `Shunts.fo_svc_fraction`
  (author's choice: continuous, 0–1; default 0.5 unchanged elsewhere), set to **0** for the fetus (crista
  dividens): AA − PA gap 0.9 → 6.0 points (ref ~8), ascending-aorta SO₂ 54.2 → 57.5 %, SVC SO₂ 42.3 → 45.5 %;
  pressures, output and its distribution unchanged. Still 40 in range / 11 out (AA 57.5 just below 58). The
  remaining gap to 67 % is the IVC (64 vs 72 %): umbilical blood mixes with lower-body blood before the
  atrium (no ductus venosus stream).

- **5.2 Maternal pool (2026-10-19).** `Placenta.mat_tco2` 23 → 21.5: the maternal pool sat at pCO₂ 47 /
  pH 7.26; now ~35 / 7.36 (placental venous blood at 30 wk, Siggaard-Andersen 1995). The umbilical vein
  equilibrates with it: pO₂ 48.2 → 41.4, pCO₂ 47.3 → 35.8, pH 7.30 → 7.40 (all on target). Tripling
  `dif_co2` changed nothing (not diffusion-limited). 43 in range / 8 out. The umbilical-artery misses (pCO₂ 48,
  pH 7.29, UA − UV gap 12.4, SO₂ 54) are fetal-side: umbilical flow 98 mL/kg/min (ref 120) at VO₂ 6.4.

## Decisions log (2026-10-19)

- Build route: live `term_neonate` + the fetal transform + a 30-week profile (preterm 30 wk levers as starting
  points), not a chain through `preterm_30wk` or the archived `term_fetus`.
- Weight 1.5 kg, the same as `preterm_30wk`.
- Sheep data allowed where no human value exists, graded "C ovine".
- Ductus venosus: reference only (the model has no ductus venosus or liver route for umbilical blood).
- Heart rate 145; MAP 38 (ovine).
- Flow shares follow Rasanen's 30-week values; cerebral blood flow kept as a grade-C derived target.
- Duct diameter: 3 mm is the documented anatomy; PA ≈ Ao is the real target and the model's duct size is a
  calibration lever.
- Ascending-aorta saturation 67 % (cordocentesis-based), not the MRI 58 %.
- Fetal urine production: reference only (known limitation; the model keeps the preterm 30-week kidney).
- Foramen ovale: the whole foramen opens onto the IVC part (`Shunts.fo_svc_fraction` 0, a new continuous engine
  parameter).
- Fetoplacental blood volume 115 mL/kg; its low bound was widened to 90 when MacGregor 1988 (94 mL/kg)
  was added at step 3.

## Open items

- Johnson 2000 (scanned PDF): absolute ventricular systolic, end-diastolic and atrial pressures at 29 wk.
- Umbilical venous pressure: no value collected.
- Foramen ovale diameter: Phillipos 1994 numbers not extracted.
- The O₂ balance conflict above.

## Sources

- **Acharya 2005**: Acharya G et al. Reference ranges for umbilical vein blood flow in the second half of pregnancy based on longitudinal data. Prenat Diagn 2005;25:99-111. doi:10.1002/pd.1091; PMID 15712315
- **Amorim-Costa 2016**: Amorim-Costa C et al. Gender-specific reference charts for cardiotocographic parameters throughout normal pregnancy (9701 fetuses). Eur J Obstet Gynecol Reprod Biol 2016;199:102-7. doi:10.1016/j.ejogrb.2016.01.036; PMID 26921476
- **Asakura 2004**: Asakura H. Fetal and neonatal thermoregulation. J Nippon Med Sch 2004;71:360-70.
- **Bökenkamp 2001**: Bökenkamp A et al. Fetal serum concentrations of cystatin C and beta2-microglobulin as predictors of postnatal kidney function. Am J Obstet Gynecol 2001;185:468-75. doi:10.1067/mob.2001.115283; PMID 11518911
- **Economides 1989**: Economides DL, Nicolaides KH. Blood glucose and oxygen tension levels in small-for-gestational-age fetuses. Am J Obstet Gynecol 1989;160:385-9. doi:10.1016/0002-9378(89)90453-5; PMID 2916623
- **Esh-Broder 2004**: Esh-Broder E et al. Free-hand 3D echocardiography in the evaluation of fetal cardiac ejection fraction. Ultrasound Obstet Gynecol 2004;23:546-51. doi:10.1002/uog.1059; PMID 15170793
- **Forestier 1986**: Forestier F et al. Hematological values of 163 normal fetuses between 18 and 30 weeks of gestation. Pediatr Res 1986;20:342-6. doi:10.1203/00006450-198604000-00017; PMID 3703624
- **Gerada 2006**: Gerada M et al. Color Doppler cineloop- vs spectral Doppler-derived umbilical vein flow. Ultrasound Obstet Gynecol 2006;28:156-61. doi:10.1002/uog.2729; PMID 16823891
- **Hamill 2011**: Hamill N et al. Fetal cardiac ventricular volume, cardiac output, and ejection fraction determined with 4D ultrasound (STIC/VOCAL). Am J Obstet Gynecol 2011;205:76.e1-10. doi:10.1016/j.ajog.2011.02.028; PMID 21531373
- **Johnson 2000**: Johnson P, Maxwell DJ, Tynan MJ, Allan LD. Intracardiac pressures in the human fetus. Heart 2000;84:59-63. doi:10.1136/heart.84.1.59; PMID 10862590
- **Kiserud 2004**: Kiserud T, Acharya G. The fetal circulation. Prenat Diagn 2004;24:1049-59. doi:10.1002/pd.1062; PMID 15614842
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
- **Prsa 2014**: Prsa M et al. Reference ranges of blood flow in the major vessels of the normal human fetal circulation at term by phase-contrast MRI. Circ Cardiovasc Imaging 2014;7:663-70. doi:10.1161/CIRCIMAGING.113.001859; PMID 24874055
- **Rabinowitz 1989**: Rabinowitz R et al. Measurement of fetal urine production in normal pregnancy by real-time ultrasonography. Am J Obstet Gynecol 1989;161:1264-6. doi:10.1016/0002-9378(89)90679-0; PMID 2686448
- **Rasanen 1996**: Rasanen J et al. Role of the pulmonary circulation in the distribution of human fetal cardiac output during the second half of pregnancy. Circulation 1996;94:1068-73. doi:10.1161/01.cir.94.5.1068; PMID 8790048
- **Rigano 2008**: Rigano S et al. Small size-specific umbilical vein diameter in severe growth restricted fetuses that die in utero (normal controls). Prenat Diagn 2008;28:908-13. doi:10.1002/pd.2054; PMID 18821714
- **Schröder 2000**: Schröder HJ et al. Unloading of baroreceptors by carotid occlusion does not increase heart rate in fetal sheep. Eur J Obstet Gynecol Reprod Biol 2000;92:265-72 (ovine). doi:10.1016/s0301-2115(99)00285-7; PMID 10996692
- **Serra 2009**: Serra V et al. Computerized analysis of normal fetal heart rate pattern throughout gestation. Ultrasound Obstet Gynecol 2009;34:74-9. doi:10.1002/uog.6365; PMID 19489020
- **Siggaard-Andersen 1995**: Siggaard-Andersen O, Huch R. The oxygen status of fetal blood. Acta Anaesthesiol Scand 1995;39 Suppl 107:129-35 (week-30 synthesis of cordocentesis data; http://www.siggaard-andersen.dk/FetalBlood.pdf).
- **Simioni 2012**: Simioni C et al. Fetal cardiac output and ejection fraction by STIC: male vs female fetuses. Rev Bras Cir Cardiovasc 2012;27:275-82. doi:10.5935/1678-9741.20120058; PMID 22996979
- **Soothill 1986**: Soothill PW et al. Effect of gestational age on fetal and intervillous blood gas and acid-base values in human pregnancy. Fetal Ther 1986;1:168-75. doi:10.1159/000262264; PMID 3454532
- **Sun 2015**: Sun L et al. Reduced fetal cerebral oxygen consumption is associated with smaller brain size in fetuses with congenital heart disease (30 normal controls at 36 wk). Circulation 2015;131:1313-23. doi:10.1161/CIRCULATIONAHA.114.013051; PMID 25762062
- **Suwanrath 2009**: Suwanrath C, Suntharasaj T. Sleep-wake cycles in normal fetuses. Arch Gynecol Obstet 2009;281:449-54. doi:10.1007/s00404-009-1111-3; PMID 19434415
- **Szpinda**: Szpinda M, ductus arteriosus morphometry regression (diameter 0.2072 + 0.0935 x GA mm), as quoted in component_models/Pda.js.
- **Touboul 2008**: Touboul C et al. Normal fetal urine production rate estimated with 3D ultrasonography (VOCAL). Am J Obstet Gynecol 2008;199:57.e1-5. doi:10.1016/j.ajog.2007.12.012; PMID 18295175
- **Unno 1999**: Unno N et al. Blood pressure and heart rate in the ovine fetus: ontogenic changes and effects of fetal adrenalectomy. Am J Physiol 1999;276:H248-56 (ovine). doi:10.1152/ajpheart.1999.276.1.H248; PMID 9887039
- **VO2 review (Cetin)**: Human fetal VO2 estimates as quoted in Cetin I et al., 'The hypoxic fetus as a patient: adaptations to the intrauterine environment' (Univ. Milan): Bonds 1986 calorimetry 6.8 mL/min/kg; Acharya & Sitras umbilical uptake 0.29 mmol/min/kg; Radaelli 0.24 mmol/min/kg; fetal lamb (Philipps) 8.1 mL/min/kg.
- **Wassink 2014**: Wassink G et al. Does maturity affect cephalic perfusion and T/QRS ratio during prolonged umbilical cord occlusion in fetal sheep? Obstet Gynecol Int 2014:314159 (ovine). doi:10.1155/2014/314159; PMID 24693290
- **Zhang 2016**: Zhang J et al. Evaluation of right ventricular function in fetal hypoplastic left heart syndrome using STIC (151 normal controls, mean 30.2 wk). Cardiovasc Ultrasound 2016;14:12. doi:10.1186/s12947-016-0056-5; PMID 27066831
