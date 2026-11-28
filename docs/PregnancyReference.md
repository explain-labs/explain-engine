# Pregnancy at 24, 30 and 36 weeks: reference values

Reference values for validating `adult_female_pregnant_36wk` (the tables below) `adult_female_pregnant_30wk` ([30 weeks](#30-weeks)) and `adult_female_pregnant_24wk` ([24 weeks](#24-weeks)): the calibrated non-pregnant `adult_female`
([AdultFemaleReference](./AdultFemaleReference.md)) at 36 weeks of a healthy singleton pregnancy, lying **left lateral**
(no aortocaval compression; the engine has no model of it). The fetus is represented only as an O2 sink in the placenta.
Compiled 2026-11-27 from a PubMed search.

The machine-readable version is [`scripts/reference/adult_female_pregnant_36wk.json`](../scripts/reference/adult_female_pregnant_36wk.json),
built by `scripts/reference/_build_adult_female_pregnant_reference.py --ga 24|30|36` and read by
`scripts/probe_term_reference.mjs --ref scripts/reference/adult_female_pregnant_36wk.json`. Per-kg values use the
pregnancy weight, 71 kg.

**Rule** ([derived scenarios](./TermTransitionReference.md)): each target is the non-pregnant reference (or model value,
where noted) x the change measured **within one longitudinal study**, pre-pregnancy or early pregnancy -> ~36 weeks.
Absolute values from other cohorts are cross-checks only; absolute targets only where she has no counterpart
(uteroplacental flow, fetal + placental O2 use).

## Decisions (user, 2026-11-27)

- **Blood pressure +5 mmHg (2026-11-28):** the non-pregnant base is calibrated to MAP 87 (was 82), so the derived pregnancy
  pressures move +5 with it (36 / 30 wk MAP 87, DBP 67; 24 wk MAP 83, DBP 66). With the higher pressure the slow controllers
  let heart rate settle ~2.4 bpm and renal blood flow ~10 % below the generator's aim, so it aims that much higher (settle
  offsets, user option B). Settled: 24 wk MAP 83.2 / HR 74.2, 30 wk 86.1 / 77.7, 36 wk 85.6 / 78.1; no row flagged.

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
| Renal blood flow (`renal`) | mL/kg/min | 16.2 | 15–17.4 | effective renal plasma flow, 3rd trimester; 36 wk gestation, left lateral | C | Dunlop W | Change: ~x1.25-1.45. ~1148 mL/min. |

## Breathing

| Variable | Unit | Reference | Range | Method, cohort, n | Grade | Source | Notes |
|---|---|---|---|---|---|---|---|
| Minute ventilation (`mv`) | mL/kg/min | 107.6 |  | (model base 5.7 L/min); 36 wk gestation, left lateral | B | Spatling L et al (PMID 1515406) | Change: x1.34. 7.6 L/min. |
| Tidal volume (`vt`) | mL/kg | 6.8 |  | (model base 380 mL); 36 wk gestation, left lateral | B | Spatling L et al (PMID 1515406) | Change: x1.27. 483 mL. |
| Respiratory rate (`rr`) | /min | 15 | 12–20 | 36 wk gestation, left lateral | B | Spatling L et al (PMID 1515406) | Change: unchanged.  |
| FRC (`frc`) | mL/kg | 26.7 |  | (model base 2.3 L); 36 wk gestation, left lateral | B/C | Craig DB, Toole MA (PMID 1201469); Gee JB et al | Change: x0.80-0.85. ~1.90 L. |
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
| Whole-body O2 consumption (maternal + uteroplacental) (`vo2`) | mL/kg/min | 3.41 |  | calorimetry, pre-pregnancy -> 3rd trimester (n=34); 36 wk gestation, left lateral | A | Butte NF et al (PMID 15159239); Forsum E et al; Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: BMR x1.26 (Forsum x1.30). 242 mL/min at 71.0 kg. |
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
| GFR (absolute, not indexed) (`gfr_abs`) | mL/min | 134 | 121–158 | inulin clearance, 34 wk vs postpartum (n=12); 36 wk gestation, left lateral | B | Saxena AR et al; Dunlop W; Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: x1.28 (Dunlop x1.5). User decision: inulin (Saxena). Pregnancy GFR is not indexed to 1.73 m2. |

## Uterus

| Variable | Unit | Reference | Range | Method, cohort, n | Grade | Source | Notes |
|---|---|---|---|---|---|---|---|
| Uterine blood flow (`ut_flow`) | mL/min | 700 | 500–970 | Doppler volume flow near term; 36 wk gestation, left lateral | B/C | Flo K et al; Konje JC et al; Metcalfe J et al | Change: ~9-10 % of CO. User decision 700. Flo 673 near term (11-12 % of CO), Metcalfe 492, Konje 970. |
| Placental (intervillous) flow (`pl_flow`) | mL/min | 600 |  | textbook ~80-90 % of uterine flow; 36 wk gestation, left lateral | C | Textbook / review; not checked against a retrieved source |  |
| Uterine artery pulsatility index (`ut_pi`) | - | 0.69 |  | Doppler reference curve at 36 wk; 36 wk gestation, left lateral | A/B | Gomez O et al | Non-pregnant model 2.66. |
| Uterus + placenta + fetus O2 consumption (`uteroplacental_vo2`) | mL O2/min | 22 | 18–26 | fetus 2.8 kg x 6.6 mL/kg/min + placenta ~5 (in vitro ~10 mL/min/kg); Metcalfe 24.5 at term; 36 wk gestation, left lateral | B | Acharya G, Sitras V; Challier JC et al; Metcalfe J et al; Hadlock FP et al (PMID 1887021) | Change: absolute. The fetus is an O2 sink (user decision). |

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
- **craig1975**: Craig DB, Toole MA. Airway closure in pregnancy (FRC, n=24). Can Anaesth Soc J 1975;22:665 (PMID 1201469)
- **hadlock1991**: Hadlock FP et al. In utero analysis of fetal growth: a sonographic weight standard. Radiology 1991;181:129-33 (doi:10.1148/radiology.181.1.1887021, PMID 1887021)
- **gee1967**: Gee JB et al. Pulmonary mechanics during pregnancy (n=10). J Clin Invest 1967
- **mills1998**: Mills JL et al. Physiological reduction in fasting plasma glucose concentration in the first trimester (n=361). 1998 (PMID 9751245)
- **hartgill2011**: Hartgill TW et al. Core body temperature and the thermoneutral zone in pregnancy. 2011
- **adult_female**: Calibrated non-pregnant adult_female reference (scripts/reference/adult_female.json, docs/AdultFemaleReference.md)
- **textbook**: Textbook / review; not checked against a retrieved source

## The scenario (2026-11-27)

`model_definitions/adult_female_pregnant_36wk.json` is generated by `scripts/_make_adult_female_pregnant.mjs` from the released
`adult_female` (weight 71 kg):

1. **Pregnancy topology** (definition stage): `Uterus` pregnant at 36 weeks; the uterine bed grows x18 (55 g -> ~1 kg, same
   pressures); the intervillous space `PL_IVS` (150 mL, a clone of `UT_CAP`) with its spiral-artery and drainage resistors and the
   `MaternalPlacenta` model. `PL_IVS` is listed on `UT_VEN.inputs` and `UT_VEN` on `VLB.inputs`, so both drains follow their
   vessels' resistance (the cloned drains kept a fixed high resistance; the `VLB` input is missing in `adult_female` too, harmless
   at its 45 mL/min). The uterine venule's resistance is x0.1, so the inflow carries the bed's pressure drop (low PI).
