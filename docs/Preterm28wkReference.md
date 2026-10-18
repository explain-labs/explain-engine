# Preterm neonate (28 wk, 1 kg) at 72 h: literature reference values

Reference values for validating a preterm scenario (working name `preterm_28wk_72h`): an infant born
at 28 weeks weighing about 1 kg, at about 72 h postnatal age. Compiled 2026-10-18 from the reference
PDFs (kept out of the repository) and a PubMed search, with every judgement call made by the model's
author (see the decisions log).

The machine-readable version is [`scripts/reference/preterm_28wk_72h.json`](../scripts/reference/preterm_28wk_72h.json),
in the same schema as the term set ([`TermNeonateReference.md`](TermNeonateReference.md)): one entry per
variable with value, range, method, age, sources (DOI/PMID), grade and the model read-out to compare
against. Entries without a model read-out are reference-only context.

## The reference state

Most preterm values depend on the clinical state, so the state is part of the reference:

- 28+0 weeks, 1.0 kg, 72 h; appropriate for gestational age
- **respiratory support:** nasal CPAP 6 cmH₂O, FiO₂ 0.25, mild / post-surfactant RDS, spontaneous breathing,
  caffeine on board. The engine's Ventilator CPAP mode cannot drive a spontaneously breathing extreme
  preterm, so CPAP is represented as a recruited-lung state plus the inspired FiO₂ (as in `bischoff_cohort`)
- **ductus:** small, restrictive, left-to-right, haemodynamically insignificant (~1 mm, LVO/RVO ~1.1);
  small left-to-right PFO
- **blood:** untransfused, delayed cord clamping
- **nutrition:** trophic feeds + parenteral nutrition, measured between feeds
- **environment:** humidified incubator, ~35 °C air, ~70 % relative humidity
- **apnoea model off:** occasional pauses are possible at day 3, frequent apnoea is not yet typical

**Grades**
- **A**: 27–30 wk infants measured on day 2–4
- **B**: wider GA band, another day, a figure read-off, or a guideline target
- **C**: textbook, extrapolation, or derived from other variables

## Measurement method matters

- **Blood pressure:** the target is **invasive** (umbilical arterial catheter, Elsayed 2023), because the
  model reads the aorta. Cuff values for the same infants read ~4 mmHg higher for the mean
  (van Zadelhoff 2023 calculator, GA 28+0, 72 h: 59/32, mean 43).
- **Cardiac output:** day-3 echo values are the anchor. Cardiac MRI (Groves 2011) was done around day 10,
  after the duct closed, and sits higher; it serves as the upper bracket. Stroke volume is taken from
  echo LVO ÷ HR (~1.4 mL/kg), not from MRI (1.73 mL/kg at HR 142).
- **SVC flow:** echo reads ~14 mL/kg/min below MRI with wide scatter (Ficial 2013). The two echo methods
  in one cohort differ by 35 mL/kg/min (Bischoff: modified 73, traditional 108).
- **Organ flows:** single-vessel Doppler volume flows add up to nearly the whole descending aorta, so they
  are treated as upper estimates. Brain flow comes from tracer methods (xenon, NIRS); kidney flow from
  newborn physiology (3–6 % of cardiac output) checked against GFR.
- **Tidal breathing:** no-mask data (electrical impedance, Liew 2020), as for the term set. Mask and
  pneumotachograph studies read ~15 % higher.
- **Lung mechanics and FRC:** mostly from intubated or older infants; the CPAP studies with numbers
  (Courtney 2010, Saslow 2006, Pandit 2001, Lavizzari 2014) were not available.
- **Oxygen:** PaO₂ at SpO₂ 90–95 % only matches with a fetal-haemoglobin dissociation curve
  (P50 ~18.5 mmHg at standard conditions). An adult curve would need PaO₂ ~67 for SpO₂ 93 %.
- **VO₂:** compared with the whole-body O₂ uptake at the lungs (Metabolism plus the myocardium).

## Balance rules

