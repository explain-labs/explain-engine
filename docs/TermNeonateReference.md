# Term neonate at 72 h: literature reference values

Reference values for validating the `term_neonate_72h` scenario: a healthy term neonate of about 3.5 kg
at about 72 h postnatal age, in a calm, mixed sleep/awake state. Compiled 2026-10-18 from three
reference PDFs (kept out of the repository) and a PubMed search.

The machine-readable version is [`scripts/reference/term_neonate_72h.json`](../scripts/reference/term_neonate_72h.json).
It has one entry per variable with value, spread, method, age, sources (DOI/PMID), grade and the
model read-out to compare against.

**Grades**
- **A**: healthy term infants measured at day 2–4
- **B**: first week, a mixed cohort, or a figure read-off
- **C**: textbook range or extrapolation; no healthy-term primary data found

**Reading the tables:** ranges are the study's own normal limits: P2.3–P97.7, P5–P95, mean ± 2 SD
or a range, as marked. "Fig" means the value was read off a published graph (±2 mmHg / ±5 mL/kg/min).

## Measurement method matters

The comparison is only fair when the model read-out matches what the clinicians measured. The main
pitfalls found while compiling this set:

- **Blood pressure:** the references are cuff (oscillometric). The model reads the ascending aorta.
- **Heart rate:** it depends on behavioural state. Quiet sleep is ~112, a calm mixed state ~117–120,
  awake about +6 bpm. This set uses the calm, mixed state.
- **Cardiac output: compare stroke volume per kg first.** The two MRI studies differ in output
  (177 vs ~200–218 mL/kg/min) mainly because their heart rates differed (100 vs 142); SV/kg agrees
  (1.6 vs 1.7). Echo output is about twice as noisy as MRI (repeatability ±109 vs ±50 mL/kg/min).
- **Tidal breathing:** a face mask with a pneumotachograph adds ~13 % to Vt and ~30 % to minute
  ventilation, so dead-space-free (flow-through) data are used.
- **Blood gases:** capillary values from 48 ± 12 h. Capillary pH and pCO₂ approximate arterial
  values; capillary pO₂ does not, so PaO₂ stays grade C.
- **Lactate:** plasma (GLOW) reads lower than capillary whole blood (Cousineau).
- **Regional flows:** MRI (PC-MRA) and Doppler volume-flow estimates differ widely. The brain-flow
  MRI cohorts were scanned for clinical reasons at term-equivalent age.

## Hemodynamics

| Variable | Reference | Range | Method, age, n | Grade | Source |
|---|---|---|---|---|---|
| Heart rate | **118** bpm | 91–145 (P5–P95) | monitor pulse, day 3, n=2628 | A | Satoh 2016; also Hannover 2018 (quiet sleep 112, 87–133), Norway 2021, He 2011 (126 → 120 from day 1 to 3) |
| Systolic BP | **74** mmHg | 60–89 (P2.3–P97.7) | NIBP, GA 40 day 3 (Fig 4a), n=607 | A | van Zadelhoff 2023; Satoh 2016 70.5 ± 7.4 |
| Diastolic BP | **46** mmHg | 31–61 | NIBP (Fig 4c) | A | van Zadelhoff 2023; Satoh 44.3 ± 6.7 |
| Mean BP | **58** mmHg | 45–72 | NIBP (Fig 4b) | A | van Zadelhoff 2023 |
| Pulse pressure | ≈ 28 mmHg | — | derived | B | as above |
| CVP | — | 2–8 mmHg | invasive, sick infants only | C | textbook |
| PAP systolic | **36.0 ± 6.5** mmHg | (24 h 43.8, 48 h 38.1) | echo, 72 h, n=76 | A/B | Kang 2016; its "upper 95 % limit 39.97" looks like a CI of the mean, not a normal limit |
| PAP diastolic | **13.3 ± 6.2** mmHg | — | echo, 72 h | A/B | Kang 2016 |
| PAP mean | **25.3 ± 8.3** mmHg | — | echo, 72 h | A/B | Kang 2016 |

## Heart (cardiac MRI)