2. **Levers**, each prototyped and accepted:

| # | Lever | Setting | Main effect |
|---|---|---|---|
| 1 | blood | volume x1.37 (5.16 L), Hb 12.2, albumin 37.2, Na 136; viscosity reference left alone | blood rows on target; GFR and HCO3 follow |
| 2 | venous | venous + venular unstressed volume trimmed to CVP 4.5 | CVP back from 9.5 |
| 3 | placenta | uterine inflow (`UT_ART`) to 700, `PL_IVS` to 600 mL/min, `mp_vo2` to 22 mL O2/min (trim started at the value the spiral-artery dilation needs) | uterine ~640, placental ~510, PI ~0.9, O2 sink 22.0 |
| 4-6 | map, hr, svr | baroreflex at true mean MAP 82, HR 78, systemic resistance trimmed | HR 77, MAP 83 |
| 7 | remodel | LV + RV diastolic stiffness (`el_k`) trimmed to stroke volume ~91 mL (not `u_vol`: it is also the end-systolic intercept) | SV 88, EDV 132, CO ~6.7 L/min, SVR ~11.7 |
| 8 | kidney | kidney bed to ~1150 mL/min, `kf` to GFR 134 (also through the final settle) | renal ~1080, GFR ~132 |
| 9 | vent | chemoreflex held at PaCO2 32, ventilation trimmed, RR 15 | PaCO2 31.6, pH 7.44, MV 7.6 L/min |
| 10 | lungs | airway resistance x0.5, chest wall x1.25 stiffer, thorax unstressed volume to FRC 1.9 L | Rrs 1.6, Crs 81, FRC 26.7 mL/kg |
| 11 | metabolism | whole-body VO2 242 incl. heart + uteroplacental, glucose 4.7, temperature 36.8 | VO2 ~238, glucose 4.8, 36.9 degC |

