# Term neonate at 72 h: literature reference values

Reference values for validating the `term_neonate` scenario: a healthy term neonate of about 3.5 kg
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
| PAP systolic | 38.1 ± 8.3 at 48 h | upper 95 % limit 40 at 72 h | echo, TR jet | B | PMID 26817918 (as cited in `scripts/_probe.mjs`) |
| PAP mean | 26.2 ± 7.5 at 48 h | — | echo | B | same |

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
| Compliance (Crs) | **~3.6** mL/cmH₂O (~1.0–1.1 /kg) | 3.2–4.0 | passive occlusion | B | Katier 2006 (prediction 4.0), Stocks 1994, Migdal 1987, Nowotny 1998 |
| Resistance (Rrs) | **52 ± 6** cmH₂O/L/s | (Katier ~75–80) | passive occlusion, n=9 | B | Nowotny 1998 |
| FRC | **27.1** mL/kg | 23.8–32.0 | helium, median day 2, n=24 | A | Yüksel 1995; nitrogen 24.0, plethysmography 29.8–31.1 |
| Anatomic dead space | **2.2** mL/kg | Vd/Vt ~0.3–0.4 | term, day 5 | A/B | Stokes 1986 |

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
| SvO₂ | — | 70–80 % | not measured in healthy neonates | C | textbook; NIRS day 2: cerebral 78, renal 89, splanchnic 75 % (Bailey 2013); cerebral venous 63.9 ± 8.2 % (Liu 2014) |

## Metabolism, blood, kidneys

| Variable | Reference | Range | Method, age, n | Grade | Source |
|---|---|---|---|---|---|
| VO₂ | **6.26 ± 1.51** mL/kg/min | — | calorimetry, first week, n=202 | B | phototherapy study 2001 |
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
| Foramen ovale | small left-to-right PFO flow common in the first week; no closure seen on day 1–3 | C | He 2011; textbook |

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

## Open items

- **Koch & Wendel 1968** (arterial gases, first week): unavailable, so PaO₂ and BE stay grade C.
- The PAP rows rely on the source cited in `scripts/_probe.mjs` and were not re-read in this pass.
