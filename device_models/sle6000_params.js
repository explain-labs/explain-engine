// SLE6000 settings: ranges, resolutions, defaults and the per-mode parameter rows, from the SLE6000
// IFU V2.0 (pages cited; the manual itself is not in the repo). Shared by the Sle6000 device model and
// the UI replica (imported through the @explain alias), so the ranges live in one place.
//
// Pressures are in mbar, as on the device. `steps` lists [upper bound, resolution] bands, so a value
// below the first bound moves by the first resolution. `off` marks a function that can be switched
// off (value 0) and `on` the value it starts from when switched on (p150, "Turning ON a parameter").
// `kind` sets the arc colour of the tile (p150): time = blue, pressure = orange, o2 = green,
// sens = white.

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
};

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
  if (p.off && value <= 0) return 0;
  let v = Math.min(p.max, Math.max(p.min, value));
  const res = sle_resolution(name, v);
  v = Math.round(v / res) * res;
  return Number(Math.min(p.max, Math.max(p.min, v)).toFixed(4));
}

// the device interlocks (pp 163-169), applied to a whole settings object for `mode`:
// Ti leaves at least 0.1 s of expiration at the (backup) rate, rise time <= Ti, PEEP <= PIP,
// P Support <= PIP
export function sle_interlocks(s, mode) {
  const out = { ...s };
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
  return Math.max(SLE_PARAMS[name].min, Math.floor(value / res + 1e-9) * res);
}
