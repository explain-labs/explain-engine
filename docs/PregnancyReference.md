# Pregnancy at 36 weeks: reference values

Reference values for validating `adult_female_pregnant_36wk`: the calibrated non-pregnant `adult_female`
([AdultFemaleReference](./AdultFemaleReference.md)) at 36 weeks of a healthy singleton pregnancy, lying **left lateral**
(no aortocaval compression; the engine has no model of it). The fetus is represented only as an O2 sink in the placenta.
Compiled 2026-11-27 from a PubMed search.

The machine-readable version is [`scripts/reference/adult_female_pregnant_36wk.json`](../scripts/reference/adult_female_pregnant_36wk.json),
built by `scripts/reference/_build_adult_female_pregnant_36wk_reference.py` and read by
`scripts/probe_term_reference.mjs --ref scripts/reference/adult_female_pregnant_36wk.json`. Per-kg values use the
pregnancy weight, 71 kg.

**Rule** ([derived scenarios](./TermTransitionReference.md)): each target is the non-pregnant reference (or model value,
where noted) x the change measured **within one longitudinal study**, pre-pregnancy or early pregnancy -> ~36 weeks.
Absolute values from other cohorts are cross-checks only; absolute targets only where she has no counterpart
(uteroplacental flow, fetal + placental O2 use).

## Decisions (user, 2026-11-27)

- **Separate scenario** at **36 weeks**, **left lateral**, fetus = **O2 sink** (no fetal circulation).
- **Haemodynamics from recent non-invasive data (option B):** cardiac output x1.31 at the early third-trimester peak
  (Meah 2016, meta-analysis of 39 studies) -> 7.1 L/min; heart rate +13 bpm (Mahendru 2014, pre-conception -> 33 wk,
  n = 54) -> 78; stroke volume follows (~91 mL). Clark 1989 (invasive, left lateral, n = 10; CO x1.43, HR x1.17) is kept
  as a cross-check and for the pressures only invasive studies give (CVP, wedge, PVR, colloid osmotic pressure).
