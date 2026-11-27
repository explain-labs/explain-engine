# Adult female: literature reference values

Reference values for validating the `adult_female` scenario: a healthy, non-pregnant woman of 26 years,
60 kg and 1.65 m (BMI 22, BSA 1.65 m²). She is awake, supine, at rest and post-absorptive, breathing
room air at sea level. Compiled 2026-11-27 from a PubMed search; there are no adult reference PDFs in
`reference-value-papers/`.

The machine-readable version is [`scripts/reference/adult_female.json`](../scripts/reference/adult_female.json),
read by `scripts/probe_term_reference.mjs --ref scripts/reference/adult_female.json`. Per-kg values use
60 kg; per-m² CMR values are converted with BSA 1.65 m².

**Grades**
- **A**: a large normative cohort of matching age, sex and method
- **B**: a smaller study, an adjacent age band, a mixed-sex cohort, or a value derived from A/B data
- **C**: textbook range, laboratory reference interval or estimate

Rows whose read-out is "none (reference only)" have no model counterpart in the probe yet.

## Decisions (user, 2026-11-27)

- **Heart and central flows are anchored on cardiac MRI**: Kawel-Boehm 2020, women aged 20–29.
- **Heart rate 65 with CMR stroke volume.** NHANES gives a seated resting HR of 76 (55–99). The CMR
  output (CI 2.9) divided by the CMR stroke volume (83 mL) implies about 58 in the scanner. Both can't
  hold, so the target is HR 65 × SV 83 mL ≈ 5.4 L/min (90 mL/kg/min, CI 3.3). That is inside the CMR
  range of 1.9–3.9. The Fick check (VO₂ 192 mL/min, Hb 13.5) then gives SvO₂ ≈ 77 %.
- **VO₂ 3.2 mL/kg/min**: Mifflin-St Jeor REE (1340 kcal/day) converted with Weir, 192 mL/min. The only
  measured cohort (Byrne 2005) gives 2.6 ± 0.4, but it includes obese subjects. The classic 1 MET (3.5)
  overestimates.
- **Blood gases use sea-level textbook targets** (pH 7.40, PaCO₂ 38, HCO₃ 24). The only measured female
  cohort was at 1100 m (pH 7.43, PaCO₂ 33.5) and is kept as a cross-check.
- **RV ejection fraction 56–66 %**: the band between the two tracing conventions (below). The model
  forces RV SV ≈ LV SV.
- **Supine FRC ≈ 1.8 L (30 mL/kg) and awake Crs ≈ 90 mL/cmH₂O**, both grade C.
- **Blood pressure is compared as central pressure (option A).** The model reads the ascending aorta; NHANES is a
  brachial cuff. Diastolic and true mean pressure are about the same in the aorta and the arm, systolic is ~10 mmHg
  lower centrally in young adults (McEniery 2008; Herbert 2014). Targets: true time-averaged MAP 82, DBP 68,
  central SBP ~100, central pulse pressure ~32. DBP + PP/3 applied to the model's aortic waveform reads ~6 mmHg
  below its true mean, so that row is reference-only.
- **CO₂ response is parked** until the breathing step, where its definition is matched to the model's
  chemoreflex.

## Measurement method matters

- **Blood pressure and heart rate (NHANES) are seated office values, and the cuff is brachial** (see the central-pressure decision above). No supine normative young-female
  cohort was found. Supine BP reads a few mmHg higher; that is a direction only.
- **CMR papillary-muscle convention.** Kawel-Boehm's LV band for women 20–29 counts the papillary muscles
  as mass, while its RV band counts them as blood volume. That is why the RV EF there (56) is below the
  LV EF (62). Maceira's RV, counting them as mass, gives EF 66. The model's chambers are pure blood
  pools.
- **Breathing pattern depends on posture and interface.** Supine plethysmography (Parreira) gives
  4.7 L/min; seated with a mask (Goldberg) gives 8.1 L/min. The supine, mask-free set is used.
- **Regional flows depend on method.** For the kidney, PC-MRI gives ~920 mL/min and hippuran clearance
  ~610 mL/min. For the portal vein, PC-MRI gives ~1.1 L/min and Doppler ~0.66 L/min.
- **The model's splanchnic beds don't map one-to-one onto the anatomy.** The LS bed (`AD_LS_ART`) is liver +
  spleen and its venous blood bypasses the liver, so it is compared with hepatic artery + splenic flow (~6.7);
  the gut bed (`AD_INT_ART`) with portal flow minus the spleen's share (~13); their sum with total liver inflow
  (`hepatic_total`, 19.7).
