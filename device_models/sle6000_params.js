// SLE6000 settings: ranges, resolutions, defaults and the per-mode parameter rows, from the SLE6000
// IFU V2.0 (pages cited; the manual itself is not in the repo). Shared by the Sle6000 device model and
// the UI replica (imported through the @explain alias), so the ranges live in one place.
//
// Pressures are in mbar, as on the device. `steps` lists [upper bound, resolution] bands, so a value
// below the first bound moves by the first resolution. `off` marks a function that can be switched
// off (value 0) and `on` the value it starts from when switched on (p150, "Turning ON a parameter").
// `kind` sets the arc colour of the tile (p150): time = blue, pressure = orange, o2 = green,
// sens = white. A `choices` parameter is a list (stored as one of its numbers, shown by `names`): its
// +/- steps through the list.

export const SLE_PARAMS = {
  rr: { label: "RR", unit: "BPM", min: 1, max: 150, steps: [[Infinity, 1]], def: 30, kind: "time" }, // p163
  ti: { label: "Ti", unit: "Seconds", min: 0.1, max: 3.0, steps: [[Infinity, 0.01]], def: 0.4, kind: "time" }, // p163
  peep: { label: "PEEP", unit: "mbar", min: 0, max: 35, steps: [[10, 0.5], [Infinity, 1]], def: 4.0, kind: "pressure" }, // p164
  pip: { label: "PIP", unit: "mbar", min: 0, max: 65, steps: [[Infinity, 1]], def: 15, kind: "pressure" }, // p164
  rise: { label: "Rise time", unit: "Seconds", min: 0.0, max: 3.0, steps: [[Infinity, 0.01]], def: 0.04, kind: "time" }, // p165
  trig_sens: { label: "Trig Sens", unit: "l/min", min: 0.2, max: 20, steps: [[Infinity, 0.2]], def: 0.6, kind: "sens" }, // p165
  term_sens: { label: "Term Sens", unit: "%", min: 5, max: 50, steps: [[Infinity, 5]], def: 5, kind: "sens" }, // p165
  rr_backup: { label: "RR Backup", unit: "BPM", min: 1, max: 150, steps: [[Infinity, 1]], def: 0, off: true, on: 40, kind: "time" }, // p163
  p_support: { label: "P Support", unit: "mbar", min: 0, max: 65, steps: [[Infinity, 1]], def: 0, off: true, on: 8, kind: "pressure" }, // p164
  vtv: { label: "VTV", unit: "ml", min: 1, max: 300, steps: [[10, 0.2], [100, 1], [Infinity, 5]], def: 0, off: true, on: 3, kind: "pressure" }, // p163
  o2: { label: "O2", unit: "%", min: 21, max: 100, steps: [[Infinity, 1]], def: 21, kind: "o2" }, // p165
  // HFO (p166)
  freq: { label: "Frequency", unit: "Hz", min: 3, max: 20, steps: [[Infinity, 0.1]], def: 10, kind: "time" },
  ie: { label: "I:E", unit: "Ratio", min: 1, max: 3, steps: [[Infinity, 1]], def: 1, kind: "time", choices: [1, 2, 3], names: ["1:1", "1:2", "1:3"] },
  map: { label: "MAP", unit: "mbar", min: 0, max: 45, steps: [[Infinity, 1]], def: 5, kind: "pressure" },
  dp: { label: "ΔP", unit: "mbar", min: 4, max: 180, steps: [[Infinity, 1]], def: 4, kind: "pressure" },
  hfo_vtv: { label: "VTV", unit: "ml", min: 0.2, max: 50, steps: [[2, 0.1], [10, 0.2], [Infinity, 1]], def: 0, off: true, on: 2, kind: "pressure" }, // pp 125, 166
  sigh_rr: { label: "Sigh RR", unit: "BPM", min: 1, max: 150, steps: [[Infinity, 1]], def: 0, off: true, on: 30, kind: "time" },
  sigh_ti: { label: "Sigh Ti", unit: "Seconds", min: 0.1, max: 3.0, steps: [[Infinity, 0.01]], def: 0.4, kind: "time" },
  sigh_p: { label: "Sigh P", unit: "mbar", min: 0, max: 45, steps: [[Infinity, 1]], def: 10, kind: "pressure" },
  hfo_activity: { label: "HFO Activity", unit: "", min: 0, max: 1, steps: [[Infinity, 1]], def: 0, kind: "sens", choices: [0, 1], names: ["Insp+Exp", "Exp"] }, // p155
};