3. **Re-anchoring** as `adult_female`, with: the maintenance intake re-measured after the final kidney trims; after the
   baroreflex fold, heart rate and systemic resistance nudged back to their targets, the baroreflex re-anchored once more
   at that state, and a last heart-rate-only nudge (the folded reflex had baked in a few bpm of braking and let the
   pressure drift: 24-wk MAP 81.5 instead of 78); the brain references captured last.
4. **Display:** a placenta node (`PL`) beside the uterus, uterus/placenta discs at 0.6 of their natural size, `fUT`/`fPL`
   read-outs on the circulation panels.

**Validation:**
- `probe_term_reference.mjs adult_female_pregnant_36wk --ref scripts/reference/adult_female_pregnant_36wk.json`: 39 rows,
  none flagged.
- `probe_vitals.mjs` and `validate_respiratory.mjs` judge against non-pregnant adult ranges: they flag PaCO2 / etCO2 / HCO3 /
  base excess low (the intended compensated respiratory alkalosis of pregnancy) and SvO2 77 (adult range 65-75).
- 30-min drift: HR, MAP, CVP (4.4 -> 4.6), gases, electrolytes and uteroplacental flows flat; blood volume +21 mL and
  interstitial fluid -22 mL (total conserved; slowing).

## 30 weeks

`adult_female_pregnant_30wk` comes from the same generator (`--ga 30`) with the 30-week targets; the levers and re-anchoring
are the same. Decisions (user, 2026-11-27): the same studies at ~28-32 weeks; plasma volume x1.40 (de Haas 2017 scaled, the
36-week source; Aguree 2019 x1.42 as a cross-check); the interpolated lung mechanics (FRC x0.89, compliance x0.93, airway
resistance x0.55). Cardiac output and heart rate equal 36 weeks (Meah 2016's early-third-trimester peak covers both;
output plateaus late, Perry 2019). Weight 68.4 kg; fetus 1.56 kg (Hadlock 1991); uterine flow 570 mL/min (Flo and Konje
30/36-week ratio 0.81 applied to 700); the pregnant uterus (bed growth x14) and the intervillous volume (120 mL) scaled
with the uterine flow (grade C).

Validation: reference probe 30 weeks, no row flagged (HR 76, CO ~6.6 L/min, MAP 83, blood volume 4.96 L, Hb 11.9, uterine
~530 / placental ~400 mL/min, PI ~1.0, O2 sink 14.0 mL/min, GFR 134, PaCO2 31.6, FRC 2.05 L); 30-min drift as at 36 weeks
(the slow interstitial -> plasma shift, ~17 mL); respiratory suite flags only the intended low PaCO2.

### Hemodynamics, heart and flows

| Variable | Unit | Reference | Range | Method, cohort, n | Grade | Source | Notes |
|---|---|---|---|---|---|---|---|
| Heart rate (`hr`) | bpm | 78 | 65–95 | non-invasive, pre-conception -> 33 wk; 30 wk gestation, left lateral | B | Mahendru AA et al (PMID 24406777); Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: +13 +/- 11 bpm (Mahendru 2014, n=54). Base 65 (user decision). Clark 1989 invasive x1.17 (76) as a cross-check; other studies x1.26-1.29. |
| Cardiac output (`lvo`) | mL/kg/min | 103.4 | 82.7–124.1 | meta-analysis of echo / impedance / rebreathing; 30 wk gestation, left lateral | A/B | Meah VL et al (PMID 26794234); Mahendru AA et al (PMID 24406777); Perry H et al (PMID 30548496); Clark SL et al | Change: x1.31 at the early 3rd-trimester peak (Meah 2016, 39 studies). 7.07 L/min (base 5.4, user decision). Plateau/slight fall after ~35 wk (Perry 2019 NICOM). Clark invasive x1.43 (7.7 L/min) cross-check. |
| Right ventricular output (`rvo`) | mL/kg/min | 103.4 | 82.7–124.1 | 30 wk gestation, left lateral | A/B | Meah VL et al (PMID 26794234) |  |
| LV stroke volume (`lv_sv`) | mL/kg | 1.33 |  | derived CO / HR; 30 wk gestation, left lateral | B (derived) | Meah VL et al (PMID 26794234); Mahendru AA et al (PMID 24406777) | Change: x1.09 (derived). 91 mL. |
| LV end-diastolic volume (`lv_edv`) | mL/kg | 2.4 |  | CMR ~34 wk vs postpartum; 30 wk gestation, left lateral | B | Ducas RA et al | Change: x1.29 (Ducas 2014). Reference only in spirit: Ducas's CO rise (+85 %) is an outlier against option B; expect the model's EDV lower. |
| Mean arterial pressure (true mean) (`map_mean`) | mmHg | 82 | 70–94 | intra-arterial (Clark); pre-conception cohort recovering by the 3rd trimester; 30 wk gestation, left lateral | B | Clark SL et al; Mahendru AA et al (PMID 24406777); Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: x1.00.  |
| Diastolic BP (`dbp`) | mmHg | 62 | 50–78 | seated cuff, pre-pregnancy cohort (n=570); 30 wk gestation, left lateral | B | Wang et al | Change: x0.96.  |
| Systemic vascular resistance (`svr`) | WU | 11 |  | derived (MAP - CVP)/CO; 30 wk gestation, left lateral | C (derived) | Clark SL et al; Meah VL et al (PMID 26794234) | Change: ~x0.76 (Clark reports x0.79).  |
| Central venous pressure (`cvp`) | mmHg | 4 | 2–7 | PA catheter, left lateral (n=10); 30 wk gestation, left lateral | B | Clark SL et al; Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: x1.00.  |
| Pulmonary artery wedge pressure (`pawp`) | mmHg | 10.1 | —–13 | PA catheter; 30 wk gestation, left lateral | B | Clark SL et al; Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: x1.00.  |
| Pulmonary vascular resistance (`pvr`) | WU | 0.57 |  | PA catheter; 30 wk gestation, left lateral | B | Clark SL et al; Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: x0.66.  |
| Mean PAP (`pap_m`) | mmHg | 12.8 | —–20 | PA catheter (derived unchanged); 30 wk gestation, left lateral | C | Clark SL et al; Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: ~x1.0.  |
| Renal blood flow (`renal`) | mL/kg/min | 18 | 16.2–19.9 | effective renal plasma flow, 3rd trimester; 30 wk gestation, left lateral | C | Dunlop W | Change: ~x1.45 (interpolated; falls in the 3rd trimester, Dunlop 1981). ~1232 mL/min. |