- **CO₂ response:** the Goldberg start-to-end rebreathing slope (0.38 L/min/mmHg) is several-fold below
  classic Read slopes measured above threshold (1–3 L/min/mmHg).



## Hemodynamics, heart and flows

| Variable | Unit | Reference | Range | Method, cohort, n | Grade | Source | Notes |
|---|---|---|---|---|---|---|---|
| Heart rate (`hr`) | bpm | 65 | 55–99 | NHANES seated 5 min, 30 s radial count; target chosen for supine rest; 20-39 y, female; n=3061 | A (range) / decision (mean) | Ostchega Y et al; Kawel-Boehm N et al (PMID 33308262) | NHANES seated women 20-39: 76 (55-99). CMR CO/SV implies ~58 supine in the scanner. User decision 2026-11-27: HR 65 with CMR SV 83 mL -> CO ~5.4 L/min (CI 3.3, inside 1.9-3.9). |
| Systolic BP (central, ascending aorta) (`sbp`) | mmHg | 100 | 84–118 | NHANES brachial 110 (94-128) minus the aorta-to-arm systolic amplification (~10 mmHg in young adults); 20-39 y, female; n=3655 | C (derived) | Wright JD et al; McEniery CM et al (PMID 18426997); Herbert A et al (PMID 25112663) | User decision 2026-11-27 (option A): the model reads the ascending aorta, so compare as central pressure. McEniery 2008: brachial-aortic SBP gap still 8 +/- 3 mmHg in women >80 y, larger in the young; Herbert 2014 tabulates it by age/sex (young-female values not verified, full text not retrieved). Brachial NHANES 110 +/- 10. |
| Diastolic BP (`dbp`) | mmHg | 68 ± 9 | 52–83 | NHANES seated office auscultation (diastolic ~equal in aorta and arm); 20-39 y, female; n=3655 | A (seated) | Wright JD et al | SD derived from the P5-P95 spread / 3.29. |
| Mean arterial pressure (true time-averaged mean) (`map_mean`) | mmHg | 82 | 66–98 | NHANES DBP + PP/3 (the brachial formula approximates the true mean, which is ~equal in aorta and arm); 20-39 y, female | B (derived) | Wright JD et al | User decision 2026-11-27 (option A). DBP + PP/3 on the model's aortic waveform reads ~6 mmHg below its true mean, so the clinical-formula row is reference-only. |
| MAP by the clinical formula (DBP + PP/3) on the aortic waveform (`map`) | mmHg |  |  | Monitor.abp_pre_pres_mean; 20-39 y, female | - | Wright JD et al | Reference only (option A): the formula is fitted to brachial waveforms. |
| Pulse pressure (central) (`pp`) | mmHg | 32 |  | central SBP 100 - DBP 68; 20-39 y, female | C (derived) | Wright JD et al; McEniery CM et al (PMID 18426997) | Brachial 42; central narrower by the systolic amplification. |
| Central venous / right atrial pressure (`cvp`) | mmHg | 4 | 2–6 | right-heart catheter; 20-39 y, female | C | Humbert M et al (PMID 36017548) |  |
| Systolic PAP (`pap_s`) | mmHg |  | 15–30 | RHC; 20-39 y, female | C | Humbert M et al (PMID 36017548) |  |
| Diastolic PAP (`pap_d`) | mmHg |  | 4–12 | RHC; 20-39 y, female | C | Humbert M et al (PMID 36017548) |  |
| Mean PAP (`pap_m`) | mmHg | 12.8 ± 3.1 |  | RHC systematic review, age <30 subgroup; <30 y, both sexes | A | Kovacs G et al (PMID 19324955) | All ages 14.0 +/- 3.3 (n=1187), sex-independent. |
| Pulmonary artery wedge pressure (`pawp`) | mmHg | 10.1 ± 1.8 | —–13 | supine RHC meta-analysis; median 26 y, both sexes; n=960 | A (all) / B (women) | Zeder K et al (PMID 38964777) | Women 10.05 vs men 8.38. Model: mean left atrial pressure. |
| Pulmonary vascular resistance (`pvr`) | WU | 0.86 ± 0.35 |  | RHC systematic review; 24-50 y | A | Kovacs G et al (PMID 21885394) | Model uses mean LA pressure as the wedge. |
| Systemic vascular resistance (`svr`) | WU | 14.4 |  | (true mean MAP - CVP)/CO with the chosen targets (82 - 4)/5.4; 20-39 y, female | C (derived) | Wright JD et al; Kawel-Boehm N et al (PMID 33308262) | No measured young-female SVR retrieved. |
| LV end-diastolic volume (`lv_edv`) | mL/kg | 2.118 ± 0.33 |  | 1.5 T SAX bSSFP, papillary muscles in mass; women 20-29 y; n=43 | A | Kawel-Boehm N et al (PMID 33308262) | 77 +/- 12 mL/m2 = 127 mL. |
| LV end-systolic volume (`lv_esv`) | mL/kg | 0.797 ± 0.192 |  | as lv_edv; women 20-29 y; n=43 | A | Kawel-Boehm N et al (PMID 33308262) | 29 +/- 7 mL/m2 = 48 mL. |
| LV stroke volume (`lv_sv`) | mL/kg | 1.375 ± 0.165 |  | as lv_edv; women 20-29 y; n=33 | A | Kawel-Boehm N et al (PMID 33308262) | 50 +/- 6 mL/m2 = 83 mL. |
| LV ejection fraction (`lv_ef`) | % | 62 ± 6 |  | as lv_edv; women 20-29 y; n=43 | A | Kawel-Boehm N et al (PMID 33308262) | Women all ages 66 +/- 7. |
| LV mass (`lv_mass`) | g | 84 ± 18 |  | as lv_edv; women 20-29 y; n=43 | A | Kawel-Boehm N et al (PMID 33308262) | 51 +/- 11 g/m2. Mob/HeartFunction use whole-heart weight (linear in body weight, ~266 g at 60 kg). |
| RV end-diastolic volume (`rv_edv`) | mL/kg | 2.145 ± 0.33 |  | 1.5 T SAX bSSFP, papillary muscles in volume; women 20-29 y; n=47 | A | Kawel-Boehm N et al (PMID 33308262) | 78 +/- 12 mL/m2 = 129 mL. |
| RV end-systolic volume (`rv_esv`) | mL/kg | 0.907 | 0.275–1.54 | as rv_edv; women 20-29 y; n=47 | A | Kawel-Boehm N et al (PMID 33308262) | 33 +/- 12 mL/m2. |
| RV stroke volume (`rv_sv`) | mL/kg | 1.265 ± 0.247 |  | as rv_edv; women 20-29 y; n=37 | A | Kawel-Boehm N et al (PMID 33308262) | In the model RV SV ~ LV SV; the CMR difference (46 vs 50) is cohort/convention. |
| RV ejection fraction (`rv_ef`) | % |  | 56–66 | papillary muscles in volume (56 +/- 11) vs in mass (Maceira 66 +/- 7); women 20-29 y; n=47 | A | Kawel-Boehm N et al (PMID 33308262) | User decision 2026-11-27: accept 56-66. |
| Left ventricular output (cardiac output) (`lvo`) | mL/kg/min | 90 | 52–107 | 3 T CMR (Le 2016) CI 2.9 +/- 0.5; women 20-69 y; n=89 | A (range) / decision (mean) | Kawel-Boehm N et al (PMID 33308262) | CMR CI 2.9 -> 4.8 L/min (80 mL/kg/min); user decision: HR 65 x SV 83 -> ~5.4 L/min (90 mL/kg/min, CI 3.3). |
| Right ventricular output (`rvo`) | mL/kg/min | 90 | 52–107 | 20-39 y, female | A | Kawel-Boehm N et al (PMID 33308262) | No shunts: equals LVO. |
| Superior vena cava flow (`svc`) | mL/kg/min | 31.5 |  | velocity-encoded MRI, SVC = 35 % of CO; adults, mixed sex; n=13 | B | Mohiaddin RH et al (PMID 2217797) | 35 % of the chosen CO 90. Mixed sex, n=13. |
| Descending aorta flow (`dao`) | mL/kg/min | 54 |  | derived: ~60 % of CO; 20-39 y, female | C | Mohiaddin RH et al (PMID 2217797) | No verified volume flow retrieved. |
| Total cerebral blood flow (`cbf`) | mL/kg/min | 12 ± 2.05 |  | PC-MRI sum of ICA + VA; adults | B | Zarrinkoob L et al (PMID 25564234); Ito H et al (PMID 14730405) | 717 +/- 123 mL/min; may include older subjects; women ~10 % higher perfusion; young female likely 700-750 mL/min. |
| Renal blood flow (both kidneys) (`renal`) | mL/kg/min | 14 | 10.2–15.3 | PC-MRI ~920 mL/min (Eckerbom) vs hippuran ERPF -> ~610 mL/min blood; young women | B | Villa G et al (PMID 31422518); Toering TJ et al (PMID 26149279) | ~850 mL/min chosen (~18 % of CO). |
| Total liver inflow (hepatic artery + portal) (`hepatic_total`) | mL/kg/min | 19.7 ± 4.6 |  | PC-MRI; mean 26 y, mixed; n=20 | B | Yzet T et al (PMID 19008062) | 1.18-1.35 L/min. Model: LS bed = liver + spleen; portal ~ gut (INT) bed. |
| Liver + spleen arterial inflow (model LS bed) (`hepatic_art`) | mL/kg/min | 6.7 |  | hepatic artery 19 % of liver flow (3.7, PC-MRI) + splenic arterial flow ~3 (textbook estimate); 20-39 y, female; n=20 | B/C | Yzet T et al (PMID 19008062); Textbook / laboratory reference interval (Guyton & Hall; local lab RIs); not checked against a retrieved source | Remapped 2026-11-27: the model's LS bed is liver + spleen and its venous blood bypasses the liver, so it carries hepatic artery + splenic flow. Splenic share not verified against a source (C). |
| Gut inflow (model INT bed) = portal minus splenic (`sma`) | mL/kg/min | 13 | 7.9–— | PC-MRI portal 81 % of liver flow (16.0) minus the splenic share (~3); fasting Doppler portal 656 mL/min (10.9) minus ~3; 20-39 y, female; n=20 | B/C | Yzet T et al (PMID 19008062); Szinnai G et al (PMID 11346210); Textbook / laboratory reference interval (Guyton & Hall; local lab RIs); not checked against a retrieved source | Remapped 2026-11-27 (see the LS row). No verified fasting SMA volume flow. |
| Coronary blood flow (whole heart) (`cor_flow`) | mL/min |  | 160–250 | resting MBF 0.65-0.76 mL/min/g (CMR median age 23; PET) x whole-heart mass ~250 g; textbook ~250 mL/min (4-5 % of CO); 20-39 y, female | C (derived) | Brown LAE et al; Czernin J et al (PMID 8319357); Textbook / laboratory reference interval (Guyton & Hall; local lab RIs); not checked against a retrieved source | Corrected 2026-11-27: the first version (60) was MBF x LV mass only. Model heart weight (Mob) ~266 g at 60 kg. |
| Myocardial O2 consumption (`mvo2`) | mL/100 g/min | 12.9 ± 2.4 |  | PET; young women; n=13 | B | Peterson LR et al (PMID 17679067) | Women > men (9.5) in the same study. |
| Intracranial pressure (`icp`) | mmHg | 7 | 0–15 | LP opening 4-18 mmHg (lateral) vs supine telemetric ~0.5; 20-39 y, female | C | Lee SC, Lueck CJ (PMID 25133881); Andresen M, Juhler M (PMID 24702326) |  |
| Cerebral perfusion pressure (`cpp`) | mmHg | 75 | 60–90 | MAP - ICP; 20-39 y, female | C | Toering TJ et al (PMID 26149279) |  |
| Aortic valve peak velocity (`aov_peak`) | m/s | 1.2 ± 0.2 |  | CMR; women | B | Kawel-Boehm N et al (PMID 33308262) |  |