The model enforces conservation, so the targets were chosen to close:

- **Aortic side:** LVO 215 = SVC 85 + descending aorta 110 + ductal shunt ~20 (+ coronaries)
- **Venous side:** RVO 195 = systemic venous return + PFO shunt
- **Upper body:** SVC 85 = brain 28 + rest ~57
- **Lower body:** descending aorta 110 = gut 25 + liver/spleen 20 + kidneys 10 + rest ~55
- **Kidney:** blood flow 10 with GFR ~0.5 mL/min/kg and Hct 43 gives a filtration fraction of ~8 %
- **CO₂:** VO₂ 6.0 × RQ 0.95 ≈ VCO₂ 5.7; alveolar ventilation ≈ RR 62 × (Vt 5.0 − Vd 3.0) ≈ 105–115
  mL/kg/min gives PaCO₂ ~45–47
- **O₂ (Fick):** Hb 14.5, SaO₂ 0.93, systemic flow 195, VO₂ 6 gives SvO₂ ~77 %

## Reference values

### Hemodynamics

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Heart rate | **155** bpm | 140–170 | B | Deshpande 2023, Bischoff 2021, Groves 2011 |
| Systolic BP | **54** mmHg | 43–64 (P5-P95) | A | Elsayed 2023, van Zadelhoff 2023, Guan 2026 |
| Diastolic BP | **29** mmHg | 25–36 (P5-P95) | A | Elsayed 2023, van Zadelhoff 2023 |
| Mean arterial pressure | **39** mmHg | 30–47 (P5-P95) | A | Elsayed 2023, van Zadelhoff 2023, Vesoulis 2016 |
| Pulse pressure | **25** mmHg | — | B | Elsayed 2023 |
| Central venous pressure | **4** mmHg | 2–6 | A/B | Trevor Inglis 2007, Choi 2015, Siassi 1980 |
| Pulmonary artery pressure, systolic | **30** mmHg | 24–38 | C | Skinner 1992, Skinner 1991, Patel 2019 |
| Pulmonary artery pressure, mean | **20** mmHg | 16–25 | C | Skinner 1992 |
| Pulmonary artery pressure, diastolic | — | < 27 | C | Skinner 1991 |

### Heart

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| LV end-diastolic volume | **2.2** mL/kg | 1.8–2.7 | B | Groves 2011 |
| LV end-systolic volume | **0.75** mL/kg | 0.4–1.2 | B | Groves 2011 |
| LV stroke volume | **1.4** mL/kg | 1.1–1.7 | B | Deshpande 2023, Bischoff 2021, Kluckow 2000, Groves 2011 |
| LV ejection fraction | **65** % | 58–80 | B | Groves 2011, Toyoshima 2024 |
| RV end-diastolic volume | **2.7** mL/kg | 2.2–3.2 | C | Levy 2015 |
| RV end-systolic volume | **1.4** mL/kg | 1–1.8 | C | Levy 2015 |
| RV stroke volume | **1.25** mL/kg | 1–1.6 | C | Deshpande 2023 |
| RV ejection fraction | **50** % | 45–60 | B/C | Toyoshima 2024, Levy 2015 |
| RV fractional area change | **31** % | 26–35 | A | Levy 2015 |
| TAPSE | **0.52** cm | 0.4–0.65 | B | Koestenberger 2011 |