### Breathing

| Variable | Unit | Reference | Range | Method, cohort, n | Grade | Source | Notes |
|---|---|---|---|---|---|---|---|
| Minute ventilation (`mv`) | mL/kg/min | 106.7 |  | (model base 5.7 L/min); 30 wk gestation, left lateral | B | Spatling L et al (PMID 1515406) | Change: x1.28. 7.3 L/min. |
| Tidal volume (`vt`) | mL/kg | 6.83 |  | (model base 380 mL); 30 wk gestation, left lateral | B | Spatling L et al (PMID 1515406) | Change: x1.23. 467 mL. |
| Respiratory rate (`rr`) | /min | 15 | 12–20 | 30 wk gestation, left lateral | B | Spatling L et al (PMID 1515406) | Change: unchanged.  |
| FRC (`frc`) | mL/kg | 29.9 |  | (model base 2.3 L); 30 wk gestation, left lateral | B/C | Craig DB, Toole MA (PMID 1201469); Gee JB et al | Change: ~x0.89 (interpolated). ~2.05 L. |
| Respiratory system compliance (`crs`) | mL/cmH2O | 84 |  | lung unchanged, chest wall lower; 30 wk gestation, left lateral | C | Gee JB et al | Change: ~x0.93.  |
| Respiratory resistance (`rrs`) | cmH2O/L/s | 1.76 |  | total pulmonary resistance; 30 wk gestation, left lateral | B | Gee JB et al | Change: x0.55.  |

### Gases and saturations

| Variable | Unit | Reference | Range | Method, cohort, n | Grade | Source | Notes |
|---|---|---|---|---|---|---|---|
| PaCO2 (`pco2`) | mmHg | 32 | 30–34 | 30 wk gestation, left lateral | B/C | Spatling L et al (PMID 1515406); Textbook / review; not checked against a retrieved source | Change: -5.5 (Spatling alveolar -4). User decision ~32. |
| Arterial pH (`ph`) | - | 7.44 | 7.4–7.47 | 30 wk gestation, left lateral | C | Textbook / review; not checked against a retrieved source | Change: compensated respiratory alkalosis.  |
| Bicarbonate (`hco3`) | mmol/L | 21 | 19–23 | 30 wk gestation, left lateral | C | Textbook / review; not checked against a retrieved source | Change: -3.  |
| PaO2 (`po2`) | mmHg | 100 | 85–110 | semi-recumbent, left lateral tilt; 30 wk gestation, left lateral | B | Templeton A, Kelman GR (PMID 10937) | Change: A-a unchanged.  |
| SpO2 (`spo2`) | % | 98 | 96–100 | 30 wk gestation, left lateral | C | Textbook / review; not checked against a retrieved source |  |

### Metabolism