## Breathing

| Variable | Unit | Reference | Range | Method, cohort, n | Grade | Source | Notes |
|---|---|---|---|---|---|---|---|
| Respiratory rate (`rr`) | /min | 15 ± 2 |  | respiratory inductance plethysmography, supine; women 20-39 y | B | Parreira VF et al (PMID 21180867) |  |
| Tidal volume (`vt`) | mL/kg | 5.4 ± 2.1 |  | RIP, supine; women 20-39 y | B | Parreira VF et al (PMID 21180867) | 325 +/- 127 mL. Below the 6-7 mL/kg often used in models. |
| Minute ventilation (`mv`) | mL/kg/min | 78 ± 22 |  | RIP, supine; women 20-39 y | B | Parreira VF et al (PMID 21180867); Goldberg S et al (PMID 28045995) | 4.69 +/- 1.34 L/min supine; 8.1 L/min seated with a mask (Goldberg). |
| Duty cycle Ti/Ttot (`ti_ttot`) | - | 0.39 ± 0.03 |  | RIP, supine; women 20-39 y | B | Parreira VF et al (PMID 21180867) |  |
| Peak tidal inspiratory flow (`ptif`) | L/min/kg | 0.31 |  | derived from mean inspiratory flow 199 mL/s; 20-39 y, female | C | Parreira VF et al (PMID 21180867) |  |
| Peak tidal expiratory flow (`ptef`) | L/min/kg | 0.25 |  | derived; 20-39 y, female | C | Parreira VF et al (PMID 21180867) |  |
| Respiratory system compliance (static, awake, supine) (`crs`) | mL/cmH2O | 90 | 80–100 | CL 150-200 and Ccw ~200 in series; 20-39 y, female | C | Gertler R (PMID 34392877) | No awake cohort found; anaesthetised supine ~43 (do not mix). |
| Lung compliance (`cl`) | mL/cmH2O/kg | 2.9 | 2.5–3.3 | 150-200 mL/cmH2O; 20-39 y, female | C | Gertler R (PMID 34392877) |  |
| Chest wall compliance (`ccw`) | mL/cmH2O/kg | 3.3 |  | ~200 mL/cmH2O; 20-39 y, female | C | Gertler R (PMID 34392877) |  |
| Respiratory resistance (R5 oscillometry) (`rrs`) | cmH2O/L/s | 3.2 | 2.3–5 | oscillometry R5, reference equation for F 26 y 165 cm; 20-39 y, female | A | Valach C et al (PMID 41497331) | Device-specific; plethysmographic Raw ~2.3 (Piatti 2012, derived). |
| Functional residual capacity (supine) (`frc`) | mL/kg | 30 |  | GLI 2021 upright 2.63 L minus the supine fall (0.5-1.07 L); 20-39 y, female | B/C | Hall GL et al (PMID 33707167); Drummond GB et al (PMID 8652330) | ~1.8 L supine; upright 2.63 L (44 mL/kg). |
| Total lung capacity (`tlc`) | L | 5.25 | 4.25–6.36 | GLI 2021 computed for F 26 y 165 cm; 20-39 y, female | A | Hall GL et al (PMID 33707167) | VC 4.02 L, RV 1.16 L. |
| Anatomical dead space (`vd`) | mL/kg | 2.2 |  | Hart 1963 equation: 132 mL; 20-39 y, female | B | Hart MC et al (PMID 31094493) |  |
| Pleural (oesophageal) pressure swing (`ppl_swing`) | cmH2O | 4 | 3–5 | oesophageal balloon, semi-recumbent 45 deg; healthy adults; n=23 | B | Lindner M et al (PMID 38902702) |  |
| Ventilatory response to CO2 (`co2_response`) | L/min/mmHg |  |  | Goldberg rebreathing start-to-end slope 0.38 L/min/mmHg (n~240 F); classic Read slope above threshold 1-3 (C); women ~24 y; n=240 | A/B | Goldberg S et al (PMID 28045995) | PARKED (user 2026-11-27): definition to be matched to the model's chemoreflex at the breathing step. |