### Flows

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Left ventricular output | **215** mL/kg/min | 180–280 | B | Deshpande 2023, Bischoff 2021, Kluckow 2000, Evans 1996, Groves 2011, Sloot 2010 |
| Right ventricular output | **195** mL/kg/min | 160–260 | B | Deshpande 2023, Bischoff 2021, Groves 2011 |
| LVO/RVO ratio | **1.1** | 1–1.25 | B | Bischoff 2021 |
| SVC flow | **85** mL/kg/min | 60–115 | B | Kluckow 2000, Deshpande 2023, Groves 2011, Ficial 2013, Bischoff 2021 |
| Descending aorta flow | **110** mL/kg/min | 80–150 | B | Groves 2011, Broadhouse 2013 |
| Cerebral blood flow | **28** mL/kg/min | 18–40 | B | Greisen 1986, Pereira 2021, Edwards 1988, Alderliesten 2016 |
| Intestinal (SMA) flow | **25** mL/kg/min | 15–40 | C | van Bel 1990, Martinussen 1996 |
| Renal blood flow | **10** mL/kg/min | 6–15 | C | Visser 1992, Vieux 2010 |
| Coeliac (liver + spleen) flow | **20** mL/kg/min | 12–30 | C | El-Khuffash 2008 |

### Shunts

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Ductal shunt flow (L->R) | **22** mL/kg/min | 10–40 | C | Bischoff 2021, Broadhouse 2013 |
| Ductal diameter | **1** mm | 0.8–1.4 | B | Deshpande 2023, Bischoff 2021 |
| Foramen ovale shunt (L->R) | **5** mL/kg/min | 0–15 | C | Bischoff 2021 |

### Breathing (nCPAP 6)

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Respiratory rate | **62** /min | 50–80 | A | Welty 2018, Liew 2020, Dimitriou 1995 |
| Tidal volume | **5** mL/kg | 4.2–6 | B | Liew 2020, Reiterer 1993, Dimitriou 1995, Kraaijenga 2015 |
| Minute ventilation | **300** mL/kg/min | 250–380 | B | Liew 2020 |
| Inspiratory time fraction (Ti/Ttot) | **0.38** | 0.33–0.44 | B | Reiterer 1993, Dimitriou 1995 |
| Respiratory system compliance | **0.69** mL/cmH2O | 0.45–1 | B | Bhutani 1988, Cunningham 1989, Reiterer 1993, Gerhardt 1980, Davis 1988 |
| Lung compliance (both lungs) | **0.8** mL/cmH2O/kg | 0.5–1.2 | B | Bhutani 1988, Cunningham 1989, Reiterer 1993, Davis 1988 |
| Chest wall compliance | **5** mL/cmH2O/kg | 3–7 | B/C | Gerhardt 1980 |
| Respiratory system resistance | **65** cmH2O/L/s | 50–100 | B | Reiterer 1993, Cunningham 1989, Bhutani 1988 |
| Functional residual capacity | **22** mL/kg | 18–28 | B | da Silva 1994 |
| Anatomic dead space | **3** mL/kg | 2.2–3.5 | B/C | Numa 1996, Williams 2021, Liew 2020 |
| Physiological dead space fraction (Vd/Vt) | **0.6** | 0.55–0.7 | B | Williams 2021, Liew 2020 |
| Inspired O2 fraction | **0.25** | 0.21–0.3 | state | Sweet 2023 |
| Apnoea / periodic breathing | — | — | C | Pre-Vent 2023 |

### Gases and oxygen

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| SpO2 (pre-ductal) | **93** % | 90–95 (target band) | B | Sweet 2023, Askie 2018, Hagadorn 2006 |
| pH | **7.26** | 7.22–7.32 | A/B | Bonsante 2017, Notz 2024 |
| pCO2 | **46** mmHg | 42–52 | A/B | Fabres 2007, Thome 2015, Liew 2020 |
| HCO3 | **20.5** mmol/L | 19–22 | B | Bonsante 2017 |
| Base excess | **-5.5** mmol/L | -8–-3 | A | Bonsante 2017, Notz 2024 |
| PaO2 | **50** mmHg | 42–58 | A | Quine 2009, Castillo 2008 |
| Hb-O2 P50 (standard) | **18.5** mmHg | 17.7–19.3 | A/B | De Halleux 2002 |
| Mixed venous O2 saturation | **77** % | 70–82 | C | Yapakci 2014 |

