# Term neonate in transition: reference values at 12 h

Reference values for `term_neonate_12h`: a healthy term neonate of about 3.5 kg, **12 h** after an
uncomplicated **vaginal birth with delayed cord clamping (~1 min)**. The baby breathes room air, is
**dressed or skin-to-skin at room temperature**, and breastfeeding has started. The 72 h column is the
`term_neonate_72h` set ([TermNeonateReference](./TermNeonateReference.md)). Compiled 2026-11-05 from PubMed, the
engine's `reference-value-papers` and NeoCardioLab. It rebuilds the first transition set, which was
deleted on 2026-10-27 (engine 5e0c5c1; the old page is at 24768d6).

The machine-readable set is [`term_neonate_12h.json`](../scripts/reference/term_neonate_12h.json), in the same
format as [`term_neonate_72h.json`](../scripts/reference/term_neonate_72h.json). Check it with
`node scripts/probe_term_reference.mjs term_neonate_12h --ref scripts/reference/term_neonate_12h.json`.

**Grades**
- **A**: healthy term infants measured at, or within a few hours of, 12 h
- **B**: a nearby age, a mixed cohort or delivery mode, or direction only
- **C**: textbook, derived, or the 72 h value carried

## The duct at 12 h

The duct is the main feature of this scenario. At 12 h it is still open in every baby and is
constricting fast:
- **Diameter:** Kang 2016 measured 4.6 mm at 2 h, 3.4 at 6 h, 2.47 ± 0.49 at 12 h and 1.9 at 24 h. Other
  cohorts are a little smaller: 2.1 ± 0.6 at 12 h (Tohoku 2002), and medians of 2.24 over 0–12 h and
  1.34 over 12–24 h (Ha 2018).
- **Where it narrows:** narrowing starts as a focal intraluminal protrusion at the pulmonary end
  (30 % of babies within 1 h, 96 % by 8 h, all by 24 h), with a high-velocity jet in and beyond it. It
  then spreads along the duct (Hiraishi 1987). The ampulla at the aortic end stays (Rudolph). In
  the model, `Pda.constriction_length` is the short pulmonary-end cone.
- **Direction:** flow is left-to-right only in 88 % of babies at 12 h; 12 % are still bidirectional,
  against 100 % at 2 h and 55 % at 6 h (Kang 2016). Bidirectional flow turns into continuous
  left-to-right flow before closure, and only 3 of 19 babies were still bidirectional at 12–24 h
  (Shiraishi 1991). Where right-to-left flow persists, it is systolic: RV ejection carries blood
  through the duct while PVR is still raised (Rudolph).
- **Velocity:** the peak left-to-right velocity is 1.43 (1.07–1.78) m/s over 0–12 h and
  2.02 (1.49–2.26) m/s over 12–24 h (Ha 2018). It rises from 1.5 ± 0.7 m/s at the first exam to
  2.3 ± 0.6 m/s just before closure (Mandorla 1990). The spectrum is continuous or diastolic, and either
  flat or with a protosystolic or protodiastolic peak.
- **Pressures behind it:** Kang's ductal-gradient PA pressure at 12 h is 52.5/23.4 (mean 40.9) mmHg. With
  Taiwo's BP of 69.8/40.4, both the systolic and the end-diastolic aorta-to-PA gradients are
  ~17 mmHg (~2.1 m/s). That is a flat, "closing" spectrum; it is derived, so grade C.
- **Pattern class** (van Laere 2018, after Su): closing means peak / end-diastolic velocity < 2;
  pulsatile means ≥ 2; growing means right-to-left for < 30 % of the cycle.
- **Not found:** NeoCardioLab has no page on the healthy term transition, and no study reports a
  measured end-diastolic velocity at 12 h. Drayton's volumetric shunt, 62 (43–82) mL/kg/min shortly
  after birth, "decreased rapidly over the first 12 h". The abstract gives no 12 h number, and the
  full text isn't in PMC.

The expected 12 h picture is therefore a constricting duct of ~2.2–2.5 mm with continuous
left-to-right flow. The peak is ~1.5–2 m/s, the end-diastolic velocity is high, and peak/ED sits at
the closing/pulsatile border. A short systolic right-to-left component is a minority finding.

