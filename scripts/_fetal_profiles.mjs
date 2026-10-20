// Lever profiles for scripts/_make_fetus_validated.mjs: one per validated fetal scenario.
// Each lever is a named constant with its source. "reference" values come straight from the scenario's
// reference set; "starting point" values are to be validated against it (first look, then recalibration);
// "preterm 30" marks a value carried over from the preterm_30wk profile (scripts/_preterm_profiles.mjs),
// the same gestation and weight born 72 h earlier.
export const PROFILES = {
  // 30 wk: a fetus in utero at 30+0 wk, 1.5 kg, not in labour (docs/Fetus30wkReference.md). Starting points
  // for the fetal-specific levers come from the archived fetus_30wk row in scripts/_ga_tables.mjs (1.35 kg,
  // old term base), corrected to 1.5 kg and to the 30 wk flow shares of the reference set.
  // 25 wk: a fetus in utero at 25+0 wk, 0.7 kg (= preterm_25wk), not in labour (docs/Fetus25wkReference.md). Size and
  // maturity levers start from the preterm_25wk profile (same weight), corrected by the ratios the 30 wk fetus found
  // against preterm_30wk (heart el_min x0.76, venous u_vol x1.10, brain bed x0.125, upper body x1.8); the fetal levers of
  // the 30 wk fetus are carried over; the placenta is scaled to 0.7 kg and the 25 wk umbilical flow and kept in
  // equilibrium with the maternal side (Siggaard-Andersen: equilibrium at 30 wk and earlier). All "starting point"
  // values are validated in step 5.
  25: {
    name: "fetus_25wk",
    refDoc: "docs/Fetus25wkReference.md",
    // diagram oxygen colour window spanning the fetal range: lower-body venous (~2.4) to the umbilical vein (~7.2 mmol/L
    // at Hb 7.95 and SO2 90 %)
    diagram: { to2_lo: 2.4, to2_hi: 7.3 },
    description:
      "Fetus in utero at 25 weeks (0.7 kg), not in labour: the placenta is the gas exchanger, the lungs are " +
      "fluid-filled, the ductus arteriosus and foramen ovale are wide open (right-to-left), fetal haemoglobin, " +
      "amniotic environment. Validated against docs/Fetus25wkReference.md.",
    L: {
      // --- patient (reference) ---
      WEIGHT: 0.7,          // kg (author's choice: = preterm_25wk)
      HEIGHT: 0.33,         // m
      GA: 25,               // weeks
      AGE: 0,               // years: not born

      // --- circulation ---
      HR_REF: 144,          // reference: CTG baseline ~144 at 25 wk
      BR_WINDOW: 1,         // baroreceptor window scaled with the set-point
      BR_MAP: 35,           // reference: MAP 35 (ovine, 0.6 gestation)
      SVR: 2.0,             // preterm 25 (fetus 30 = preterm 30 value)
      FETAL_PVR: 9.5,       // fetal transform
      PVR: 3.0,             // starting point: fetus 30 x1.4 by the size rule (/0.7 x 1.5)
      CONT_LEFT: 1.0,       // as fetus 30
      CONT_RIGHT: 1.2,      // as fetus 30
      RELAX: 1.12,          // preterm 25
      HEART_EL_MAX: 4.86,   // preterm 25
      HEART_EL_MIN: 2.5,    // 5.1: heart chambers el_min x (starting point 3.8 = preterm 25 5.0 x0.76): the heart under-filled (output 377,
                            //      LV SV 1.0) and the baroreflex held HR at 160 / SVR x1.22 for MAP ~31 -> MAP 34.4, HR 148, reflex ~neutral,
                            //      output 439, umbilical flow 147. SVR 2.0 -> 3.2 raised MAP only to 33.4 (the placenta takes the flow)
      ART_EL: 7.14,         // preterm 25
      VEN_UVOL: 0.85,       // as fetus 30 (preterm 25 0.77 x1.10)
      RV_EL_MIN: 0.8,       // as fetus 30
      RV_UVOL_RATIO: 1.64,  // fetal transform
      DA_DIAM: 3.9,         // starting point: fetus 30 4.6 x Szpinda 2.54/3.01 (anatomy 2.54; PA ~ Ao is the target)
      DA_LEN: 7.9,          // reference: Szpinda length at 25 wk, mm
      FO_DIAM: 3.4,         // starting point: fetus 30 4.4 x (0.7/1.5)^(1/3)
      FO_SEPTUM: 1.7,       // starting point: fetus 30 2.2 x (0.7/1.5)^(1/3)
      FO_SVC_FRACTION: 0.0, // as fetus 30: only IVC blood crosses the foramen
      COR_R: 2.99,          // preterm 25
      BRAIN_R: 0.35,        // final: cerebral bed r x (starting point 0.24 = preterm 25 1.95 x0.125; after 5.1 raised MAP the bed was
                            //      constricting at 1.77) -> autoregulation ~1.0 over minutes 8-10 at CBF ~95
      CBF_SET: 0.0665,      // reference: 95 mL/kg/min x 0.7 kg, L/min absolute (grade C)
      UB_R: 2.34,           // starting point: preterm 25 1.3 x1.8 (fetus 30 / preterm 30)
      INT_R: 1.64,          // preterm 25
      LS_R: 1.8,            // preterm 25

      // --- placenta ---
      PL_VOL: 0.22,         // starting point: fetal PL_* x (term 113 mL -> 25 mL = 30 % of 120 mL/kg x 0.7 kg)
      MAT_VOL: 0.3,         // starting point
      UMB_ART_RES: 2245,    // starting point: fetus 30 1095 x (210/94.5 mL/min umbilical flow) x (MAP 35/38)
      PLF_RES: 4980,        // starting point: fetus 30 2430, same scaling
      UMB_VEN_RES: 330,     // starting point: fetus 30 160, same scaling
      DIF_O2: 0.012,        // starting point: smaller placenta, still in equilibrium (fetus 30 0.020 at 1.5 kg)
      DIF_CO2: 0.016,       // starting point (fetus 30 0.027)
      MAT_TO2: 6.0,         // starting point: maternal pool for UV pO2 ~44 at equilibrium (SO2 ~79 % at maternal P50 26.7)
      MAT_TCO2: 21.0,       // 5.2: maternal pool CO2 content (starting point 21.4: UV pCO2 36, UA pH 7.32) -> UV 33 / 7.43, UA 41 / 7.34
                            //      (author's choice over 21.2, which put the UV exactly on 34.5 / 7.41 and the UA at 7.33)

      // --- metabolism, blood, kidney, environment ---
      VO2_METABOLISM: 4.98, // reference total 6.0 minus the myocardium (~0.81), / 1.042 (Q10 at core 37.5)
      BRAIN_VO2_FRAC: 0.65, // as fetus 30
      RESP_Q: 0.95,         // reference (ovine)
      GLUCOSE: 4.2,         // reference
      UMA_DELTA: 0.0,       // starting point
      HB_MMOL: 12.8 / 1.611, // reference: Hb 12.8 g/dL
      P50: 18.5,            // reference (= preterm 25)
      REABS_WATER: 0.833,   // preterm 25 (fetal urine is reference only)
      REABS_NACL: 0.90,     // preterm 25
      MAINT_RATE: 3.0,      // preterm 25: stands in for the placental water supply
      GFR_FACTOR: 1.143,    // preterm 25 (renal reference)
      ENV_TEMP: 37.3,       // reference: amniotic fluid (degC)
      H_FLUID: 170,         // starting point: heat ~1.4 W / (SA 0.039 m2 x 0.2 K) - h_radiative
      SETPOINT_TEMP: 37.5,  // reference
      BRAIN_CTL_GAIN: 1.0,  // as fetus 30
    },
  },
  30: {
    name: "fetus_30wk",
    refDoc: "docs/Fetus30wkReference.md",
    // diagram oxygen colour window (mmol/L O2 content) spanning the fetal range, lower-body venous (~2.5) to the
    // umbilical vein (~7.5): the preterm rule (to2_hi ~ Hb capacity, 8.4) left everything below the umbilical vein
    // blue on the steep ramp (gamma 4). Now placenta/umbilical vein red, IVC/RA purple, LA/LV/AA blue-purple, SVC blue
    diagram: { to2_lo: 2.5, to2_hi: 7.6 },
    description:
      "Fetus in utero at 30 weeks (1.5 kg), not in labour: the placenta is the gas exchanger, the lungs are " +
      "fluid-filled, the ductus arteriosus and foramen ovale are wide open (right-to-left), fetal haemoglobin, " +
      "amniotic environment. Validated against docs/Fetus30wkReference.md.",
    L: {
      // --- patient (reference) ---
      WEIGHT: 1.5,          // kg (author's choice: = preterm_30wk)
      HEIGHT: 0.40,         // m, crown-heel ~40 cm
      GA: 30,               // weeks
      AGE: 0,               // years: not born

      // --- circulation ---
      HR_REF: 145,          // reference: CTG baseline 145 (Suwanrath 2009, Amorim-Costa 2016)
      BR_WINDOW: 1,         // as preterm: baroreceptor window scaled with the set-point
      BR_MAP: 38,           // reference: MAP 38 (ovine, Wassink 2014)
      SVR: 1.34,            // preterm 30 (starting point)
      FETAL_PVR: 9.5,       // fetal transform: raw r_for/r_back x on the pulmonary BloodVessels (fetus_term x9.5)
      PVR: 1.4,             // starting point: pulmonary resistances x on top (archived 30 wk x2.30 gave lungs 12 %; target 20 %)
      CONT_LEFT: 1.0,       // starting point: Heart.cont_factor_left
      CONT_RIGHT: 1.2,      // starting point: Heart.cont_factor_right, the RV-dominance lever (docs/fetal_circulation.md)
      RELAX: 1.08,          // preterm 30
      HEART_EL_MAX: 2.27,   // preterm 30
      HEART_EL_MIN: 2.2,    // 5.6: heart chambers el_min x (preterm 30 2.9): the ventricles needed CVP ~6 to fill; with VEN_UVOL 0.85 ->
                            //      CVP 6.0 -> 4.5, output 387 -> 425, LV SV 1.08 -> 1.20, HR 146 / MAP 37.7 at the baroreflex set-point
      ART_EL: 5.5,          // preterm 30 (pulse pressure target 16, ovine)
      VEN_UVOL: 0.85,       // 5.6: VLB/VUB unstressed volume x (preterm 30 0.77), with HEART_EL_MIN 2.2. On its own a larger venous
                            //      unstressed volume lowered CVP only by emptying the heart (1.0: output 332, MAP 32, HR 162)
      RV_EL_MIN: 0.8,       // 5.3: RV diastolic elastance x on top of HEART_EL_MIN (the scaling left RV and LV equally stiff; the fetal
                            //      RV is the larger, more compliant chamber) -> RV EDV 2.00 -> 2.26, RV:LV 52:48 -> 59:41, foramen 29 -> 23 %,
                            //      duct 35 -> 40 %, output 348 -> 364. cont_factor_right barely moved the split (1.2 -> 1.8: RV 52.5 -> 54.8 %)
      RV_UVOL_RATIO: 1.64,  // fetal transform: RV.u_vol = 1.64 x LV.u_vol (term chambers give 5.46x; RV EF otherwise ~25 %)
      DA_DIAM: 4.6,         // starting point: Pda.diameter_ao/pa_max, mm (archived 30 wk 4.58; anatomy 3.0 mm, but PA ~ Ao is the target)
      DA_LEN: 10.1,         // reference: Szpinda length at 30 wk, mm (-3.07 + 0.438 x 30)
      FO_DIAM: 4.4,         // starting point: Shunts.diameter_fo, mm (archived 30 wk)
      FO_SEPTUM: 2.2,       // starting point: Shunts.atrial_septal_width, mm (archived 30 wk)
      FO_SVC_FRACTION: 0.0, // 5.1: Shunts.fo_svc_fraction: the whole foramen opens onto the IVC part (crista dividens), so SVC
                            //      blood no longer mixes into the LA: AA - PA saturation gap 0.9 -> 6.0 points (reference ~8)
      COR_R: 1.72,          // preterm 30
      BRAIN_R: 0.2,         // final: cerebral bed r x (starting point 0.4 = preterm 30 1.6 x 25/95 x 38/43 left autoregulation at its
                            //      dilation floor 0.15 with CBF 91) -> autoregulation 1.01 over minutes 8-10 at CBF 95
      CBF_SET: 0.1425,      // reference: 95 mL/kg/min x 1.5 kg, L/min absolute (grade C, Sun 2015)
      UB_R: 1.8,            // starting point: upper body outside the brain (SVC 125 = brain 95 + rest 30)
      INT_R: 1.1,           // preterm 30
      LS_R: 1.5,            // preterm 30

      // --- placenta ---
      PL_VOL: 0.40,         // starting point: fetal PL_* vol/u_vol x (term 113 mL -> 45 mL = 26 % of 115 mL/kg x 1.5 kg)
      MAT_VOL: 0.50,        // archived 30 wk: maternal pool PL_MAT x
      UMB_ART_RES: 1095,    // 5.4: umbilical artery resistance (was 1460 = archived 30 wk 1260 x 1.16) x0.75 with PLF_RES -> umbilical flow
                            //      101 -> 129 mL/kg/min (MRI 129), placental share 28 -> 33 % (Kiserud ~32), output 364 -> 387
      PLF_RES: 2430,        // 5.4: fetal placental resistance (was 3240) x0.75, with UMB_ART_RES
      UMB_VEN_RES: 160,     // starting point: archived 30 wk 140 x 1.16
      DIF_O2: 0.020,        // archived 30 wk
      DIF_CO2: 0.027,       // archived 30 wk
      MAT_TO2: 5.6,         // reference: maternal placental venous O2 content 5.6 mmol/L at 30 wk (Siggaard-Andersen 1995)
      MAT_TCO2: 21.5,       // 5.2: maternal pool CO2 content (was 23: pool pCO2 47, pH 7.26) -> pool pCO2 ~35, pH ~7.36 (placental
                            //      venous blood at 30 wk, Siggaard-Andersen 1995); the umbilical vein equilibrates with it: 41/36/7.40

      // --- metabolism, blood, kidney, environment ---
      VO2_METABOLISM: 4.98, // 5.4: total VO2 6.0 (was 6.5; human range 5.4-8.1) minus the myocardium (~0.81), / 1.042 (Q10 at core 37.5).
                            //      With umbilical flow 129 the umbilical Fick balance then matches the cordocentesis saturations:
                            //      UA 55 -> 64 %, AA 58 -> 67 %, IVC 65 -> 72 % (at VO2 6.5 they need ~164 mL/kg/min)
      BRAIN_VO2_FRAC: 0.65, // 5.5: Metabolism.metabolic_active_models.BR_CAP (term 0.31311); the other organs' fractions are rescaled
                               //   so the fractions still sum to 1 -> brain 55 % of fetal VO2, cerebral O2 extraction ~31 %
                               //   (Sun 2015 MRI: 58 %, 34 %); SVC SO2 56.5 -> 50.9
      RESP_Q: 0.95,         // reference (ovine)
      GLUCOSE: 4.0,         // reference
      UMA_DELTA: 0.0,       // starting point
      HB_MMOL: 13.6 / 1.611, // reference: Hb 13.6 g/dL (Nicolaides 1988)
      P50: 19.0,            // reference (= preterm 30)
      REABS_WATER: 0.9375,  // preterm 30 (fetal urine is reference only)
      REABS_NACL: 0.97,     // preterm 30
      MAINT_RATE: 3.0,      // preterm 30: stands in for the placental water supply that matches the urine
      GFR_FACTOR: 0.743,    // preterm 30 (renal reference, reseed_preterm)
      ENV_TEMP: 37.3,       // reference: amniotic fluid (degC)
      H_FLUID: 240,         // starting point: Thermoregulation.h_convective, W/m2/K: fluid + umbilical heat loss so the core
                            //   rests ~0.2 degC above the amniotic fluid (3.3 W / (0.066 m2 x 0.2 K) - h_radiative)
      SETPOINT_TEMP: 37.5,  // reference: fetal core 37.5; no brown-fat drive in utero (bat_gain 0)
      BRAIN_CTL_GAIN: 1.0,  // as preterm 30
    },
  },
  // 40 wk: a fetus in utero at 40+0 wk, 3.545 kg (as term_neonate, so weight scaling is a no-op), not in labour
  // (docs/TermFetusReference.md). Size/maturity levers start at term_neonate's own values (x1); the fetal levers
  // the 30 wk calibration found (RV stiffness, foramen streaming, brain O2 share) are carried over; placental
  // resistances are scaled from the 30 wk ones to the term umbilical flow. All "starting point" values are
  // validated in step 5 against the term reference set.
  40: {
    name: "fetus_term",
    refDoc: "docs/TermFetusReference.md",
    // diagram oxygen colour window spanning the fetal range at term: lower-body venous (~2.3) to the umbilical
    // vein (~7.0 mmol/L at Hb 9.3 and SO2 75 %), as the 30 wk window
    diagram: { to2_lo: 2.3, to2_hi: 7.1 },
    description:
      "Fetus in utero at 40 weeks (3.545 kg), not in labour: the placenta is the gas exchanger, the lungs are " +
      "fluid-filled, the ductus arteriosus and foramen ovale are wide open (right-to-left), fetal haemoglobin, " +
      "amniotic environment. Validated against docs/TermFetusReference.md.",
    L: {
      // --- patient (reference) ---
      WEIGHT: 3.545,        // kg (author's choice: = term_neonate)
      HEIGHT: 0.51,         // m
      GA: 40,               // weeks
      AGE: 0,               // years: not born

      // --- circulation ---
      HR_REF: 136,          // reference: CTG baseline at 40 wk (Pildner von Steinburg 2013)
      BR_WINDOW: 1,         // baroreceptor window scaled with the set-point
      BR_MAP: 50,           // reference: MAP 50 (ovine, Segar 2002)
      SVR: 1.0,             // starting point: term_neonate's systemic resistances
      FETAL_PVR: 9.5,       // fetal transform: raw r on the pulmonary BloodVessels (fetus_term x9.5)
      PVR: 0.8,             // 5.2: pulmonary resistances x on top of the fetal x9.5 -> lungs 14.9 -> 17.7 % (ref 18), PA - Ao 2.2 -> 1.5
      CONT_LEFT: 1.15,      // 5.2: Heart.cont_factor_left (with CONT_RIGHT 1.0) -> LV EF 58 -> 63, LV SV 1.12 -> 1.20, RV share 62 -> 58.6 %
      CONT_RIGHT: 1.0,      // 5.2 (30 wk value 1.2): with RV_EL_MIN 0.8 the term RV already out-filled the LV (RV EF 67, share 62 %)
      RELAX: 1.0,           // term myocardium
      HEART_EL_MAX: 1.0,    // term_neonate's chambers
      HEART_EL_MIN: 1.0,    // starting point (30 wk needed 0.76x its preterm value to bring CVP down)
      ART_EL: 1.0,          // term_neonate's arteries
      VEN_UVOL: 1.0,        // starting point
      RV_EL_MIN: 0.8,       // 30 wk 5.3: the fetal RV is the more compliant chamber
      RV_UVOL_RATIO: 1.64,  // fetal transform
      DA_DIAM: 6.0,         // starting point: archived term_fetus (PA ~ Ao); = 30 wk 4.6 x Szpinda 3.95/3.01. Anatomy 3.95
      DA_LEN: 14.4,         // reference: Szpinda length at 40 wk, mm
      FO_DIAM: 6.0,         // starting point: archived term_fetus
      FO_SEPTUM: 3.0,       // starting point: archived term_fetus
      FO_SVC_FRACTION: 0.0, // 30 wk 5.1: only IVC blood crosses the foramen
      COR_R: 1.0,           // term_neonate
      BRAIN_R: 0.10,        // final: cerebral bed r x (starting point 0.26 = term bed x MAP 50/58 x CBF 106/355 mL/min left autoregulation at
                            //      its dilation floor with CBF 88) -> autoregulation ~1.07 over minutes 8-10 at CBF 100
      CBF_SET: 0.3545,      // reference: 100 mL/kg/min x 3.545 kg, L/min absolute (grade C)
      UB_R: 1.0,            // starting point
      INT_R: 1.0,           // term_neonate
      LS_R: 1.0,            // term_neonate

      // --- placenta ---
      PL_VOL: 0.73,         // starting point: fetal PL_* x (term 113 mL -> 82 mL = 22 % of 105 mL/kg x 3.545 kg)
      MAT_VOL: 1.0,         // archived term_fetus
      UMB_ART_RES: 585,     // 5.3: umbilical artery resistance (starting point 780 = 30 wk 1095 x 210/390 x 50/38) x0.75 with PLF_RES ->
                            //      umbilical flow 111 -> 142 mL/kg/min (MRI 129-134), placental share 27 -> 33 %, UA - UV pCO2 11.1 -> 8.8,
                            //      UA pH 7.30 -> 7.32, AA SO2 56 -> 62. dif_co2 x3/x10 changed nothing (the gap is fetal-side)
      PLF_RES: 1298,        // 5.3: fetal placental resistance (starting point 1730) x0.75, with UMB_ART_RES
      UMB_VEN_RES: 115,     // starting point: 30 wk 160, same scaling
      DIF_O2: 0.003,        // 5.1: placental O2 diffusion (archived term_fetus 0.03, saturated: UV equilibrated with the maternal pool,
                            //      SO2 85 / pO2 39) -> UV 80 / 34, ~30 % short of the pool as at term (Siggaard-Andersen); <= 0.0015 the
                            //      fetus decompensates (acute placental insufficiency)
      DIF_CO2: 0.04,        // archived term_fetus
      MAT_TO2: 5.4,         // reference: maternal placental venous O2 content at 40 wk (Siggaard-Andersen 1995)
      MAT_TCO2: 21.6,       // starting point: maternal placental venous pCO2 ~36 (30 wk 21.5 gave ~35)

      // --- metabolism, blood, environment ---
      VO2_METABOLISM: 5.46, // reference total 6.5 minus the myocardium (~0.81), / 1.042 (Q10 at core 37.5)
      BRAIN_VO2_FRAC: 0.65, // 30 wk 5.5 (Sun 2015: brain 58 % of fetal VO2)
      RESP_Q: 0.95,         // reference (ovine)
      GLUCOSE: 3.7,         // reference
      UMA_DELTA: 0.0,       // starting point
      HB_MMOL: 15.0 / 1.611, // reference: Hb 15.0 g/dL
      P50: 20.0,            // reference (= term_neonate)
      REABS_WATER: null,    // term_neonate's own kidney (fetal urine is reference only)
      REABS_NACL: null,
      MAINT_RATE: null,
      GFR_FACTOR: null,     // no preterm renal reference at term
      ENV_TEMP: 37.3,       // reference: amniotic fluid (degC)
      H_FLUID: 320,         // starting point: heat ~7.7 W / (SA 0.116 m2 x 0.2 K) - h_radiative
      SETPOINT_TEMP: 37.5,  // reference
      BRAIN_CTL_GAIN: 1.0,  // as 30 wk
    },
  },
};
