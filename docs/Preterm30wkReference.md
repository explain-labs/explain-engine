# Preterm neonate (30 wk, 1.5 kg) at 72 h: literature reference values

Reference values for validating a preterm scenario (`preterm_30wk`): an infant born at 30 weeks weighing
about 1.5 kg, at about 72 h postnatal age. Compiled 2026-10-19 from the reference PDFs (kept out of the
repository) and a PubMed search. Every judgement call was made by the model's author (see the decisions
log). It continues the series [`Preterm25wkReference.md`](Preterm25wkReference.md) →
[`Preterm28wkReference.md`](Preterm28wkReference.md); values with no 30-week evidence follow that series,
and the notes say so.

The machine-readable version is [`scripts/reference/preterm_30wk.json`](../scripts/reference/preterm_30wk.json),
in the same schema as the term, 25-week and 28-week sets. Each variable has one entry: value, range, method,
age, sources (DOI/PMID), grade, and the model read-out to compare against. Entries without a model read-out
are reference-only context.

## The reference state

- 30+0 weeks, 1.5 kg, 72 h, appropriate for gestational age
- **Respiratory support:**
  - nasal CPAP 5 cmH₂O in room air (FiO₂ 0.21)
  - no surfactant: mild RDS on the infant's own lung
  - spontaneous breathing, caffeine on board
  - Represented as for 25 and 28 wk: a recruited-lung state plus the inspired FiO₂. In room air FiO₂ is
    not titrated, so SpO₂ is an outcome of the lung, not a target band.
- **Ductus:** small, restrictive, left-to-right, haemodynamically insignificant (~1 mm, LVO/RVO ~1.1).
  A small left-to-right PFO.
- **Blood:** untransfused, delayed cord clamping
- **Nutrition:** advancing enteral feeds (~60 mL/kg/day, 3-hourly boluses) plus a parenteral top-up
- **Environment:** humidified incubator, ~34 °C air, ~60 % relative humidity
- **Apnoea model off:** the reference state is a quiet baseline

**Grades**
- **A**: 29–31 wk infants measured on day 2–4
- **B**: a wider GA band, another day, a figure read-off, a guideline target, or a short extrapolation
- **C**: textbook, extrapolation, or derived from other variables

## Measurement method matters

- **Blood pressure:** the invasive (UAC) normative cohort (Elsayed 2023) stops at 28 wk. Its day-3 centiles
  are extrapolated linearly to 30 wk (MAP rises ~1.9 mmHg/wk from 23 to 28 wk), hence grade B.
  - Two cuff datasets cover 30 wk directly: the van Zadelhoff calculator (GA 30+0, 72 h: 62/35, mean 46.1)
    and Guan 2026 (28–31 wk, day 3: 67/36, mean 46).
  - The cuff reads ~4 mmHg above the extrapolated arterial mean, the same gap as at 28 wk.
- **Cardiac output:** day-3 echo data at 29–31 wk are scarce. Schwarz 2022 (median 29 wk, days 1–2) is
  still transitional (LVO 163); Sloot 2010 (day 7) and Groves' MRI (CGA ~30, day 10, duct closed) are upper
  brackets. The per-kg flows of the 25/28 wk sets are kept between them.
- **Organ flows:** volume flows remain scarce; brain, gut and kidney targets are derived from organ size,
  tracer CBF per 100 g, the feeding cycle and the filtration fraction. All are grade C or B/C.
- **Breathing:** Welty 2018 (29.6 wk, 44 h, bubble CPAP 5–8, mostly room air) gives the breathing rate at
  the right age. Lung and chest-wall mechanics without surfactant at 30 wk are interpolated between acute
  RDS, recovering lungs and the 36-week data of Stoecklin 2024.
- **Oxygen:** no on-oxygen saturation band applies in room air. Richard 1993 (30–36 wk, no respiratory
  distress, room air) brackets the healthy end (median 99.4 %).
- **Kidney:** the GFR target (0.8 mL/min/kg) is 0.77 × the Vieux 2010 day-7 value, the same day-3 ratio as
  the 28-week set. The engine's preterm renal reference (`scripts/_renal_reference.mjs`) rests at the day-7
  value (1.08 mL/min/kg); whether to correct it is decided in the first look.

## Balance rules

- **Aortic side:** LVO 215 = SVC 85 + descending aorta ~100 + duct ~20 + coronaries ~12
- **Venous side:** RVO 195 = systemic venous return + PFO shunt
- **Upper body:** SVC 85 = brain 25 + rest ~60
- **Lower body:** descending aorta ~100 = gut 28 + liver/spleen 20 + kidneys 17 + rest ~35
- **Kidney:** GFR 0.8 mL/min/kg filters 48 mL/kg/h; urine 3 mL/kg/h needs water reabsorption ~0.94.
  Kidney blood flow ~17 follows at term's blood-flow/GFR ratio (21).
- **CO₂:** VO₂ 6.5 × RQ 0.92 ≈ VCO₂ 6.0. Alveolar ventilation ≈ 300 × (1 − 0.60) = 120 mL/kg/min gives
  PaCO₂ ~43.