**Early-systolic dip (cross-check, not a target).** The dip in a restrictive duct is parked for the
preterm rebuild ([Pda.md](./Pda.md)). At 12 h the aorta-PA gradient (~17 mmHg) is about the size of
NeoCardioLab's restrictive example. But on day 0 (2–12 h) the aortic valve opens before the pulmonary
valve (Shiraishi 1987: RPEP 94 > LPEP 77 ms), which argues against a dip. The probe reports the beat
minimum as `pda_v_ed`, so a dip would show there.

## Reference values

Rows marked "PENDING USER CHOICE" in the JSON are the duct targets still to be decided.

### Hemodynamics

| Variable | Unit | 12 h | Grade | Sources | 72 h |
|---|---|---|---|---|---|
| Heart rate | bpm | 121 (97–152) | B | tveiten2021 | 118 ± 16.6 (91–145) |
| Systolic BP | mmHg | 69.8 ± 7.8 (54–85) | A | taiwo2022 | 74 (60–89) |
| Diastolic BP | mmHg | 40.4 ± 6.4 (28–53) | A | taiwo2022 | 46 (31–61) |
| Mean arterial pressure | mmHg | 50.2 ± 5.8 (39–62) | A | taiwo2022 | 58 (45–72) |
| Pulse pressure | mmHg | 29.4 | B | taiwo2022 | 28 |
| Central venous pressure | mmHg | 1.6 (-3–4) | C | siassi1980 | 2–8 |
| Pulmonary artery pressure, systolic | mmHg | 52.5 ± 9.1 (34–71) | A/B | kang2016 | 36 ± 6.48 |
| Pulmonary artery pressure, mean | mmHg | 41 ± 9 (32–50) | A/B | kang2016 | 25.25 ± 8.29 |
| Pulmonary artery pressure, diastolic | mmHg | ref. only | C |  | 13.25 ± 6.18 |

### Heart

| Variable | Unit | 12 h | Grade | Sources | 72 h |
|---|---|---|---|---|---|
| LV end-diastolic volume | mL/kg | ref. only | C |  | 2.5 ± 0.3 (1.9–3.1) |
| LV end-systolic volume | mL/kg | ref. only | C |  | 0.9 ± 0.2 (0.5–1.3) |
| LV stroke volume | mL/kg | 2.15 ± 0.37 (1.4–2.9) | B | agata1991 | 1.6 ± 0.1 (1.4–1.9) |
| LV ejection fraction | % | ref. only | C |  | 63.2 ± 3.4 (56.4–69.9) |
| RV end-diastolic volume | mL/kg | ref. only | C |  | 3.1 ± 0.3 (2.5–3.7) |
| RV end-systolic volume | mL/kg | ref. only | C |  | 1.5 ± 0.2 (1.1–1.9) |
| RV stroke volume | mL/kg | ref. only | C |  | 1.6 ± 0.2 (1.2–2) |
| RV ejection fraction | % | ref. only | C |  | 52.5 ± 3.3 (45.9–59.1) |

### Regional and coronary flows

| Variable | Unit | 12 h | Grade | Sources | 72 h |
|---|---|---|---|---|---|
| Left ventricular output | mL/kg/min | 290 ± 68 (190–390) | B | agata1991, agata1994 | 196 (108–284) |
| Right ventricular output | mL/kg/min | ref. only | C |  | 199 (100–298) |
| SVC flow | mL/kg/min | 99 | B | lee2009 | 83 (28–138) |
| Descending aorta flow | mL/kg/min | ref. only | C |  | 99 (57–141) |
| Cerebral blood flow | mL/kg/min | ref. only | C |  | 28.5 (9.8–94) |
| Intestinal (SMA) flow | mL/kg/min | ref. only | C |  | 43 ± 13 |
| Renal blood flow | mL/kg/min | ref. only | C | agata1994 | ref. only |
| Hepatic arterial / coeliac flow | mL/kg/min | ref. only | C | agata1994 | ref. only |
| Coronary flow (whole heart) | mL/min | 22 (18–28) | C | aburawi2012, yasuoka2002 | 22 (18–28) |
| Myocardial O2 use | mL/100 g/min | 14 (10–19) | C | smolich1996 | 14 (10–19) |

### Lungs and breathing

