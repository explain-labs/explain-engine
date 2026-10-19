# Preterm neonate (25 wk, 700 g) at 72 h: literature reference values

Reference values for validating a preterm scenario (`preterm_25wk`): an infant born at 25 weeks weighing
about 700 g, at about 72 h postnatal age. Compiled 2026-10-19 from the reference PDFs (kept out of the
repository) and a PubMed search. Every judgement call was made by the model's author (see the decisions
log). It follows the 28-week set ([`Preterm28wkReference.md`](Preterm28wkReference.md)). Values with
no 25-week evidence carry over from that set, and the notes say so.

The machine-readable version is [`scripts/reference/preterm_25wk.json`](../scripts/reference/preterm_25wk.json),
in the same schema as the term and 28-week sets. Each variable has one entry: value, range, method, age,
sources (DOI/PMID), grade, and the model read-out to compare against. Entries without a model read-out
are reference-only context.

## The reference state

- 25+0 weeks, 0.70 kg, 72 h, appropriate for gestational age
- **Respiratory support:**
  - nasal CPAP 7 cmH₂O, FiO₂ 0.30
  - one LISA surfactant dose, stable post-surfactant RDS
  - spontaneous breathing, caffeine on board
  - Represented as for 28 wk: a recruited-lung state plus the inspired FiO₂. CPAP 7, not 6, because a
    stiffer lung needs about one more cmH₂O to hold the same FRC.
- **Ductus:** small, restrictive, left-to-right, haemodynamically insignificant (~1 mm, LVO/RVO ~1.1).
  A small left-to-right PFO.
- **Blood:** untransfused, delayed cord clamping
- **Nutrition:** trophic feeds plus parenteral nutrition, measured between feeds
- **Environment:** humidified incubator, ~36 °C air, ~80 % relative humidity
- **Apnoea model off:** apnoea is more frequent than at 28 wk, but the reference state is a quiet baseline

**Grades**
- **A**: 24–27 wk infants measured on day 2–4
- **B**: a wider GA band, another day, a figure read-off, or a guideline target
- **C**: textbook, extrapolation, or derived from other variables

## Measurement method matters

- **Blood pressure:** invasive (UAC) values from Elsayed 2023, n = 29 at 25 wk.
  - At 25 wk the cuff reads only ~1.7 mmHg above the catheter for the mean (van Zadelhoff calculator,
    GA 25+0, 72 h: 53/24, mean 35.7). At 28 wk the gap was ~4 mmHg.
  - Infants <26 wk in that cohort had routine arterial lines alongside the cuff.
- **Cardiac output:** day-3 echo from direct-age cohorts:
  - Deshpande 2023 (25.9 wk)
  - Bischoff 2021 (25.5 wk, 720 g)
  - Groves' MRI cohort starts at a corrected age of 28–29 wk, so it is only an extrapolated upper bracket.
- **Organ flows:** almost no volume flows exist at 25 wk; most studies give only Doppler velocities.
  - Brain, gut and kidney targets are derived from organ size, tracer CBF per 100 g, and the
    filtration fraction.
  - All are grade C.
- **Breathing:** no day-3 CPAP breathing-pattern study at 25 wk was found. The values are the 28-week
  values extrapolated a little, plus direct-age dead space data (Dassios 2024, Murthy 2015).
- **Acid–base:** Notz 2024 selected the worst sample of each day from mixed arterial, capillary and venous
  gases. A typical day-3 value sits above its minima.
- **Kidney:** the GFR target (0.30 mL/min/kg) lies above the Vieux 2010 curve extrapolated to 25 wk.
  - That curve gives 4.03 mL/min/1.73 m² at day 7, or ~0.21 mL/min/kg on day 3.
  - The engine's preterm renal reference (`scripts/_renal_reference.mjs`) uses that curve, so this
    scenario needs a deliberate kidney override.

## Balance rules

- **Aortic side:** LVO 215 = SVC 85 + descending aorta ~100 + duct ~20 + coronaries ~12.
  The coronaries are counted this time; the 28-week targets left them out.