- **O₂ (Fick):** Hb 15.5, SaO₂ 0.96, systemic flow 195 and VO₂ 6.5 give SvO₂ ~80 %.

## Reference values

### Hemodynamics

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Heart rate | **150** bpm | 130–170 | B/C | Alonzo 2018, Eenkhoorn 2026, Groves 2011, Deshpande 2023 |
| Systolic BP | **58** mmHg | 46–68 (P5-P95) | B | Elsayed 2023, van Zadelhoff 2023, Guan 2026 |
| Diastolic BP | **31** mmHg | 27–39 (P5-P95) | B | Elsayed 2023, van Zadelhoff 2023, Guan 2026 |
| Mean arterial pressure | **42** mmHg | 31–50 (P5-P95) | B | Elsayed 2023, van Zadelhoff 2023, Guan 2026 |
| Pulse pressure | **27** mmHg | — | B | Elsayed 2023 |
| Central venous pressure | **3.5** mmHg | 1.3–5.7 | B | Choi 2015, Trevor Inglis 2007, Abdel-Hady 2008 |
| Pulmonary artery pressure, systolic | **29** mmHg | 23–35 | C | Patel 2019, Skinner 1992 |
| Pulmonary artery pressure, mean | **19.5** mmHg | 15–23 | C | Skinner 1992 |
| Pulmonary artery pressure, diastolic | — | < 31 | C | Skinner 1991 |

### Heart

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| LV end-diastolic volume | **2.2** mL/kg | 1.8–2.7 | B | Groves 2011 |
| LV end-systolic volume | **0.77** mL/kg | 0.4–1.1 | B | Groves 2011 |
| LV stroke volume | **1.43** mL/kg | 1.1–1.75 | B | Groves 2011, Schwarz 2022 |
| LV ejection fraction | **65** % | 58–80 | B | Groves 2011 |
| RV end-diastolic volume | **2.6** mL/kg | 2.1–3.1 | C | Levy 2015 |
| RV end-systolic volume | **1.3** mL/kg | 0.95–1.7 | C | Levy 2015 |
| RV stroke volume | **1.3** mL/kg | 1.05–1.6 | C | Schwarz 2022 |
| RV ejection fraction | **50** % | 45–60 | B/C | Toyoshima 2024, Levy 2015 |
| RV fractional area change (ref.) | **31** % | 26–38 | B | Levy 2015, James 2015 |
| TAPSE (ref.) | **0.55** cm | 0.4–0.7 | B | Koestenberger 2011, Ghandi 2018 |

### Flows

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Left ventricular output | **215** mL/kg/min | 180–280 | B | Schwarz 2022, Sloot 2010, Groves 2011, Cappelleri 2019 |
| Right ventricular output | **195** mL/kg/min | 160–260 | B | Schwarz 2022, Abdel-Hady 2008 |
| LVO/RVO ratio | **1.1** | 1–1.25 | B | Bischoff 2021 |
| SVC flow | **85** mL/kg/min | 60–115 | B | Kluckow 2000, Groves 2011, Ficial 2013 |
| Descending aorta flow | **100** mL/kg/min | 75–140 | B/C | Groves 2011, Broadhouse 2013 |
| Cerebral blood flow | **25** mL/kg/min | 18–35 | B/C | Greisen 1986, Pryds 1989, Kehrer 2003, Dobbing 1978 |
| Intestinal (SMA) flow | **28** mL/kg/min | 15–40 | C | Maruyama 2013, Havranek 2007, Martinussen 1996, van Bel 1990 |
| Renal blood flow | **17** mL/kg/min | 11–23 | C | Vieux 2010, Visser 1992 |
| Coeliac (liver + spleen) flow | **20** mL/kg/min | 12–30 | C | El-Khuffash 2008 |

### Shunts

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Ductal shunt flow (L->R) | **22** mL/kg/min | 10–40 | C | Broadhouse 2013 |
| Ductal diameter | **1** mm | 0.8–1.4 | B | Deshpande 2023, Hsu 2019 |
| Foramen ovale shunt (L->R) | **5** mL/kg/min | 0–15 | C | Bischoff 2021 |

