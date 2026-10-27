// Vitals + blood-gas measurement for the Explain engine, extracted from
// scripts/probe_vitals.mjs so the generic builder (build_patient.mjs) can reuse
// the exact same measurement + normal-range tables the calibration probe uses.
//
// measureVitals(model, send) cycle-averages the pulsatile monitor signals over a
// WINDOW (advancing the sim itself), and returns a flat object of averaged vitals
// (the same keys probe_vitals.mjs reports). The model must already be warmed to
// steady state before calling.

const SLICE = 0.02; // sample every 20 ms (sub-cardiac-cycle) so pulsatile pressures average cleanly

// Cycle-average the monitor + ABG over `window` seconds. Mirrors the accumulate
// loop in probe_vitals.mjs (lines 96-112). Reads the same model instances:
//   Monitor (hemodynamics, mixed-venous SvO2 from the PA), AA (arterial blood gas), Pda (ductal shunt).
export function measureVitals(model, send, { window = 20 } = {}) {
  const M = model.models.Monitor;
  const AA = model.models.AA; // ascending aorta — arterial blood gas
  const N = Math.round(window / SLICE);
  const acc = {};
  const add = (k, v) => {
    acc[k] = (acc[k] || 0) + (v ?? 0);
  };
  for (let i = 0; i < N; i++) {
    send("POST", "calc", SLICE);
    add("hr", M.heart_rate);
    add("rr", M.resp_rate);
    add("sys", M.minmax?.abp_pre_pres_max);
    add("dia", M.minmax?.abp_pre_pres_min);
    add("map", M.minmax?.abp_pre_pres_mean); // clinical mean, dia + pp/3 (Monitor.arterial_mean_targets)
    add("map_int", M.minmax?.abp_pre_pres_mean_int); // true time-averaged mean over the beat
    add("pap_s", M.minmax?.pap_pres_max);
    add("pap_d", M.minmax?.pap_pres_min);
    add("pap_m", M.minmax?.pap_pres_mean);
    add("pap_m_int", M.minmax?.pap_pres_mean_int);
    add("cvp", M.minmax?.cvp_pres_mean);
    add("spo2_pre", M.sao2_pre);
    add("spo2_post", M.sao2_post);
    add("svo2", M.svo2); // mixed-venous (PA) saturation, already in %
    add("q_da", model.models.Pda?.flow_pa); // ductal shunt at the PA end (L/s); +ve = left-to-right
    add("q_fo", model.models.Shunts?.flow_fo); // foramen ovale shunt (L/s); +ve = left-to-right (LA -> RA)
    add("ef", model.models.Heart ? model.models.Heart.lv_ef * 100 : undefined); // LV ejection fraction, % of the last beat
    add("temp", M.temp);
    add("etco2", M.etco2);
    add("lvo", M.flows?.lvo);
    add("rvo", M.flows?.rvo);
    add("svc", M.flows?.svc_flow); // superior vena cava flow (L/min)
    add("ph", AA?.ph);
    add("pco2", AA?.pco2);
    add("po2", AA?.po2);
    add("hco3", AA?.hco3);
    add("be", AA?.be);
    add("so2_aa", AA?.so2);
  }
  for (const k in acc) acc[k] /= N;
  return acc;
}