- **Venous side:** RVO 195 = systemic venous return + PFO shunt
- **Upper body:** SVC 85 = brain 28 + rest ~57
- **Lower body:** descending aorta ~100 = gut 22 + liver/spleen 20 + kidneys 6 + rest ~52
- **Kidney:**
  - Blood flow ~6 with GFR 0.30 mL/min/kg and Hct 41 gives a filtration fraction of ~8 %.
  - Urine 3 mL/kg/h needs water reabsorption ~0.83.
- **CO₂:** VO₂ 6.0 × RQ 0.95 ≈ VCO₂ 5.7. Alveolar ventilation ≈ RR 65 × (Vt 5.0 − Vd 3.2) ≈ 115 mL/kg/min,
  less alveolar dead space, gives PaCO₂ ~48.
- **O₂ (Fick):** Hb 13.5, SaO₂ 0.93, systemic flow 195 and VO₂ 6 give SvO₂ ~76 %.

## Reference values

### Hemodynamics

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Heart rate | **160** bpm | 140–180 | A | Deshpande 2023, Bischoff 2021 |
| Systolic BP | **45** mmHg | 39–58 (P5-P95) | A | Elsayed 2023, van Zadelhoff 2023 |
| Diastolic BP | **26** mmHg | 22–31 (P5-P95) | A | Elsayed 2023, van Zadelhoff 2023 |
| Mean arterial pressure | **34** mmHg | 27–42 (P5-P95) | A | Elsayed 2023, van Zadelhoff 2023, Vesoulis 2016 |
| Pulse pressure | **19** mmHg | — | B | Elsayed 2023 |
| Central venous pressure | **5** mmHg | 3–7 | A/B | Trevor Inglis 2007, Choi 2015, Siassi 1980, Abdel-Hady 2008 |
| Pulmonary artery pressure, systolic | **27** mmHg | 22–34 | C | Skinner 1992, Skinner 1991, Patel 2019 |
| Pulmonary artery pressure, mean | **18.5** mmHg | 15–23 | C | Skinner 1992 |
| Pulmonary artery pressure, diastolic | — | < 25 | C | Skinner 1991 |

### Heart

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| LV end-diastolic volume | **2.07** mL/kg | 1.7–2.6 | B | Groves 2011 |
| LV end-systolic volume | **0.73** mL/kg | 0.4–1.1 | B | Groves 2011 |
| LV stroke volume | **1.34** mL/kg | 1.05–1.65 | B | Deshpande 2023, Bischoff 2021, Groves 2011 |
| LV ejection fraction | **65** % | 58–80 | B | Groves 2011, Homedi 2026 |
| RV end-diastolic volume | **2.44** mL/kg | 2–2.9 | C | Levy 2015 |
| RV end-systolic volume | **1.22** mL/kg | 0.9–1.6 | C | Levy 2015 |
| RV stroke volume | **1.22** mL/kg | 1–1.5 | C | Deshpande 2023 |
| RV ejection fraction | **50** % | 45–60 | B/C | Toyoshima 2024, Levy 2015 |
| RV fractional area change | **31** % | 24–40 | A | Levy 2015, James 2015, Homedi 2026 |
| TAPSE | **0.4** cm | 0.3–0.55 | B | Koestenberger 2011, Sehgal 2022, Sehgal 2019, Homedi 2026 |

### Flows

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Left ventricular output | **215** mL/kg/min | 180–280 | B | Deshpande 2023, Bischoff 2021, Homedi 2026, Evans 1996, Moritz 2008, Aquilano 2014 |
| Right ventricular output | **195** mL/kg/min | 160–260 | B | Deshpande 2023, Bischoff 2021, Abdel-Hady 2008 |
| LVO/RVO ratio | **1.1** | 1–1.25 | B | Bischoff 2021 |
| SVC flow | **85** mL/kg/min | 60–115 | B | Kluckow 2000, Deshpande 2023, Bischoff 2021, Ficial 2013, Groves 2011 |
| Descending aorta flow | **100** mL/kg/min | 75–140 | B/C | Groves 2011, Broadhouse 2013 |
| Cerebral blood flow | **28** mL/kg/min | 15–40 | C | Greisen 1986, Lundstrøm 1995, Pryds 1989, Pereira 2021, Chock 2022 |
| Intestinal (SMA) flow | **22** mL/kg/min | 12–35 | C | van Bel 1990, Thompson 2013, Gursoy 2015, Hsu 2019 |
| Renal blood flow | **6** mL/kg/min | 4–9 | C | Vieux 2010, Visser 1992 |
| Coeliac (liver + spleen) flow | **20** mL/kg/min | 12–30 | C | El-Khuffash 2008 |