### Metabolism and thermal

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Oxygen consumption | **6** mL/kg/min | 5–7 | B | Bauer 1997, Bauer 2003, Bauer 2001, Schulze 2001 |
| Respiratory quotient | **0.95** | 0.85–1 | B | Bauer 2003, Forsyth 1992 |
| Core temperature | **37** degC | 36.5–37.5 | C | Sauer 1984 |
| Incubator air temperature | **35** degC | 34–36 | C | Sauer 1984 |
| Incubator relative humidity | **70** % | 60–80 | B | Adv Neonatal Care 2021, J Perinatol 2025 |
| Insensible water loss | **40** mL/kg/day | 25–60 | B | J Perinatol 2025, Lorenz 1995 |
| Plasma glucose | **6.5** mmol/L | 4–8 | A/B | Liu 2026 |
| Lactate | **1.4** mmol/L | 1–2 | A | Liu 2026, Deshpande 1997 |

### Blood

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| Hemoglobin | **14.5** g/dL | 13–16 | B/C | Jopling 2009, Banerjee 2015, Puia-Dumitrescu 2019, Mintzer 2014 |
| Hematocrit | **43** % | 38–47 | B/C | Jopling 2009, Banerjee 2015, Mintzer 2014 |
| Fetal haemoglobin fraction | **90** % | 85–95 | A/B | De Halleux 2002 |
| Blood volume | **80** mL/kg | 70–90 | B | Aladangady 2004, Aladangady 2006, Bauer 1993 |

### Kidneys

| Variable | Reference | Range | Grade | Sources |
|---|---|---|---|---|
| GFR | **8.5** mL/min/1.73m2 | 5–13.5 | C | Vieux 2010, Bueva 1994, Lorenz 1995 |
| Urine output | **3** mL/kg/h | 2–5 | B | Lorenz 1995 |
| Fractional sodium excretion | **5** % | 3–10 | B | Lorenz 1995 |
| Plasma creatinine | **95** umol/L | 75–130 | B/C | Miall 1999 |

## First look at the model (step 5)

`preterm_28wk_72h` as first generated by `scripts/_make_preterm_28wk_72h.mjs`, before any calibration
against this set. Its levers are the reference values where the reference defines them (weight, HR
reference, baroreflex MAP 39, minute volume, RR, Ti/Ttot, FiO₂, chemoreceptor set-points, PDA 1 mm,
Hb, P50, VO₂, incubator) and the `_make_preterm.mjs` 28 wk row elsewhere (severe-RDS lungs, PVR ×1.75,
contractility 0.9). Probe: `node scripts/probe_term_reference.mjs preterm_28wk_72h --ref scripts/reference/preterm_28wk_72h.json`.

- **Matches:**
  - LVO 186, RVO 188, SVC 80
  - gut 21, liver/spleen 21
  - ductal diameter 1.0 mm
  - CVP 2.5
  - pH 7.28, pCO₂ 48.7, BE −3.1
  - VO₂ 6.6
  - minute volume 362, Ti/Ttot 0.38, Vd/Vt 0.67
  - Hb 14.4 / Hct 44, blood volume 86
  - lactate 1.5, core temperature 37.0
- **Far off:**
  - oxygenation: PaO₂ 25.5, SpO₂ 61, SvO₂ 45 (the unsupported severe-RDS lung row, not a recruited CPAP lung)
  - BP 23/18 (21) against 54/29 (39), with HR 186 (baroreflex at full drive)
  - weak, dilated ventricles: LV EF 31 %, RV EF 25 %, EDV 3.2 / 4.0 mL/kg
  - RR 111 and Vt 3.3, while minute volume is about right
  - lungs: compliance 0.49 /kg against 0.8 and FRC 14 against 22; the chest wall is too compliant (15 /kg against 5)
  - kidneys: GFR 0 and no urine at this BP; renal flow 20.5 against 10
  - flows: brain 45 against 28; descending aorta 80 against 110; FO shunt 16 against ~5; LVO/RVO 0.99
  - others: dead space 2.2 against 3.0; glucose 4.0 against 6.5; RQ 0.81 against 0.95