| Variable | Unit | Reference | Range | Method, cohort, n | Grade | Source | Notes |
|---|---|---|---|---|---|---|---|
| Whole-body O2 consumption (maternal + uteroplacental) (`vo2`) | mL/kg/min | 3.42 |  | calorimetry, pre-pregnancy -> 3rd trimester (n=34); 30 wk gestation, left lateral | A | Butte NF et al (PMID 15159239); Forsum E et al; Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: BMR x1.22 (Butte 2004, interpolated: +10.7 kcal/wk). 234 mL/min at 68.4 kg. |
| Respiratory quotient (`rq`) | - | 0.82 |  | 30 wk gestation, left lateral | B | Spatling L et al (PMID 1515406) | Change: unchanged.  |
| Core temperature (`temp`) | degC | 36.8 | 36.3–37.5 | 30 wk gestation, left lateral | C | Hartgill TW et al | Change: falls slightly.  |
| Fasting glucose (`glucose`) | mmol/L | 4.7 | 3.9–5.1 | from 6 wk (n=361); 30 wk gestation, left lateral | B | Mills JL et al (PMID 9751245); Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: -0.2.  |
| Arterial lactate (`lactate`) | mmol/L | 1 | 0.5–2.2 | 30 wk gestation, left lateral | C | Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: unchanged (non-fasting x1.26 weak).  |

### Blood and kidneys

| Variable | Unit | Reference | Range | Method, cohort, n | Grade | Source | Notes |
|---|---|---|---|---|---|---|---|
| Blood volume (`blood_volume`) | mL/kg | 71.8 |  | plasma x1.40 (de Haas 2017 scaled to ~30 wk) + red cells +237 mL (Taylor & Lind 1979, interpolated); 30 wk gestation, left lateral | B | de Haas S et al; Taylor DJ, Lind T; Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: x1.30 (derived). 4.91 L. Two studies combined (breaks the one-study rule). |
| Haemoglobin (`hb`) | g/dL | 12 | 11–13.5 | red cell mass / blood volume; 30 wk gestation, left lateral | B/C | Taylor DJ, Lind T; de Haas S et al; Murphy MM et al | Change: x0.89 (with iron). User decision: with iron. Murphy 2002 Hct only -4 % (conflict noted). |
| Haematocrit (`hct`) | % | 35.5 | 33–40 | 30 wk gestation, left lateral | B/C | Taylor DJ, Lind T; de Haas S et al | Change: x0.89.  |
| Albumin (`albumin`) | g/L | 37.2 | 32–42 | pre-pregnancy -> 32 wk (n=93); 30 wk gestation, left lateral | B | Murphy MM et al; Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: x0.866. Colloid osmotic pressure x0.86 (Clark): ~21.5 mmHg. |
| Sodium (`na`) | mmol/L | 136 | 132–140 | plasma osmolality -10 mOsm/kg; 30 wk gestation, left lateral | C | Davison JM et al | Change: -4.  |
| GFR (absolute, not indexed) (`gfr_abs`) | mL/min | 133 | 121–158 | inulin clearance, 22 and 34 wk vs postpartum (n=12), interpolated; 30 wk gestation, left lateral | B | Saxena AR et al; Dunlop W; Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: x1.27 (Dunlop x1.5). User decision: inulin (Saxena). Pregnancy GFR is not indexed to 1.73 m2. |

### Uterus

| Variable | Unit | Reference | Range | Method, cohort, n | Grade | Source | Notes |
|---|---|---|---|---|---|---|---|
| Uterine blood flow (`ut_flow`) | mL/min | 570 | 400–790 | Doppler volume flow, longitudinal (Flo 2010, Konje 2001): 30/36-wk ratio 0.81 applied to 700; 30 wk gestation, left lateral | B/C | Flo K et al; Konje JC et al; Metcalfe J et al | Change: ~9-10 % of CO. Absolute values at 30 wk differ between the studies (Flo ~475, Konje ~767); only their ratio is used. |
| Placental (intervillous) flow (`pl_flow`) | mL/min | 485 |  | textbook ~80-90 % of uterine flow; 30 wk gestation, left lateral | C | Textbook / review; not checked against a retrieved source |  |
| Uterine artery pulsatility index (`ut_pi`) | - | 0.77 |  | Doppler reference curve at 30 wk; 30 wk gestation, left lateral | A/B | Gomez O et al | Non-pregnant model 2.66. |
| Uterus + placenta + fetus O2 consumption (`uteroplacental_vo2`) | mL O2/min | 14 | 11–17 | fetus 1.56 kg (Hadlock 1991) x 6.6 mL/kg/min + placenta ~4; 30 wk gestation, left lateral | B | Acharya G, Sitras V; Challier JC et al; Metcalfe J et al; Hadlock FP et al (PMID 1887021) | Change: absolute. The fetus is an O2 sink (user decision). |

### Shunts

| Variable | Unit | Reference | Range | Method, cohort, n | Grade | Source | Notes |
|---|---|---|---|---|---|---|---|

## 24 weeks