### Shunts

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Ductal shunt flow (L->R) | **22** mL/kg/min | 10–40 | C | Bischoff 2021, Broadhouse 2013 |
| Ductal diameter | **1** mm | 0.8–1.4 | B | Deshpande 2023, Bischoff 2021, Hsu 2019 |
| Foramen ovale shunt (L->R) | **5** mL/kg/min | 0–15 | C | Bischoff 2021 |

### Breathing (nCPAP 7)

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Respiratory rate | **65** /min | 50–85 | B | Welty 2018, Liew 2020, Dimitriou 1995 |
| Tidal volume | **5** mL/kg | 4.2–6 | B | Liew 2020, Reiterer 1993, Kraaijenga 2015 |
| Minute ventilation | **325** mL/kg/min | 250–400 | B | Liew 2020 |
| Inspiratory time fraction (Ti/Ttot) | **0.38** | 0.33–0.44 | B | Reiterer 1993, Dimitriou 1995 |
| Respiratory system compliance | **0.39** mL/cmH2O | 0.25–0.6 | C | Bhutani 1988, Davis 1988, Gerhardt 1980, Dassios 2024 |
| Lung compliance (both lungs) | **0.6** mL/cmH2O/kg | 0.4–0.9 | C | Bhutani 1988, Davis 1988, Dassios 2024, Sehgal 2019 |
| Chest wall compliance | **7** mL/cmH2O/kg | 4–10 | C | Gerhardt 1980, Stoecklin 2024, Rehan 2001 |
| Respiratory system resistance | **90** cmH2O/L/s | 65–140 | C | Reiterer 1993, Bhutani 1988 |
| Functional residual capacity | **22** mL/kg | 17–28 | C | da Silva 1994 |
| Anatomic dead space | **3.2** mL/kg | 2.4–3.8 | B/C | Numa 1996, Murthy 2015, Dassios 2024, Liew 2020 |
| Physiological dead space fraction (Vd/Vt) | **0.65** | 0.55–0.75 | B | Williams 2021, Dassios 2024 |
| Inspired O2 fraction | **0.3** | 0.25–0.35 | state | Sweet 2023 |
| Apnoea / periodic breathing | — | — | C | Pre-Vent 2023 |

### Gases and oxygen

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| SpO2 (pre-ductal) | **93** % | 90–95 (target band) | B | Sweet 2023, Askie 2018, Hagadorn 2006 |
| pH | **7.22** | 7.18–7.3 | A/B | Notz 2024, Bonsante 2017 |
| pCO2 | **48** mmHg | 42–55 | A/B | Fabres 2007, Thome 2015 |
| HCO3 | **19.5** mmol/L | 17–22 | B | Notz 2024, Bonsante 2017 |
| Base excess | **-7** mmol/L | -10–-4 | A | Notz 2024, Bonsante 2017 |
| PaO2 | **50** mmHg | 42–58 | A | Quine 2009, Castillo 2008 |
| Hb-O2 P50 (standard) | **18.5** mmHg | 17.7–19.3 | A | De Halleux 2002 |
| Mixed venous O2 saturation | **76** % | 70–82 | C | Yapakci 2014 |

