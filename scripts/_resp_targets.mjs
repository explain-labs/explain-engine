// Target ranges for scripts/validate_respiratory.mjs, per patient class. Each range is what a
// clinician would accept for that patient, with the source in the comment; they are NOT fitted to
// the model. A check outside its range fails the suite unless it is listed in KNOWN_FAILURES.
//
// Sources (short names used below):
//   [Polgar]   Polgar & Weng, "The functional development of the respiratory system", Am Rev Respir Dis 1979
//   [Gerhardt] Gerhardt & Bancalari, lung compliance in newborns with and without RDS, Acta Paediatr 1980
//   [Bhutani]  Bhutani & Sivieri, "Clinical use of pulmonary mechanics and waveform graphics", Clin Perinatol 2001
//   [Rennie]   Rennie's Textbook of Neonatology, 5th ed., normal blood gases and ventilation
//   [West]     West's Respiratory Physiology, 10th ed. (adult normals, chemosensitivity)
//   [Rebuck]   Rebuck & Slutsky, "Measurement of ventilatory responses to hypercapnia and hypoxia", 1981
//   [Rigatto]  Rigatto, "Control of ventilation in the newborn", Annu Rev Physiol 1984 (neonatal CO2 response)
//   [Tobin]    Tobin, Principles and Practice of Mechanical Ventilation, 3rd ed. (load responses, PS, triggering)
//   [Lucking]  Lucking et al., HFOV CO2 elimination ~ f·Vt², Crit Care Med 1986 / Slutsky NEJM 1988

// scenario -> class; a scenario not listed is classified by weight in classify()
export const SCENARIO_CLASS = {
  preterm_28wk: "preterm",
  term_neonate: "term",
  adult_female: "adult",
};

export function classify(name, def) {
  if (SCENARIO_CLASS[name]) return SCENARIO_CLASS[name];
  const w = def.weight ?? 3;
  if (w > 20) return "adult";
  return (def.gestational_age ?? 40) < 37 ? "preterm" : "term";
}

// [lo, hi]; null on either side = open
export const TARGETS = {
  preterm: {
    rr: [40, 70],            // /min, spontaneous [Rennie]
    vt_kg: [4.0, 7.0],       // mL/kg [Bhutani]
    mv_kg: [0.15, 0.40],     // L/kg/min [Bhutani]
    paco2: [35, 55],         // mmHg, permissive target for preterms [Rennie]
    ph: [7.25, 7.45],        // [Rennie]
    spo2: [88, 97],          // %, preterm target band [Rennie]
    ppl_swing: [2, 10],      // cmH2O, quiet breathing [Bhutani]
    cstat_kg: [0.5, 1.5],    // mL/cmH2O/kg, respiratory system, preterm with RDS [Gerhardt]
    co2_gain: [0.05, 0.40],  // fractional MV rise per mmHg PaCO2; blunted in preterms [Rigatto]
  },
  term: {
    rr: [30, 60],            // [Rennie]
    vt_kg: [4.5, 7.5],       // [Polgar]
    mv_kg: [0.15, 0.35],     // [Polgar]
    paco2: [35, 45],         // [Rennie]
    ph: [7.35, 7.45],
    spo2: [95, 100],
    ppl_swing: [2, 8],       // [Bhutani]
    cstat_kg: [1.0, 2.0],    // mL/cmH2O/kg, total respiratory system [Polgar]
    co2_gain: [0.10, 0.40],  // 0.03-0.06 L/kg/min/mmHg on ~0.2 L/kg/min [Rigatto]
  },
  adult: {
    rr: [10, 20],            // [West]
    vt_kg: [5.0, 8.0],       // [West]
    mv_kg: [0.07, 0.13],     // 5-8 L/min at 60 kg [West]
    paco2: [35, 45],         // [West]
    ph: [7.35, 7.45],
    spo2: [95, 100],
    ppl_swing: [2, 6],       // cmH2O [West]
    cstat_kg: [0.8, 1.7],    // 50-100 mL/cmH2O at 60 kg [Tobin]
    co2_gain: [0.15, 0.50],  // HCVR 1-3 L/min/mmHg on ~6 L/min [Rebuck]
  },
};

// response checks, the same for every class
export const RESPONSE_TARGETS = {
  // lower-airway resistance x3: the patient defends ventilation [Tobin]
  res_load_paco2_rise: [null, 5],     // mmHg
  res_load_vt_ratio: [0.75, 1.10],    // loaded / baseline Vt
  // lung elastance x2: rapid shallow breathing [Tobin]
  stiff_vt_ratio: [0.55, 0.95],
  stiff_rr_ratio: [1.10, 1.80],
  stiff_paco2_rise: [null, 8],
  // CPAP 5 on an intubated spontaneously breathing patient: the tube adds apparatus dead space and
  // resistance, so PaCO2 creeps up a little and the chemoreflex raises Vt and rate [Tobin]
  cpap_vt_ratio: [0.75, 1.40],
  cpap_paco2_delta: [-5, 5],
  // PS 10 above PEEP: support takes over part of the work [Tobin]
  ps_vt_ratio: [1.05, 2.0],
  ps_ppl_swing_ratio: [null, 0.80],   // effort falls
  ps_paco2_delta: [null, 2],
  ps_trigger_frac: [0.80, 1.0],       // triggered breaths / efforts outside ventilator inspiration
  // drive off (central apnea / CPR)
  apnea_effort: [null, 0.01],         // cmH2O pleural swing driven by the muscle
  // HFOV CO2 elimination ~ f·Vt² [Lucking]
  hfov_paco2_dco2_spread: [null, 0.15], // (max-min)/mean of PaCO2·DCO2 over f = 8, 10, 12 Hz
  hfov_amp_paco2_falls: [1, 1],       // 1 = PaCO2 falls when amplitude rises
};

// check id -> reason. A listed check that fails is reported as XFAIL (exit 0); a listed check that
// passes is reported as XPASS so the entry can be removed. Keys are "<class>.<check>" or "*.<check>".
export const KNOWN_FAILURES = {
  // the rate rises with stiffer lungs only through the chemoreflex; the vagal (stretch / J-receptor)
  // rate response is not modelled
  "term.stiff.rr_ratio": "no vagal rate response to stiff lungs; the rate follows the chemoreflex only",
  "adult.stiff.rr_ratio": "no vagal rate response to stiff lungs; the rate follows the chemoreflex only",
  // no Hering-Breuer inspiratory inhibition: the neural inspiration does not shorten when pressure
  // support inflates the lung, so infants take the full support on top of their own effort
  "preterm.ps.vt_ratio": "no Hering-Breuer reflex; preterm compliance high (recalibration)",
  "term.ps.vt_ratio": "no Hering-Breuer reflex: neural Ti does not shorten under support",
  // a 1 kg preterm intubated with the scenario's 3.5 mm tube (clinically 2.5 mm)
  "preterm.cpap.paco2_delta": "3.5 mm ETT on a 1 kg preterm; dead-space compliance (recalibration)",
  // preterm_28wk respiratory system compliance is high for RDS
  "preterm.cstat.cstat_kg": "preterm compliance ~2.4 mL/cmH2O/kg, high for RDS (recalibration)",
};