// normal resting ranges by profile; [low, high]. Verbatim from probe_vitals.mjs.
export const RANGES = {
  adult: {
    hr: [60, 100], rr: [12, 20], sys: [90, 130], dia: [60, 85], map: [70, 100],
    pap_s: [15, 30], pap_d: [4, 12], pap_m: [9, 18], cvp: [2, 8],
    spo2_pre: [95, 100], svo2: [65, 75], temp: [36.5, 37.5], etco2: [35, 45],
    ph: [7.35, 7.45], pco2: [35, 45], po2: [80, 100], hco3: [22, 26], be: [-2, 2],
  },
  // the healthy term neonate at ~72 h: the ranges of docs/TermNeonateReference.md
  // (scripts/reference/term_neonate_72h.json) where it gives one; SpO2 mean - 2 SD; pap_* stay the
  // age-dependent table below (rangesFor); hco3 and etco2 have no reference range
  neonate: {
    hr: [91, 145], rr: [32, 57], sys: [60, 89], dia: [31, 61], map: [45, 72],
    pap_s: [18, 40], pap_d: [5, 20], pap_m: [12, 30], cvp: [2, 8],
    spo2_pre: [94.5, 100], svo2: [70, 80], temp: [36.5, 37.5], etco2: [35, 45],
    ph: [7.31, 7.47], pco2: [28.5, 48.7], po2: [60, 90], hco3: [18, 24], be: [-4, 2],
  },
  // the healthy term neonate at ~1 h (vaginal birth, delayed cord clamping): the ranges of
  // docs/TermTransitionReference.md (scripts/reference/term_neonate_1h.json); SpO2 mean - 2 SD;
  // pap_s, pap_d and etco2 have no 1 h range
  neonate_1h: {
    hr: [102, 162], rr: [32, 57], sys: [52, 83], dia: [25, 49], map: [36, 59],
    pap_m: [38, 56], cvp: [-3, 4],
    spo2_pre: [94, 100], svo2: [84, 90], temp: [36.5, 37.5],
    ph: [7.27, 7.38], pco2: [30, 42], po2: [60, 90], hco3: [17, 21], be: [-7, -3],
  },
  // the healthy term neonate at ~12 h: the ranges of docs/TermTransitionReference.md
  // (scripts/reference/term_neonate_12h.json); pap_d and etco2 have no 12 h range
  neonate_12h: {
    hr: [97, 152], rr: [32, 57], sys: [54, 85], dia: [28, 53], map: [39, 62],
    pap_s: [34, 71], pap_m: [32, 50], cvp: [-3, 4],
    spo2_pre: [95, 100], svo2: [82, 88], temp: [36.5, 37.5],
    ph: [7.31, 7.41], pco2: [30, 40], po2: [60, 90], hco3: [17, 22], be: [-6, -2],
  },
  // the healthy term neonate at ~24 h: the ranges of docs/TermTransitionReference.md
  // (scripts/reference/term_neonate_24h.json); pap_d and etco2 have no 24 h range
  neonate_24h: {
    hr: [99, 143], rr: [32, 57], sys: [58, 84], dia: [29, 53], map: [41, 61],
    pap_s: [28, 60], pap_m: [24, 44], cvp: [-3, 4],
    spo2_pre: [95, 100], svo2: [81, 87], temp: [36.5, 37.5],
    ph: [7.32, 7.42], pco2: [30, 41], po2: [60, 90], hco3: [18, 23], be: [-5.5, -1.5],
  },
  preterm_36: {
    hr: [115, 170], rr: [38, 62], sys: [48, 80], dia: [27, 52], map: [38, 54],
    pap_s: [20, 43], pap_d: [6, 21], pap_m: [13, 31], cvp: [1, 8],
    spo2_pre: [90, 98], svo2: [57, 82], temp: [36.5, 37.5], etco2: [34, 50],
    ph: [7.27, 7.41], pco2: [38, 52], po2: [48, 80], hco3: [18, 24], be: [-6, 2],
  },
  preterm_34: {
    hr: [120, 175], rr: [40, 65], sys: [45, 75], dia: [25, 50], map: [35, 50],
    pap_s: [22, 45], pap_d: [6, 22], pap_m: [14, 32], cvp: [1, 8],
    spo2_pre: [88, 97], svo2: [55, 82], temp: [36.5, 37.5], etco2: [34, 52],
    ph: [7.25, 7.40], pco2: [40, 55], po2: [45, 75], hco3: [18, 24], be: [-7, 2],
  },
  preterm_32: {
    hr: [125, 180], rr: [40, 70], sys: [40, 70], dia: [22, 48], map: [30, 45],
    pap_s: [20, 48], pap_d: [6, 24], pap_m: [15, 35], cvp: [1, 8],
    spo2_pre: [86, 96], svo2: [52, 82], temp: [36.5, 37.5], etco2: [33, 52],
    ph: [7.22, 7.38], pco2: [42, 58], po2: [42, 70], hco3: [17, 24], be: [-8, 2],
  },
  preterm_30: {
    hr: [128, 185], rr: [40, 72], sys: [35, 68], dia: [20, 46], map: [28, 44],
    pap_s: [20, 49], pap_d: [7, 25], pap_m: [15, 36], cvp: [0, 8],
    spo2_pre: [86, 95], svo2: [51, 82], temp: [36.5, 37.5], etco2: [32, 52],
    ph: [7.21, 7.37], pco2: [44, 60], po2: [41, 68], hco3: [16, 24], be: [-8, 2],
  },
  preterm_28: {
    hr: [130, 190], rr: [40, 75], sys: [30, 65], dia: [18, 45], map: [26, 42],
    pap_s: [20, 50], pap_d: [8, 26], pap_m: [16, 38], cvp: [0, 7],
    spo2_pre: [85, 95], svo2: [50, 82], temp: [36.5, 37.5], etco2: [32, 52],
    ph: [7.20, 7.36], pco2: [45, 62], po2: [40, 65], hco3: [16, 24], be: [-9, 2],
  },
  preterm_26: {
    hr: [135, 198], rr: [40, 80], sys: [28, 60], dia: [18, 42], map: [22, 38],
    pap_s: [18, 55], pap_d: [8, 26], pap_m: [15, 38], cvp: [0, 7],
    spo2_pre: [83, 94], svo2: [48, 82], temp: [36.5, 37.5], etco2: [30, 52],
    ph: [7.18, 7.34], pco2: [46, 66], po2: [38, 62], hco3: [16, 24], be: [-10, 2],
  },
  preterm_24: {
    hr: [135, 200], rr: [40, 85], sys: [24, 58], dia: [16, 40], map: [20, 35],
    pap_s: [16, 55], pap_d: [6, 26], pap_m: [14, 38], cvp: [0, 6],
    spo2_pre: [80, 93], svo2: [46, 82], temp: [36.5, 37.5], etco2: [30, 52],
    ph: [7.15, 7.32], pco2: [48, 70], po2: [35, 60], hco3: [15, 24], be: [-11, 2],
  },

  // --- FETAL (in utero) ---------------------------------------------------------
  // A fetus and a preterm neonate of the same gestational age and weight have radically
  // different normal ranges, so these cannot be reached by gestational age alone — see
  // selectProfile's `fetal` argument below.
  //
  // Two things read oddly on purpose:
  //   - pap_* sits ABOVE map. That is correct in utero: pulmonary pressure at or above
  //     systemic is what drives the duct right-to-left. PAP < MAP means the circulation
  //     has broken, not that the patient is well.
  //   - `spo2_pre` is Monitor.sao2_pre = AA.so2. "Pre-ductal" is not a fetal concept, but
  //     AA is the physiologically meaningful upper-body/cerebral saturation, so the
  //     compartment is right even though the label is not.
  //
  // `rr` and `etco2` are deliberately OMITTED rather than set to [0,0]: the fetus is
  // apnoeic and the lung is inert, so they are not-applicable rather than out-of-range.
  // flagOf() returns "" for an absent key, which prints blank instead of a false LOW.
  //
  // These are calibration guard-rails, not diagnostic criteria, and are deliberately wide.
  fetus_30: {
    hr: [130, 165], sys: [38, 55], dia: [22, 35], map: [30, 42],
    pap_s: [45, 70], pap_d: [28, 45], pap_m: [36, 52], cvp: [1, 5],
    spo2_pre: [55, 75], svo2: [40, 60], temp: [36.5, 37.5],
    ph: [7.32, 7.42], pco2: [38, 50], po2: [18, 30], hco3: [18, 24], be: [-4, 2],
  },
  fetus_term: {
    hr: [120, 160], sys: [55, 75], dia: [35, 50], map: [45, 60],
    pap_s: [55, 80], pap_d: [40, 60], pap_m: [48, 68], cvp: [2, 6],
    spo2_pre: [55, 75], svo2: [40, 60], temp: [36.5, 37.5],
    ph: [7.32, 7.42], pco2: [38, 52], po2: [18, 32], hco3: [18, 24], be: [-5, 2],
  },
};