### Metabolism and thermal

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Oxygen consumption | **6** mL/kg/min | 5–7 | B | Bauer 1997, Bauer 2003, Bauer 2001, Schulze 2001 |
| Respiratory quotient | **0.95** | 0.85–1 | B | Bauer 2003, Forsyth 1992 |
| Core temperature | **37** degC | 36.5–37.5 | C | Sauer 1984 |
| Incubator air temperature | **36** degC | 35–37 | C | Sauer 1984, Karlsson 2012 |
| Incubator relative humidity | **80** % | 70–90 | B | Adv Neonatal Care 2021, J Perinatol 2025, Karlsson 2012 |
| Insensible water loss | **40** mL/kg/day | 25–60 | B | J Perinatol 2025, Karlsson 2012 |
| Plasma glucose | **7** mmol/L | 4–10 | B | Liu 2026, Alsayigh 2026, Fursule 2026 |
| Lactate | **1.5** mmol/L | 1–2.5 | A | Liu 2026, Deshpande 1997 |

### Blood

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Hemoglobin | **13.5** g/dL | 12–15 | C | Jopling 2009, Puia-Dumitrescu 2019, Banerjee 2015 |
| Hematocrit | **41** % | 36–45 | C | Jopling 2009, Mintzer 2014 |
| Fetal haemoglobin fraction | **93** % | 90–96 | A | De Halleux 2002 |
| Blood volume | **85** mL/kg | 75–95 | C | Aladangady 2004, Aladangady 2006, Bauer 1993 |

### Kidneys

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| GFR | **4.6** mL/min/1.73m2 | 3.1–7.7 | C | Vieux 2010, Bueva 1994, Lorenz 1995 |
| Urine output | **3** mL/kg/h | 2–5 | B | Lorenz 1995 |
| Fractional sodium excretion | **10** % | 5–15 | B/C | Lorenz 1995 |
| Plasma creatinine | **150** umol/L | 100–220 | B/C | Miall 1999 |

## Decisions log (2026-10-19)

All choices were made by the model's author after the evidence was presented.

| Topic | Decision | Basis |
|---|---|---|
| State | nCPAP like the 28 wk; small restrictive L→R PDA; untransfused | Author's choice. A minority state at 25 wk, where most infants are still intubated |
| CPAP / FiO₂ | CPAP 7 (FRC ~22), FiO₂ 0.30, one LISA dose | da Silva pressure–volume slope; post-surfactant stability |
| Build | One shared generator with 28 and 25 wk lever profiles; the 28 wk output stays byte-identical | Lessons carry over |
| BP | Elsayed 25 wk day-3 invasive median 45/26 (34); van Zadelhoff cuff as cross-check | Same rule as 28 wk |
| Flows | LVO/RVO/SVC 215/195/85, as at 28 wk | Deshpande and Bischoff are direct-age; flow per kg not GA-dependent there |
| HR | 160 | Deshpande 25.9 wk at 54 h |
| Hb | 13.5 g/dL / Hct 41 | Birth 15.1 + clamping − early fall − sampling |
| PAP | RV/systemic ratio 0.60 (27 / 18.5) | PAAT rises with GA (Patel 2019) |
| CVP | 5 (3–7) | Inglis 2007; CPAP 7 |
| Brain flow | Kept at 28 mL/kg/min (33 % of SVC flow); 24 derived as the low side | Author's choice |
| Organ flows | DAo ~100 with coronaries; SMA 22; coeliac 20; kidneys ~6 | Balance; GFR |
| Lungs | CL 0.6 /kg, Ccw 7 /kg, Crs 0.39 mL/cmH₂O, Rrs ~90 | Post-LISA, less mature lung; compliant chest wall |
| Breathing | RR 65, Vt 5.0, MV 325, Ti/Ttot 0.38, dead space 3.2, VD/VT 0.65 | Extrapolated; Dassios / Murthy dead space |
| Acid–base | BE −7, pCO₂ 48 → pH 7.22, HCO₃ 19.5 | Notz 2024: base deficit peaks on day 3 |
| Oxygen | SpO₂ 93, PaO₂ 50, P50 18.5, HbF 93, SvO₂ 76 | As at 28 wk |
| Kidney | GFR 0.30 mL/min/kg (4.6 /1.73 m²), FENa 10 %, urine 3, creatinine ~150 | Between the Vieux extrapolation and Bueva; Miall |
| Metabolism / environment | VO₂ 6.0, glucose 7.0, lactate 1.5, blood volume 85, incubator 36 °C / 80 % RH | Hyperglycaemia common at 25 wk |