// invasive conventional modes (phase 1). `main` is the bottom row left to right (O2 always last),
// `extra` the additional-parameters row above it; null is an empty slot. `labels` renames a tile in
// that mode (pp 68-76).
export const SLE_MODES = {
  CPAP: {
    main: ["ti", null, "peep", "pip", null, "o2"],
    extra: ["rr_backup", "rise", null, "trig_sens"],
    labels: { peep: "CPAP" },
  },
  CMV: { main: ["rr", "ti", "peep", "pip", "vtv", "o2"], extra: [null, "rise"] },
  PTV: { main: ["rr", "ti", "peep", "pip", "vtv", "o2"], extra: [null, "rise", null, "trig_sens"] },
  PSV: {
    main: ["rr", "ti", "peep", "pip", "vtv", "o2"],
    extra: [null, "rise", null, "trig_sens", "term_sens"],
    labels: { ti: "Ti Max" },
  },
  SIMV: {
    main: ["rr", "ti", "peep", "pip", "vtv", "o2"],
    extra: [null, "rise", "p_support", "trig_sens", "term_sens"],
  },
  // HFO (pp 78-80): the additional row of HFOV has an empty P Support slot
  HFOV: { main: ["freq", "ie", "map", "dp", "hfo_vtv", "o2"], extra: ["sigh_rr", "sigh_ti", null, "sigh_p"] },
  "HFOV+CMV": { main: ["rr", "ti", "freq", "peep", "pip", "dp", "o2"], extra: ["hfo_activity"] },
};

// the oscillatory modes
export const SLE_HFO_MODES = ["HFOV", "HFOV+CMV"];

export const SLE_MODE_NAMES = Object.keys(SLE_MODES);

export function sle_defaults() {
  const s = {};
  for (const [k, p] of Object.entries(SLE_PARAMS)) s[k] = p.def;
  return s;
}

// resolution of `name` at `value` (moving up from value)
export function sle_resolution(name, value) {
  const p = SLE_PARAMS[name];
  for (const [bound, res] of p.steps) if (value < bound - 1e-9) return res;
  return p.steps.at(-1)[1];
}

// one +/- press: dir = +1 or -1. Off functions go 0 -> off; a press below min switches them off.
export function sle_step(name, value, dir) {
  const p = SLE_PARAMS[name];
  if (p.choices) {
    const i = Math.max(0, p.choices.indexOf(sle_clamp(name, value)));
    return p.choices[Math.min(p.choices.length - 1, Math.max(0, i + (dir > 0 ? 1 : -1)))];
  }
  if (p.off && value === 0) return dir > 0 ? p.on : 0;
  const res = dir > 0 ? sle_resolution(name, value) : sle_resolution(name, value - 1e-6);
  const next = value + dir * res;
  if (p.off && next < p.min - 1e-9) return 0;
  return sle_clamp(name, next);
}

// clamp to the range and snap to the resolution band
export function sle_clamp(name, value) {
  const p = SLE_PARAMS[name];
  if (!Number.isFinite(value)) return p.def;
  if (p.choices) return p.choices.reduce((a, b) => (Math.abs(b - value) < Math.abs(a - value) ? b : a));
  if (p.off && value <= 0) return 0;
  let v = Math.min(p.max, Math.max(p.min, value));
  const res = sle_resolution(name, v);
  v = Math.round(v / res) * res;
  return Number(Math.min(p.max, Math.max(p.min, v)).toFixed(4));
}

// the display text of a value (a list parameter by its name)
export function sle_format(name, value, decimals = 1) {
  const p = SLE_PARAMS[name];
  if (p.choices) return p.names[Math.max(0, p.choices.indexOf(sle_clamp(name, value)))];
  if (p.off && value === 0) return "Off";
  return Number(value).toFixed(decimals);
}

// the device interlocks (pp 163-169), applied to a whole settings object for `mode`:
// Ti leaves at least 0.1 s of expiration at the (backup) rate, rise time <= Ti, PEEP <= PIP,
// P Support <= PIP. HFOV (p78): Sigh Ti leaves 0.1 s at the Sigh RR (whichever was changed gives
// way to the other), Sigh P follows MAP up and can be set at most 15 mbar above it. `changed`
// lists the settings just edited.
export function sle_interlocks(s, mode, changed = []) {
  const out = { ...s };
  if (mode === "HFOV") {
    if (out.sigh_rr > 0) {
      if (changed.includes("sigh_rr") && !changed.includes("sigh_ti")) {
        out.sigh_rr = Math.min(out.sigh_rr, Math.floor(60 / (out.sigh_ti + 0.1)));
      } else {
        out.sigh_ti = Math.min(out.sigh_ti, sle_floor_res("sigh_ti", 60 / out.sigh_rr - 0.1));
      }
    }
    if (out.sigh_p < out.map) out.sigh_p = out.map;
    if (changed.includes("sigh_p")) out.sigh_p = Math.min(out.sigh_p, out.map + 15, SLE_PARAMS.sigh_p.max);
    return out;
  }
  // CPAP times only its backup breaths; in PTV/PSV the RR is the rate of the mandatory breaths that
  // cover apnoea (the manual's RR Backup tile in those modes duplicates it, so it is not modelled)
  const rate = mode === "CPAP" ? out.rr_backup : out.rr;
  if (rate > 0) out.ti = Math.min(out.ti, sle_floor_res("ti", 60 / rate - 0.1));
  out.rise = Math.min(out.rise, out.ti);
  if (out.peep > out.pip) out.peep = sle_floor_res("peep", out.pip);
  if (out.p_support > 0 && out.p_support > out.pip) out.p_support = out.pip;
  return out;
}

function sle_floor_res(name, value) {
  const res = sle_resolution(name, value);
  return Number(Math.max(SLE_PARAMS[name].min, Math.floor(value / res + 1e-9) * res).toFixed(4));
}