Jhaveri 2023: 20 healthy term newborns, average 3545 g (the scenario's weight), scanned at
31.8 ± 14 h, asleep after a feed (HR 100). Limits are mean ± 2 SD.

| Variable | LV | RV | Grade |
|---|---|---|---|
| EDV (mL/kg) | **2.5 ± 0.3** (1.9–3.1) | **3.1 ± 0.3** (2.5–3.7) | A/B |
| ESV (mL/kg) | **0.9 ± 0.2** (0.5–1.3) | **1.5 ± 0.2** (1.1–1.9) | A/B |
| SV (mL/kg) | **1.6 ± 0.1** (1.4–1.9) | **1.6 ± 0.2** (1.2–2.0) | A/B |
| EF (%) | **63.2 ± 3.4** (56.4–69.9) | **52.5 ± 3.3** (45.9–59.1) | A/B |

Groves 2011 cine MRI at CGA 40 (Fig 5): LV EDV ~2.45 mL/kg, ESV ~0.78, EF ~68 %; SV 1.73 ± 0.28 at
HR 142. RVEDV/LVEDV is 1.2 ± 0.2.

## Flows

| Variable | Reference (mL/kg/min) | Range | Method, age | Grade | Source |
|---|---|---|---|---|---|
| LV output | **~196** | 108–284 | PC-MRI, CGA 40 (Fig 3A) | B | Groves 2011; Jhaveri 177 ± 25 at HR 100 |
| RV output | **~199** | 100–298 | PC-MRI (Fig 3B) | B | Groves 2011; Jhaveri 181 ± 30 |
| SVC flow | **~83** | 28–138 | PC-MRI (Fig 3C) | B | Groves 2011 |
| Descending aorta | **~99** | 57–141 | PC-MRI (Fig 3D) | B | Groves 2011 |
| Brain | **28.5** (median; term 106 mL/min) | 9.8–94 | PC-MRA at TEA ~41 wk, n=344 | B | Kooi 2019; Liu 2014 14.9 ± 4.9 mL/100 g/min |
| Intestine (SMA) | **43 ± 13** | — | Doppler volume flow, preterm + term | B | Van Bel 1990; Agata 1994 ~48 at 96 h |
| Kidney | no credible absolute value | — | Doppler, left renal artery only: ~32 (24 h) / ~37 (96 h), unchanged over 1–96 h | C | Agata 1994 (Fig 2) |
| Coronary (whole heart) | **~22 mL/min** (absolute) | 18–28 | LAD volume flow by transthoracic Doppler, healthy controls at 1 week (8.2 ± 3.0 mL/min), scaled by the LAD's ~35–45 % share | C | Aburawi 2012 ([doi](https://doi.org/10.1016/j.echo.2011.11.019)); per gram highest in young infants (Yasuoka 2002) |
| Myocardial O₂ use | **~14 mL/100 g/min** | 10–19 | between adult rest (~8–10) and newborn lambs at 1 h (LV 18.9, efficiency 31–35 %) | C | Smolich 1996 ([doi](https://doi.org/10.1152/ajpheart.1996.270.2.H741)) |
| Liver/spleen (coeliac) | no credible absolute value | — | Doppler, coeliac: ~75 (24 h) / ~72 (96 h) | C | Agata 1994 (Fig 2) |

**Doppler volume flows are upper estimates.** Agata's single vessels (left MCA ~46, coeliac ~72,
SMA ~48, one renal artery ~37 mL/kg/min at 96 h) add up to ~203 of an LVO of 258 mL/kg/min, which is
not possible. The usable findings are the time course (organ flows stable from 24 to 96 h; renal flow
unchanged from 1 h) and the SMA agreement with Van Bel. Kidney and coeliac have no credible
absolute reference.

The model's LS bed is liver + spleen, so it compares with coeliac / hepatic arterial flow. Portal
inflow comes through the intestinal bed (INT), which the model drains into the lower-body veins.

## Breathing

| Variable | Reference | Range | Method, age, n | Grade | Source |
|---|---|---|---|---|---|
| Respiratory rate | **44** /min | 32–57 (P3–P97) | quiet sleep, median day 2, n=215 | A | Hannover 2018; Schmalisch 2005 39.2 ± 8.6 |
| Tidal volume | **5.57 ± 1.06** mL/kg | — | flow-through, day 7, n=48 | A/B | Schmalisch 2005 |
| Minute ventilation | **215 ± 52** mL/kg/min | — | flow-through | A/B | Schmalisch 2005 |
| Ti/Ttot | **0.40** (Ti 0.65 s, Te 0.98 s) | — | flow-through | A/B | Schmalisch 2005 |
| Peak tidal insp / exp flow | **0.83 ± 0.20 / 0.64 ± 0.19** L/min/kg | — | flow-through | A/B | Schmalisch 2005 |
| Compliance (Crs) | **~3.6** mL/cmH₂O (~1.0–1.1 /kg) | 3.2–4.0 | passive occlusion | B | Katier 2006 (prediction 4.0), Stocks 1994, Migdal 1987, Nowotny 1998 |
| Resistance (Rrs) | **52 ± 6** cmH₂O/L/s | (Katier ~75–80) | passive occlusion, n=9 | B | Nowotny 1998 |
| FRC | **27.1** mL/kg | 23.8–32.0 | helium, median day 2, n=24 | A | Yüksel 1995; nitrogen 24.0, plethysmography 29.8–31.1 |
| Anatomic dead space | **2.2** mL/kg | Vd/Vt ~0.3–0.4 | term, day 5 | A/B | Stokes 1986 |
| CO₂ response | **38.7 ± 3.0** mL/kg/min per mmHg (quiet sleep) | 12–67 | normoxic CO₂ rebreathing, term, 4–6 days, n=5; REM sleep 12.2 ± 3.0; Moriette 67 / 44 (quiet / active sleep, 40 % O₂). Vt rises in every report; rate contributes in quiet sleep, no quantitative split found. Model 34 (`scripts/probe_co2_response.mjs`, 0/2/4 % CO₂) | B | Cohen 1991 ([doi](https://doi.org/10.1152/jappl.1991.71.1.168)); Moriette 1985 ([doi](https://doi.org/10.1016/0034-5687(85)90093-3)); Rigatto 1991 ([doi](https://doi.org/10.1164/ajrccm/143.1.101)); Mortola 1996 ([doi](https://doi.org/10.1016/0034-5687(95)00093-3)). Added 2026-10-28 |
| Pleural (oesophageal) pressure swing | **7.3 ± 1.4** cmH₂O | — | oesophageal catheter, quiet breathing, newborn to 5 years (no change with growth), n=40. Cross-check: lung compliance 1.34 ± 0.37 mL/cmH₂O/kg in healthy term infants (Yau 1994); the model's Crs with a chest wall ~2.9× as compliant as the lung (Papastamelos 1995) gives ~1.30. Model 7.6 (`validate_respiratory`) | B | Gerhardt 1987 ([doi](https://doi.org/10.1002/ppul.1950030506)); Papastamelos 1995 ([doi](https://doi.org/10.1152/jappl.1995.78.1.179)); Yau 1994 (PMID [7912580](https://pubmed.ncbi.nlm.nih.gov/7912580/)). Added 2026-10-28 |

## Gases and saturations

| Variable | Reference | Range | Method, age, n | Grade | Source |
|---|---|---|---|---|---|
| SpO₂ (pre-ductal) | **97.3 ± 1.4** % | — | pulse oximetry, median day 2, n=209 | A | Brockmann 2011; Poets 1996 97.6 (92–100) |
| pH | **7.395 ± 0.037** | 7.312–7.473 | capillary, 48 ± 12 h, n=119 | A | Cousineau 2005 |
| pCO₂ | **38.7 ± 5.1** mmHg | 28.5–48.7 | capillary | A | Cousineau 2005 |
| HCO₃ | ≈ 23.4 mmol/L | — | derived from pH/pCO₂ | B | Cousineau 2005 |
| Base excess | — | −4 to +2 | — | C | textbook |
| PaO₂ | — | 60–90 mmHg | arterial | C | textbook (Koch & Wendel 1968 unavailable) |
| EtCO₂ | ≈ PaCO₂ | gap 0 ± 7 mmHg | capnography | C | Lopez 2011 (healthy preterm controls) |
| SvO₂ | **~76 %** | 70–80 | right-atrial fibre-optic catheter, stable preterms in room air (73.6 ± 5.3 % at SaO₂ 93.4 %, extraction 0.21); peripheral-muscle extraction 0.22–0.26 in healthy term babies | B | van der Hoeven 1996 ([doi](https://doi.org/10.1136/fn.74.3.f177)); Wolfsberger 2023 ([doi](https://doi.org/10.3389/fped.2023.1276769)); sagittal sinus 72.4 % (Carmichael 2025, [doi](https://doi.org/10.1038/s41390-025-03966-6)), 63.9 % (Liu 2014); NIRS day 2: cerebral 78, renal 89, splanchnic 75 % (Bailey 2013). The Fick estimate from calorimetry VO₂ and MRI output is ~83 %. Revised 2026-10-27 (was ~83 %, derived) |

## Metabolism, blood, kidneys

| Variable | Reference | Range | Method, age, n | Grade | Source |
|---|---|---|---|---|---|
| VO₂ | **~8.4** mL/kg/min (lung uptake) | 6.3–9.5 | the O₂ use that gives the measured venous extraction (0.21) at the measured output; calorimetry 6.26 ± 1.51 (first week, thermoneutral rest, n=202) and 6.6–7.2 at 6–30 h (RQ 0.94 → 0.88) | C | derived (2026-10-27); phototherapy study 2001; Zoppi 1998 ([doi](https://doi.org/10.1038/sj.ejcn.1600564)). Raises ventilation to ~250 mL/kg/min against 215 measured in quiet sleep |
| RQ | **~0.85** | 0.80–0.90 | indirect calorimetry; no measurement at 72 h: 0.94 at 6 h and 0.88 at 30 h on 10 % glucose feeds before milk (n=46), 0.879 ± 0.009 breast-fed at ~17 days asleep. A breast-fed baby on small volumes of fat-rich milk is expected below the glucose-fed 0.88 (estimate). The model keeps 0.80 (`Metabolism.resp_q`), the low edge: a higher RQ adds CO₂ and ventilation, which already exceeds the quiet-sleep 215 | C | Zoppi 1998 ([doi](https://doi.org/10.1038/sj.ejcn.1600564)); Stettler 1992 (PMID [1600931](https://pubmed.ncbi.nlm.nih.gov/1600931/)). Added 2026-10-28 |
| Temperature | 37.0 °C | 36.5–37.5 | — | C | WHO/textbook |
| Glucose | **~4.0** mmol/L | — | plasma; 3.3 ± 0.6 to 48 h, 4.6 ± 0.7 by day 4 | A | GLOW 2020; Cousineau 3.8 ± 0.8 |
| Lactate | **1.4** mmol/L (plasma, median) | 0.8–3.3 | > 48 h, n=67 | A | GLOW 2021; Cousineau capillary 2.6 ± 0.7 (1.4–4.1) |
| Hb | **~17.0** g/dL | 12.8–21.2 (P5–P95) | day 3, 35–42 wk (Fig 3B) | B | Jopling 2009 (Utah, 800–1520 m) |
| Hct | **~49.5** % | 37–62.5 | Fig 3A | B | Jopling 2009 |
| Blood volume | — | 80–90 mL/kg | — | C | textbook |
| GFR | **~30** mL/min/1.73 m² | 19.6 (day 1) – 40.6 (day 5) | measured GFR, IPD meta-analysis, n=881 | A/B | Smeets 2022 |
| Urine output | — | 1–3 mL/kg/h | — | C | textbook |

## Shunts at 72 h

| Shunt | Reference | Grade | Source |
|---|---|---|---|
| Ductus arteriosus | patent in **4 %** at 60–72 h (12 % at 48–60 h, 21–22 % at 24–48 h) | A | Ha 2018 (n=56, echo every 12 h) |
| Foramen ovale | small, predominantly left-to-right PFO flow in most term newborns; no closure on day 1–3; CMR RV output exceeds LV by ~3–4 mL/kg/min with the duct closed | C | He 2011; Hiraishi 1991; Jhaveri 2023 / Groves 2011 (indirect) |

## First look at the model (step 3, scenario at `07b4ebf`)

Preliminary values taken while compiling; the formal comparison follows in step 5.

- **Matches:**
  - BP 72.6/45.8 (58.9)
  - LVO/RVO 200
  - SVC 81 and DAo 106
  - RR 40, Vt 5.6–5.8 mL/kg, MV 235
  - dead space 2.23 mL/kg
  - SpO₂ 96.8, pH 7.37, PaCO₂ 39.5
  - glucose 4.0
  - Hb 16.1 g/dL
  - GFR 34.7
  - ductus closed
- **Worth discussing:**
  - HR 131 (reference ~118); at the same output this gives SV 1.5 mL/kg against 1.6
  - Ti/Ttot 0.30 (reference 0.40)
  - Crs 3.4 mL/cmH₂O (low end)
  - lactate 1.0 (below both lactate references)
  - brain flow 40.5 mL/kg/min = 20 % of LVO (MRI median ~28.5)
  - intestinal flow 26 (reference 43 ± 13)
  - foramen ovale fully closed

## Recalibrations made from this reference

Use `node scripts/probe_term_reference.mjs` for the full comparison (`--file` probes a scenario file
outside `model_definitions/`).

| Date | Change | Before → after | Basis |
|---|---|---|---|
| 2026-10-18 | Brain flow and O₂ use (`scripts/_fix_term_brain_mri.mjs`); freed flow → upper body (RUB) | CBF 144 → 106 mL/min (20 → 15 % of LVO); brain VO₂ 11.0 → 8.1 mL/min (42 → 31 %); extraction unchanged at 35 %; SVC stays 81 | Kooi 2019 term median; Liu 2014 extraction |
| 2026-10-18 | Foramen ovale (`scripts/_fix_term_fo.mjs`): `diameter_fo` 0 → 1.5 mm (`fo_lr_factor` 1); chemoreflex and HeartFunction references re-anchored | FO 0 → 5.9 mL/kg/min L→R; RVO − LVO 0 → +6 mL/kg/min; gases, BP, HR unchanged | He 2011; Hiraishi 1991; CMR RV > LV output |
| 2026-10-18 | Resting lactate (`scripts/_fix_term_lactate.mjs`): `lact_baseline` 1.0 → 1.5; lact +0.5 / uma −0.5 in every patient blood compartment | lactate 1.0 → 1.5 mmol/L; pH, HCO₃, BE unchanged (7.364 / 22.35 / −2.40) | GLOW 2021 (1.4 plasma > 48 h); Cousineau 2005 (2.6 capillary, 1.4–4.1) |
| 2026-10-18 | Breathing pattern (`scripts/_fix_term_breathing_pattern.mjs`): `ie_ratio` 0.30 → 0.40; `vt_rr_ratio` → 1.29795e-4; `minute_volume_ref` and chemoreceptor set-points re-anchored | Ti/Ttot 0.30 → 0.40; RR 37.7 → 40.0; Vt 5.51 → 5.34; MV 208 → 213; peak flows 0.90/0.58 → 0.70/0.66 L/min/kg | Schmalisch 2005 (Ti, Vt, MV, peak flows); Hannover 2018 (RR) |
| 2026-10-18 | Heart rate and contractility (`scripts/_fix_term_hr_contractility.mjs`): `heart_rate_ref` 131.15 → 120.33; LV `el_max` ×1.15, RV ×1.3; chemoreflex and HeartFunction stress references re-anchored | HR 131 → 120; LV ESV/SV/EF 1.01/1.51/59.9 → 0.92/1.66/64.4; RV 1.65/1.51/47.8 → 1.54/1.66/51.8; output unchanged; PAP 38.9 → 40.6 systolic | Satoh 2016, He 2011, Agata 1994 (HR); Jhaveri 2023 (CMR volumes) |
| 2026-10-18 | Whole-body VO₂ (`scripts/_fix_term_vo2.mjs`): `Metabolism.vo2` 7.288 → 6.1396 (Mob's ~0.81 for the heart kept); `minute_volume_ref` and chemoreceptor set-points re-anchored | total VO₂ 8.1 → 7.0 mL/kg/min; MV 235 → 207; RR 40.4 → 37.5; Vt 5.8 → 5.5; SvO₂ 78.7 → 81.5; PaO₂ 73 → 76 | 6.26 ± 1.51 (first week, rest); REE 45–50 kcal/kg/d ≈ 6.5–7.2; calm mixed state |
| 2026-10-18 | Probe only: blood volume leaves out the bladder (URINE is a BloodCapacitance) | reported blood volume ~82–86 → 80.6 mL/kg; the scenario is unchanged | Whole-body volume balance (blood + bladder vs maintenance intake) closes exactly |
| 2026-10-25 | Blood volume (`scripts/_fix_blood_volume.mjs --factor 1.06`, re-validation re-anchoring): `vol`/`u_vol` of the 31 blood-volume compartments ×1.06, `Hormones.volume_setpoint` 0.286 → 0.3011 L (the new resting volume) | CVP 1.93 → 2.47 mmHg (was below 2 after the heart re-validation: valves, inertance, RV, coronary flow); blood volume 80.6 → 85.0 mL/kg (mid-reference); LVO 196 → 200, HR 118.1 → 116.9, MAP 60.2 → 60.9 | Reference ranges CVP 2–8, blood volume 80–90 mL/kg (textbook, grade C) |
| 2026-10-27 | Venous oxygen extraction (`scripts/_fix_term_venous_vo2.mjs`): per-bed O₂ use +0.6 upper body, +0.6 lower body, +0.15 gut, +0.08 liver mL/kg/min (brain and kidney keep their absolute use), `Metabolism.vo2` 6.30 → 7.73; `minute_volume_ref` and chemoreceptor set-points re-anchored; heat-loss trim re-seeded | lung VO₂ 7.07 → 8.51 mL/kg/min; mixed venous (PA) 82.0 → 78.5 %, SVC 82.6 → 79.0, IVC 82.7 → 79.0, brain venous 67.6 → 67.2; extraction 0.155 → 0.19; MV 213 → 250; RR 40 → 43.7; Vt 5.31 → 5.72; PaO₂ 75 → 72; PaCO₂, pH, BE, BP, HR, output unchanged | van der Hoeven 1996 (right atrium 73.6 ± 5.3 %, extraction 0.21); Wolfsberger 2023 (peripheral extraction 0.22–0.26). Partly reverses the 2026-10-18 VO₂ step (calorimetry); the ventilation now exceeds the quiet-sleep 215 (accepted) |
| 2026-10-27 | Myocardial O₂ use and coronary flow (`scripts/_fix_term_mvo2.mjs`): `Mob.bm_vo2_per_g` 3.7e-5 → 6.1716e-5 (basal 5.0 → 8.3 mL/100 g/min; stroke-work part and efficiency 0.35 unchanged); `AA_COR` R 107 112 → 75 149 for the same 55 % extraction; breathing and chemoreceptors re-anchored, heat-loss trim re-seeded | myocardial VO₂ 10.7 → 14.0 mL/100 g/min; coronary flow 18.5 → 25.9 mL/min (80 → 113 mL/100 g/min; 2.6 → 3.6 % of LVO); lung VO₂ 8.51 → 8.71; SvO₂ 78.5 → 78.1; MV 250 → 256; HR, BP, output, gases unchanged | Aburawi 2012 (LAD 8.2 ± 3.0 mL/min → ~18–23 for the heart); Yasuoka 2002; Smolich 1996 (newborn lambs 18.9 mL/100 g/min). User: the coronary flow looked low |
| 2026-10-25 | Re-bake of the stored state (re-validation (g)): HeartFunction set-points re-learned (`_relearn_heartfunction.mjs`: LV σ_ed 21.6 → 26.0, RV 57.0 → 63.1), then `scripts/reseed_term_neonate.mjs` (settle 600 s, save at a sinus-node firing); Heart fires on the first step after a load, Brain resumes its smoothers | Stored controller state now where it settles (Brain `autoreg_factor` 1.009 → 1.12, renal afferent 0.995 → 1.11, TGF 1.00 → 1.04, baroreflex firing 0.500 → 0.526, Thermoregulation `loss_trim` persisted); no phantom LV remodelling at rest; no MAP dip at load (was 61 → 53 mmHg for ~2 s); reference values within 0.5 % (CVP 2.47 → 2.44) | Stale state from before the heart re-validation; the load transient was a skipped beat |
| 2026-10-25 | Reflexes (re-validation (l)): baroreflex folded neutral at rest and `BR_MAP.set_value` 57.81 → 60.56 (`scripts/_fix_baro_setpoint.mjs`, now folding `el_k` and the venous `u_vol` too); `BR_MAP.tc` 4 → 0.5 s, `EF_HR.tc` 2 → 0.5 s; `CR_PO2.effect_weight` −0.15 → −0.4; state re-baked | Baroreflex firing at rest 0.524 → 0.499; baroreflex sensitivity 1.5 → 6.0 ms/mmHg; FiO₂ 0.15: ventilation +5 % flat → +19 % at 1 min, +11 % at 5 min; rest within 1 % (MAP 60.9 → 61.2) | Andriessen 2005, Yiallourou 2010 (6.4 ms/mmHg at 2–4 wk, user's target); Rigatto 1982, De Boeck 1984 |
| 2026-10-25 | Brain (re-validation (f)): ICP acts as a pressure (excess added to the venous outflow pressure, the waterfall, and to the cerebral vessels' external pressure) instead of an outflow resistance (`icp_outflow_gain`/`_factor_max` removed); `cbf_tc` 3 → 1 s, `autoreg_tc` 4 → 1 s; resting autoregulation folded into `BR_ART` (r ×1.1228, factor 1.12 → 1.00); `cbv0` 3.784 → 3.990 mL; state re-baked | Pressure-passive CBF follows CPP and stops as ICP reaches MAP (was 92 mL/min with ICP > MAP); intact autoregulation holds CBF to CPP ~35, lower limit ~30; CBF returns ~5 s after a pressure step without ringing; rest unchanged (CBF 106 mL/min) | Monro–Kellie, vascular waterfall (Starling resistor) |
| 2026-10-25 | Catecholamines (re-validation (j)), also the Drugs code defaults: clearance of adrenaline and noradrenaline scaled to 25 mL/kg/min; adrenaline EC50s 5.7 (HR) and 18 ng/mL (inotropy, lusitropy, SVR), Hill 1, Emax fitted closed-loop; noradrenaline mainly vascular | Half-life 20 s → 130 s; adrenaline 0.1 mcg/kg/min: 0.9 → 4.0 ng/mL, HR +0 → +16 %, MAP +0 → +24 %; noradrenaline 0.3: MAP +18 %, HR −3 % | Oualha 2014, Fisher 1993; neonatal noradrenaline cohorts (Kallimath 2024, Gupta 2022, Lu 2023) |
| 2026-10-25 | Glucose (re-validation (i)), also the code defaults: interstitial pool (0.31 L/kg, τ 5 min), brain uptake insulin-independent and saturable (Km 1 mmol/L), insulin secretion blunted above the set-point (`insulin_gain` 6 → 0.54) with prompt suppression below (`insulin_suppression_gain` 6), counter-regulation one-sided; state re-baked | Rest unchanged (4.0 mmol/L); hepatic output stopped: 2.82 → 3.27 mmol/L at 10 min, 0.01 → 1.25 at 90; D10 2 mL/kg: cleared in ~8 min with a rebound to 1.99 → K 1.54 %/min, +2.1 mmol/L at 10 min | Bier 1977, Huang 1989, Salle 1976 |
| 2026-10-25 | Thermoregulation (re-validation), also the code defaults: surface area `surface_area_k` 0.05 → 0.097 (0.116 → 0.226 m²); `h_radiative` 9.6 → 5.2, `h_convective` 7.0 → 4.9; perfusion coupling mass = the relaxed blood's heat capacity (`blood_volume_per_kg` removed); `loss_trim` re-seeded (−3.23 → −5.26 W) | Rest unchanged; dry-loss sensitivity 1.93 → 2.28 W/K (60 min at 28 °C: −0.97 → −1.10 °C; at 35 °C: +1.39 → +1.56 °C); skin evaporation 0.35 → 0.68 W (≈ respiratory, as measured); `Q_perf` returns to 0 | Sjörs 1997, Apedoh 1999, Riesenfeld 1995, Sedin 1983 |
| 2026-10-25 | Hypoxic ventilatory depression (final pass), new in Breathing: `hvd_factor` relaxes over 120 s towards 1 − min(2 · (70 − pO2)/70, 0.8) below a pO2 of 70 mmHg | FiO₂ 0.15: ventilation +18 % at 1 min, +4 % at 5 min (12 % below the peak; was +11 % sustained); FiO₂ 0.07: pH 7.44 at 1 min, 7.33 at 7 min (was 7.41: the stronger chemoreflex of (l) kept the baby alkalotic, probe_lactate failed); rest unchanged | De Boeck 1984, Rehan 1996 |

## Open items

- **Koch & Wendel 1968** (arterial gases, first week): unavailable, so PaO₂ and BE stay grade C.
