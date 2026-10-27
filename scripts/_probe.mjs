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
};

// Is the patient a fetus in utero (placenta running, cord unclamped)? Takes either a live model or a
// model_definition (both expose .models).
export function isFetal(model) {
  const P = model?.models?.Placenta;
  return !!(P && P.placenta_running === true && P.umb_clamped === false);
}

// pick a normal-range profile from body weight unless overridden: every patient under 10 kg is checked
// against the term neonate's ranges, heavier ones against the adult's. An explicit `profile` wins.
export function selectProfile({ weight, profile } = {}) {
  if (profile && RANGES[profile]) return profile;
  if (typeof weight === "number" && weight < 10) return "neonate";
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