// pick a normal-range profile from body weight (term neonate ≈ 3.5 kg) unless
// overridden; gestational age narrows preterm babies onto the matching table, and a term baby
// younger than 6 h (ageHours) gets the transitional neonate_1h table, 6 to under 18 h neonate_12h and
// 18 to under 48 h neonate_24h.
// Is this a fetus in utero? Verified unambiguous across the shipped scenario library: only
// fetus_term / fetus_*wk have the placenta running with the cord unclamped; every neonatal and
// adult scenario has placenta_running=false, umb_clamped=true. Takes either a live model or a
// model_definition (both expose .models).
export function isFetal(model) {
  const P = model?.models?.Placenta;
  return !!(P && P.placenta_running === true && P.umb_clamped === false);
}

// `fetal` must be passed explicitly by a caller that knows (via isFetal, or a spec flag): a 30 wk
// fetus and a 30 wk preterm neonate share a gestational age and a weight but not their normal
// ranges, so neither GA nor weight can separate them. An explicit `profile` still wins over both.
export function selectProfile({ weight, gestational_age, profile, fetal = false, ageHours } = {}) {
  if (profile && RANGES[profile]) return profile;
  if (fetal) {
    const ga = Math.round(gestational_age ?? 40);
    if (ga >= 37) return "fetus_term";
    return RANGES[`fetus_${ga}`] ? `fetus_${ga}` : "fetus_30";
  }
  if (typeof gestational_age === "number" && gestational_age < 37) {
    const ga = Math.max(24, Math.min(36, Math.round(gestational_age)));
    // snap to the nearest defined preterm table (24,26,28,30,32,34,36)
    const defined = [24, 26, 28, 30, 32, 34, 36];
    const nearest = defined.reduce((a, b) => (Math.abs(b - ga) < Math.abs(a - ga) ? b : a));
    if (RANGES[`preterm_${nearest}`]) return `preterm_${nearest}`;
  }
  if (typeof weight === "number" && weight < 10) {
    if (typeof ageHours === "number" && ageHours < 6) return "neonate_1h";
    if (typeof ageHours === "number" && ageHours < 18) return "neonate_12h";
    if (typeof ageHours === "number" && ageHours < 48) return "neonate_24h";
    return "neonate";
  }
  return "adult";
}

