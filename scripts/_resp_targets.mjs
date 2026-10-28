// Target ranges for scripts/validate_respiratory.mjs, per patient class. Each range is what a
// clinician would accept for that patient, with the source in the comment; they are NOT fitted to
// the model. A check outside its range fails the suite unless it is listed in KNOWN_FAILURES.
//
// Sources (short names used below):
//   [Polgar]   Polgar & Weng, "The functional development of the respiratory system", Am Rev Respir Dis 1979
//   [Rennie]   Rennie's Textbook of Neonatology, 5th ed., normal blood gases and ventilation
//   [West]     West's Respiratory Physiology, 10th ed. (adult normals, chemosensitivity)
//   [Rebuck]   Rebuck & Slutsky, "Measurement of ventilatory responses to hypercapnia and hypoxia", 1981
//   [Rigatto]  Rigatto, "Control of ventilation in the newborn", Annu Rev Physiol 1984 (neonatal CO2 response)
//   [Gerhardt] Gerhardt et al., "Pulmonary mechanics in normal infants and young children during first 5 years of life", Pediatr Pulmonol 1987 (oesophageal pressure swing)
//   [Tobin]    Tobin, Principles and Practice of Mechanical Ventilation, 3rd ed. (load responses, PS, triggering)

// scenario -> class; a scenario not listed is classified by weight in classify()
export const SCENARIO_CLASS = {
  term_neonate_72h: "term",
};

export function classify(name, def) {
  if (SCENARIO_CLASS[name]) return SCENARIO_CLASS[name];
  const w = def.weight ?? 3;
  return w > 20 ? "adult" : "term";
}

// [lo, hi]; null on either side = open
export const TARGETS = {
  term: {
    rr: [30, 60],            // [Rennie]
    vt_kg: [4.5, 7.5],       // [Polgar]
    mv_kg: [0.15, 0.35],     // [Polgar]
    paco2: [35, 45],         // [Rennie]
    ph: [7.35, 7.45],
    spo2: [95, 100],
    ppl_swing: [4.5, 10.1],  // cmH2O, oesophageal swing 7.3 +/- 1.4 (mean +/- 2 SD) [Gerhardt]
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
  flowtrig_trigger_frac: [0.80, 1.0], // the same with a 0.6 L/min flow trigger
  // SIMV at half the spontaneous rate with PS 5: one synchronised or mandatory breath per window
  // (window edges in a 20 s count allow one breath either way), the other efforts supported
  simv_window_breath_ratio: [0.85, 1.15],
  simv_supported_frac: [0.80, 1.0],
  // drive off (central apnea / CPR)
  apnea_effort: [null, 0.01],         // cmH2O pleural swing driven by the muscle
};

// check id -> reason. A listed check that fails is reported as XFAIL (exit 0); a listed check that
// passes is reported as XPASS so the entry can be removed. Keys are "<class>.<check>" or "*.<check>".
export const KNOWN_FAILURES = {
  // the rate rises with stiffer lungs only through the chemoreflex; the vagal (stretch / J-receptor)
  // rate response is not modelled
  "adult.stiff.rr_ratio": "no vagal rate response to stiff lungs; the rate follows the chemoreflex only",
};