## Gases and saturations

| Variable | Unit | Reference | Range | Method, cohort, n | Grade | Source | Notes |
|---|---|---|---|---|---|---|---|
| SpO2 (`spo2`) | % | 98 ± 1.3 |  | pulse oximetry, seated; women ~24 y; n=240 | A/B | Goldberg S et al (PMID 28045995) |  |
| Arterial pH (`ph`) | - | 7.4 | 7.35–7.45 | sea level; 20-39 y, female | C | Textbook / laboratory reference interval (Guyton & Hall; local lab RIs); not checked against a retrieved source; Bushfield et al (PMID 42926907) | User decision: sea-level textbook targets; cross-check 18 women at 1100 m: 7.43 +/- 0.02. |
| PaCO2 (`pco2`) | mmHg | 38 | 35–45 | sea level; 20-39 y, female | C | Textbook / laboratory reference interval (Guyton & Hall; local lab RIs); not checked against a retrieved source; Bushfield et al (PMID 42926907); Klaestrup E et al (PMID 21619466) | Women run slightly lower; 1100 m cohort 33.5 +/- 3.8. |
| Bicarbonate (`hco3`) | mmol/L | 24 | 22–26 | 20-39 y, female | C | Textbook / laboratory reference interval (Guyton & Hall; local lab RIs); not checked against a retrieved source; Bushfield et al (PMID 42926907) | 1100 m cohort 22.4 +/- 2.4. |
| Base excess (`be`) | mmol/L | 0 | -2–2 | 20-39 y, female | C | Textbook / laboratory reference interval (Guyton & Hall; local lab RIs); not checked against a retrieved source; Bushfield et al (PMID 42926907) | 1100 m cohort -1.8 +/- 2.6. |
| PaO2 (`po2`) | mmHg | 100 | 85–110 | Crapo: 106.6 - 0.245 x age; 20-39 y, female | B | Crapo RO et al (PMID 10556115) |  |
| End-tidal CO2 (`etco2`) | mmHg | 35 ± 5 |  | capnography, seated with mask (4.65 +/- 0.68 %); women ~24 y; n=240 | A/B | Goldberg S et al (PMID 28045995) |  |
| Mixed venous O2 saturation (`svo2`) | % | 75 | 70–80 | PA catheter; 20-39 y, female | C | Barratt-Boyes BG, Wood EH (PMID 13439270) | Fick check: VO2 192 / CO 5.4 / Hb 13.5 -> ~77 %. |