// Pulmonary artery pressure falls steeply over the first days, so the term neonate's PAP ranges
// follow postnatal age. Mean ± 2 SD of healthy term newborns by echo (Medicine 2016, PMID 26817918:
// systolic 43.8 ± 7.9 at 24 h, 38.1 ± 8.3 at 48 h, upper 95 % limit 40 at 72 h; diastolic
// 19.7 ± 8.5 and 13.9 ± 5.6; mean 34.4 ± 9.9 and 26.2 ± 7.5), low bounds kept at the table's floors.
// From 60 h on the `neonate` table's own values apply.
export const NEONATE_PAP_BY_AGE = [
  { upToHours: 36, pap_s: [28, 60], pap_d: [5, 37], pap_m: [15, 54] },
  { upToHours: 60, pap_s: [22, 55], pap_d: [5, 25], pap_m: [11, 41] },
];

// The range table for a profile at a postnatal age (days; null/undefined = day 1). The
// term_neonate_72h baseline itself is 72 h old, so builds from it default to the day-3 table. Only the term `neonate` profile is age-dependent, and only its PAP keys.
export function rangesFor(profile, { ageDays } = {}) {
  const base = RANGES[profile] || RANGES.adult;
  if (profile !== "neonate") return base;
  const hours = 24 * (typeof ageDays === "number" && ageDays >= 0 ? ageDays : 1);
  const row = NEONATE_PAP_BY_AGE.find((r) => hours < r.upToHours);
  return row ? { ...base, pap_s: row.pap_s, pap_d: row.pap_d, pap_m: row.pap_m } : base;
}

export function flagOf(ranges, k, v) {
  const r = ranges?.[k];
  if (!r || typeof v !== "number") return "";
  return v < r[0] ? "LOW" : v > r[1] ? "HIGH" : "ok";
}