### Breathing (nCPAP 5, room air)

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Respiratory rate | **60** /min | 45–80 | A/B | Welty 2018, Liew 2020 |
| Tidal volume | **5** mL/kg | 4.2–6 | B | Liew 2020, Reiterer 1993, Kraaijenga 2015 |
| Minute ventilation | **300** mL/kg/min | 240–380 | B | Liew 2020 |
| Inspiratory time fraction (Ti/Ttot) | **0.38** | 0.33–0.44 | B | Reiterer 1993, Dimitriou 1995 |
| Respiratory system compliance | **1.13** mL/cmH2O | 0.75–1.5 | C | Bhutani 1988, Gerhardt 1980, Stoecklin 2024 |
| Lung compliance (both lungs) | **0.9** mL/cmH2O/kg | 0.6–1.3 | C | Bhutani 1988, Cunningham 1989, Reiterer 1993, Stoecklin 2024 |
| Chest wall compliance | **4.5** mL/cmH2O/kg | 3–6.5 | C | Gerhardt 1980, Stoecklin 2024, Rehan 2001 |
| Respiratory system resistance | **45** cmH2O/L/s | 30–70 | C | Reiterer 1993, Bhutani 1988 |
| Functional residual capacity | **24** mL/kg | 18–30 | B | da Silva 1994 |
| Anatomic dead space | **2.8** mL/kg | 2.2–3.4 | B/C | Numa 1996, Liew 2020 |
| Physiological dead space fraction (Vd/Vt) | **0.6** | 0.5–0.7 | B | Williams 2021 |
| Inspired O2 fraction | **0.21** | 0.21–0.25 | state | Welty 2018 |
| Apnoea / periodic breathing (ref.) | — | — | C | Pre-Vent 2023 |

### Gases and oxygen

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| SpO2 (pre-ductal) | **96** % | 94–98 | B/C | Richard 1993, Sweet 2023 |
| pH | **7.33** | 7.28–7.38 | B | Senterre 2015, Thome 2015 |
| pCO2 | **43** mmHg | 38–50 | B | Thome 2015, Welty 2018 |
| HCO3 | **22.3** mmol/L | 20–24.5 | B | Senterre 2015 |
| Base excess | **-3** mmol/L | -6–-1 | B/C | Senterre 2015, Bonsante 2017 |
| PaO2 | **64** mmHg | 55–75 | C | Granzotto 1991, Quine 2009 |
| Hb-O2 P50 (standard) | **19** mmHg | 18.2–19.8 | B | Granzotto 1991, De Halleux 2002 |
| Mixed venous O2 saturation | **80** % | 74–85 | C | Yapakci 2014 |

### Metabolism and thermal

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Oxygen consumption | **6.5** mL/kg/min | 5.5–7.5 | B | Kjartansson 1992, Bauer 1997, Bauer 2001 |
| Respiratory quotient | **0.92** | 0.85–1 | C | Forsyth 1992, Bauer 2003 |
| Core temperature | **37** degC | 36.5–37.5 | C | Sauer 1984 |
| Incubator air temperature | **34** degC | 33–35 | C | Sauer 1984 |
| Incubator relative humidity | **60** % | 50–70 | C | Adv Neonatal Care 2021, Hammarlund 1983 |
| Insensible water loss (ref.) | **25** mL/kg/day | 15–35 | C | Hammarlund 1983, Hammarlund 1982 |
| Plasma glucose | **5.5** mmol/L | 3.5–8 | B/C | Liu 2026 |
| Lactate | **1.4** mmol/L | 1–2.5 | A/B | Liu 2026, Deshpande 1997 |
| Enteral feed volume (ref.) | **60** mL/kg/day | 40–80 | state | Maruyama 2013 |

### Blood

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Hemoglobin | **15.5** g/dL | 13.5–17.5 | B | Jopling 2009 |
| Hematocrit | **46** % | 40–52 | B | Jopling 2009 |
| Fetal haemoglobin fraction (ref.) | **88** % | 84–92 | C | Granzotto 1991, De Halleux 2002 |
| Blood volume | **80** mL/kg | 75–90 | C | Aladangady 2004, Aladangady 2006 |

### Kidneys

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| GFR | **16** mL/min/1.73m2 | 10–22 | C | Vieux 2010, Bueva 1994, Gallini 2000 |
| Urine output | **3** mL/kg/h | 2–5 | B | Lorenz 1995 |
| Fractional sodium excretion (ref.) | **3** % | 1.5–6 | B/C | Gallini 2000, Lorenz 1995 |
| Plasma creatinine (ref.) | **85** umol/L | 60–110 | B/C | Bueva 1994, Miall 1999 |

## First look at the model (step 5)