## Metabolism

| Variable | Unit | Reference | Range | Method, cohort, n | Grade | Source | Notes |
|---|---|---|---|---|---|---|---|
| O2 consumption (`vo2`) | mL/kg/min | 3.2 | 2.6–3.5 | Mifflin REE 1340 kcal/day + Weir -> 192 mL/min; 20-39 y, female | B | Mifflin MD et al (PMID 2305711); Byrne NM et al (PMID 15831804) | User decision: 3.2. Byrne measured 2.6 +/- 0.4 (mixed cohort incl. obese); 1 MET 3.5 overestimates. |
| Respiratory quotient (`rq`) | - | 0.82 |  | post-absorptive; 20-39 y, female | C | Textbook / laboratory reference interval (Guyton & Hall; local lab RIs); not checked against a retrieved source |  |
| Core temperature (`temp`) | degC | 37 | 36.3–37.8 | rectal; adults | A/B | Geneva II et al (PMID 30976605) | Oral 36.6. |
| Fasting glucose (`glucose`) | mmol/L | 4.9 | 3.9–5.5 | 20-39 y, female | C | Textbook / laboratory reference interval (Guyton & Hall; local lab RIs); not checked against a retrieved source | ADA normal fasting < 5.6. |
| Arterial lactate (`lactate`) | mmol/L | 1 ± 0.5 | 0.5–2.2 | arterial; healthy women; n=18 | B | Bushfield et al (PMID 42926907); Klaestrup E et al (PMID 21619466) |  |