| Variable | Unit | 12 h | Grade | Sources | 72 h |
|---|---|---|---|---|---|
| Respiratory rate | /min | 44 (32–57) | C | hannover2018, schmalisch2005, fleming2011 | 44 (32–57) |
| Tidal volume | mL/kg | 5.57 ± 1.06 | C | schmalisch2005, schmalisch2001 | 5.57 ± 1.06 |
| Minute ventilation | mL/kg/min | 215 ± 51.7 | C | schmalisch2005 | 215 ± 51.7 |
| Inspiratory time fraction (Ti/Ttot) | - | 0.4 | C | schmalisch2005 | 0.4 |
| Peak tidal inspiratory flow | L/min/kg | 0.83 ± 0.2 | C | schmalisch2005 | 0.83 ± 0.2 |
| Peak tidal expiratory flow | L/min/kg | 0.64 ± 0.19 | C | schmalisch2005 | 0.64 ± 0.19 |
| Respiratory system compliance | mL/cmH2O | ref. only | B | lodrup1993 | 3.6 (3.2–4) |
| Respiratory system resistance | cmH2O/L/s | 52 ± 5.6 | C | nowotny1998, katier2006 | 52 ± 5.6 |
| Functional residual capacity | mL/kg | 24 (19–33) | B | lee1999, milner1978 | 27.1 (23.8–32) |
| Anatomic dead space | mL/kg | 2.2 | C | stokes1986 | 2.2 |
| Pleural (oesophageal) pressure swing | cmH2O | 7.3 ± 1.4 | B | gerhardt1987, papastamelos1995, yau1994 | 7.3 ± 1.4 |
| Ventilatory response to CO2 | mL/kg/min per mmHg | 38.7 (12–67) | B | cohen1991, moriette1985, rigatto1991, mortola1996 | 38.7 (12–67) |

### Gases

| Variable | Unit | 12 h | Grade | Sources | 72 h |
|---|---|---|---|---|---|
| SpO2 (pre-ductal) | % | 98 ± 1 | A | nikkola2002, obrien2000, mariani2007 | 97.3 ± 1.4 |
| pH | - | 7.36 (7.31–7.41) | C |  | 7.395 ± 0.037 (7.312–7.473) |
| pCO2 | mmHg | 35 (30–40) | C |  | 38.7 ± 5.1 (28.5–48.7) |
| HCO3 | mmol/L | 19.5 (17–22) | C |  | 23.4 |
| Base excess | mmol/L | -4 (-6–-2) | C |  | -4–2 |
| PaO2 | mmHg | 60–90 | C | textbook | 60–90 |
| End-tidal CO2 | mmHg | ref. only | C | lopez2011 | ref. only |
| Mixed venous O2 saturation | % | 78 (70–84) | B | vanderhoeven1996, wolfsberger2023 | 76 (70–80) |
| SpO2 post-ductal | % | 98 ± 1 | A | nikkola2002, mariani2007 | – |

### Metabolism

| Variable | Unit | 12 h | Grade | Sources | 72 h |
|---|---|---|---|---|---|
| Oxygen consumption | mL/kg/min | 9.5 (7–10.5) | C | photo2001, zoppi1998 | 8.4 ± 1.51 (6.3–9.5) |
| Core temperature | degC | 36.9 (36.5–37.5) | B | karlsson1996 | 37 (36.5–37.5) |
| Plasma glucose | mmol/L | 3.2 ± 0.6 (2.6–4.4) | B | glow2020, hoseth2000 | 4 ± 0.7 |
| Lactate | mmol/L | 2 (1–5) | B | glow2021 | 1.4 (0.8–3.3) |
| Respiratory quotient | - | 0.9 (0.85–0.95) | C | zoppi1998, stettler1992 | 0.85 (0.8–0.9) |

### Blood

| Variable | Unit | 12 h | Grade | Sources | 72 h |
|---|---|---|---|---|---|
| Hemoglobin | g/dL | 19.1 (16.5–21.7) | C | ceriani2006 | 17 (12.8–21.2) |
| Hematocrit | % | 57 (50–64) | B | ceriani2006, christensen2009 | 49.5 (37–62.5) |
| Blood volume | mL/kg | 77 (72–82) | B | linderkamp1992, nelle1995 | 80–90 |

### Kidneys

| Variable | Unit | 12 h | Grade | Sources | 72 h |
|---|---|---|---|---|---|
| GFR | mL/min/1.73m2 | 19.6 | A/B | smeets2022 | 30 (20–40) |
| Urine output | mL/kg/h | 0.5–2.5 | C | hogg1977, lorenz1995, ogala1986 | 1–3 |

### Shunts

