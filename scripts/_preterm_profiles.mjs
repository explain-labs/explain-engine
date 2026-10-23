// Lever profiles for scripts/_make_preterm_validated.mjs: one per validated preterm scenario.
// Each lever is a named constant with its source. "reference" values come straight from the scenario's
// reference set; "starting point" values are to be validated against it; the step numbers (6.1, ...)
// refer to the recalibration log in the reference document.
export const PROFILES = {
  28: {
    name: "preterm_28wk",
    refDoc: "docs/Preterm28wkReference.md",
    // chemoreceptor set-points = the reference resting gases, so the chemoreflex is neutral at the target
    CR: { CR_PCO2: 46, CR_PO2: 50, CR_PH: 7.26 },
    // diagram settings set by the author in the app (the oxygen colour window's upper end, mmol/L)
    diagram: { to2_hi: 8.8 },
    description:
      "Preterm neonate born at 28 weeks (1.0 kg) at 72 h: stable on nasal CPAP 6 cmH2O with FiO2 0.25 after " +
      "surfactant (mild RDS), a small restrictive left-to-right PDA (~1 mm) and a small PFO, untransfused " +
      "(delayed cord clamping), trophic feeds + parenteral nutrition, caffeine, humidified incubator. CPAP is " +
      "represented by the inspired FiO2 plus a recruited-lung state. Validated against " +
      "docs/Preterm28wkReference.md.",
    L: {
      // --- patient (reference) ---
      WEIGHT: 1.0,          // kg
      HEIGHT: 0.355,        // m (_make_preterm 28 wk row)
      GA: 28,               // weeks
      AGE: 3 / 365,         // years (scenario age is in years): 72 h

      // --- circulation ---
      HR_REF: 155,          // reference: HR 155 (Deshpande 2023, Bischoff 2021)
      BR_WINDOW: 1,         // 6.4: scale the baroreceptor window (BR_MAP min/max, term 25/100) with the set-point (x39/57.8 ->
                            //      16.9-67.5); the lopsided term window weighted the diastolic dip ~4x and read "low" at MAP 42
      BR_MAP: 39,           // reference: the MAP the baroreflex defends = Elsayed 2023 day-3 invasive median
      SVR: 2.0,             // 6.2/6.4/final: systemic resistances x -> MAP ~40 with the baroreflex neutral (term 1.0)
      PVR: 3.0,             // 6.2/6.4: pulmonary resistances x -> PAP ~31/25 (term 1.0); reference ratio 0.55
      CONT: 1.0,            // 6.2: Heart.cont_factor_* (was 0.90): preterm EF is normal (Groves 2011, no GA effect)
      RELAX: 1.10,          // starting point: immature diastolic function, Heart.relax_factor_*
      HEART_EL_MAX: 3.4,    // 6.2/6.4: heart chambers el_max x (el_max_factor_scaling_ps): weight scaling shrinks the chambers
                            //      but keeps term stiffness -> EF 69 %, ESV 0.72 mL/kg (was x1: EF 30 %)
      HEART_EL_MIN: 3.5,    // 6.2/6.4: heart chambers el_min x (el_min_factor_scaling_ps) -> EDV 2.3 mL/kg (at x2.4 the heart over-filled)
      ART_EL: 5.0,          // 6.2: artery el_base x (el_base_factor_scaling_ps, implicit aorta) -> pulse pressure ~22
                            //      (Elsayed 2023 54/29). The PWV rule of build_patient (x1.88) leaves PP ~10
      VEN_UVOL: 0.77,       // final: VLB/VUB unstressed volume x (_make_preterm 0.82) -> CVP ~2 (more stressed venous volume)
      PDA_REL: 1.0 / 3.0,   // reference: ductal diameter 1.0 mm (Pda.diameter_pa_max = 3 mm)
      FO_DIAM: 0.75,        // 6.4: Shunts.diameter_fo, mm (term 1.5) -> PFO shunt ~4 mL/kg/min L->R
      COR_R: 2.4,           // 6.4: coronary inflow (AA_COR) r x -> 12.7 mL/kg/min (term 11.7; was 27.6, a term-size bed)
      BRAIN_R: 1.2,         // 6.4: cerebral bed (BR_ART, BR_CAP, BR_VEN) r x, so autoregulation rests near 1 at CBF 28
      CBF_SET: 0.028,       // 6.4: Brain.cbf_setpoint, L/min absolute (28 mL/kg/min; term 0.10592 kept the bed fully dilated);
                            //      the CPP/CBV rest anchors re-seed after the warm-up

      // --- lungs and breathing ---
      RDS_EL: 5.55,         // 6.1: alveolar el_base x -> lung compliance 0.8 mL/cmH2O/kg (was 9.067, the unsupported severe-RDS row)
      RDS_UVOL: 0.80,       // 6.1: alveolar u_vol x -> FRC 22 mL/kg, the lung recruited by CPAP 6 (da Silva 1994)
      THORAX_EL: 2.94,      // 6.1: chest-wall (THORAX) el_base x -> 5 mL/cmH2O/kg (Gerhardt 1980); weight scaling leaves it at the term absolute value
      GASEX: 0.45,          // alveolar-capillary diffusion x (kept in 6.1: absolute, so already generous for 1 kg)
      IPS_RES: 10500,       // 6.1/final: intrapulmonary shunt resistance -> SpO2 93 % at FiO2 0.25 (mild residual shunt; was 1900)
      SURFACTANT: 0.25,     // starting point: surfactant maturity (_add_surfactant 28 wk); post-surfactant may sit higher
      FIO2: 0.25,           // reference: state definition
      MV_REF: 0.300,        // reference: minute volume 300 mL/kg/min (L/kg/min, per kg)
      RR: 62,               // reference: respiratory rate
      IE: 0.38,             // reference: Ti/Ttot
      RMP_RECAL: 1,         // 6.3: 1 = discard term_neonate's frozen muscle-effort gain (rmp_calibrated) so Breathing
                            //      recalibrates on these ~5x stiffer lungs; with the term gain Vt stayed at 3.4 of 6.3 mL/kg
      DS_UVOL: 1.36,        // 6.3: anatomic dead space (DS u_vol) x -> 3.0 mL/kg (was 2.2); nCPAP does not wash out the
                            //      nasopharynx (Liew 2020; Numa & Newth 1996)

      // --- metabolism, blood, environment ---
      REABS_WATER: 0.9175,  // 6.5: Kidneys.reabsorption_fraction (water; term 0.98) -> urine 3 mL/kg/h at GFR ~0.54
                            //      mL/min/kg, the diuretic phase of the immature tubule (Lorenz 1995)
      REABS_NACL: 0.95,     // 6.5: Kidneys.reabsorption_fractions na and cl (term 0.99 / 0.988) -> FENa 5 % (Lorenz 1995)
      MAINT_RATE: 3.0,      // 6.5: Fluids.maintenance_rate, mL/kg/h (term 1.352) = the resting urine; the maintenance fluid's
                            //   composition is set to the urine these fractions make (plasma x (1-f_s)/(1-f_water); lactate
                            //   excluded, as in term_neonate)
      UMA_DELTA: 2.85,      // 6.6: added to uma (unmeasured anions, Stewart) in every patient blood compartment ->
                            //      BE -2.65 -> -5.5, pH 7.27 (Bonsante 2017: early PN, <=29 wk days 2-7)
      GLUCOSE: 6.5,         // 6.6: mmol/L, blood glucose and the Glucose set-point (term 4.0); calm value on PN (Liu 2026).
                            //      Production = use (5.4 mg/kg/min: liver + PN), independent of concentration
      RESP_Q: 0.95,         // 6.3: Metabolism.resp_q (term 0.8) -> RQ on glucose-rich PN (Bauer 2003, Forsyth 1992)
      VO2_METABOLISM: 5.19, // reference total 6.0 minus term's Mob (myocardium) ~0.81 (starting point split)
      HB_MMOL: 14.5 / 1.611, // reference: Hb 14.5 g/dL -> 9.0 mmol/L
      P50: 18.5,            // reference: De Halleux 2002, untransfused <= 27 wk, standard conditions
      ENV_TEMP: 35.0,       // reference: incubator air (degC)
      REL_HUMIDITY: 0.70,   // reference: incubator humidity
      GFR_FACTOR: 1.0,      // renal reference GFR target as the Vieux 2010 rule gives it (reseed_preterm)
      AIRWAY_R: 1.0,        // airway resistors (MOUTH_DS, DS_ALL, DS_ALR) at term's absolute value: Rrs 54, in range
      INT_R: 1.0,           // intestinal bed (INT_ART, INT_CAP, INT_VEN) r x; SMA flow 32 (accepted edge)
      LS_R: 1.0,            // liver/spleen bed (LS_ART, LS_CAP, LS_VEN) r x; coeliac flow 32 (accepted edge)
      UB_R: 1.0,            // upper-body (non-brain) bed RUB r x
      BRAIN_AR_GAIN: 1.0,   // Brain.autoregulation_gain (1 = intact, term default)
      BRAIN_CTL_GAIN: 1.5,  // Brain.autoreg_control_gain (term_neonate baked value; class default 5.0)
    },
  },

  // 25 wk: the 28 wk profile carried over with the 25 wk reference values swapped in. Size-related levers
  // follow the size rule (author's choice, 2026-10-19): weight scaling shrinks volumes but leaves elastances
  // and resistances at term's absolute values, so each 28 wk size correction is divided by 0.7 (the weight
  // ratio to the 28 wk) and moved to the 25 wk per-kg target. All "starting point" values are validated in
  // step 6 against docs/Preterm25wkReference.md.
  25: {
    name: "preterm_25wk",
    refDoc: "docs/Preterm25wkReference.md",
    // chemoreceptor set-points = the reference resting gases (pCO2 48, PaO2 50, pH 7.22)
    CR: { CR_PCO2: 48, CR_PO2: 50, CR_PH: 7.22 },
    // diagram settings set by the author in the app (the oxygen colour window's upper end, mmol/L)
    diagram: { to2_hi: 7.8 },
    description:
      "Preterm neonate born at 25 weeks (0.7 kg) at 72 h: stable on nasal CPAP 7 cmH2O with FiO2 0.30 after " +
      "one LISA surfactant dose, a small restrictive left-to-right PDA (~1 mm) and a small PFO, untransfused " +
      "(delayed cord clamping), trophic feeds + parenteral nutrition, caffeine, humidified incubator. CPAP is " +
      "represented by the inspired FiO2 plus a recruited-lung state. Validated against " +
      "docs/Preterm25wkReference.md.",
    L: {
      // --- patient (reference) ---
      WEIGHT: 0.70,         // kg
      HEIGHT: 0.32,         // m (between the _make_preterm 24 and 26 wk rows)
      GA: 25,               // weeks
      AGE: 3 / 365,         // years: 72 h

      // --- circulation ---
      HR_REF: 160,          // reference: Deshpande 2023 (25.9 wk, 54 h)
      BR_WINDOW: 1,         // as 28 wk: baroreceptor window scaled with the set-point
      BR_MAP: 34,           // reference: Elsayed 2023 25 wk day-3 invasive median MAP
      SVR: 2.0,             // 6.4/final: systemic resistances x (size rule 2.49; lowered once the gut and upper-body beds were raised) -> MAP 36.5, baroreflex ~0.96
      PVR: 3.96,            // size rule: 3.0 x (mean PAP 18.5/20) / 0.7
      CONT: 1.0,            // as 28 wk: EF normal (Groves 2011, no GA effect)
      RELAX: 1.12,          // starting point: immature diastolic function (_make_preterm 24-26 wk 1.15/1.12)
      HEART_EL_MAX: 4.86,   // size rule: 3.4 / 0.7
      HEART_EL_MIN: 5.0,    // size rule: 3.5 / 0.7
      ART_EL: 7.14,         // size rule: 5.0 / 0.7 (pulse pressure target 19)
      VEN_UVOL: 0.77,       // as 28 wk
      PDA_REL: 0.8 / 3.0,   // 6.2: ductal diameter 0.8 mm (reference 0.8-1.4; 1.14 mm/kg ~ the 28 wk 1 mm/kg): ductal flow 41 -> 22
      FO_DIAM: 0.75,        // as 28 wk (starting point)
      COR_R: 2.99,          // size rule: 2.4 x (34/39) / 0.7
      BRAIN_R: 1.95,        // 6.4/final: cerebral bed r x (on top of SVR, which also scales it) -> autoregulation rests at ~0.99 over 10 min
                            //   (was 1.54, constricting); judge it by a time average, the controller is slow
      CBF_SET: 0.0196,      // reference: 28 mL/kg/min x 0.7 kg, L/min absolute (author kept the 28 wk per-kg CBF)

      // --- lungs and breathing ---
      RDS_EL: 10.57,        // size rule: 5.55 x (CL 0.8/0.6) / 0.7 -> lung compliance 0.6 mL/cmH2O/kg
      RDS_UVOL: 0.80,       // as 28 wk: FRC ~22 mL/kg (CPAP 7 at 25 wk ~ CPAP 6 at 28 wk)
      THORAX_EL: 3.0,       // size rule: 2.94 x (Ccw 5/7) / 0.7 -> chest wall 7 mL/cmH2O/kg
      GASEX: 0.315,         // size rule: 0.45 x 0.7 (absolute diffusion, scales with lung size)
      IPS_RES: 10500,       // 6.1/final: intrapulmonary shunt resistance -> SpO2 91 / PaO2 55, both in range (15000 gave 94.6 / 65;
                            //      SpO2 93 needs PaO2 ~58 on the fetal curve at pH ~7.23)
      SURFACTANT: 0.20,     // starting point: one LISA dose, between the 24-26 wk 0.15 and 28 wk 0.25
      FIO2: 0.30,           // reference: state definition
      MV_REF: 0.30,         // final: reference minute volume 0.325 -> 0.30 L/kg/min so pCO2 rests at the chemoreceptor set-point 48
                            //   (ventilation drive 0.93 -> 1.0); actual minute volume stays ~318 mL/kg/min, RR 65
      RR: 65,               // reference
      IE: 0.38,             // reference: Ti/Ttot
      RMP_RECAL: 1,         // as 28 wk: recalibrate the breathing effort gain on these lungs
      DS_UVOL: 1.45,        // reference: dead space 3.2 mL/kg (1.36 gave 3.0 at 28 wk)

      // --- metabolism, blood, environment ---
      REABS_WATER: 0.833,   // reference: urine 3 mL/kg/h at GFR 0.30 mL/min/kg (filtered 18 mL/kg/h)
      REABS_NACL: 0.90,     // reference: FENa 10 % (immature tubule)
      MAINT_RATE: 3.0,      // as 28 wk: maintenance intake = resting urine, composition derived from it
      UMA_DELTA: 4.35,      // starting point: 28 wk 2.85 + 1.5 (BE -5.5 -> -7, uma lowers BE ~1:1)
      GLUCOSE: 7.0,         // reference: calm value; hyperglycaemia common at 25 wk
      RESP_Q: 0.95,         // as 28 wk: glucose-rich PN
      VO2_METABOLISM: 5.19, // as 28 wk: total 6.0 mL/kg/min minus the myocardium
      HB_MMOL: 13.5 / 1.611, // reference: Hb 13.5 g/dL
      P50: 18.5,            // reference: De Halleux 2002 (<= 27 wk, untransfused)
      ENV_TEMP: 36.0,       // reference: incubator air (degC)
      REL_HUMIDITY: 0.80,   // reference: incubator humidity
      GFR_FACTOR: 1.143,    // reference: GFR 0.30 mL/min/kg vs the Vieux rule extrapolated to 25 wk (0.2625)
      AIRWAY_R: 1.67,       // 6.1: airway resistors x (were term absolute, Rrs 54) -> Rrs 90
      INT_R: 1.64,          // 6.4: intestinal bed r x -> SMA flow 36 -> 28
      LS_R: 1.8,            // 6.4: liver/spleen bed r x -> coeliac flow 36 -> 26
      UB_R: 1.3,            // final: upper-body (non-brain) bed RUB r x -> SVC 110 -> 96 (flow moved up once the gut beds closed)
      BRAIN_AR_GAIN: 1.0,   // Brain.autoregulation_gain (1 = intact, term default)
      BRAIN_CTL_GAIN: 1.0,  // final: Brain.autoreg_control_gain 1.5 -> 1.0: at 1.5 the loop oscillated (~18 s period, CBF +/-19 %,
                            //   integrator hitting its floor); autoregulation strength unchanged, only slower
    },
  },

  // 30 wk: the 28 wk profile carried over with the 30 wk reference values swapped in. Size-related levers
  // follow the size rule: each 28 wk size correction is divided by 1.5 (the weight ratio to the 28 wk) and
  // moved to the 30 wk per-kg target. No surfactant was given: the lung is the infant's own, mildly
  // affected one, in room air. All "starting point" values are validated in step 6 against
  // docs/Preterm30wkReference.md.
  30: {
    name: "preterm_30wk",
    refDoc: "docs/Preterm30wkReference.md",
    // chemoreceptor set-points = the reference resting gases (pCO2 43, PaO2 64, pH 7.33)
    CR: { CR_PCO2: 43, CR_PO2: 64, CR_PH: 7.33 },
    description:
      "Preterm neonate born at 30 weeks (1.5 kg) at 72 h: stable on nasal CPAP 5 cmH2O in room air without " +
      "surfactant (mild RDS), a small restrictive left-to-right PDA (~1 mm) and a small PFO, untransfused " +
      "(delayed cord clamping), advancing enteral feeds + parenteral nutrition, caffeine, humidified incubator. " +
      "CPAP is represented by the inspired FiO2 plus a recruited-lung state. Validated against " +
      "docs/Preterm30wkReference.md.",
    L: {
      // --- patient (reference) ---
      WEIGHT: 1.5,          // kg
      HEIGHT: 0.40,         // m (Fenton P50 length at 30 wk)
      GA: 30,               // weeks
      AGE: 3 / 365,         // years: 72 h

      // --- circulation ---
      HR_REF: 150,          // reference: between 28 wk 155 and Groves MRI 142 (HR falls with GA: Alonzo 2018, Eenkhoorn 2026)
      BR_WINDOW: 1,         // as 28 wk: baroreceptor window scaled with the set-point
      BR_MAP: 42,           // reference: Elsayed 2023 day-3 median extrapolated to 30 wk
      SVR: 1.34,            // 6.4: systemic resistances x (size rule 2.0 x (42/39) / 1.5 = 1.44; lowered once the gut beds closed,
                            //      which had raised MAP to 44.4) -> MAP 43.3 with the baroreflex neutral
      PVR: 1.25,            // 6.2: pulmonary resistances x (size rule 3.0 x (19.5/20) / 1.5 = 1.95 left PAP mean 26 whatever the
                            //      output) -> PAP 26/20.3; the lower PA pressure lets the duct carry 30 (was 23)
      CONT: 1.0,            // as 28 wk: EF normal (Groves 2011, no GA effect)
      RELAX: 1.08,          // starting point: diastolic function a little more mature than 28 wk (_make_preterm 30 wk row)
      HEART_EL_MAX: 2.27,   // size rule: 3.4 / 1.5
      HEART_EL_MIN: 2.9,    // 6.1: heart chambers el_min x (size rule 3.5 / 1.5 = 2.33 over-filled: LV EDV 2.55, LVO 251, MAP 46
                            //      above the baroreflex set-point) -> EDV 2.19, LVO 221, MAP 42.5 with the baroreflex neutral
      ART_EL: 5.5,          // 6.2: artery el_base x (size rule 5.0 / 1.5 x 27/25 = 3.6 gave pulse pressure 18) -> BP 56/30, PP 26
      VEN_UVOL: 0.77,       // as 28 wk
      PDA_REL: 0.9 / 3.0,   // 6.4: ductal diameter 0.9 mm (reference 0.8-1.4): after 6.2 lowered the PA pressure a 1.0 mm duct carried
                            //      30 mL/kg/min -> 21.5
      FO_DIAM: 0.9,         // size rule: 0.75 mm x sqrt(1.5) (same L->R flow per kg through a 1.5x larger infant)
      COR_R: 1.72,          // size rule: 2.4 x (42/39) / 1.5
      BRAIN_R: 1.6,         // 6.4: cerebral bed r x (size rule 1.34; SVR also scales the brain bed) -> autoregulation rests at 0.97
                            //      over minutes 8-10 (was 1.14, and 1.3 once SVR was lowered), CBF 25
      CBF_SET: 0.0375,      // reference: 25 mL/kg/min x 1.5 kg, L/min absolute

      // --- lungs and breathing ---
      RDS_EL: 3.29,         // size rule: 5.55 x (CL 0.8/0.9) / 1.5 -> lung compliance 0.9 mL/cmH2O/kg
      RDS_UVOL: 0.87,       // starting point: 0.80 x (FRC 24/22) on CPAP 5
      THORAX_EL: 2.18,      // size rule: 2.94 x (Ccw 5/4.5) / 1.5 -> chest wall 4.5 mL/cmH2O/kg
      GASEX: 0.675,         // size rule: 0.45 x 1.5 (absolute diffusion, scales with lung size)
      IPS_RES: 14000,       // starting point: 10500 / 1.5 for the larger lung, x2 for about half the shunt fraction
                            //   (SpO2 96 in room air vs 93 on FiO2 0.25)
      SURFACTANT: 0.30,     // starting point: own surfactant at 30 wk, none given (_add_surfactant default)
      FIO2: 0.21,           // reference: state definition (room air on CPAP 5)
      MV_REF: 0.285,        // final: reference minute volume 0.30 -> 0.285 L/kg/min so pCO2 rests at the chemoreceptor set-point 43
                            //   (ventilation drive 0.95 -> 1.0); actual minute volume ~286 mL/kg/min, RR 60
      RR: 60,               // reference: Welty 2018 (29.6 wk, 44 h) 67 +/- 20, lower with maturity
      IE: 0.38,             // reference: Ti/Ttot
      RMP_RECAL: 1,         // as 28 wk: recalibrate the breathing effort gain on these lungs
      DS_UVOL: 1.27,        // reference: dead space 2.8 mL/kg (1.36 gave 3.0 at 28 wk)

      // --- metabolism, blood, environment ---
      REABS_WATER: 0.9375,  // reference: urine 3 mL/kg/h at GFR 0.8 mL/min/kg (filtered 48 mL/kg/h)
      REABS_NACL: 0.97,     // reference: FENa ~3 % (falls with GA, Gallini 2000)
      MAINT_RATE: 3.0,      // as 28 wk: maintenance intake = resting urine, composition derived from it
      UMA_DELTA: 0.35,      // starting point: 28 wk 2.85 - 2.5 (BE -5.5 -> -3, uma lowers BE ~1:1)
      GLUCOSE: 5.5,         // reference: advancing feeds, less PN glucose
      RESP_Q: 0.92,         // reference: milk fat replaces part of the glucose-rich PN
      VO2_METABOLISM: 5.69, // reference total 6.5 mL/kg/min minus the myocardium (~0.81, as 28 wk)
      HB_MMOL: 15.5 / 1.611, // reference: Hb 15.5 g/dL (Jopling 29-34 wk, day 3)
      P50: 19.0,            // reference: Granzotto 1991 (P50 rises linearly with GA)
      ENV_TEMP: 34.0,       // reference: incubator air (degC)
      REL_HUMIDITY: 0.60,   // reference: incubator humidity
      GFR_FACTOR: 0.743,    // reference: GFR 0.8 mL/min/kg vs the Vieux day-7 rule at 30 wk (1.077)
      AIRWAY_R: 0.83,       // starting point: airway resistors x (term-absolute, Rrs ~54) -> Rrs ~45
      INT_R: 1.1,           // 6.4: intestinal bed r x -> SMA flow ~30 (time-averaged reference 28)
      LS_R: 1.5,            // 6.4: liver/spleen bed r x -> coeliac flow 30 -> 23 (templated identical to the gut bed in term)
      UB_R: 1.0,            // starting point: as 28 wk
      BRAIN_AR_GAIN: 1.0,   // Brain.autoregulation_gain (1 = intact, term default)
      BRAIN_CTL_GAIN: 1.0,  // as 25 wk: 1.0 keeps the autoregulation loop from oscillating (term baked 1.5)
    },
  },

  // Bischoff 2021 no-PDA group (Echocardiography 38:1524, Tables 1-2): the 25 wk profile carried over with
  // Bischoff's values swapped in. Size-related levers follow the size rule from 0.70 to 0.764 kg (each 25 wk
  // size correction x 0.70/0.764 = 0.916). Values the paper does not give keep the 25 wk reference. All
  // "starting point" values are validated in step 3 against docs/BischoffNoPdaReference.md.
  bischoff_no_pda: {
    name: "bischoff_no_pda",
    refDoc: "docs/BischoffNoPdaReference.md",
    // chemoreceptor set-points = the reference resting gases (Bischoff no-PDA pCO2 43, PaO2 44 from the OI, pH 7.37)
    CR: { CR_PCO2: 43, CR_PO2: 44, CR_PH: 7.37 },
    // diagram settings set by the author in the app (the oxygen colour window's upper end, mmol/L)
    diagram: { to2_hi: 7.8 },
    description:
      "Preterm neonate matching the no-PDA group of Bischoff et al. 2021 (25.5 weeks, 0.764 kg) at 72 h: " +
      "spontaneous breathing at mean airway pressure 6 in room air (the group was mostly on HFJV), duct closed, " +
      "small PFO, untransfused, trophic feeds + parenteral nutrition, caffeine, humidified incubator. Respiratory " +
      "support is represented by the inspired FiO2 plus a recruited-lung state. Validated against " +
      "docs/BischoffNoPdaReference.md.",
    L: {
      // --- patient (reference) ---
      WEIGHT: 0.764,        // kg: Bischoff current weight, median (birth weight 826 g)
      HEIGHT: 0.32,         // m: as 25 wk
      GA: 25.5,             // weeks: Bischoff 25.53 +/- 2.07
      AGE: 3 / 365,         // years: 72 h (author's choice; Bischoff median day 1)

      // --- circulation ---
      HR_REF: 155,          // reference: Bischoff 155.1 +/- 9.1
      BR_WINDOW: 1,         // as 25 wk: baroreceptor window scaled with the set-point
      BR_MAP: 34,           // reference (25 wk set): Elsayed 2023 25 wk day-3 invasive median MAP
      SVR: 2.1,             // 3.1: systemic resistances x (size rule 1.83) -> MAP 34.0 with the stiffer ventricles, baroreflex ~1.01
      PVR: 3.63,            // size rule: 3.96 x 0.916
      CONT: 1.0,            // as 25 wk: no LV dysfunction in the group
      RELAX: 1.12,          // as 25 wk (starting point)
      HEART_EL_MAX: 4.45,   // size rule: 4.86 x 0.916
      HEART_EL_MIN: 6.0,    // 3.1: heart chambers el_min x (size rule 4.58 gave SV 1.43, LVO 215) -> SV 1.12, EDV 1.75, LVO 177
                            //      (Bischoff 170); diastolic stiffness of the immature myocardium, CVP 1.9 -> 2.7
      ART_EL: 6.54,         // size rule: 7.14 x 0.916
      VEN_UVOL: 0.77,       // as 25 wk
      PDA_REL: 0,           // reference: no PDA; 0 = closed (Pda closed-duct path, as term_neonate)
      FO_DIAM: 0.78,        // size rule: 0.75 mm x sqrt(0.764/0.70); Bischoff: atrial communication in 14/15, net ~0
      COR_R: 2.74,          // size rule: 2.99 x 0.916
      BRAIN_R: 1.44,        // 3.3: cerebral bed r x (25 wk 1.95 left autoregulation at 0.50, dilated, once SVR rose to 2.1;
                            //      SVR also scales the brain bed) -> autoregulation ~1 over minutes 8-10, CBF 28
      CBF_SET: 0.0214,      // reference: 28 mL/kg/min x 0.764 kg, L/min absolute

      // --- lungs and breathing ---
      RDS_EL: 9.68,         // size rule: 10.57 x 0.916 (lung compliance 0.6 mL/cmH2O/kg)
      RDS_UVOL: 0.80,       // as 25 wk (starting point): recruited lung at mean airway pressure 6
      THORAX_EL: 2.75,      // size rule: 3.0 x 0.916
      GASEX: 0.344,         // size rule: 0.315 / 0.916 (absolute diffusion, scales with lung size)
      IPS_RES: 14000,       // 3.2: intrapulmonary shunt resistance (size-rule start 9620 gave SpO2 86.4 / PaO2 36.9 once the output
                            //   fell) -> SpO2 90.4 / PaO2 43.3 / SvO2 72 in room air; O2 diffusion x2 changed nothing (shunt-limited)
      SURFACTANT: 0.20,     // as 25 wk (starting point)
      FIO2: 0.21,           // reference: Bischoff FiO2 21 % [21, 33]
      MV_REF: 0.335,        // starting point: 25 wk 0.30 x 48/43 for the lower pCO2 set-point
      RR: 65,               // reference (25 wk set)
      IE: 0.38,             // reference (25 wk set): Ti/Ttot
      RMP_RECAL: 1,         // as 25 wk: recalibrate the breathing effort gain on these lungs
      DS_UVOL: 1.45,        // reference (25 wk set): dead space 3.2 mL/kg

      // --- metabolism, blood, environment ---
      REABS_WATER: 0.833,   // as 25 wk: urine 3 mL/kg/h at GFR 0.30 mL/min/kg
      REABS_NACL: 0.90,     // as 25 wk: FENa 10 %
      MAINT_RATE: 3.0,      // as 25 wk: maintenance intake = resting urine, composition derived from it
      UMA_DELTA: -3.15,     // starting point: 25 wk 4.35 - 7.5 (BE -7 -> +0.5, uma lowers BE ~1:1)
      GLUCOSE: 7.0,         // as 25 wk
      RESP_Q: 0.95,         // as 25 wk: glucose-rich PN
      VO2_METABOLISM: 5.19, // as 25 wk: total 6.0 mL/kg/min minus the myocardium
      HB_MMOL: 13.5 / 1.611, // as 25 wk: Hb 13.5 g/dL
      P50: 18.5,            // as 25 wk
      ENV_TEMP: 36.0,       // as 25 wk
      REL_HUMIDITY: 0.80,   // as 25 wk
      GFR_FACTOR: 1.143,    // as 25 wk: GFR 0.30 mL/min/kg vs the Vieux rule extrapolated to 25 wk
      AIRWAY_R: 1.53,       // size rule: 1.67 x 0.916
      INT_R: 1.64,          // as 25 wk (bed ratio)
      LS_R: 1.8,            // as 25 wk (bed ratio)
      UB_R: 1.3,            // as 25 wk (bed ratio)
      BRAIN_AR_GAIN: 1.0,   // Brain.autoregulation_gain (1 = intact, term default)
      BRAIN_CTL_GAIN: 1.0,  // as 25 wk
    },
  },

  // Bischoff 2021 left-to-right PDA group (Tables 1-2): the calibrated bischoff_no_pda profile with this group's values
  // swapped in and the duct opened. Size-related levers follow the size rule from 0.764 to 0.72 kg (x 0.764/0.72 = 1.061).
  // All "starting point" values are validated in step 3 against docs/BischoffLtrPdaReference.md.
  bischoff_ltr_pda: {
    name: "bischoff_ltr_pda",
    refDoc: "docs/BischoffLtrPdaReference.md",
    // chemoreceptor set-points = the reference resting gases (Bischoff L->R PDA pCO2 49, PaO2 46 from the OI, pH 7.34)
    CR: { CR_PCO2: 49, CR_PO2: 46, CR_PH: 7.34 },
    // diagram settings set by the author in the app (the oxygen colour window's upper end, mmol/L)
    diagram: { to2_hi: 7.8 },
    description:
      "Preterm neonate matching the left-to-right PDA group of Bischoff et al. 2021 (25.8 weeks, 0.72 kg) at 72 h: " +
      "spontaneous breathing at mean airway pressure 7 with FiO2 0.26 (the group was mostly on HFJV), a haemodynamically " +
      "significant left-to-right PDA (~2.1 mm) and a left-to-right PFO, untransfused, trophic feeds + parenteral nutrition, " +
      "caffeine, humidified incubator. Respiratory support is represented by the inspired FiO2 plus a recruited-lung state. " +
      "Validated against docs/BischoffLtrPdaReference.md.",
    L: {
      // --- patient (reference) ---
      WEIGHT: 0.72,         // kg: Bischoff current weight, median (birth weight 716 g)
      HEIGHT: 0.32,         // m: as bischoff_no_pda
      GA: 25.8,             // weeks: Bischoff 25.77 +/- 2.18
      AGE: 3 / 365,         // years: 72 h = the group median (day 3)

      // --- circulation ---
      HR_REF: 163,          // reference: Bischoff 162.7 +/- 12.7
      BR_WINDOW: 1,         // as bischoff_no_pda
      BR_MAP: 34,           // reference (25 wk set): Elsayed 2023 25 wk day-3 invasive median MAP
      SVR: 2.23,            // size rule: 2.1 x 1.061
      PVR: 3.4,             // 3.1/3.3: pulmonary resistances x (size rule 3.85; 3.2 in 3.1) -> with the narrower ductal jet: PAP near-systemic,
                            //      ductal flow ~94, no right-to-left time; raised to 3.4 once the larger lung shunt lowered PAP
      CONT: 1.0,            // as bischoff_no_pda: no LV or RV dysfunction in the group
      CONT_R: 1.0,          // RV contractility (Heart.cont_factor_right); 3.2: x1.3/x1.6 raised RV EF only to 42/43 % but RVO rose and CVP fell
      RELAX: 1.12,          // as bischoff_no_pda
      HEART_EL_MAX: 4.72,   // size rule: 4.45 x 1.061
      HEART_EL_MIN: 6.37,   // size rule: 6.0 x 1.061
      ART_EL: 6.94,         // size rule: 6.54 x 1.061
      AO_PROX_EL: 3.0,      // 3.5: proximal aorta (AA, AAR) el x on top of ART_EL -> pulsatile unrestrictive ductal Doppler (neocardiolab image)
      PA_EL: 2.0,           // 3.5: PA/PAAL/PAAR el_base x (stiffer PA follows the aorta in diastole -> low end-diastolic ductal velocity)
      AO_ZC: 1.0,           // AAR_AD resistance x (tried 5-30 in 3.5: little effect on the ductal shape, kept 1)
      VEN_UVOL: 0.73,       // 3.4: VLB/VUB unstressed volume x (0.77 in bischoff_no_pda) -> CVP 1.3 -> 1.55, PAP back in range
      PDA_REL: 2.1 / 3.0,   // reference: ductal diameter 2.1 mm (Bischoff 2.1 +/- 0.5; Pda.diameter_pa_max = 3 mm)
      PDA_LEN: 14,          // ductal length, mm (term_neonate value; 3.1: length 40 fixed the direction but not the Doppler)
      PDA_CD: 0.25,         // 3.1: ductal orifice discharge coefficient (term 0.9): effective jet ~1 mm in the 2.1 mm duct, so the
                            //      Doppler jet (Q/A_eff) reaches ~1.7 / 0.5 m/s and right-to-left time 19.8 % -> 0 (Bischoff group < 10 %)
      FO_DIAM: 0.5,         // 3.2: Shunts.diameter_fo, mm (size rule 0.76 carried ~20 mL/kg/min L->R that the RV pumped again, RVO 200)
                            //      -> PFO 5.6, RVO 190, LVO/RVO 1.44; atrial communication L->R in 14/15
      COR_R: 2.91,          // size rule: 2.74 x 1.061
      BRAIN_R: 1.56,        // 3.4: cerebral bed r x (1.44 in bischoff_no_pda left autoregulation at 1.13, constricted) -> ~1 over minutes 8-10
      CBF_SET: 0.0202,      // reference: 28 mL/kg/min x 0.72 kg, L/min absolute

      // --- lungs and breathing ---
      RDS_EL: 10.27,        // size rule: 9.68 x 1.061
      RDS_UVOL: 0.80,       // as bischoff_no_pda (starting point): recruited lung at mean airway pressure 7
      THORAX_EL: 2.92,      // size rule: 2.75 x 1.061
      GASEX: 0.324,         // size rule: 0.344 / 1.061
      IPS_RES: 7000,        // 3.3: intrapulmonary shunt resistance (size rule 14860 gave SpO2 95 / PaO2 63 at FiO2 0.26) -> SpO2 89.4,
                            //      PaO2 45, SvO2 (RA) 72
      SURFACTANT: 0.20,     // as bischoff_no_pda
      FIO2: 0.26,           // reference: Bischoff FiO2 26 % [24, 35]
      MV_REF: 0.31,         // 3.3: reference minute volume, L/kg/min (start 0.289) so pCO2 rests at the set-point 49 (ventilation drive 1.12 -> 1.02)
      RR: 65,               // reference (25 wk set)
      IE: 0.38,             // reference (25 wk set)
      RMP_RECAL: 1,         // as bischoff_no_pda
      DS_UVOL: 1.45,        // reference (25 wk set): dead space 3.2 mL/kg

      // --- metabolism, blood, environment ---
      REABS_WATER: 0.833,   // as bischoff_no_pda
      REABS_NACL: 0.90,     // as bischoff_no_pda
      MAINT_RATE: 3.0,      // as bischoff_no_pda
      UMA_DELTA: -3.15,     // as bischoff_no_pda: BE ~+0.6 there; pH 7.34 + pCO2 49 imply BE ~+0.8 (BE follows)
      GLUCOSE: 7.0,         // as bischoff_no_pda
      RESP_Q: 0.95,         // as bischoff_no_pda
      VO2_METABOLISM: 5.19, // as bischoff_no_pda
      HB_MMOL: 13.5 / 1.611, // as bischoff_no_pda
      P50: 18.5,            // as bischoff_no_pda
      ENV_TEMP: 36.0,       // as bischoff_no_pda
      REL_HUMIDITY: 0.80,   // as bischoff_no_pda
      GFR_FACTOR: 1.143,    // as bischoff_no_pda
      AIRWAY_R: 1.62,       // size rule: 1.53 x 1.061
      INT_R: 1.64,          // as bischoff_no_pda (bed ratio)
      LS_R: 1.8,            // as bischoff_no_pda (bed ratio)
      UB_R: 1.3,            // as bischoff_no_pda (bed ratio)
      BRAIN_AR_GAIN: 1.0,   // as bischoff_no_pda
      BRAIN_CTL_GAIN: 1.0,  // as bischoff_no_pda
    },
  },
  // Bischoff 2021 bidirectional PDA group (Tables 1-2): the calibrated bischoff_ltr_pda profile with this group's values
  // swapped in, the duct at 1.7 mm and the step 3.5 arch/PA stiffening off. Size-related levers follow the size rule from
  // 0.72 to 0.68 kg (x 0.72/0.68 = 1.0588). All "starting point" values are validated in step 3 against
  // docs/BischoffBidirPdaReference.md.
  bischoff_bidir_pda: {
    name: "bischoff_bidir_pda",
    refDoc: "docs/BischoffBidirPdaReference.md",
    // chemoreceptor set-points = the reference resting gases (Bischoff bidirectional PDA pCO2 45, PaO2 36 from the OI, pH 7.32)
    CR: { CR_PCO2: 45, CR_PO2: 36, CR_PH: 7.32 },
    // diagram settings set by the author in the app (the oxygen colour window's upper end, mmol/L)
    diagram: { to2_hi: 7.8 },
    description:
      "Preterm neonate matching the bidirectional PDA group of Bischoff et al. 2021 (25.1 weeks, 0.68 kg) at 72 h: " +
      "spontaneous breathing at mean airway pressure 8 with FiO2 0.28 (the group was ventilated, mostly HFJV), a bidirectional " +
      "unrestrictive PDA (~1.7 mm, right-to-left in systole) with near-systemic pulmonary pressure, a bidirectional PFO and RV " +
      "dysfunction, untransfused, trophic feeds + parenteral nutrition, caffeine, humidified incubator. Respiratory support is " +
      "represented by the inspired FiO2 plus a recruited-lung state. Validated against docs/BischoffBidirPdaReference.md.",
    L: {
      // --- patient (reference) ---
      WEIGHT: 0.68,         // kg: Bischoff current weight, median (birth weight 725 g)
      HEIGHT: 0.32,         // m: as bischoff_ltr_pda
      GA: 25.1,             // weeks: Bischoff 25.06 +/- 2.17
      AGE: 3 / 365,         // years: 72 h (author's choice; the group median is day 0)

      // --- circulation ---
      HR_REF: 160,          // reference: Bischoff 159.8 +/- 12.4
      BR_WINDOW: 1,         // as bischoff_ltr_pda
      BR_MAP: 34,           // reference (25 wk set): Elsayed 2023 25 wk day-3 invasive median MAP
      SVR: 2.36,            // size rule: 2.23 x 1.0588 (bischoff_ltr_pda)
      PVR: 8.5,             // 3.1/3.2/3.4: pulmonary resistances x (size rule 3.6 kept the duct left-to-right, PAP 31/26; 9 in 3.1, 8 in 3.2)
                            //      -> with the weaker heart and IPS_RES 20000: PAP 37/31, right-to-left 35 % of the cycle, net duct 9,
                            //      Doppler 0.62/0.43 m/s (PVR 9 -> 42-46 %; 10 -> 55 %; 8 + IPS 22000 -> 30 %, SpO2 86.5)
      CONT: 0.4,            // 3.4: LV contractility (LV dysfunction in 27 %), with CONT_R: pump-limited low output -> LVO/RVO 165/157,
                            //      CVP 3.2, SvO2 (RA) 62; 0.3 gives the same flow (floor); brain autoregulation 0.65 (dilated)
      CONT_R: 0.4,          // 3.3/3.4: RV contractility (Heart.cont_factor_right; RV dysfunction in 47 %); 0.65 in 3.3 (LVO 199). Stiffer
                            //      heart (HEART_EL_MIN 9-13) flipped the duct right-to-left; VEN_UVOL / blood volume lowered LVO only with CVP,
                            //      PAP and SBP below range (hypovolaemic picture); SVR and LV CONT alone barely moved LVO
      RELAX: 1.12,          // as bischoff_ltr_pda
      HEART_EL_MAX: 5.0,    // size rule: 4.72 x 1.0588
      HEART_EL_MIN: 6.74,   // size rule: 6.37 x 1.0588
      ART_EL: 7.35,         // size rule: 6.94 x 1.0588
      AO_PROX_EL: 1.0,      // off (bischoff_ltr_pda 3.5 used 3 for its left-to-right Doppler shape)
      PA_EL: 1.0,           // off (bischoff_ltr_pda 3.5 used 2)
      AO_ZC: 1.0,           // AAR_AD resistance x
      VEN_UVOL: 0.73,       // as bischoff_ltr_pda (starting point)
      PDA_REL: 1.7 / 3.0,   // reference: ductal diameter 1.7 mm (Bischoff 1.7 +/- 0.6; Pda.diameter_pa_max = 3 mm)
      PDA_LEN: 14,          // ductal length, mm (as bischoff_ltr_pda)
      PDA_CD: 0.25,         // 3.1: ductal orifice discharge coefficient, as bischoff_ltr_pda (0.9 gave Doppler ~0.4 m/s, below the image)
      FO_DIAM: 0.5,         // as bischoff_ltr_pda (starting point): Shunts.diameter_fo, mm
      COR_R: 3.08,          // size rule: 2.91 x 1.0588
      BRAIN_R: 1.56,        // as bischoff_ltr_pda (starting point)
      CBF_SET: 0.0190,      // reference: 28 mL/kg/min x 0.68 kg, L/min absolute

      // --- lungs and breathing ---
      RDS_EL: 10.87,        // size rule: 10.27 x 1.0588
      RDS_UVOL: 0.80,       // as bischoff_ltr_pda (starting point): recruited lung (mean airway pressure 8 in this group)
      THORAX_EL: 3.09,      // size rule: 2.92 x 1.0588
      GASEX: 0.306,         // size rule: 0.324 / 1.0588
      IPS_RES: 20000,       // 3.2/3.4: intrapulmonary shunt resistance (size rule 7410 gave SpO2 66 / PaO2 24 once PVR 9 pushed 70 % of
                            //      the pulmonary flow through the fixed shunt; 16500 in 3.2) -> SpO2 83.7 / PaO2 36.1 after 3.4; higher
                            //      values overshoot the right-to-left time as the ventilation drive falls
      SURFACTANT: 0.20,     // as bischoff_ltr_pda
      FIO2: 0.28,           // reference: Bischoff FiO2 28 % [26, 92]
      MV_REF: 0.31,         // as bischoff_ltr_pda (starting point)
      RR: 65,               // reference (25 wk set)
      IE: 0.38,             // reference (25 wk set)
      RMP_RECAL: 1,         // as bischoff_ltr_pda
      DS_UVOL: 1.45,        // reference (25 wk set): dead space 3.2 mL/kg

      // --- metabolism, blood, environment ---
      REABS_WATER: 0.833,   // as bischoff_ltr_pda
      REABS_NACL: 0.90,     // as bischoff_ltr_pda
      MAINT_RATE: 3.0,      // as bischoff_ltr_pda
      UMA_DELTA: -3.15,     // as bischoff_ltr_pda (starting point); target BE -4.4 (pH 7.32 + pCO2 45 imply ~-3)
      GLUCOSE: 7.0,         // as bischoff_ltr_pda
      RESP_Q: 0.95,         // as bischoff_ltr_pda
      VO2_METABOLISM: 5.19, // as bischoff_ltr_pda
      HB_MMOL: 13.5 / 1.611, // as bischoff_ltr_pda
      P50: 18.5,            // as bischoff_ltr_pda
      ENV_TEMP: 36.0,       // as bischoff_ltr_pda
      REL_HUMIDITY: 0.80,   // as bischoff_ltr_pda
      GFR_FACTOR: 1.143,    // as bischoff_ltr_pda
      AIRWAY_R: 1.72,       // size rule: 1.62 x 1.0588
      INT_R: 1.64,          // as bischoff_ltr_pda (bed ratio)
      LS_R: 1.8,            // as bischoff_ltr_pda (bed ratio)
      UB_R: 1.3,            // as bischoff_ltr_pda (bed ratio)
      BRAIN_AR_GAIN: 1.0,   // as bischoff_ltr_pda
      BRAIN_CTL_GAIN: 1.0,  // as bischoff_ltr_pda
    },
  },
};