## Blood and kidneys

| Variable | Unit | Reference | Range | Method, cohort, n | Grade | Source | Notes |
|---|---|---|---|---|---|---|---|
| Haemoglobin (`hb`) | g/dL | 13.5 | 12–15.5 | venous; non-pregnant women; n=3640 | A (LLN) / C (mean) | Braat S et al (PMID 38432242); Textbook / laboratory reference interval (Guyton & Hall; local lab RIs); not checked against a retrieved source | LLN 11.97 g/dL = WHO 2024 threshold 12.0. |
| Haematocrit (`hct`) | % | 40 | 36–46 | 20-39 y, female | C | Textbook / laboratory reference interval (Guyton & Hall; local lab RIs); not checked against a retrieved source |  |
| O2 dissociation P50 (adult HbA) (`p50`) | mmHg | 26.8 |  | Severinghaus equation; 20-39 y, female | B | Severinghaus JW (PMID 35496) |  |
| Blood volume (`blood_volume`) | mL/kg | 62.8 |  | Nadler for 1.65 m / 60 kg = 3.77 L; ICSH RCM 23.2 + PV 38.6 = 61.8 mL/kg; 20-39 y, female | B/C | Nadler SB et al (PMID 21936146); Pearson TC et al (PMID 7772511) | ICSH whole-body Hct 0.375 vs venous 0.40. |
| Measured GFR (`gfr`) | mL/min/1.73m2 | 109 ± 14.1 |  | inulin/iohexol; women 20-30 y; n=24 | A | Pottel H et al (PMID 28852494) | Not the textbook 120-130. Absolute ~105 mL/min. |
| Urine output (`urine`) | mL/kg/h | 1 | 0.5–— | 20-39 y, female | C | Textbook / laboratory reference interval (Guyton & Hall; local lab RIs); not checked against a retrieved source |  |

## Shunts

| Variable | Unit | Reference | Range | Method, cohort, n | Grade | Source | Notes |
|---|---|---|---|---|---|---|---|
| Ductus arteriosus flow (`pda`) | mL/kg/min | 0 | —–0.5 | adult | - | Textbook / laboratory reference interval (Guyton & Hall; local lab RIs); not checked against a retrieved source | Adult: closed. |
| Foramen ovale flow (`fo`) | mL/kg/min | 0 | —–0.5 | adult | - | Textbook / laboratory reference interval (Guyton & Hall; local lab RIs); not checked against a retrieved source | Adult: closed (a small PFO in ~25 % is ignored). |

## Sources