`adult_female_pregnant_24wk` (`--ga 24`), mid-pregnancy. Decisions (user, 2026-11-28): cardiac output and heart rate as the
within-series step of Mulder 2021 (meta-analysis of studies with a non-pregnant reference: x1.27 / +10.7 bpm at 22-28 wk vs
x1.29 / +14.6 at 29-35 wk) applied to the calibrated 30-week values (CO ~6.96 L/min, HR 74); MAP 78 (the mid-pregnancy low
point, de Haas 2022 BP meta-analysis, -4); renal blood flow x1.6 (Dunlop 1981: renal plasma flow at its +80 % plateau,
16-26 wk); plasma volume x1.28 (Aguree 2019's 24/30-week step on the 30-week x1.40). Weight 65.9 kg; fetus 0.67 kg; uterine
flow 440 mL/min; uterus (x11) and intervillous volume (95 mL) scaled with the uterine flow (grade C).

Validation: reference probe, no row flagged (HR 74.1, MAP 79.1, CO ~6.7-7.0 L/min, SV 93, SVR 11.2, blood volume 4.55 L, Hb
12.0, uterine ~410 mL/min, O2 sink 7.4, GFR ~132, renal ~1290 mL/min, PaCO2 31.7); 30-min drift as 30/36 weeks (slow
interstitial -> plasma shift ~18 mL); respiratory suite flags only the intended low PaCO2. The post-fold changes moved
30 and 36 weeks slightly toward their targets (30: HR 77.3 / MAP 82.1; 36: HR 79.8 / MAP 81.4).

### Hemodynamics, heart and flows

| Variable | Unit | Reference | Range | Method, cohort, n | Grade | Source | Notes |
|---|---|---|---|---|---|---|---|
| Heart rate (`hr`) | bpm | 74 | 65–95 | Mulder 2021 meta-analysis bins: +10.7 bpm (22-28 wk) vs +14.6 (29-35 wk); the 24/30 step applied to the 30-wk 78; 24 wk gestation, left lateral | B | Mulder E et al (PMID 33630403); Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: -4 bpm vs 30 wk (Mulder 2021 within-series). User decision 2026-11-28: within-series step from the calibrated 30-wk values. |
| Cardiac output (`lvo`) | mL/kg/min | 105.6 | 84.5–126.7 | meta-analysis, studies with a non-pregnant reference (105 studies); 24 wk gestation, left lateral | B | Mulder E et al (PMID 33630403); Meah VL et al (PMID 26794234) | Change: x1.27 vs x1.29 at 29-35 wk (Mulder 2021); the 24/30 step applied to the 30-wk 7.07 L/min. ~6.96 L/min. SVR lowest at 22-28 wk (-25 %, Mulder; Clapp 1997 at 24 wk). |
| Right ventricular output (`rvo`) | mL/kg/min | 105.6 | 84.5–126.7 | 24 wk gestation, left lateral | A/B | Meah VL et al (PMID 26794234) |  |
| LV stroke volume (`lv_sv`) | mL/kg | 1.43 |  | derived CO / HR; 24 wk gestation, left lateral | B (derived) | Meah VL et al (PMID 26794234); Mahendru AA et al (PMID 24406777) | Change: x1.09 (derived). 94 mL. |
| LV end-diastolic volume (`lv_edv`) | mL/kg | 2.49 |  | CMR ~34 wk vs postpartum; 24 wk gestation, left lateral | B | Ducas RA et al | Change: x1.29 (Ducas 2014). Reference only in spirit: Ducas's CO rise (+85 %) is an outlier against option B; expect the model's EDV lower. |
| Mean arterial pressure (true mean) (`map_mean`) | mmHg | 78 | 66–90 | arm cuff, mixed posture (BP meta-analysis), mid-pregnancy low point; 24 wk gestation, left lateral | B | de Haas S et al (PMID 34929556); Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: -4. User decision 78. Clapp 1997 places the low point at 16 wk (-6); by 24 wk pressure may be recovering. |
| Diastolic BP (`dbp`) | mmHg | 61 | 48–76 | arm cuff, mixed posture (BP meta-analysis); 24 wk gestation, left lateral | B | de Haas S et al (PMID 34929556) | Change: -4 (mid-pregnancy).  |
| Systemic vascular resistance (`svr`) | WU | 10.6 |  | derived (MAP - CVP)/CO; 24 wk gestation, left lateral | C (derived) | Clark SL et al; Meah VL et al (PMID 26794234) | Change: ~x0.76 (Clark reports x0.79).  |
| Central venous pressure (`cvp`) | mmHg | 4 | 2–7 | PA catheter, left lateral (n=10); 24 wk gestation, left lateral | B | Clark SL et al; Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: x1.00.  |
| Pulmonary artery wedge pressure (`pawp`) | mmHg | 10.1 | —–13 | PA catheter; 24 wk gestation, left lateral | B | Clark SL et al; Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: x1.00.  |
| Pulmonary vascular resistance (`pvr`) | WU | 0.58 |  | scaled from the 30-wk decision (no mid-pregnancy invasive data); 24 wk gestation, left lateral | C | Clark SL et al; Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: x0.68.  |
| Mean PAP (`pap_m`) | mmHg | 12.8 | —–20 | PA catheter (derived unchanged); 24 wk gestation, left lateral | C | Clark SL et al; Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: ~x1.0.  |
| Renal blood flow (`renal`) | mL/kg/min | 20.6 | 18.7–22.6 | effective renal plasma flow, 3rd trimester; 24 wk gestation, left lateral | C | Dunlop W | Change: ~x1.6 (Dunlop 1981: renal plasma flow +80 % plateau at 16-26 wk, haematocrit-corrected). ~1360 mL/min. |

### Breathing

| Variable | Unit | Reference | Range | Method, cohort, n | Grade | Source | Notes |
|---|---|---|---|---|---|---|---|
| Minute ventilation (`mv`) | mL/kg/min | 107.3 |  | (model base 5.7 L/min); 24 wk gestation, left lateral | B | Spatling L et al (PMID 1515406) | Change: x1.24. 7.1 L/min. |
| Tidal volume (`vt`) | mL/kg | 7.15 |  | (model base 380 mL); 24 wk gestation, left lateral | B | Spatling L et al (PMID 1515406) | Change: x1.24. 471 mL. |
| Respiratory rate (`rr`) | /min | 15 | 12–20 | 24 wk gestation, left lateral | B | Spatling L et al (PMID 1515406) | Change: unchanged.  |
| FRC (`frc`) | mL/kg | 33.2 |  | (model base 2.3 L); 24 wk gestation, left lateral | B/C | Craig DB, Toole MA (PMID 1201469); Gee JB et al | Change: ~x0.95 (interpolated). ~2.18 L. |
| Respiratory system compliance (`crs`) | mL/cmH2O | 86 |  | lung unchanged, chest wall lower; 24 wk gestation, left lateral | C | Gee JB et al | Change: ~x0.96.  |
| Respiratory resistance (`rrs`) | cmH2O/L/s | 1.92 |  | total pulmonary resistance; 24 wk gestation, left lateral | B | Gee JB et al | Change: x0.6.  |

### Gases and saturations

| Variable | Unit | Reference | Range | Method, cohort, n | Grade | Source | Notes |
|---|---|---|---|---|---|---|---|
| PaCO2 (`pco2`) | mmHg | 32 | 30–34 | 24 wk gestation, left lateral | B/C | Spatling L et al (PMID 1515406); Textbook / review; not checked against a retrieved source | Change: -5.5 (Spatling alveolar -4). User decision ~32. |
| Arterial pH (`ph`) | - | 7.44 | 7.4–7.47 | 24 wk gestation, left lateral | C | Textbook / review; not checked against a retrieved source | Change: compensated respiratory alkalosis.  |
| Bicarbonate (`hco3`) | mmol/L | 21 | 19–23 | 24 wk gestation, left lateral | C | Textbook / review; not checked against a retrieved source | Change: -3.  |
| PaO2 (`po2`) | mmHg | 100 | 85–110 | semi-recumbent, left lateral tilt; 24 wk gestation, left lateral | B | Templeton A, Kelman GR (PMID 10937) | Change: A-a unchanged.  |
| SpO2 (`spo2`) | % | 98 | 96–100 | 24 wk gestation, left lateral | C | Textbook / review; not checked against a retrieved source |  |

### Metabolism

| Variable | Unit | Reference | Range | Method, cohort, n | Grade | Source | Notes |
|---|---|---|---|---|---|---|---|
| Whole-body O2 consumption (maternal + uteroplacental) (`vo2`) | mL/kg/min | 3.44 |  | calorimetry, pre-pregnancy -> 3rd trimester (n=34); 24 wk gestation, left lateral | A | Butte NF et al (PMID 15159239); Forsum E et al; Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: BMR x1.18 (Butte 2004, 22-wk visit, interpolated). 227 mL/min at 65.9 kg. |
| Respiratory quotient (`rq`) | - | 0.82 |  | 24 wk gestation, left lateral | B | Spatling L et al (PMID 1515406) | Change: unchanged.  |
| Core temperature (`temp`) | degC | 36.8 | 36.3–37.5 | 24 wk gestation, left lateral | C | Hartgill TW et al | Change: falls slightly.  |
| Fasting glucose (`glucose`) | mmol/L | 4.7 | 3.9–5.1 | from 6 wk (n=361); 24 wk gestation, left lateral | B | Mills JL et al (PMID 9751245); Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: -0.2.  |
| Arterial lactate (`lactate`) | mmol/L | 1 | 0.5–2.2 | 24 wk gestation, left lateral | C | Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: unchanged (non-fasting x1.26 weak).  |

### Blood and kidneys

| Variable | Unit | Reference | Range | Method, cohort, n | Grade | Source | Notes |
|---|---|---|---|---|---|---|---|
| Blood volume (`blood_volume`) | mL/kg | 68.6 |  | plasma x1.28 (Aguree 2019 24/30-wk step on the 30-wk x1.40) + red cells +125 mL (Taylor & Lind 1979, iron, interpolated); 24 wk gestation, left lateral | B | de Haas S et al; Taylor DJ, Lind T; Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: x1.20 (derived). 4.52 L. Two studies combined (breaks the one-study rule). |
| Haemoglobin (`hb`) | g/dL | 12.1 | 11–13.5 | red cell mass / blood volume; 24 wk gestation, left lateral | B/C | Taylor DJ, Lind T; de Haas S et al; Murphy MM et al | Change: x0.90 (with iron). User decision: with iron. Murphy 2002 Hct only -4 % (conflict noted). |
| Haematocrit (`hct`) | % | 36 | 33–40 | 24 wk gestation, left lateral | B/C | Taylor DJ, Lind T; de Haas S et al | Change: x0.90.  |
| Albumin (`albumin`) | g/L | 38.3 | 33–43 | pre-pregnancy -> 20 / 32 wk (n=93), interpolated; 24 wk gestation, left lateral | A/B | Murphy MM et al; Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: x0.89.  |
| Sodium (`na`) | mmol/L | 136 | 132–140 | plasma osmolality -10 mOsm/kg; 24 wk gestation, left lateral | C | Davison JM et al | Change: -4.  |
| GFR (absolute, not indexed) (`gfr_abs`) | mL/min | 131 | 121–158 | inulin clearance, 22.3 wk vs postpartum (n=12); 24 wk gestation, left lateral | B | Saxena AR et al; Dunlop W; Calibrated non-pregnant adult_female reference (scripts/reference/adult_female | Change: x1.25 (Dunlop x1.5). User decision: inulin (Saxena). Pregnancy GFR is not indexed to 1.73 m2. |

### Uterus

| Variable | Unit | Reference | Range | Method, cohort, n | Grade | Source | Notes |
|---|---|---|---|---|---|---|---|
| Uterine blood flow (`ut_flow`) | mL/min | 440 | 310–610 | Doppler volume flow, longitudinal (Flo 2010 299 at 22 wk, Konje 2001 513 at 20 wk): ratio 0.63 to 36 wk applied to 700; 24 wk gestation, left lateral | B/C | Flo K et al; Konje JC et al; Metcalfe J et al | Change: ~9-10 % of CO. Absolute values differ ~2x between the studies; only their ratio is used. |
| Placental (intervillous) flow (`pl_flow`) | mL/min | 375 |  | textbook ~80-90 % of uterine flow; 24 wk gestation, left lateral | C | Textbook / review; not checked against a retrieved source |  |
| Uterine artery pulsatility index (`ut_pi`) | - | 0.94 |  | Doppler reference curve at 24 wk; 24 wk gestation, left lateral | A/B | Gomez O et al | Non-pregnant model 2.66. |
| Uterus + placenta + fetus O2 consumption (`uteroplacental_vo2`) | mL O2/min | 7.4 | 6–9 | fetus 0.67 kg (Hadlock 1991) x 6.6 mL/kg/min + placenta ~3; 24 wk gestation, left lateral | B | Acharya G, Sitras V; Challier JC et al; Metcalfe J et al; Hadlock FP et al (PMID 1887021) | Change: absolute. The fetus is an O2 sink (user decision). |

### Shunts

| Variable | Unit | Reference | Range | Method, cohort, n | Grade | Source | Notes |
|---|---|---|---|---|---|---|---|

## Open items

- **30-week renal blood flow** (x1.45) may be low against Dunlop's mid-pregnancy plateau (+80 % renal plasma flow at
  16-26 wk, falling in the third trimester); the 24-week set uses x1.6.

- **Slow interstitial -> plasma shift** of ~20 mL per 30 min (slowing; total fluid conserved); re-seeding the interstitium at
  the end did not stop it.
- **Uterine artery PI 0.9** against the 36-week median 0.69 (low-impedance regime reached, slightly high).
- **Glucose 4.8 and temperature 36.9** settle a little above their targets (their set-points re-anchor to the resting values).
- **CO2 sensitivity of pregnancy** (x1.6, Jensen 2005) not modelled.
- **Supine position / aortocaval compression** not modelled (the scenario is left lateral).
- **No fetal circulation**: the fetus is an O2 sink in `MaternalPlacenta`.
- The `UT_VEN` input missing on `VLB` in `adult_female` should be fixed in `_make_adult_female.mjs`.
