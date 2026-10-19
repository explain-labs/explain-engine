// Lever profiles for scripts/_make_fetus_validated.mjs: one per validated fetal scenario.
// Each lever is a named constant with its source. "reference" values come straight from the scenario's
// reference set; "starting point" values are to be validated against it (first look, then recalibration);
// "preterm 30" marks a value carried over from the preterm_30wk profile (scripts/_preterm_profiles.mjs),
// the same gestation and weight born 72 h earlier.
export const PROFILES = {
  // 30 wk: a fetus in utero at 30+0 wk, 1.5 kg, not in labour (docs/Fetus30wkReference.md). Starting points
  // for the fetal-specific levers come from the archived fetus_30wk row in scripts/_ga_tables.mjs (1.35 kg,
  // old term base), corrected to 1.5 kg and to the 30 wk flow shares of the reference set.
  30: {
    name: "fetus_30wk",
    refDoc: "docs/Fetus30wkReference.md",
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
      FETAL_PVR: 9.5,       // fetal transform: raw r_for/r_back x on the pulmonary BloodVessels (term_fetus x9.5)
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
};
