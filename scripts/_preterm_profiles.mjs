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
      SVR: 2.1,             // 6.4: systemic resistances x (size rule 2.49; lowered once the gut beds were raised) -> MAP 36, baroreflex ~0.96
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
      BRAIN_R: 2.0,         // 6.4: cerebral bed r x (on top of SVR, which also scales it) -> autoregulation rests at ~1.06 (was 1.54, constricting)
      CBF_SET: 0.0196,      // reference: 28 mL/kg/min x 0.7 kg, L/min absolute (author kept the 28 wk per-kg CBF)

      // --- lungs and breathing ---
      RDS_EL: 10.57,        // size rule: 5.55 x (CL 0.8/0.6) / 0.7 -> lung compliance 0.6 mL/cmH2O/kg
      RDS_UVOL: 0.80,       // as 28 wk: FRC ~22 mL/kg (CPAP 7 at 25 wk ~ CPAP 6 at 28 wk)
      THORAX_EL: 3.0,       // size rule: 2.94 x (Ccw 5/7) / 0.7 -> chest wall 7 mL/cmH2O/kg
      GASEX: 0.315,         // size rule: 0.45 x 0.7 (absolute diffusion, scales with lung size)
      IPS_RES: 9500,        // 6.1: intrapulmonary shunt resistance -> SpO2 91 / PaO2 54, both in range (15000 gave 94.6 / 65;
                            //      SpO2 93 needs PaO2 ~58 on the fetal curve at pH ~7.23)
      SURFACTANT: 0.20,     // starting point: one LISA dose, between the 24-26 wk 0.15 and 28 wk 0.25
      FIO2: 0.30,           // reference: state definition
      MV_REF: 0.325,        // reference: 325 mL/kg/min (L/kg/min, per kg)
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
    },
  },
};