| Variable | Unit | 12 h | Grade | Sources | 72 h |
|---|---|---|---|---|---|
| Ductal net left-to-right flow | mL/kg/min | 5–40 | C | drayton1987 | 4 |
| Foramen ovale | mL/kg/min | ref. only | A | hiraishi1991 | ref. only |
| Ductal diameter | mm | 2.47 ± 0.49 (1.49–3.45) | A | kang2016, tohoku2002, ha2018 | – |
| Ductal right-to-left time | % of steps | 0–10 | A | kang2016, shiraishi1991, walther1993 | – |
| Ductal peak L->R velocity | m/s | 1.7 (1.1–2.3) | A/B | ha2018, mandorla1990, kang2016 | – |
| Ductal end-diastolic L->R velocity | m/s | 0.8–2 | C | kang2016, taiwo2022, mandorla1990 | – |
| Ductal peak / end-diastolic velocity | - | 1–2.2 | C | vanlaere2018, kang2016 | – |

## Sources

- `aburawi2012`: Aburawi EH et al. Coronary flow in neonates with impaired intrauterine growth. J Am Soc Echocardiogr 2012;25:313-8 ([doi](https://doi.org/10.1016/j.echo.2011.11.019))
- `agata1991`: Agata Y et al. Changes in left ventricular output from fetal to early neonatal life. J Pediatr 1991;119:441-5 ([doi](https://doi.org/10.1016/s0022-3476(05)82060-8))
- `agata1994`: Agata Y et al. Regional blood flow distribution and left ventricular output during early neonatal life. Pediatr Res 1994;36:805-10 ([doi](https://doi.org/10.1203/00006450-199412000-00022))
- `ceriani2006`: Ceriani Cernadas JM et al. The effect of timing of cord clamping on neonatal venous hematocrit. Pediatrics 2006;117:e779-86 ([doi](https://doi.org/10.1542/peds.2005-1156))
- `christensen2009`: Jopling J, Christensen RD et al. Reference ranges for hematocrit and blood hemoglobin. Pediatrics 2009;123:e333-7 ([doi](https://doi.org/10.1542/peds.2008-2654))
- `cohen1991`: Cohen G, Xu C, Henderson-Smart D. Ventilatory response of the sleeping newborn to CO2 during normoxic rebreathing. J Appl Physiol 1991;71:168-74 ([doi](https://doi.org/10.1152/jappl.1991.71.1.168))
- `drayton1987`: Drayton MR, Skidmore R. Ductus arteriosus blood flow during first 48 hours of life. Arch Dis Child 1987;62:1030-4 ([doi](https://doi.org/10.1136/adc.62.10.1030))
- `fleming2011`: Fleming S et al. Lancet 2011;377:1011-8 ([doi](https://doi.org/10.1016/S0140-6736(10)62226-X))
- `gerhardt1987`: Gerhardt T, Reifenberg L, Hehre D, Feller R, Bancalari E. Pulmonary mechanics in normal infants and young children during first 5 years of life. Pediatr Pulmonol 1987;3:309-16 ([doi](https://doi.org/10.1002/ppul.1950030506))
- `glow2020`: Harris DL et al. Glucose profiles in healthy term infants in the first 5 days (GLOW). J Pediatr 2020;223:34-41 ([doi](https://doi.org/10.1016/j.jpeds.2020.02.079))
- `glow2021`: Harris DL et al. Lactate, ketones and glucose in healthy term infants (GLOW). J Pediatr 2021 ([doi](https://doi.org/10.1016/j.jpeds.2020.12.063))
- `ha2018`: Ha KS et al. J Korean Med Sci 2018;33:e155 ([doi](https://doi.org/10.3346/jkms.2018.33.e155))
- `hannover2018`: Healthy term neonates during quiet sleep, Hannover. Acta Paediatr 2019;108:231-8 ([doi](https://doi.org/10.1111/apa.14470))
- `hiraishi1991`: Hiraishi S et al. Interatrial shunt flow profiles in newborn infants. Br Heart J 1991;65:41-5 ([doi](https://doi.org/10.1136/hrt.65.1.41))
- `hogg1977`: Hogg MI et al. Urinary excretion and metabolism of pethidine and norpethidine in the newborn. Br J Anaesth 1977;49:891-9 ([doi](https://doi.org/10.1093/bja/49.9.891))
- `hoseth2000`: Hoseth E et al. Blood glucose levels in a population of healthy, breast fed, term infants. Arch Dis Child Fetal Neonatal Ed 2000;83:F117-9 ([doi](https://doi.org/10.1136/fn.83.2.f117))
- `kang2016`: Kang C et al. Pulmonary artery pressure and ductus arteriosus closure in term neonates. Medicine 2016;95:e2599 ([doi](https://doi.org/10.1097/MD.0000000000002599))
- `karlsson1996`: Karlsson H. Skin to skin care: heat balance. Arch Dis Child Fetal Neonatal Ed 1996;75:F130-2 ([doi](https://doi.org/10.1136/fn.75.2.f130))
- `katier2006`: Katier N et al. Pediatr Pulmonol 2006;41:1058-64 ([doi](https://doi.org/10.1002/ppul.20492))
- `lee1999`: Lee S et al. Functional residual capacity after vaginal and caesarean delivery. Pediatr Pulmonol 1999;27:318-21 ([doi](https://doi.org/10.1002/(sici)1099-0496(199905)27:5<318::aid-ppul4>3.0.co;2-e))
- `lee2009`: Lee A et al. Superior vena cava flow in healthy term infants. Arch Dis Child Fetal Neonatal Ed 2010 ([doi](https://doi.org/10.1136/adc.2009.176883))
- `linderkamp1992`: Linderkamp O et al. The effect of early and late cord-clamping on blood viscosity and other hemorheological parameters in full-term neonates. Acta Paediatr 1992;81:745-50 ([doi](https://doi.org/10.1111/j.1651-2227.1992.tb12095.x))
- `lodrup1993`: Lodrup Carlsen KC et al. Lung function in awake healthy infants: the first five days of life. Eur Respir J 1993, PMID 8112445
- `lopez2011`: Lopez E et al. Pediatr Pulmonol 2011;46:896-902 ([doi](https://doi.org/10.1002/ppul.21445))
- `lorenz1995`: Lorenz JM et al. Phases of fluid and electrolyte homeostasis in the extremely low birth weight infant. Pediatrics 1995;96:484-9, PMID 7651782
- `mandorla1990`: Mandorla S et al. The ductus arteriosus in healthy newborn infants studied by continuous Doppler. G Ital Cardiol 1990 (abstract), PMID 2272416
- `mariani2007`: Mariani G et al. Pre-ductal and post-ductal O2 saturation in healthy term neonates after birth. J Pediatr 2007;150:418-21 ([doi](https://doi.org/10.1016/j.jpeds.2006.12.015))
- `milner1978`: Milner AD et al. Effects of delivery by caesarean section on lung mechanics and lung volume. Arch Dis Child 1978;53:545-8 ([doi](https://doi.org/10.1136/adc.53.7.545))
- `moriette1985`: Moriette G, Van Reempts P, Moore M, Cates D, Rigatto H. The effect of rebreathing CO2 on ventilation and diaphragmatic electromyography in newborn infants. Respir Physiol 1985;62:387-97 ([doi](https://doi.org/10.1016/0034-5687(85)90093-3))
- `mortola1996`: Mortola JP, Lanthier C. The ventilatory and metabolic response to hypercapnia in newborn mammalian species. Respir Physiol 1996;103:263-70 ([doi](https://doi.org/10.1016/0034-5687(95)00093-3))
- `nelle1995`: Nelle M et al. Effect of Leboyer childbirth on cardiac output, cerebral and gastrointestinal blood flow velocities in full-term neonates. Am J Perinatol 1995;12:212-6 ([doi](https://doi.org/10.1055/s-2007-994455))
- `nikkola2002`: Nikkola E et al. Baseline SpO2 after vaginal and caesarean delivery. Acta Paediatr 2002 ([doi](https://doi.org/10.1080/080352502760272605))
- `nowotny1998`: Nowotny T et al. Pediatr Pulmonol 1998;26:138-44 (9 term controls) ([doi](https://doi.org/10.1002/(sici)1099-0496(199808)26:2<138::aid-ppul12>3.0.co;2-2))
- `obrien2000`: O'Brien LM et al. Oxygen saturation during the first 24 hours of life. Arch Dis Child Fetal Neonatal Ed 2000;83:F35-8 ([doi](https://doi.org/10.1136/fn.83.1.f35))
- `ogala1986`: Ogala WN et al. Time of first urine passage in healthy newborns (Nigeria) 1986, PMID 3810846
- `papastamelos1995`: Papastamelos C, Panitch HB, England SE, Allen JL. Developmental changes in chest wall compliance in infancy and early childhood. J Appl Physiol 1995;78:179-84 ([doi](https://doi.org/10.1152/jappl.1995.78.1.179))
- `photo2001`: Oxygen consumption during phototherapy, Arch Dis Child Fetal Neonatal Ed 2001;85:F49-52 ([doi](https://doi.org/10.1136/fn.85.1.f49))
- `rigatto1991`: Rigatto H, Kwiatkowski KA, Hasan SU, Cates DB. The ventilatory response to endogenous CO2 in preterm infants. Am Rev Respir Dis 1991;143:101-4 ([doi](https://doi.org/10.1164/ajrccm/143.1.101))
- `schmalisch2001`: Schmalisch G et al. Eur Respir J 2001;17:108-14 ([doi](https://doi.org/10.1183/09031936.01.17101080))
- `schmalisch2005`: Schmalisch G et al. BMC Pediatr 2005;5:36 ([doi](https://doi.org/10.1186/1471-2431-5-36))
- `shiraishi1991`: Shiraishi H, Yanagisawa M. Bidirectional flow through the ductus arteriosus in normal newborns. Pediatr Cardiol 1991;12:201 ([doi](https://doi.org/10.1007/BF02310566))
- `siassi1980`: Siassi B et al. Central venous pressure in preterm infants. Biol Neonate 1980;37:285-90 ([doi](https://doi.org/10.1159/000241288))
- `smeets2022`: Smeets NJL et al. J Am Soc Nephrol 2022;33:1277-92 ([doi](https://doi.org/10.1681/ASN.2021101326))
- `smolich1996`: Smolich JJ, Berger PJ, Walker AM. Interrelation between ventricular function, myocardial blood flow, and O2 consumption changes at birth in lambs. Am J Physiol 1996;270:H741-9 ([doi](https://doi.org/10.1152/ajpheart.1996.270.2.H741))
- `stettler1992`: Stettler N et al. Energetic and metabolic cost of growth in Gambian infants. Eur J Clin Nutr 1992;46:329-35, PMID 1600931
- `stokes1986`: Stokes GM et al. Pediatr Pulmonol 1986;2:89-93 ([doi](https://doi.org/10.1002/ppul.1950020206))
- `taiwo2022`: Taiwo AB et al. Blood pressure profile and trends in the neonatal transitioning period: term asphyxiated and healthy newborns. Glob Pediatr Health 2022;9:2333794X221099263 ([doi](https://doi.org/10.1177/2333794X221099263))
- `textbook`: General neonatal textbook range; no healthy-term primary source found
- `tohoku2002`: Left ventricular systolic and diastolic function during early neonatal period. Tohoku J Exp Med 2002;197:151 ([doi](https://doi.org/10.1620/tjem.197.151))
- `tveiten2021`: Tveiten L et al. Heart rate during the first 24 hours in term-born infants. Arch Dis Child Fetal Neonatal Ed 2021 ([doi](https://doi.org/10.1136/archdischild-2020-320761))
- `vanderhoeven1996`: van der Hoeven MA, Maertzdorf WJ, Blanco CE. Continuous central venous oxygen saturation (ScvO2) measurement using a fibre optic catheter in newborn infants. Arch Dis Child Fetal Neonatal Ed 1996;74:F177-81 ([doi](https://doi.org/10.1136/fn.74.3.f177))
- `vanlaere2018`: van Laere D et al. Application of NPE in the assessment of a patent ductus arteriosus. Pediatr Res 2018;84:S46 ([doi](https://doi.org/10.1038/s41390-018-0077-x))
- `walther1993`: Walther FJ, Benders MJ, Leighton JO. Early changes in the neonatal circulatory transition. J Pediatr 1993;123:625 ([doi](https://doi.org/10.1016/s0022-3476(05)80966-7))
- `wolfsberger2023`: Wolfsberger CH et al. Peripheral muscle fractional tissue oxygen extraction in stable term and preterm neonates during the first 24 h after birth. Front Pediatr 2023;11:1276769 ([doi](https://doi.org/10.3389/fped.2023.1276769))
- `yasuoka2002`: Yasuoka K et al. Left anterior descending coronary artery flow and its relation to age in children. J Am Soc Echocardiogr 2002;15:69-75 ([doi](https://doi.org/10.1067/mje.2002.115537))
- `yau1994`: Yau KI, Fang LJ. Pulmonary mechanics and the energetics of breathing in healthy infants. J Formos Med Assoc 1994;93:110-6, PMID 7912580
- `zoppi1998`: Zoppi G et al. Respiratory quotient changes in full term newborn infants within 30 hours from birth before start of milk feeding. Eur J Clin Nutr 1998;52:360-2 ([doi](https://doi.org/10.1038/sj.ejcn.1600564))