- **Weight 71 kg** (60 + IOM 2009 normal-BMI gain at 36 weeks, 0.42 kg/week).
- **Hb 12.2 g/dL with iron supplementation** (red cell mass +349 mL, Taylor & Lind 1979; plasma x1.456, de Haas 2017).
- **GFR x1.28** (inulin, Saxena 2012), absolute ~134 mL/min, not indexed to 1.73 m2.
- **PaCO2 ~32** (third-trimester plateau in reviews; Spatling's -4 is alveolar and early).
- **Uterine blood flow ~700 mL/min** (Flo 2010 673 near term; Metcalfe 492; Konje 970).

## Caveats

- Clark 1989's numbers came via a reproduction of its table; the abstract confirms each direction.
- The non-invasive devices disagree in absolute value (NICOM ~30 % above echo), so only within-study changes are used.
- Blood volume and Hb combine two studies (plasma meta-analysis + red cell mass), breaking the one-study rule.
- Cardiac output plateaus or falls slightly after ~35 weeks (Perry 2019): 36 weeks sits near the peak.
- LV end-diastolic volume x1.29 comes from a CMR study whose output rise (+85 %) is an outlier against option B; expect
  the model's EDV lower.
- Several respiratory and metabolic values are review-level (pH, HCO3, temperature, chest-wall compliance).



## Hemodynamics, heart and flows

| Variable | Unit | Reference | Range | Method, cohort, n | Grade | Source | Notes |
|---|---|---|---|---|---|---|---|
| Heart rate (`hr`) | bpm | 78 | 65–95 | non-invasive, pre-conception -> 33 wk; 36 wk gestation, left lateral | B | Mahendru AA et al (PMID 24406777); Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: +13 +/- 11 bpm (Mahendru 2014, n=54). Base 65 (user decision). Clark 1989 invasive x1.17 (76) as a cross-check; other studies x1.26-1.29. |
| Cardiac output (`lvo`) | mL/kg/min | 99.6 | 79.7–119.6 | meta-analysis of echo / impedance / rebreathing; 36 wk gestation, left lateral | A/B | Meah VL et al (PMID 26794234); Mahendru AA et al (PMID 24406777); Perry H et al (PMID 30548496); Clark SL et al | Change: x1.31 at the early 3rd-trimester peak (Meah 2016, 39 studies). 7.07 L/min (base 5.4, user decision). Plateau/slight fall after ~35 wk (Perry 2019 NICOM). Clark invasive x1.43 (7.7 L/min) cross-check. |
| Right ventricular output (`rvo`) | mL/kg/min | 99.6 | 79.7–119.6 | 36 wk gestation, left lateral | A/B | Meah VL et al (PMID 26794234) |  |
| LV stroke volume (`lv_sv`) | mL/kg | 1.28 |  | derived CO / HR; 36 wk gestation, left lateral | B (derived) | Meah VL et al (PMID 26794234); Mahendru AA et al (PMID 24406777) | Change: x1.09 (derived). 91 mL. |
| LV end-diastolic volume (`lv_edv`) | mL/kg | 2.31 |  | CMR ~34 wk vs postpartum; 36 wk gestation, left lateral | B | Ducas RA et al | Change: x1.29 (Ducas 2014). Reference only in spirit: Ducas's CO rise (+85 %) is an outlier against option B; expect the model's EDV lower. |
| Mean arterial pressure (true mean) (`map_mean`) | mmHg | 82 | 70–94 | intra-arterial (Clark); pre-conception cohort recovering by the 3rd trimester; 36 wk gestation, left lateral | B | Clark SL et al; Mahendru AA et al (PMID 24406777); Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: x1.00.  |
| Diastolic BP (`dbp`) | mmHg | 62 | 50–78 | seated cuff, pre-pregnancy cohort (n=570); 36 wk gestation, left lateral | B | Wang et al | Change: x0.96.  |
| Systemic vascular resistance (`svr`) | WU | 11 |  | derived (MAP - CVP)/CO; 36 wk gestation, left lateral | C (derived) | Clark SL et al; Meah VL et al (PMID 26794234) | Change: ~x0.76 (Clark reports x0.79).  |
| Central venous pressure (`cvp`) | mmHg | 4 | 2–7 | PA catheter, left lateral (n=10); 36 wk gestation, left lateral | B | Clark SL et al; Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: x1.00.  |
| Pulmonary artery wedge pressure (`pawp`) | mmHg | 10.1 | —–13 | PA catheter; 36 wk gestation, left lateral | B | Clark SL et al; Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: x1.00.  |
| Pulmonary vascular resistance (`pvr`) | WU | 0.57 |  | PA catheter; 36 wk gestation, left lateral | B | Clark SL et al; Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: x0.66.  |
| Mean PAP (`pap_m`) | mmHg | 12.8 | —–20 | PA catheter (derived unchanged); 36 wk gestation, left lateral | C | Clark SL et al; Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: ~x1.0.  |
| Renal blood flow (`renal`) | mL/kg/min | 16.2 | 15–17.4 | effective renal plasma flow, 3rd trimester; 36 wk gestation, left lateral | C | Dunlop W | Change: ~x1.25-1.45. ~1150 mL/min. |

## Breathing

| Variable | Unit | Reference | Range | Method, cohort, n | Grade | Source | Notes |
|---|---|---|---|---|---|---|---|
| Minute ventilation (`mv`) | mL/kg/min | 107.6 |  | (model base 5.7 L/min); 36 wk gestation, left lateral | B | Spatling L et al (PMID 1515406) | Change: x1.34. 7.6 L/min. |
| Tidal volume (`vt`) | mL/kg | 6.8 |  | (model base 380 mL); 36 wk gestation, left lateral | B | Spatling L et al (PMID 1515406) | Change: x1.27. 483 mL. |
| Respiratory rate (`rr`) | /min | 15 | 12–20 | 36 wk gestation, left lateral | B | Spatling L et al (PMID 1515406) | Change: unchanged.  |
| FRC (`frc`) | mL/kg | 26.7 |  | (model base 2.3 L); 36 wk gestation, left lateral | B/C | Craig DB, Toole MA; Gee JB et al | Change: x0.80-0.85. ~1.9 L. |
| Respiratory system compliance (`crs`) | mL/cmH2O | 81 |  | lung unchanged, chest wall lower; 36 wk gestation, left lateral | C | Gee JB et al | Change: ~x0.9.  |
| Respiratory resistance (`rrs`) | cmH2O/L/s | 1.6 |  | total pulmonary resistance; 36 wk gestation, left lateral | B | Gee JB et al | Change: x0.5.  |

## Gases and saturations

| Variable | Unit | Reference | Range | Method, cohort, n | Grade | Source | Notes |
|---|---|---|---|---|---|---|---|
| PaCO2 (`pco2`) | mmHg | 32 | 30–34 | 36 wk gestation, left lateral | B/C | Spatling L et al (PMID 1515406); Textbook / review; not checked against a retrieved source | Change: -5.5 (Spatling alveolar -4). User decision ~32. |
| Arterial pH (`ph`) | - | 7.44 | 7.4–7.47 | 36 wk gestation, left lateral | C | Textbook / review; not checked against a retrieved source | Change: compensated respiratory alkalosis.  |
| Bicarbonate (`hco3`) | mmol/L | 21 | 19–23 | 36 wk gestation, left lateral | C | Textbook / review; not checked against a retrieved source | Change: -3.  |
| PaO2 (`po2`) | mmHg | 100 | 85–110 | semi-recumbent, left lateral tilt; 36 wk gestation, left lateral | B | Templeton A, Kelman GR (PMID 10937) | Change: A-a unchanged.  |
| SpO2 (`spo2`) | % | 98 | 96–100 | 36 wk gestation, left lateral | C | Textbook / review; not checked against a retrieved source |  |

## Metabolism

| Variable | Unit | Reference | Range | Method, cohort, n | Grade | Source | Notes |
|---|---|---|---|---|---|---|---|
| Whole-body O2 consumption (maternal + uteroplacental) (`vo2`) | mL/kg/min | 3.41 |  | calorimetry, pre-pregnancy -> 3rd trimester (n=34); 36 wk gestation, left lateral | A | Butte NF et al (PMID 15159239); Forsum E et al; Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: BMR x1.26 (Forsum x1.30). 242 mL/min at 71 kg. |
| Respiratory quotient (`rq`) | - | 0.82 |  | 36 wk gestation, left lateral | B | Spatling L et al (PMID 1515406) | Change: unchanged.  |
| Core temperature (`temp`) | degC | 36.8 | 36.3–37.5 | 36 wk gestation, left lateral | C | Hartgill TW et al | Change: falls slightly.  |
| Fasting glucose (`glucose`) | mmol/L | 4.7 | 3.9–5.1 | from 6 wk (n=361); 36 wk gestation, left lateral | B | Mills JL et al (PMID 9751245); Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: -0.2.  |
| Arterial lactate (`lactate`) | mmol/L | 1 | 0.5–2.2 | 36 wk gestation, left lateral | C | Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: unchanged (non-fasting x1.26 weak).  |

## Blood and kidneys

| Variable | Unit | Reference | Range | Method, cohort, n | Grade | Source | Notes |
|---|---|---|---|---|---|---|---|
| Blood volume (`blood_volume`) | mL/kg | 72.7 |  | plasma x1.456 (meta-analysis) + red cells +349 mL (36 wk, iron); 36 wk gestation, left lateral | B | de Haas S et al; Taylor DJ, Lind T; Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: x1.37 (derived). 5.16 L. Two studies combined (breaks the one-study rule). |
| Haemoglobin (`hb`) | g/dL | 12.2 | 11–13.5 | red cell mass / blood volume; 36 wk gestation, left lateral | B/C | Taylor DJ, Lind T; de Haas S et al; Murphy MM et al | Change: x0.90 (with iron; x0.85 without). User decision: with iron. Murphy 2002 Hct only -4 % (conflict noted). |
| Haematocrit (`hct`) | % | 36 | 33–40 | 36 wk gestation, left lateral | B/C | Taylor DJ, Lind T; de Haas S et al | Change: x0.90.  |
| Albumin (`albumin`) | g/L | 37.2 | 32–42 | pre-pregnancy -> 32 wk (n=93); 36 wk gestation, left lateral | B | Murphy MM et al; Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: x0.866. Colloid osmotic pressure x0.86 (Clark): ~21.5 mmHg. |
| Sodium (`na`) | mmol/L | 136 | 132–140 | plasma osmolality -10 mOsm/kg; 36 wk gestation, left lateral | C | Davison JM et al | Change: -4.  |
| GFR (absolute, not indexed) (`gfr_abs`) | mL/min | 134 | 121–158 | inulin clearance, 34 wk vs postpartum (n=12); 36 wk gestation, left lateral | B | Saxena AR et al; Dunlop W; Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: x1.28 (Dunlop x1.5). User decision x1.28. Pregnancy GFR is not indexed to 1.73 m2. |

## Uterus

| Variable | Unit | Reference | Range | Method, cohort, n | Grade | Source | Notes |
|---|---|---|---|---|---|---|---|
| Uterine blood flow (`ut_flow`) | mL/min | 700 | 500–970 | Doppler volume flow near term; 36 wk gestation, left lateral | B/C | Flo K et al; Konje JC et al; Metcalfe J et al | Change: ~10 % of CO. User decision 700. Flo 673 near term (11-12 % of CO), Metcalfe 492, Konje 970. |
| Placental (intervillous) flow (`pl_flow`) | mL/min | 600 |  | textbook ~80-90 % of uterine flow; 36 wk gestation, left lateral | C | Textbook / review; not checked against a retrieved source |  |
| Uterine artery pulsatility index (`ut_pi`) | - | 0.69 |  | Doppler reference curve at 36 wk; 36 wk gestation, left lateral | A/B | Gomez O et al | Non-pregnant model 2.66. |
| Uterus + placenta + fetus O2 consumption (`uteroplacental_vo2`) | mL O2/min | 22 | 18–26 | fetus 2.8 kg x 6.6 mL/kg/min + placenta ~5 (in vitro ~10 mL/min/kg); Metcalfe 24.5 at term; 36 wk gestation, left lateral | B | Acharya G, Sitras V; Challier JC et al; Metcalfe J et al | Change: absolute. The fetus is an O2 sink (user decision). |

## Shunts

| Variable | Unit | Reference | Range | Method, cohort, n | Grade | Source | Notes |
|---|---|---|---|---|---|---|---|

## Sources

- **meah2016**: Meah VL et al. Cardiac output and related haemodynamics during pregnancy: a series of meta-analyses. Heart 2016;102:518-26 (doi:10.1136/heartjnl-2015-308476, PMID 26794234)
- **mahendru2014**: Mahendru AA et al. A longitudinal study of maternal cardiovascular function from preconception to the postpartum period. J Hypertens 2014;32:849-56 (doi:10.1097/HJH.0000000000000090, PMID 24406777)
- **perry2019**: Perry H et al. NICOM device-specific reference ranges in pregnancy. Ultrasound Obstet Gynecol 2019;54:670-5 (doi:10.1002/uog.20179, PMID 30548496)
- **clark1989**: Clark SL et al. Central hemodynamic assessment of normal term pregnancy. Am J Obstet Gynecol 1989;161:1439-42 (values via a GLOWM table reproduction) (doi:10.1016/0002-9378(89)90900-9)
- **wang2013**: Wang et al. Blood pressure from pre-pregnancy through pregnancy (n=570, seated cuff). 2013
- **ducas2014**: Ducas RA et al. Cardiovascular magnetic resonance in pregnancy: insights from the cardiac hemodynamic imaging and remodeling in pregnancy (CHIRP) study. J Cardiovasc Magn Reson 2014;16:1 (doi:10.1186/1532-429X-16-1)
- **dehaas2017**: de Haas S et al. Physiological adaptation of maternal plasma volume during pregnancy: a systematic review and meta-analysis. Ultrasound Obstet Gynecol 2017;49:177-87 (doi:10.1002/uog.17360)
- **taylor1979**: Taylor DJ, Lind T. Red cell mass during and after normal pregnancy. Br J Obstet Gynaecol 1979;86:364-70 (doi:10.1111/j.1471-0528.1979.tb10611.x)
- **murphy2002**: Murphy MM et al. Plasma albumin and haematocrit from pre-pregnancy to 32 wk. Am J Clin Nutr 2002;76:614-9 (doi:10.1093/ajcn/76.3.614)
- **davison1981**: Davison JM et al. Serial changes in plasma osmolality during pregnancy. Br J Obstet Gynaecol 1981 (doi:10.1111/j.1471-0528.1981.tb01019.x)
- **saxena2012**: Saxena AR et al. Inulin GFR in normal pregnancy (34 wk vs postpartum). Hypertens Pregnancy 2012 (doi:10.3109/10641955.2010.507845)
- **dunlop1981**: Dunlop W. Serial changes in renal haemodynamics during normal human pregnancy. Br J Obstet Gynaecol 1981;88:1-9 (doi:10.1111/j.1471-0528.1981.tb00929.x)
- **iom2009**: Institute of Medicine. Weight Gain During Pregnancy: Reexamining the Guidelines. 2009
- **flo2010**: Flo K et al. A longitudinal study of the relationship between maternal cardiac output and uterine artery blood flow. BJOG 2010;117:837-44 (doi:10.1111/j.1471-0528.2010.02548.x)
- **konje2001**: Konje JC et al. Longitudinal quantification of uterine artery blood volume flow changes during gestation. 2001
- **metcalfe1955**: Metcalfe J et al. Estimation of uterine blood flow in normal human pregnancy at term. J Clin Invest 1955
- **gomez2008**: Gomez O et al. Reference ranges for uterine artery mean pulsatility index at 11-41 weeks. Ultrasound Obstet Gynecol 2008;32:128-32 (doi:10.1002/uog.5315)
- **butte2004**: Butte NF et al. Energy requirements during pregnancy based on total energy expenditure and energy deposition (calorimetry, n=34). Am J Clin Nutr 2004 (PMID 15159239)
- **forsum1992**: Forsum E et al. Energy metabolism in pregnancy (longitudinal). 1992
- **acharya2009**: Acharya G, Sitras V. Oxygen uptake of the human fetus at term. Acta Obstet Gynecol Scand 2009
- **challier1976**: Challier JC et al. Placental oxygen consumption in vitro. 1976
- **spatling1992**: Spatling L et al. The variability of cardiopulmonary adaptation to pregnancy at rest and during exercise (n=20). Br J Obstet Gynaecol 1992 (PMID 1515406)
- **templeton1976**: Templeton A, Kelman GR. Maternal blood-gases, PAO2-PaO2, physiological shunt and VD/VT in normal pregnancy. Br J Anaesth 1976 (PMID 10937)
- **jensen2005**: Jensen D et al. Mechanisms of ventilatory response to CO2 in pregnancy. 2005 (PMID 15677521)
- **craig1975**: Craig DB, Toole MA. Airway closure in pregnancy (FRC, n=24). Can Anaesth Soc J 1975
- **gee1967**: Gee JB et al. Pulmonary mechanics during pregnancy (n=10). J Clin Invest 1967
- **mills1998**: Mills JL et al. Physiological reduction in fasting plasma glucose concentration in the first trimester (n=361). 1998 (PMID 9751245)
- **hartgill2011**: Hartgill TW et al. Core body temperature and the thermoneutral zone in pregnancy. 2011
- **adult_female**: Calibrated non-pregnant adult_female reference (scripts/reference/adult_female.json, docs/AdultFemaleReference.md)
- **textbook**: Textbook / review; not checked against a retrieved source

## Open items

- Built step by step; see the scenario section once written.
