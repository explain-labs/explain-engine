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
//   Monitor (hemodynamics), AA (arterial blood gas), IVCI (mixed-venous proxy), Pda (ductal shunt).
export function measureVitals(model, send, { window = 20 } = {}) {
  const M = model.models.Monitor;
  const AA = model.models.AA; // ascending aorta — arterial blood gas
  const IVCI = model.models.IVCI; // IVC inlet — mixed-venous proxy
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
    add("map", M.minmax?.abp_pre_pres_mean);
    add("pap_s", M.minmax?.pap_pres_max);
    add("pap_d", M.minmax?.pap_pres_min);
    add("pap_m", M.minmax?.pap_pres_mean);
    add("cvp", M.minmax?.cvp_pres_mean);
    add("spo2_pre", M.sao2_pre);
    add("spo2_post", M.sao2_post);
    add("svo2", IVCI?.so2); // already in %
    add("q_da", model.models.Pda?.flow_pa); // ductal shunt at the PA end (L/s); +ve = left-to-right
    add("temp", M.temp);
    add("etco2", M.etco2);
    add("lvo", M.flows?.lvo);
    add("rvo", M.flows?.rvo);
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
  neonate: {
    hr: [100, 160], rr: [30, 60], sys: [55, 90], dia: [30, 55], map: [40, 60],
    pap_s: [18, 40], pap_d: [5, 20], pap_m: [12, 30], cvp: [2, 8],
    spo2_pre: [93, 100], svo2: [60, 80], temp: [36.5, 37.5], etco2: [35, 45],
    ph: [7.30, 7.42], pco2: [35, 45], po2: [50, 85], hco3: [18, 24], be: [-6, 2],
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
};

// pick a normal-range profile from body weight (term neonate ≈ 3.5 kg) unless
// overridden; gestational age narrows preterm babies onto the matching table.
export function selectProfile({ weight, gestational_age, profile } = {}) {
  if (profile && RANGES[profile]) return profile;
  if (typeof gestational_age === "number" && gestational_age < 37) {
    const ga = Math.max(24, Math.min(36, Math.round(gestational_age)));
    // snap to the nearest defined preterm table (24,26,28,30,32,34,36)
    const defined = [24, 26, 28, 30, 32, 34, 36];
    const nearest = defined.reduce((a, b) => (Math.abs(b - ga) < Math.abs(a - ga) ? b : a));
    if (RANGES[`preterm_${nearest}`]) return `preterm_${nearest}`;
  }
  return typeof weight === "number" && weight < 10 ? "neonate" : "adult";
}

export function flagOf(ranges, k, v) {
  const r = ranges?.[k];
  if (!r || typeof v !== "number") return "";
  return v < r[0] ? "LOW" : v > r[1] ? "HIGH" : "ok";
}