`preterm_30wk` as first generated by `scripts/_make_preterm_validated.mjs --profile 30`, before any
calibration. It is the 28-week profile with the 30-week reference values swapped in. Its size-related levers
follow the size rule: each 28-week size correction is divided by 1.5 and moved to the 30-week per-kg target.
The GFR target is applied with `GFR_FACTOR` 0.743 (0.8 mL/min/kg against the engine's Vieux day-7 rule).
Probe: `node scripts/probe_term_reference.mjs preterm_30wk --ref scripts/reference/preterm_30wk.json`.

**55 of 61 variables with a model read-out are in range** (25 wk first look: 52; 28 wk: 29). The
out-of-range ones:

| Variable | Model | Reference | Range | Flag |
|---|---|---|---|---|
| Pulmonary artery pressure, systolic | 35.3 | 29 | 23–35 | HIGH (edge) |
| Pulmonary artery pressure, mean | 26.9 | 19.5 | 15–23 | HIGH |
| LV stroke volume | 1.78 mL/kg | 1.43 | 1.1–1.75 | HIGH (edge) |
| RV end-diastolic volume | 3.13 mL/kg | 2.6 | 2.1–3.1 | HIGH (edge) |
| RV stroke volume | 1.63 mL/kg | 1.30 | 1.05–1.6 | HIGH (edge) |
| Coeliac flow | 33.8 | 20 | 12–30 | HIGH |

**In range but off-centre:**
- outputs run high: LVO 251 vs 215, RVO 229 vs 195, DAo 119 vs 100, SMA 34 vs 28; SvO₂ 83.9 vs 80
- MAP 45.9 sits above the baroreflex set-point 42, so the reflex lowers HR (141 vs 150) and resistance
  (EF_HR 0.94, EF_SVR 0.95)
- pulse pressure 22 vs 27
- brain autoregulation reads 1.42 (constricting) at 180 s; to be judged by a time average

**On target at first look:** the lungs and breathing (Crs 1.12, Rrs 45, FRC 25.5, RR 59, Vt 4.9), the gases
(SpO₂ 95.9 in room air, PaO₂ 66, pH 7.34, pCO₂ 42, BE −2.8), the kidney (GFR 15.5 /1.73 m², urine 2.9),
CBF 25, kidney flow 17, the shunts.

## Recalibrations made from this reference

Each change is a named lever in the 30 wk profile (`scripts/_preterm_profiles.mjs`, generator
`scripts/_make_preterm_validated.mjs --profile 30`). The scenario is regenerated from scratch after each one.

| Step | Change | Effect | Basis |
|---|---|---|---|
| 6.1 | Heart chambers `el_min` ×2.33 → ×2.9 (`HEART_EL_MIN`; the size rule gave 3.5 / 1.5) | LV EDV 2.55 → 2.19, RV EDV 3.13 → 2.84; LV/RV SV 1.78/1.63 → 1.47/1.36; LVO/RVO 251/229 → 221/204; MAP 45.9 → 42.5 with the baroreflex neutral (HR 141 → 151); coeliac 34 → 29; 55 → 60 of 61 in range. Mean PAP stays 26; pulse pressure 22 → 18 | At ×2.33 the heart over-filled and over-pumped, MAP rose above the baroreflex set-point and the reflex lowered HR and SVR. 2.7 / 2.9 / 3.2 were prototyped; 3.2 dropped the outputs below target with the reflex pushing up (SVR effect 1.06) |
| 6.2 | Pulmonary resistances ×1.95 → ×1.25 (`PVR`); artery `el_base` ×3.6 → ×5.5 (`ART_EL`) | PAP 33/26 → 26/20.3; BP 51/33 → 56/30 (MAP 43.2), pulse pressure 18 → 26; ductal flow 23 → 30, PFO 5.1 → 7.1, LVO 221 → 233; SpO₂ 95.5 → 96.8, PaO₂ 63 → 72; baroreflex neutral; 60 → 61 of 61 in range | Mean PAP did not follow the outputs in 6.1, so the resistance itself was high. A lower PA pressure lets more blood cross the restrictive duct. PVR 1.2/1.4/1.6 and ART_EL 4.5/5.5 were prototyped alone and together; PVR 1.4 kept the duct at 28 with mean PAP 21.7 |

## Decisions log (2026-10-19)

All choices were made by the model's author after the evidence was presented.

| Topic | Decision | Basis |
|---|---|---|
| State | nCPAP 5 in room air, no surfactant; small restrictive L→R PDA + PFO; untransfused; advancing feeds + PN | Author's choice; keeps the series comparable (PDA) while moving to a maturer lung |
| Build | A third lever profile (`--profile 30`) in the shared generator; size corrections ÷1.5 from the 28 wk profile | Size rule |
| BP | Elsayed day-3 median extrapolated to 30 wk: 58/31 (42); cuff values as cross-check | Same method as 25/28 wk |
| Flows | LVO/RVO/SVC 215/195/85 kept | Day 1–2 echo below, day 7–10 data above |
| HR | 150 | Falls with GA (Alonzo, Eenkhoorn); between 155 (28 wk) and 142 (MRI) |
| Hb | 15.5 g/dL / Hct 46 | Jopling day-3 29–34 wk group |
| PAP | RV/systemic ratio 0.50 (29 / 19.5) | Series 0.60 → 0.55 → 0.50 (Patel 2019) |
| CVP | 3.5 (1.3–5.7) | Choi 2015; CPAP 5 |
| Brain flow | 25 mL/kg/min (derived) | Same flow per gram as 28 wk; the brain is 12.3 % of body weight |
| Organ flows | DAo ~100; SMA 28 (time-averaged with feeds); coeliac 20; kidneys ~17 | Balance; feeding cycle; GFR |
| Lungs | CL 0.9 /kg, Ccw 4.5 /kg, Crs 1.13 mL/cmH₂O, Rrs ~45, FRC 24 | Mild RDS without surfactant; chest wall stiffens with maturity |
| Breathing | RR 60, Vt 5.0, MV 300, Ti/Ttot 0.38, dead space 2.8, VD/VT 0.60 | Welty 2018 (direct age); series |
| Oxygen | SpO₂ 96 in room air, PaO₂ 64, P50 19.0, HbF 88, SvO₂ 80 | Richard 1993; Granzotto 1991; Fick |
| Acid–base | BE −3, pCO₂ 43 → pH 7.33, HCO₃ 22.3 | Feeds, maturer tubule (Senterre 2015) |
| Metabolism | VO₂ 6.5, RQ 0.92, glucose 5.5, lactate 1.4 | Caffeine and feeds |
| Kidney | GFR 0.8 mL/min/kg (16 /1.73 m²), urine 3, FENa 3 %, creatinine ~85 | Vieux day-7 × 0.77; Bueva; Gallini |
| Environment | incubator 34 °C / 60 % RH, IWL ~25 | Series 36/35/34 °C and 80/70/60 % |

## Open items

- **Full texts that could raise grades:**
  - Alonzo 2018 / Eenkhoorn 2026 heart-rate centiles for 29–31 wk (tables not in the free full text)
  - Lavizzari 2014 (GA 31, <96 h, CPAP 2–6: breathing pattern, CL, RL), not found in PubMed
  - a 29–31 wk day-3 echo cohort for LVO/SVC; Kehrer 2005 day-3 CBF at 28–30 wk
  - Hammarlund 1982/1983 TEWL numbers for the 28–30 wk group
- **Model implications to check in the first look:**
  - kidney: the engine's renal reference rests at 1.08 mL/min/kg (Vieux day 7) against the 0.8 target
  - lungs: SpO₂ 96 in room air needs a smaller intrapulmonary shunt than at 25/28 wk
  - the size rule (÷1.5) for heart, arteries, lungs, airways and beds

## Sources

- **Abdel-Hady 2008**: Abdel-Hady H et al. Hemodynamic changes during weaning from nasal CPAP. Pediatrics 2008;122:e1086-90. doi:10.1542/peds.2008-1193; PMID 18977958
- **Adv Neonatal Care 2021**: Systematic review of incubator humidity in preterm infants. Adv Neonatal Care 2021. doi:10.1097/ANC.0000000000000791; PMID 33009156
- **Aladangady 2004**: Aladangady N et al. Arch Dis Child Fetal Neonatal Ed 2004;89:F344-7. doi:10.1136/adc.2003.039008; PMID 15210672
- **Aladangady 2006**: Aladangady N et al. Infants' blood volume in a controlled trial of placental transfusion at preterm delivery. Pediatrics 2006;117:93-8. doi:10.1542/peds.2004-1773; PMID 16396865
- **Alonzo 2018**: Alonzo CJ et al. Heart rate ranges in premature neonates using high resolution physiologic data. J Perinatol 2018;38:1242-5. doi:10.1038/s41372-018-0156-1; PMID 29925866
- **Bauer 1997**: Bauer K et al. Body temperatures and oxygen consumption during skin-to-skin care. J Pediatr 1997;130:240-4. doi:10.1016/s0022-3476(97)70349-4; PMID 9042126
- **Bauer 2001**: Bauer J et al. Effect of caffeine on oxygen consumption in VLBW infants. Pediatrics 2001;107:660-3. doi:10.1542/peds.107.4.660; PMID 11335740
- **Bauer 2003**: Bauer J et al. Longitudinal evaluation of energy expenditure in preterm infants <1000 g. Br J Nutr 2003;89:533-7. doi:10.1079/BJN2002816; PMID 12654172
- **Bhutani 1988**: Bhutani VK et al. Pediatr Pulmonol 1988;4:150-8. doi:10.1002/ppul.1950040306; PMID 3374983
- **Bischoff 2021**: Bischoff AR et al. Assessment of superior vena cava flow and cardiac output in different patterns of PDA shunt. Echocardiography 2021;38:1524-33. doi:10.1111/echo.15163; PMID 34309068
- **Bonsante 2017**: Bonsante F et al. Early optimal parenteral nutrition and metabolic acidosis in very preterm infants. PLoS One 2017;12:e0186936. doi:10.1371/journal.pone.0186936; PMID 29176758
- **Broadhouse 2013**: Broadhouse KM et al. Assessment of PDA shunt and systemic blood flow in newborns using cardiac MRI. NMR Biomed 2013;26:1135-41. doi:10.1002/nbm.2927; PMID 23412748
- **Bueva 1994**: Bueva A, Guignard JP. Renal function in preterm neonates. Pediatr Res 1994;36:572-7. doi:10.1203/00006450-199411000-00005; PMID 7877873
- **Cappelleri 2019**: Cappelleri A et al. Myocardial function in late preterm infants during the transitional period. Cardiol Young 2020;30:249-55. doi:10.1017/S1047951119003020; PMID 31845639
- **Choi 2015**: Choi YS et al. Central venous pressure and renal function in very low birth weight infants during the early neonatal period. J Matern Fetal Neonatal Med 2015. doi:10.3109/14767058.2014.1002766; PMID 25612465
- **Cunningham 1989**: Cunningham MD. J Perinatol 1989;9:56-9. PMID 2709153
- **da Silva 1994**: da Silva WJ, Abbasi S, Pereira G, Bhutani VK. Role of PEEP in preterm infants with RDS: FRC. Pediatr Pulmonol 1994;18:89-92. doi:10.1002/ppul.1950180206; PMID 7970924
- **De Halleux 2002**: De Halleux V et al. Effect of transfusion on the Hb-O2 dissociation curve of very early preterm infants. Semin Perinatol 2002;26:411-5. doi:10.1053/sper.2002.37313; PMID 12537312
- **Deshpande 1997**: Deshpande SA, Platt MP. Association between blood lactate and acid-base status and mortality in ventilated babies. Arch Dis Child Fetal Neonatal Ed 1997;76:F15-20. doi:10.1136/fn.76.1.f15; PMID 9059180
- **Deshpande 2023**: Deshpande P et al. Cerebral oxygenation, cardiac output and blood pressure during transition in extremely low gestational age neonates. Front Pediatr 2023;11:1187769. doi:10.3389/fped.2023.1187769; PMID 37654688
- **Dimitriou 1995**: Dimitriou G, Greenough A, Chan V. Early Hum Dev 1995;41:61-8. doi:10.1016/0378-3782(94)01609-s; PMID 7781569
- **Dobbing 1978**: Dobbing J, Sands J. Head circumference, biparietal diameter and brain growth in fetal and postnatal life. Early Hum Dev 1978;2:81-7. doi:10.1016/0378-3782(78)90054-3; PMID 569046
- **Eenkhoorn 2026**: Eenkhoorn C et al. Reference values for heart rate frequency and variability in premature neonates during the first week of life. J Perinat Med 2026;54:778-87. doi:10.1515/jpm-2025-0439; PMID 41612747
- **El-Khuffash 2008**: El-Khuffash A et al. Coeliac flow / LVO ratio and the haemodynamically significant PDA. Neonatology 2008;93:206-12. doi:10.1159/000110869; PMID 17992021
- **Elsayed 2023**: Elsayed Y, Ahmed F. Blood pressure normative values in preterm infants during postnatal transition. Pediatr Res 2024;95:698-704. doi:10.1038/s41390-023-02788-8; PMID 37667035
- **Ficial 2013**: Ficial B et al. Validation of echocardiographic measurements of systemic blood flow volume in newborn infants. J Am Soc Echocardiogr 2013;26:1365-71. doi:10.1016/j.echo.2013.08.019; PMID 24075229
- **Forsyth 1992**: Forsyth JS, Crighton A. Arch Dis Child 1992;67:315-9. doi:10.1136/adc.67.3.315; PMID 1575556
- **Gallini 2000**: Gallini F et al. Progression of renal function in preterm neonates with gestational age <= 32 weeks. Pediatr Nephrol 2000;15:119-24. doi:10.1007/s004670000356; PMID 11095027
- **Gerhardt 1980**: Gerhardt T, Bancalari E. Chestwall compliance in full-term and premature infants. Acta Paediatr Scand 1980;69:359-64. doi:10.1111/j.1651-2227.1980.tb07093.x; PMID 7376862
- **Ghandi 2018**: Ghandi Y et al. Reference values of longitudinal systolic right and left ventricular function by M-mode echocardiography in healthy preterm and term neonates. J Cardiovasc Echogr 2018;28:177-81. doi:10.4103/jcecho.jcecho_31_18; PMID 30306022
- **Granzotto 1991**: Granzotto J et al. Oxygen transport in newborns at different gestational ages. J Perinat Med 1991;19:477-83. doi:10.1515/jpme.1991.19.6.477; PMID 1726111
- **Greisen 1986**: Greisen G. Cerebral blood flow in preterm infants during the first week of life. Acta Paediatr Scand 1986;75:43-51. doi:10.1111/j.1651-2227.1986.tb10155.x; PMID 2420149
- **Groves 2011**: Groves AM et al. Functional cardiac MRI in preterm and term newborns. Arch Dis Child Fetal Neonatal Ed 2011;96:F86-91. doi:10.1136/adc.2010.189142; PMID 20971721
- **Guan 2026**: Guan et al. Blood pressure changes in preterm infants of 28 to <37 weeks within 7 days after birth. Front Pediatr 2026. doi:10.3389/fped.2026.1757399; PMID 41878454
- **Hammarlund 1982**: Hammarlund K, Sedin G, Stromberg B. Transepidermal water loss in newborn infants VII: relation to post-natal age in very pre-term and full-term infants. Acta Paediatr Scand 1982;71:369-74. doi:10.1111/j.1651-2227.1982.tb09436.x; PMID 7136649
- **Hammarlund 1983**: Hammarlund K, Sedin G, Stromberg B. Transepidermal water loss in newborn infants VIII: relation to gestational age and post-natal age. Acta Paediatr Scand 1983;72:721-8. doi:10.1111/j.1651-2227.1983.tb09801.x; PMID 6637471
- **Havranek 2007**: Havranek T et al. Nasal CPAP affects pre- and postprandial intestinal blood flow velocity in preterm infants. J Perinatol 2007;27:704-8. doi:10.1038/sj.jp.7211808; PMID 17703183
- **Hsu 2019**: Hsu KH et al. Effects of PDA on organ blood flow in infants born very preterm. J Pediatr 2019;216:95-100. doi:10.1016/j.jpeds.2019.08.057; PMID 31610928
- **James 2015**: James AT et al. Clinical utility of right ventricular fractional area change in preterm infants. Early Hum Dev 2015;92:19-23. doi:10.1016/j.earlhumdev.2015.10.015; PMID 26619069
- **Jopling 2009**: Jopling J et al. Reference ranges for hematocrit and blood hemoglobin concentration during the neonatal period. Pediatrics 2009;123:e333-7. doi:10.1542/peds.2008-2654; PMID 19171584
- **Kehrer 2003**: Kehrer M et al. The development of cerebral perfusion in healthy preterm and term neonates. Neuropediatrics 2003;34:281-6. doi:10.1055/s-2003-44663; PMID 14681752
- **Kjartansson 1992**: Kjartansson S, Hammarlund K, Riesenfeld T, Sedin G. Respiratory water loss and oxygen consumption in newborn infants during phototherapy. Acta Paediatr 1992;81:769-73. doi:10.1111/j.1651-2227.1992.tb12100.x; PMID 1421880
- **Kluckow 2000**: Kluckow M, Evans N. Superior vena cava flow in newborn infants: a novel marker of systemic blood flow. Arch Dis Child Fetal Neonatal Ed 2000;82:F182-7. doi:10.1136/fn.82.3.f182; PMID 10794783
- **Koestenberger 2011**: Koestenberger M et al. Systolic right ventricular function in preterm and term neonates: TAPSE reference values. Neonatology 2011;100:85-92. doi:10.1159/000322006; PMID 21273793
- **Kraaijenga 2015**: Kraaijenga JV et al. Effect of caffeine on diaphragmatic activity and tidal volume. J Pediatr 2015;167:70-5. doi:10.1016/j.jpeds.2015.04.040; PMID 25982138
- **Levy 2015**: Levy PT et al. Right ventricular function in preterm and term neonates: RV areas and fractional area change. J Am Soc Echocardiogr 2015;28:559-69. doi:10.1016/j.echo.2015.01.024; PMID 25753503
- **Liew 2020**: Liew Z et al. Physiological effects of high-flow nasal cannula vs CPAP in preterm infants. Arch Dis Child Fetal Neonatal Ed 2020;105:87-93. doi:10.1136/archdischild-2018-316773; PMID 31123057
- **Liu 2026**: Liu et al. REACT substudy: glucose and lactate in very preterm infants. Arch Dis Child Fetal Neonatal Ed 2026;111:F196-202. doi:10.1136/archdischild-2025-328701; PMID 41087081
- **Lorenz 1995**: Lorenz JM et al. Phases of fluid and electrolyte homeostasis in the extremely low birth weight infant. Pediatrics 1995;96:484-9. PMID 7651782
- **Martinussen 1996**: Martinussen M et al. Mesenteric blood flow velocity in preterm infants. Pediatr Res 1996;39:275-80. doi:10.1203/00006450-199602000-00015; PMID 8825800
- **Maruyama 2013**: Maruyama K et al. Feeding interval and postprandial intestinal blood flow in premature infants. Pediatr Int 2013;55:472-6. doi:10.1111/ped.12106; PMID 23566051
- **Miall 1999**: Miall LS et al. Plasma creatinine rises dramatically in the first 48 hours of life in preterm infants. Pediatrics 1999;104:e76. doi:10.1542/peds.104.6.e76; PMID 10586010
- **Numa 1996**: Numa AH, Newth CJ. Anatomic dead space in infants and children. J Appl Physiol 1996;80:1485-9. doi:10.1152/jappl.1996.80.5.1485; PMID 8727530
- **Patel 2019**: Patel MD et al. Echocardiographic assessment of right ventricular afterload in preterm infants. J Am Soc Echocardiogr 2019;32:884-94. doi:10.1016/j.echo.2019.03.015; PMID 31272593
- **Pre-Vent 2023**: Weese-Mayer DE et al. (Pre-Vent). Pediatr Res 2023. doi:10.1038/s41390-023-02839-0; PMID 37857848
- **Pryds 1989**: Pryds O, Greisen G. Effect of PaCO2 and haemoglobin concentration on day to day variation of CBF in preterm neonates. Acta Paediatr Scand Suppl 1989;360:33-6. doi:10.1111/j.1651-2227.1989.tb11279.x; PMID 2518395
- **Quine 2009**: Quine D, Stenson BJ. Arterial oxygen tension values in infants <29 weeks of gestation at currently targeted saturations. Arch Dis Child Fetal Neonatal Ed 2009;94:F51-3. doi:10.1136/adc.2007.135285; PMID 18285372
- **Rehan 2001**: Rehan VK et al. Diaphragm dimensions of the healthy preterm infant. Pediatrics 2001;108:e91. doi:10.1542/peds.108.5.e91; PMID 11694675
- **Reiterer 1993**: Reiterer F, Sivieri E, Abbasi S, Bhutani VK. Pediatr Pulmonol 1993;15:117-21. doi:10.1002/ppul.1950150209; PMID 8474783
- **Richard 1993**: Richard D, Poets CF et al. Arterial oxygen saturation in preterm neonates without respiratory failure. J Pediatr 1993;123:963-8. doi:10.1016/s0022-3476(05)80395-6; PMID 8229531
- **Sauer 1984**: Sauer PJ, Dane HJ, Visser HK. New standards for neutral thermal environment of healthy very low birthweight infants in week one of life. Arch Dis Child 1984;59:18-22. doi:10.1136/adc.59.1.18; PMID 6696489
- **Schwarz 2022**: Schwarz CE et al. Agreement of cardiac output estimates between electrical cardiometry and transthoracic echocardiography in very preterm infants. Neonatology 2022;119:594-601. doi:10.1159/000525755; PMID 35896077
- **Senterre 2015**: Senterre T et al. Electrolyte and mineral homeostasis after optimizing early macronutrient intakes in VLBW infants on parenteral nutrition. J Pediatr Gastroenterol Nutr 2015;61:491-8. doi:10.1097/MPG.0000000000000854; PMID 25988555
- **Skinner 1991**: Skinner JR et al. Non-invasive assessment of pulmonary arterial pressure in healthy neonates. Arch Dis Child 1991;66:386-90. doi:10.1136/adc.66.4_spec_no.386; PMID 2025029
- **Skinner 1992**: Skinner JR et al. Pulmonary and systemic arterial pressure in hyaline membrane disease. Arch Dis Child 1992;67:366-73. doi:10.1136/adc.67.4_spec_no.366; PMID 1586172
- **Sloot 2010**: Sloot SC et al. Central blood flow measurements in stable preterm infants after the transitional period. Arch Dis Child Fetal Neonatal Ed 2010;95:F369-72. doi:10.1136/adc.2009.169169; PMID 20530103
- **Stoecklin 2024**: Stoecklin B et al. Respiratory and chest wall mechanics in very preterm infants. J Appl Physiol 2024;136:1499-1506. doi:10.1152/japplphysiol.00561.2023; PMID 38634505
- **Sweet 2023**: Sweet DG et al. European Consensus Guidelines on the Management of RDS: 2022 Update. Neonatology 2023;120:3-23. doi:10.1159/000528914; PMID 36863329
- **Thome 2015**: Thome UH et al. (PHELBI). Lancet Respir Med 2015;3:534-43. doi:10.1016/S2213-2600(15)00204-0; PMID 26088180
- **Toyoshima 2024**: Toyoshima K et al. Biventricular function in preterm infants with PDA ligation: a 3D echocardiographic study. Pediatr Res 2024. doi:10.1038/s41390-024-03180-w; PMID 38615076
- **Trevor Inglis 2007**: Trevor Inglis GD, Dunster KR, Davies MW. Establishing normal values of central venous pressure in very low birth weight infants. Physiol Meas 2007;28:1283-91. doi:10.1088/0967-3334/28/10/012; PMID 17906394
- **van Bel 1990**: van Bel F et al. Superior mesenteric artery blood flow velocity and estimated volume flow: duplex Doppler US. Radiology 1990;174:165-9. doi:10.1148/radiology.174.1.2403678; PMID 2403678
- **van Zadelhoff 2023**: van Zadelhoff AC et al. Age-dependent changes in arterial blood pressure in neonates during the first week of life. Br J Anaesth 2023;130:585-94. doi:10.1016/j.bja.2023.01.024; PMID 36858885
- **Vieux 2010**: Vieux R et al. Glomerular filtration rate reference values in very preterm infants. Pediatrics 2010;125:e1186-92. doi:10.1542/peds.2009-1426; PMID 20368313
- **Visser 1992**: Visser MO et al. Renal blood flow in neonates: quantification with color flow and pulsed Doppler US. Radiology 1992;183:441-4. doi:10.1148/radiology.183.2.1561347; PMID 1561347
- **Welty 2018**: Welty SE et al. PLoS One 2018;13:e0193807 (bubble CPAP, 29.6 wk, 44 h). doi:10.1371/journal.pone.0193807; PMID 29590143
- **Williams 2021**: Williams E et al. Pediatr Res 2021 (volumetric capnography, ventilated RDS day 3). doi:10.1038/s41390-021-01388-8; PMID 33603211
- **Yapakci 2014**: Yapakci E et al. IVC oxygen saturation in the first 3 postnatal days in preterms. Balkan Med J 2014;31:230-4. doi:10.5152/balkanmedj.2014.13197; PMID 25337418