## Recalibrations made from this reference

Each change is a named lever in `scripts/_make_preterm_28wk_72h.mjs`; the scenario is regenerated from
term_neonate after every change (`--name` and `--set LEVER=value` run prototypes without touching it).

| Step | Change | Before → after | Basis |
|---|---|---|---|
| 6.1 | Lungs and oxygenation: alveolar `el_base` ×9.067 → ×5.55; alveolar `u_vol` ×0.50 → ×0.80; chest wall (`THORAX.el_base`) ×1 → ×2.94; `Shunts.ips_res` 1 900 → 14 000 | lung compliance 0.49 → 0.80 /kg; chest wall 14.7 → 5.0 /kg; FRC 14 → 22 mL/kg; SpO₂ 61 → 93 %; PaO₂ 25 → 57; SvO₂ 45 → 72 | Bhutani 1988, Reiterer 1993 (compliance); Gerhardt 1980 (chest wall); da Silva 1994 (FRC on PEEP); SpO₂ target (Sweet 2023). PaO₂ follows from P50 18.5 at pH 7.28 (in vivo ~21): SpO₂ 93 % is matched, PaO₂ lands at ~57, inside 42–58 |
| 6.2 | BP and heart: heart chambers `el_max`/`el_min` ×2.4 (`*_factor_scaling_ps`); arteries `el_base` ×5 (implicit aorta); systemic resistances ×1 → ×2.2; pulmonary ×1.75 → ×2.5; `cont_factor` 0.9 → 1.0 | BP 22/18 (20) → 52/30 (41.5); HR 186 → 160 with the baroreflex near neutral (HR ×1.5 → ×1.03, SVR ×2.0 → ×1.07); LV EDV/ESV/EF 3.1/2.2/30 % → 2.65/0.94/65 %; RV EF 23 → 50 %; PAP 20/16 → 31.5/25; GFR 0 → 10.6 | Weight scaling shrinks volumes but keeps term stiffness, so the 1 kg heart and arteries were ~3.5× too compliant per kg. Elsayed 2023 (BP shape), Groves 2011 (EF, volumes), Skinner 1992 (PAP). The pulse-wave-velocity size rule of `build_patient.mjs` (×1.88) leaves a pulse pressure of ~10; ×5 matches the invasive 54/29 |
| 6.3 | Breathing: Breathing effort gain recalibrated (`rmp_calibrated` reset; term's frozen ~334 → ~1230 mmHg/L); dead space `DS.u_vol` ×1.36; `Metabolism.resp_q` 0.8 → 0.95 | RR 81 → 61; Vt 3.2 → 4.8; MV 262 → 293; dead space 2.2 → 3.0 mL/kg; pCO₂ 49.1 → 46.1; RQ at the lung 0.80 → 0.93; breathing chemoreflex ×1.68 → ×0.98 | The scenario inherited term's effort gain, calibrated on ~5× more compliant lungs, so breaths fell short. Liew 2020, Welty 2018 (pattern); Numa & Newth 1996 (dead space); Bauer 2003, Forsyth 1992 (RQ on PN) |

## Decisions log (2026-10-18)

All choices were made by the model's author after the evidence was presented.

| Topic | Decision | Basis |
|---|---|---|
| State | Stable on nCPAP 6, FiO₂ 0.25; small restrictive L→R PDA; untransfused | Typical day-3 28-weeker |
| Bischoff 2021 weight | Grade B; outputs between its no-PDA and hsPDA groups, gases as a cross-check (84 % on HFJV) | Younger cohort (25.5 wk, 720 g) |
| BP | Elsayed day-3 invasive median 54/29 (39). The author's first estimate (45/25) sits at P5–P10 | Only invasive source at 28 wk, day 3 |
| SVC anchor | MRI, then lowered 95 → 85 so the flows close | Ficial 2013; balance rule |
| Stroke volume | Echo-based ~1.4 mL/kg at HR 155 | Day-3 echo outputs |
| PAP | RV/systemic pressure ratio 0.55 | Skinner 1992 (0.44 healthy – 0.72 HMD) |
| HR | Grade B accepted | Alonzo/Eenkhoorn centile tables not available |
| Flow balance | LVO 215 / RVO 195 kept; SVC 85, DAo 110 | Option A |
| Feeding | Trophic feeds + PN, between feeds | SMA ~25 |
| Organ flows | Brain 28, coeliac 20 accepted; kidneys lowered 30 → 10 | Filtration fraction with GFR ~0.5 |
| Breathing | No-mask Vt 5.0; dead space ~3 mL/kg; lung compliance 0.8 /kg | Liew 2020; Numa & Newth 1996 |
| Gases | VO₂ 6.0; BE −5.5 (so pH ~7.26); SpO₂ 93; SvO₂ by Fick | Bonsante 2017; European Consensus 2022 |
| 6.1 lungs | Match SpO₂ 93 and accept PaO₂ ~57 rather than 50 | Dissociation curve at pH 7.28 |
| 6.2 heart/BP | Arterial stiffness ×5 (match the invasive pulse pressure) instead of the PWV rule ×1.88; MAP (41.5) and SpO₂ (96 %) fine-tuned after the flow step | Elsayed 2023 |
| Blood | Delayed clamping: Hb 14.5 / Hct 43 | Jopling 2009, Banerjee 2015, sampling losses |
| Glucose / GFR | Glucose 6.5 (calm); GFR ~0.5 mL/min/kg on day 3 | Liu 2026; Vieux 2010 −20 % |

## Open items

- **Full texts that could raise grades:** Alonzo 2018 and Eenkhoorn 2026 (HR centiles), Kluckow & Evans
  2000 tables (SVC/LVO by hour), Kehrer 2005 (day-3 CBF by GA), the CPAP mechanics studies listed above,
  Vieux 2010 day-2 data, Sauer 1984 thermoneutral tables.
- **Follow-up:** other scenarios generated from term_neonate (the archived preterm rows, `bischoff_cohort`) also carry term's frozen breathing effort gain (`Breathing.rmp_calibrated`).
- **Model implications to check in the first look:** dead space must rise from the term ~2.2 to ~3 mL/kg;
  the dissociation curve must be fetal (P50 ~18.5–19); the kidney bed must be small.

## Sources

- **Elsayed 2023**: Elsayed Y, Ahmed F. Blood pressure normative values in preterm infants during postnatal transition. Pediatr Res 2024;95:698-704. doi:10.1038/s41390-023-02788-8; PMID 37667035
- **van Zadelhoff 2023**: van Zadelhoff AC et al. Age-dependent changes in arterial blood pressure in neonates during the first week of life. Br J Anaesth 2023;130:585-94. doi:10.1016/j.bja.2023.01.024; PMID 36858885
- **Guan 2026**: Guan et al. Blood pressure changes in preterm infants of 28 to <37 weeks within 7 days after birth. Front Pediatr 2026. doi:10.3389/fped.2026.1757399; PMID 41878454
- **Vesoulis 2016**: Vesoulis ZA et al. Empirical estimation of the normative blood pressure in infants <28 weeks gestation. J Perinatol 2016;36:291-5. doi:10.1038/jp.2015.185; PMID 26633144
- **Deshpande 2023**: Deshpande P et al. Cerebral oxygenation, cardiac output and blood pressure during transition in extremely low gestational age neonates. Front Pediatr 2023;11:1187769. doi:10.3389/fped.2023.1187769; PMID 37654688
- **Bischoff 2021**: Bischoff AR et al. Assessment of superior vena cava flow and cardiac output in different patterns of PDA shunt. Echocardiography 2021;38:1524-33. doi:10.1111/echo.15163; PMID 34309068
- **Groves 2011**: Groves AM et al. Functional cardiac MRI in preterm and term newborns. Arch Dis Child Fetal Neonatal Ed 2011;96:F86-91. doi:10.1136/adc.2010.189142; PMID 20971721
- **Kluckow 2000**: Kluckow M, Evans N. Superior vena cava flow in newborn infants: a novel marker of systemic blood flow. Arch Dis Child Fetal Neonatal Ed 2000;82:F182-7. doi:10.1136/fn.82.3.f182; PMID 10794783
- **Evans 1996**: Evans N, Kluckow M. Early determinants of right and left ventricular output in ventilated preterm infants. Arch Dis Child Fetal Neonatal Ed 1996;74:F88-94. doi:10.1136/fn.74.2.f88; PMID 8777673
- **Ficial 2013**: Ficial B et al. Validation of echocardiographic measurements of systemic blood flow volume in newborn infants. J Am Soc Echocardiogr 2013;26:1365-71. doi:10.1016/j.echo.2013.08.019; PMID 24075229
- **Broadhouse 2013**: Broadhouse KM et al. Assessment of PDA shunt and systemic blood flow in newborns using cardiac MRI. NMR Biomed 2013;26:1135-41. doi:10.1002/nbm.2927; PMID 23412748
- **Sloot 2010**: Sloot SC et al. Central blood flow measurements in stable preterm infants after the transitional period. Arch Dis Child Fetal Neonatal Ed 2010;95:F369-72. doi:10.1136/adc.2009.169169; PMID 20530103
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
- **Edwards 1988**: Edwards AD et al. Cotside measurement of cerebral blood flow in ill newborn infants by near infrared spectroscopy. Lancet 1988;2:770-1. doi:10.1016/s0140-6736(88)92418-x; PMID 2901613
- **Alderliesten 2016**: Alderliesten T et al. Reference values of regional cerebral oxygen saturation during the first 3 days of life in preterm neonates. Pediatr Res 2016;79:55-64. doi:10.1038/pr.2015.186; PMID 26389823
- **van Bel 1990**: van Bel F et al. Superior mesenteric artery blood flow velocity and estimated volume flow: duplex Doppler US. Radiology 1990;174:165-9. doi:10.1148/radiology.174.1.2403678; PMID 2403678
- **Martinussen 1996**: Martinussen M et al. Mesenteric blood flow velocity in preterm infants. Pediatr Res 1996;39:275-80. doi:10.1203/00006450-199602000-00015; PMID 8825800
- **Visser 1992**: Visser MO et al. Renal blood flow in neonates: quantification with color flow and pulsed Doppler US. Radiology 1992;183:441-4. doi:10.1148/radiology.183.2.1561347; PMID 1561347
- **El-Khuffash 2008**: El-Khuffash A et al. Coeliac flow / LVO ratio and the haemodynamically significant PDA. Neonatology 2008;93:206-12. doi:10.1159/000110869; PMID 17992021
- **Welty 2018**: Welty SE et al. PLoS One 2018;13:e0193807 (bubble CPAP, 29.6 wk, 44 h). doi:10.1371/journal.pone.0193807; PMID 29590143
- **Liew 2020**: Liew Z et al. Physiological effects of high-flow nasal cannula vs CPAP in preterm infants. Arch Dis Child Fetal Neonatal Ed 2020;105:87-93. doi:10.1136/archdischild-2018-316773; PMID 31123057
- **Dimitriou 1995**: Dimitriou G, Greenough A, Chan V. Early Hum Dev 1995;41:61-8. doi:10.1016/0378-3782(94)01609-s; PMID 7781569
- **Reiterer 1993**: Reiterer F, Sivieri E, Abbasi S, Bhutani VK. Pediatr Pulmonol 1993;15:117-21. doi:10.1002/ppul.1950150209; PMID 8474783
- **Bhutani 1988**: Bhutani VK et al. Pediatr Pulmonol 1988;4:150-8. doi:10.1002/ppul.1950040306; PMID 3374983
- **Cunningham 1989**: Cunningham MD. J Perinatol 1989;9:56-9. PMID 2709153
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