## Open items

- **Full texts that could raise grades:**
  - Lui 2000 (week-1 Crs/Rrs in ≤1000 g; numbers not in the abstract)
  - Bourchier (acid–base <26 wk)
  - CPAP breathing pattern and FRC studies below 26 wk
  - Vieux 2010 data below 27 wk
- **Model implications to check in the first look:**
  - kidney: an override above the default renal reference
  - lungs: CL 0.6 with a chest wall of 7 /kg
  - CPAP 7 recruitment
  - the brain bed defending 28 mL/kg/min at a lower BP set-point (34)

## Sources

- **Elsayed 2023**: Elsayed Y, Ahmed F. Blood pressure normative values in preterm infants during postnatal transition. Pediatr Res 2024;95:698-704. doi:10.1038/s41390-023-02788-8; PMID 37667035
- **van Zadelhoff 2023**: van Zadelhoff AC et al. Age-dependent changes in arterial blood pressure in neonates during the first week of life. Br J Anaesth 2023;130:585-94. doi:10.1016/j.bja.2023.01.024; PMID 36858885
- **Vesoulis 2016**: Vesoulis ZA et al. Empirical estimation of the normative blood pressure in infants <28 weeks gestation. J Perinatol 2016;36:291-5. doi:10.1038/jp.2015.185; PMID 26633144
- **Deshpande 2023**: Deshpande P et al. Cerebral oxygenation, cardiac output and blood pressure during transition in extremely low gestational age neonates. Front Pediatr 2023;11:1187769. doi:10.3389/fped.2023.1187769; PMID 37654688
- **Bischoff 2021**: Bischoff AR et al. Assessment of superior vena cava flow and cardiac output in different patterns of PDA shunt. Echocardiography 2021;38:1524-33. doi:10.1111/echo.15163; PMID 34309068
- **Groves 2011**: Groves AM et al. Functional cardiac MRI in preterm and term newborns. Arch Dis Child Fetal Neonatal Ed 2011;96:F86-91. doi:10.1136/adc.2010.189142; PMID 20971721
- **Kluckow 2000**: Kluckow M, Evans N. Superior vena cava flow in newborn infants: a novel marker of systemic blood flow. Arch Dis Child Fetal Neonatal Ed 2000;82:F182-7. doi:10.1136/fn.82.3.f182; PMID 10794783
- **Evans 1996**: Evans N, Kluckow M. Early determinants of right and left ventricular output in ventilated preterm infants. Arch Dis Child Fetal Neonatal Ed 1996;74:F88-94. doi:10.1136/fn.74.2.f88; PMID 8777673
- **Ficial 2013**: Ficial B et al. Validation of echocardiographic measurements of systemic blood flow volume in newborn infants. J Am Soc Echocardiogr 2013;26:1365-71. doi:10.1016/j.echo.2013.08.019; PMID 24075229
- **Broadhouse 2013**: Broadhouse KM et al. Assessment of PDA shunt and systemic blood flow in newborns using cardiac MRI. NMR Biomed 2013;26:1135-41. doi:10.1002/nbm.2927; PMID 23412748
- **Skinner 1991**: Skinner JR et al. Non-invasive assessment of pulmonary arterial pressure in healthy neonates. Arch Dis Child 1991;66:386-90. doi:10.1136/adc.66.4_spec_no.386; PMID 2025029
- **Skinner 1992**: Skinner JR et al. Pulmonary and systemic arterial pressure in hyaline membrane disease. Arch Dis Child 1992;67:366-73. doi:10.1136/adc.67.4_spec_no.366; PMID 1586172
- **Patel 2019**: Patel MD et al. Echocardiographic assessment of right ventricular afterload in preterm infants. J Am Soc Echocardiogr 2019;32:884-94. doi:10.1016/j.echo.2019.03.015; PMID 31272593
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
- **Sweet 2023**: Sweet DG et al. European Consensus Guidelines on the Management of RDS: 2022 Update. Neonatology 2023;120:3-23. doi:10.1159/000528914; PMID 36863329
- **Askie 2018**: Askie LM et al. (NeOProM). JAMA 2018;319:2190-2201. doi:10.1001/jama.2018.5725; PMID 29872859
- **Hagadorn 2006**: Hagadorn JI et al. (AVIOx). Pediatrics 2006;118:1574-82. doi:10.1542/peds.2005-0413; PMID 17015549
- **Quine 2009**: Quine D, Stenson BJ. Arterial oxygen tension values in infants <29 weeks of gestation at currently targeted saturations. Arch Dis Child Fetal Neonatal Ed 2009;94:F51-3. doi:10.1136/adc.2007.135285; PMID 18285372
- **Castillo 2008**: Castillo A et al. Prevention of hyperoxia: SpO2 and PaO2 in newborns receiving oxygen. Pediatrics 2008;121:882-9. doi:10.1542/peds.2007-0117; PMID 18450890
- **De Halleux 2002**: De Halleux V et al. Effect of transfusion on the Hb-O2 dissociation curve of very early preterm infants. Semin Perinatol 2002;26:411-5. doi:10.1053/sper.2002.37313; PMID 12537312
- **Bonsante 2017**: Bonsante F et al. Early optimal parenteral nutrition and metabolic acidosis in very preterm infants. PLoS One 2017;12:e0186936. doi:10.1371/journal.pone.0186936; PMID 29176758
- **Notz 2024**: Notz L et al. Early metabolic acidosis in infants <28 weeks. BMC Pediatr 2024;24:605. doi:10.1186/s12887-024-05077-3; PMID 39342228
- **Fabres 2007**: Fabres J et al. Both extremes of arterial carbon dioxide pressure and the magnitude of fluctuations are associated with severe IVH. Pediatrics 2007;119:299-305. doi:10.1542/peds.2006-2434; PMID 17272619
- **Thome 2015**: Thome UH et al. (PHELBI). Lancet Respir Med 2015;3:534-43. doi:10.1016/S2213-2600(15)00204-0; PMID 26088180
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
- **Lorenz 1995**: Lorenz JM et al. Phases of fluid and electrolyte homeostasis in the extremely low birth weight infant. Pediatrics 1995;96:484-9. PMID 7651782
- **Miall 1999**: Miall LS et al. Plasma creatinine rises dramatically in the first 48 hours of life in preterm infants. Pediatrics 1999;104:e76. doi:10.1542/peds.104.6.e76; PMID 10586010
- **Sauer 1984**: Sauer PJ, Dane HJ, Visser HK. New standards for neutral thermal environment of healthy very low birthweight infants in week one of life. Arch Dis Child 1984;59:18-22. doi:10.1136/adc.59.1.18; PMID 6696489
- **Adv Neonatal Care 2021**: Systematic review of incubator humidity in preterm infants. Adv Neonatal Care 2021. doi:10.1097/ANC.0000000000000791; PMID 33009156
- **J Perinatol 2025**: Insensible water loss at 70 % vs 90 % incubator humidity, 22-28 wk. J Perinatol 2025. doi:10.1038/s41372-025-02261-w; PMID 40089583
- **Homedi 2026**: Homedi A et al. Early targeted neonatal echocardiography in infants born before 29 weeks. Front Pediatr 2026;14:1782985. doi:10.3389/fped.2026.1782985; PMID 41948700
- **Sehgal 2022**: Sehgal A et al. Cardiorespiratory adaptation to low-dose dexamethasone in extremely preterm infants. J Physiol 2022;600:4361-73. doi:10.1113/JP282973; PMID 36068678
- **James 2015**: James AT et al. Clinical utility of right ventricular fractional area change in preterm infants. Early Hum Dev 2015;92:19-23. doi:10.1016/j.earlhumdev.2015.10.015; PMID 26619069
- **Moritz 2008**: Moritz B et al. Nasal CPAP does not change cardiac output in preterm infants. Am J Perinatol 2008;25:105-9. doi:10.1055/s-2008-1040341; PMID 18240105
- **Aquilano 2014**: Aquilano G et al. Bi-level CPAP does not change central blood flow in preterm infants with RDS. Ital J Pediatr 2014;40:60. doi:10.1186/1824-7288-40-60; PMID 24952579
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