- **kb2020**: Kawel-Boehm N et al. Reference ranges (normal values) for CMR in adults and children: 2020 update. J Cardiovasc Magn Reson 2020;22:87 (doi:10.1186/s12968-020-00683-3, PMID 33308262)
- **nhsr35**: Wright JD et al. Mean systolic and diastolic BP in adults aged 18 and over, NHANES 2001-2008. Natl Health Stat Report 2011;35
- **nhsr41**: Ostchega Y et al. Resting pulse rate reference data, NHANES 1999-2008. Natl Health Stat Report 2011;41
- **mceniery2008**: McEniery CM et al. Central pressure: variability and impact of cardiovascular risk factors: the Anglo-Cardiff Collaborative Trial II. Hypertension 2008;51:1476-82 (doi:10.1161/HYPERTENSIONAHA.107.105445, PMID 18426997)
- **herbert2014**: Herbert A et al. Establishing reference values for central blood pressure and its amplification in a general healthy population. Eur Heart J 2014;35:3122-33 (doi:10.1093/eurheartj/ehu293, PMID 25112663)
- **kovacs2009**: Kovacs G et al. Pulmonary arterial pressure during rest and exercise in healthy subjects: a systematic review. Eur Respir J 2009;34:888-94 (doi:10.1183/09031936.00145608, PMID 19324955)
- **kovacs2012**: Kovacs G et al. Pulmonary vascular resistances during exercise in normal subjects: a systematic review. Eur Respir J 2012;39:319-28 (doi:10.1183/09031936.00008611, PMID 21885394)
- **zeder2024**: Zeder K et al. Pulmonary arterial wedge pressure in healthy subjects: a meta-analysis. Eur Respir J 2024;64:2400967 (doi:10.1183/13993003.00967-2024, PMID 38964777)
- **escers2022**: Humbert M et al. 2022 ESC/ERS Guidelines for pulmonary hypertension. Eur Heart J 2022;43:3618 (Table 11) (doi:10.1093/eurheartj/ehac237, PMID 36017548)
- **czernin1993**: Czernin J et al. Influence of age and hemodynamics on myocardial blood flow and flow reserve. Circulation 1993;88:62-9 (doi:10.1161/01.cir.88.1.62, PMID 8319357)
- **brown2018**: Brown LAE et al. CMR quantitative perfusion mapping, healthy volunteers (median age 23). 2018
- **peterson2007**: Peterson LR et al. Sex differences in myocardial oxygen and glucose metabolism. J Nucl Cardiol 2007;14:573-81 (doi:10.1016/j.nuclcard.2007.03.001, PMID 17679067)
- **zarrinkoob2015**: Zarrinkoob L et al. Blood flow distribution in cerebral arteries. J Cereb Blood Flow Metab 2015;35:648-54 (doi:10.1038/jcbfm.2014.241, PMID 25564234)
- **ito2004**: Ito H et al. Database of normal human cerebral blood flow, volume, O2 extraction and metabolic rate (PET). Eur J Nucl Med Mol Imaging 2004;31:635-43 (doi:10.1007/s00259-003-1430-8, PMID 14730405)
- **leelueck2014**: Lee SC, Lueck CJ. Cerebrospinal fluid pressure in adults. J Neuroophthalmol 2014;34:278-83 (doi:10.1097/WNO.0000000000000155, PMID 25133881)
- **andresen2014**: Andresen M, Juhler M. Intracranial pressure following complete removal of a small demarcated brain tumor (telemetric ICP). J Neurosurg 2014 (doi:10.3171/2014.2.JNS132209, PMID 24702326)
- **villa2020**: Villa G et al. Renal blood flow by phase-contrast MRI: review (Eckerbom data, Table 2). MAGMA 2020;33:3-21 (doi:10.1007/s10334-019-00772-0, PMID 31422518)
- **toering2015**: Toering TJ et al. Sex differences in renal hemodynamics and RAAS activity in healthy young adults. Physiol Rep 2015;3:e12434 (doi:10.14814/phy2.12434, PMID 26149279)
- **yzet2010**: Yzet T et al. Hepatic vascular flow measurements by phase-contrast MRI in healthy volunteers. Eur J Radiol 2010;73:119-24 (doi:10.1016/j.ejrad.2008.09.032, PMID 19008062)
- **szinnai2001**: Szinnai G et al. Sex-related differences in portal vein blood flow (Doppler). Scand J Gastroenterol 2001;36:1167 (doi:10.1080/003655201750153458, PMID 11346210)
- **mohiaddin1990**: Mohiaddin RH et al. Superior vena cava flow by velocity-encoded MRI. Radiology 1990;177:537-41 (doi:10.1148/radiology.177.2.2217797, PMID 2217797)
- **nadler1962**: Nadler SB et al. Prediction of blood volume in normal human adults. Surgery 1962;51:224-32 (PMID 21936146)
- **icsh1995**: Pearson TC et al. ICSH: interpretation of measured red cell mass and plasma volume in adults. Br J Haematol 1995;89:748-56 (doi:10.1111/j.1365-2141.1995.tb08411.x, PMID 7772511)
- **braat2024**: Braat S et al. Haemoglobin thresholds to define anaemia in non-pregnant women. Lancet Haematol 2024 (doi:10.1016/S2352-3026(24)00030-9, PMID 38432242)
- **severinghaus1979**: Severinghaus JW. Simple, accurate equations for human blood O2 dissociation computations. J Appl Physiol 1979;46:599-602 (doi:10.1152/jappl.1979.46.3.599, PMID 35496)
- **pottel2017**: Pottel H et al. Age-dependent reference intervals for measured GFR. Clin Kidney J 2017;10:545-51 (doi:10.1093/ckj/sfx026, PMID 28852494)
- **parreira2010**: Parreira VF et al. Breathing pattern and thoracoabdominal motion in healthy subjects (RIP), supine. Rev Bras Fisioter 2010;14:411-6 (doi:10.1590/S1413-35552010000500010, PMID 21180867)
- **hall2021**: Hall GL et al. GLI reference equations for static lung volumes. Eur Respir J 2021;57:2000289 (doi:10.1183/13993003.00289-2020, PMID 33707167)
- **drummond1996**: Drummond GB et al. Supine vs upright FRC. Br J Anaesth 1996;76:560 (PMID 8652330)
- **gertler2021**: Gertler R. Respiratory mechanics. Anesthesiol Clin 2021;39:415-40 (doi:10.1016/j.anclin.2021.04.003, PMID 34392877)
- **valach2026**: Valach C et al. Oscillometry reference values (LEAD cohort). ERJ Open Res 2026;12:00159-2025 (doi:10.1183/23120541.00159-2025, PMID 41497331)
- **hart1963**: Hart MC et al. Relation between anatomic respiratory dead space and body size. J Appl Physiol 1963;18:519-22 (doi:10.1152/jappl.1963.18.3.519, PMID 31094493)
- **lindner2024**: Lindner M et al. Oesophageal pressure swings in healthy volunteers. BMC Pulm Med 2024;24:289 (doi:10.1186/s12890-024-03096-5, PMID 38902702)
- **goldberg2017**: Goldberg S et al. Chemosensitivity in young women (n~240). PLoS One 2017;12:e0168930 (doi:10.1371/journal.pone.0168930, PMID 28045995)
- **bushfield2026**: Bushfield et al. Arterial blood gases in healthy women at 1100 m (Table 2). Compr Physiol 2026;16:e70279 (doi:10.1002/cph4.70279, PMID 42926907)
- **crapo1999**: Crapo RO et al. Arterial blood gas reference values for sea level and 1400 m. Am J Respir Crit Care Med 1999;160:1525-31 (doi:10.1164/ajrccm.160.5.9806006, PMID 10556115)
- **barrattboyes1957**: Barratt-Boyes BG, Wood EH. The oxygen saturation of blood in the venae cavae, right heart chambers and pulmonary vessels of healthy subjects. J Lab Clin Med 1957;50:93-106 (PMID 13439270)
- **byrne2005**: Byrne NM et al. Metabolic equivalent: one size does not fit all. J Appl Physiol 2005;99:1112-9 (doi:10.1152/japplphysiol.00023.2004, PMID 15831804)
- **mifflin1990**: Mifflin MD et al. A new predictive equation for resting energy expenditure. Am J Clin Nutr 1990;51:241-7 (doi:10.1093/ajcn/51.2.241, PMID 2305711)
- **geneva2019**: Geneva II et al. Normal body temperature: a systematic review. Open Forum Infect Dis 2019;6:ofz032 (doi:10.1093/ofid/ofz032, PMID 30976605)
- **klaestrup2011**: Klaestrup E et al. Reference intervals and age/gender dependency for arterial blood gases and electrolytes. Clin Chem Lab Med 2011;49:1495 (doi:10.1515/CCLM.2011.603, PMID 21619466)
- **textbook**: Textbook / laboratory reference interval (Guyton & Hall; local lab RIs); not checked against a retrieved source

## Open items

- No verified fasting SMA volume flow or descending-aorta flow (portal flow and ~60 % of CO are used).
- No awake respiratory compliance cohort (grade C).
- Mixed venous saturation, electrolytes, urine output and fluid compartments are textbook values.
- Le Ven 2016 (n=434, age 26 ± 4, CMR) would be the ideal heart cohort; its full text was not available.
- Menstrual phase was uncontrolled in most sources; it affects ventilation, PaCO₂ and temperature.
