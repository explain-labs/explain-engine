import { Ventilator } from "./Ventilator";
import { SLE_PARAMS, SLE_MODES, SLE_HFO_MODES, sle_defaults, sle_clamp, sle_interlocks } from "./sle6000_params";

const MBAR_TO_CMH2O = 1.01972;
const HFO_BIAS_FLOW = 8.0; // l/min, the continuous flow (p24); an assumption for HFO
// The response of the delivered (Y-piece) pressure to its target: the jets at the exhalation block
// and their pressure loop are not instantaneous, and the pressure is read at the Y-piece past the
// limbs. The manual gives no figure, so this is an assumption, calibrated on a reference PV loop of
// a healthy 3.5 kg neonate on 14/4 (a first-order response with Rise time 0.1 s):
//   volume in at 90 % of PIP: 11 % ideal (Rise 0.04) -> ~25 % (reference ~26 %)
//   volume left when the pressure is back at PEEP + 10 %: 93 % ideal -> ~84 % (reference ~84 %)
const PRES_RESPONSE_TAU = 0.012; // s

export class Sle6000 extends Ventilator {
  // static properties
  static model_type = "Sle6000";

  /**
   * The SLE6000 neonatal ventilator (SLE Ltd, IFU V2.0): the generic Ventilator driven through the
   * device's own modes, settings (mbar, with its ranges, resolutions and interlocks), patient
   * circuits and monitored values. Phase 1: the invasive conventional modes CPAP, CMV, PTV, PSV and
   * SIMV, with volume targeting (VTV). Phase 2: the invasive oscillatory modes HFOV (with VTV, sighs
   * and oscillation pause) and HFOV+CMV. It is the ventilator of every scenario up to 30 kg (the
   * device's range); the scenario keeps the instance name "Ventilator", so the Monitor,
   * Resuscitation and every UI path that reads Ventilator.* keep working. A scenario can start
   * ventilating: is_enabled true plus sle_mode and the sle_* settings.
   */
  constructor(model_ref, name = "") {
    super(model_ref, name);

    // Independent properties: the device settings, in the device's units (see sle6000_params.js)
    this.sle_mode = "Standby"; // Standby | CPAP | CMV | PTV | PSV | SIMV | HFOV | HFOV+CMV
    const d = sle_defaults();
    this.sle_rr = d.rr; // BPM
    this.sle_ti = d.ti; // s (Ti Max in PSV)
    this.sle_peep = d.peep; // mbar (CPAP level in CPAP)
    this.sle_pip = d.pip; // mbar (PIP Max with VTV on)
    this.sle_rise = d.rise; // s
    this.sle_trig_sens = d.trig_sens; // l/min, flow trigger
    this.sle_term_sens = d.term_sens; // % of peak flow
    this.sle_rr_backup = d.rr_backup; // BPM, CPAP apnoea backup (0 = off)
    this.sle_p_support = d.p_support; // mbar, SIMV pressure support level (0 = off)
    this.sle_vtv = d.vtv; // ml, volume target (0 = off)
    this.sle_o2 = d.o2; // %
    this.sle_freq = d.freq; // Hz, HFO frequency
    this.sle_ie = d.ie; // HFOV I:E, 1:x (1, 2 or 3)
    this.sle_map = d.map; // mbar, HFOV mean airway pressure
    this.sle_dp = d.dp; // mbar, HFO Delta P (ΔP Max with VTV on)
    this.sle_hfo_vtv = d.hfo_vtv; // ml, HFOV volume target (0 = off)
    this.sle_sigh_rr = d.sigh_rr; // BPM, HFOV sigh rate (0 = off)
    this.sle_sigh_ti = d.sigh_ti; // s
    this.sle_sigh_p = d.sigh_p; // mbar
    this.sle_hfo_activity = d.hfo_activity; // HFOV+CMV: 0 = oscillation in both phases, 1 = expiration only
    this.sle_circuit = 10; // mm, patient circuit BC6188 (10) or BC6198 (15)
    this.sle_o2_boost_inc = 10; // %, O2 Boost increment (factory default, p128)

    // Dependent properties: the monitored values, filtered as the device does (p175)
    this.mon_pip = 0.0; // mbar
    this.mon_peep = 0.0; // mbar
    this.mon_map = 0.0; // mbar, tau 5 breaths
    this.mon_vte = 0.0; // ml, tau 3 breaths
    this.mon_vti = 0.0; // ml, tau 3 breaths
    this.mon_vmin = 0.0; // l/min, expired volume over the last minute
    this.mon_leak = 0.0; // %, 5-breath average then tau 10 breaths
    this.mon_rr = 0.0; // BPM, total (mechanical + triggered)
    this.mon_trig = 0; // patient-triggered breaths per minute
    this.mon_c = 0.0; // ml/mbar, tau 3 breaths
    this.mon_r = 0.0; // mbar/l/s, tau 3 breaths
    this.mon_c20c = null; // C20/C, tau 3 breaths (null: not measurable on this breath)
    this.mon_ti = 0.0; // s
    this.mon_te = 0.0; // s
    this.mon_ie = 0.0; // Te/Ti (shown as 1:x)
    this.mon_o2 = 21.0; // %, oxygen cell (first-order, 45 s response)
    this.mon_fg_flow = 0.0; // l/min, fresh gas flow
    this.mon_dp = 0.0; // mbar, HFO measured Delta P (peak to peak at the proximal airway)
    this.mon_dco2 = 0.0; // ml^2/s, HFO gas transport coefficient f * Vte^2, tau 3 cycles
    this.mon_freq = 0.0; // Hz, HFO frequency
    this.o2_boost_remaining = 0.0; // s left of an O2 Boost (0 = none)

    // Local properties
    this._mon_init = false;
    this._leak_hist = [];
    this._vte_hist = []; // [model time, ml] of the breaths of the last minute
    this._c20 = { p80: null, v80: null }; // samples at 80 % of the set Ti
    this._o2_boost_base = null;
    this._c20_p_end = 0.0;
    this._c20_v_end = 0.0;
    this._last_mode = "CMV"; // the mode Start/Resume returns to
    this._in_apply = false; // inside sle_apply (its switch-on is not a generic one)
    this._hfo_peak_flow = 0.0; // l/s, peak flow at the tube over the current oscillation
    this._cmv_p_max = -1e9; // cmH2O, peak pressure of the current HFOV+CMV breath
    this._cmv_was_insp = false;
    this._cycle_crossed = false; // a CMV breath edge fell inside the current oscillation
  }

  init_model(args = {}) {
    super.init_model(args);
    this._apply_circuit();
    // a scenario that starts ventilating: the device settings drive the generic ventilator
    if (!this.is_enabled) this.sle_mode = "Standby";
    else if (this.sle_mode in SLE_MODES) this._apply_mode();
    else this._sync_from_generic();
    this.mon_o2 = this.fio2 * 100.0;
  }

  calc_model() {
    this._calc_o2_boost();
    super.calc_model();
    this._sle_monitoring();
  }

  // ------------------------------------------------------------------------------------------------
  // control API

  sle_apply(settings = {}) {
    // the preview -> Confirm of the mode panel and the parameter tiles: validate and clamp every
    // given setting, keep the others (parameter memory across modes, p124), apply the interlocks and
    // start (or switch) the mode. `settings` may carry `mode` and `circuit`.
    const mode = settings.mode ?? this.sle_mode;
    for (const [k, v] of Object.entries(settings)) {
      if (k in SLE_PARAMS) this[`sle_${k}`] = sle_clamp(k, Number(v));
    }
    if (settings.circuit === 10 || settings.circuit === 15) this.sle_circuit = settings.circuit;
    if (mode !== "Standby" && !(mode in SLE_MODES)) return;
    const s = sle_interlocks(this._settings(), mode, Object.keys(settings));
    for (const [k, v] of Object.entries(s)) this[`sle_${k}`] = v;
    this.sle_mode = mode;
    if (mode !== "Standby") this._last_mode = mode;
    this._apply_circuit();
    if (mode === "Standby") {
      if (this.is_enabled) this.switch_ventilator(false);
      return;
    }
    this._in_apply = true;
    if (!this.is_enabled) this.switch_ventilator(true);
    this._in_apply = false;
    this._apply_mode();
  }

  sle_set(name, value) {
    this.sle_apply({ [name]: value });
  }

  sle_standby() {
    this.sle_apply({ mode: "Standby" });
  }

  sle_start(mode = null) {
    this.sle_apply({ mode: mode ?? (this.sle_mode === "Standby" ? this._last_mode : this.sle_mode) });
  }

  switch_ventilator(state) {
    // also reached directly (Resuscitation): off is the device's Standby, on outside sle_apply shows
    // what the generic ventilator is doing
    super.switch_ventilator(state);
    if (!state) {
      this.sle_mode = "Standby";
      this.o2_boost_remaining = 0.0;
      this._o2_boost_base = null;
      this._reset_monitor();
    } else if (!this._in_apply) {
      this._sync_from_generic();
    }
  }

  // the generic setters, called directly (Resuscitation, scripts): the device settings follow them
  set_pc(...args) {
    super.set_pc(...args);
    if (!this._in_apply) this._sync_from_generic();
  }

  set_psv(...args) {
    super.set_psv(...args);
    if (!this._in_apply) this._sync_from_generic();
  }

  set_simv(...args) {
    super.set_simv(...args);
    if (!this._in_apply) this._sync_from_generic();
  }

  set_cpap(...args) {
    super.set_cpap(...args);
    if (!this._in_apply) this._sync_from_generic();
  }

  set_hfov(...args) {
    super.set_hfov(...args);
    if (!this._in_apply) this._sync_from_generic();
  }

  set_hfov_cmv(...args) {
    super.set_hfov_cmv(...args);
    if (!this._in_apply) this._sync_from_generic();
  }

  sle_manual_breath() {
    // one breath at the set PIP and Ti (p155); every mode but HFOV offers it (HFOV has Sigh)
    if (this.sle_mode !== "Standby" && this.sle_mode !== "HFOV") this.trigger_breath();
  }

  sle_sigh() {
    // HFOV Sigh (p155): an oscillatory pause at the set Sigh P for the set Sigh Ti
    if (this.sle_mode === "HFOV") this.hfo_sigh();
  }

  sle_osc_pause() {
    // HFOV Oscillation Pause (p155): oscillation stops at the set MAP for up to 60 s; pressing
    // again cancels it
    if (this.sle_mode === "HFOV") this.hfo_pause();
  }

  sle_o2_boost(state = true) {
    // O2 Boost: the set O2 plus sle_o2_boost_inc for 2 minutes, then back to the set value (p128)
    this.o2_boost_remaining = state ? 120.0 : 0.0;
    if (!state) this._end_o2_boost();
  }

  sle_set_circuit(diameter = 10) {
    this.sle_apply({ circuit: diameter });
  }

  // ------------------------------------------------------------------------------------------------
  // mapping onto the generic ventilator

  _settings() {
    const s = {};
    for (const k of Object.keys(SLE_PARAMS)) s[k] = this[`sle_${k}`];
    return s;
  }

  _apply_mode() {
    const mode = this.sle_mode;
    const pip = this.sle_pip * MBAR_TO_CMH2O;
    const peep = this.sle_peep * MBAR_TO_CMH2O;

    // common to every mode: a flow sensor at the tube, so a flow trigger and flow-cycled support
    this.peep_cmh2o = peep;
    this.pip_cmh2o = pip;
    this.pip_cmh2o_max = pip;
    this.insp_time = this.sle_ti;
    this.rise_time = this.sle_rise;
    this.trigger_mode = "flow";
    this.trigger_flow = this.sle_trig_sens;
    this.leak_comp_max_perc = 35; // patient leak compensation, 35 % in the conventional modes (p127)
    // PSV automatic leak compensation (p127): flow cycling compensates leak flows up to 5 l/min or
    // 50 % of the peak flow, only while the leak is 10-50 %
    this.leak_term_min_perc = 10;
    this.leak_term_max_perc = 50;
    this.leak_term_max_flow = 5;
    this.term_sens_perc = this.sle_term_sens;
    this.insp_pause = 0.0;
    if (this._o2_boost_base === null) this.set_fio2(this.sle_o2 / 100.0);

    // VTV: PIP becomes PIP Max and the working pressure is servoed on Vte (p126); off restores the
    // set PIP, which the volume targeting never changes
    const vtv = this.sle_vtv > 0.0 && mode !== "CPAP" && !SLE_HFO_MODES.includes(mode);
    const vg_was = this.volume_guarantee;
    this.volume_guarantee = vtv;
    if (vtv) {
      if (!vg_was || Math.abs(this.tidal_volume - this.sle_vtv / 1000.0) > 1e-9) this._pip_working = null;
      this.tidal_volume = this.sle_vtv / 1000.0;
    }

    switch (mode) {
      case "CPAP":
        this.backup_rate = this.sle_rr_backup;
        this.vent_mode = "CPAP";
        break;
      case "CMV": // time-triggered, time-cycled (p16)
        this.vent_rate = this.sle_rr;
        this.synchronized = false;
        this.vent_mode = "PC";
        break;
      case "PTV": // assist/control: every effort gets a breath at PIP and Ti (p17)
        this.vent_rate = this.sle_rr;
        this.synchronized = true;
        this.vent_mode = "PC";
        break;
      case "PSV": // patient-triggered, flow-cycled, Ti Max; RR covers apnoea (p17)
        this.vent_rate = this.sle_rr;
        this.ps_cmh2o = Math.max(0.0, pip - peep);
        this.vent_mode = "PS";
        break;
      case "SIMV": // P Support is an absolute level, at most PIP (p160)
        this.vent_rate = this.sle_rr;
        this.ps_cmh2o =
          this.sle_p_support > 0.0 ? Math.max(0.0, Math.min(this.sle_p_support, this.sle_pip) * MBAR_TO_CMH2O - peep) : 0.0;
        if (this.vent_mode !== "SIMV") {
          this._simv_window_counter = 0.0;
          this._simv_breath_given = false;
        }
        this.vent_mode = "SIMV";
        break;
      case "HFOV": {
        // continuous oscillation around MAP (p77); VTV servoes the working ΔP on the average Vte,
        // ΔP becoming ΔP Max (p125). The bias flow is the device's continuous flow (p24).
        this.hfo_map_cmh2o = this.sle_map * MBAR_TO_CMH2O;
        this.hfo_amplitude_cmh2o = this.sle_dp * MBAR_TO_CMH2O;
        this.hfo_freq = this.sle_freq;
        this.hfo_insp_fraction = 1.0 / (1.0 + this.sle_ie);
        this.hfo_bias_flow = HFO_BIAS_FLOW;
        const hfo_vtv = this.sle_hfo_vtv > 0.0;
        const target = this.sle_hfo_vtv / 1000.0;
        if (hfo_vtv && (!this.hfo_volume_guarantee || Math.abs(this.hfo_tidal_volume_target - target) > 1e-9)) {
          this.set_hfo_volume_guarantee(true, this.sle_hfo_vtv, this.hfo_amplitude_cmh2o);
        }
        this.hfo_volume_guarantee = hfo_vtv;
        this.hfo_amplitude_max_cmh2o = this.hfo_amplitude_cmh2o;
        this.hfo_sigh_rate = this.sle_sigh_rr;
        this.hfo_sigh_time = this.sle_sigh_ti;
        this.hfo_sigh_cmh2o = this.sle_sigh_p * MBAR_TO_CMH2O;
        if (this.vent_mode !== "HFOV") this._hfo_start();
        this.vent_mode = "HFOV";
        break;
      }
      case "HFOV+CMV": {
        // CMV breaths with the oscillation in both phases or in expiration only (p80, HFO Activity)
        this.vent_rate = this.sle_rr;
        this.hfo_amplitude_cmh2o = this.sle_dp * MBAR_TO_CMH2O;
        this.hfo_freq = this.sle_freq;
        this.hfo_insp_fraction = 0.5;
        this.hfo_bias_flow = HFO_BIAS_FLOW;
        this.hfo_activity = this.sle_hfo_activity === 1 ? "exp" : "both";
        this.hfo_volume_guarantee = false;
        if (this.vent_mode !== "HFOV_CMV") this._hfo_start();
        this.vent_mode = "HFOV_CMV";
        break;
      }
    }
  }

  _hfo_start() {
    // entering an oscillatory mode: a fresh oscillation and monitor
    this._hfo_phase = 0.0;
    this._hfo_breath_t = 0.0;
    this._hfo_sigh_timer = 0.0;
    this.hfo_sigh_remaining = 0.0;
    this.hfo_pause_remaining = 0.0;
    this._breath_interval_counter = 0.0;
    this._rate_avg = 0.0;
    this._reset_monitor();
  }

  _sync_from_generic() {
    // mirror the generic mode and settings into the device's, clamped to its ranges; the generic
    // ventilator keeps running as set (no _apply_mode), so a device-range clamp only shows
    const modes = { PC: this.synchronized ? "PTV" : "CMV", PS: "PSV", SIMV: "SIMV", CPAP: "CPAP", HFOV: "HFOV", HFOV_CMV: "HFOV+CMV" };
    const mode = modes[this.vent_mode];
    if (!mode || !this.is_enabled) return;
    const set = (k, v) => {
      if (Number.isFinite(v)) this[`sle_${k}`] = sle_clamp(k, v);
    };
    set("rr", this.vent_rate);
    set("ti", this.insp_time);
    set("peep", this.peep_cmh2o / MBAR_TO_CMH2O);
    set("pip", (mode === "PSV" ? this.peep_cmh2o + this.ps_cmh2o : this.pip_cmh2o) / MBAR_TO_CMH2O);
    set("o2", this.fio2 * 100.0);
    if (mode === "HFOV" || mode === "HFOV+CMV") {
      set("freq", this.hfo_freq);
      set("dp", this.hfo_amplitude_cmh2o / MBAR_TO_CMH2O);
    }
    if (mode === "HFOV") {
      set("map", this.hfo_map_cmh2o / MBAR_TO_CMH2O);
      set("ie", 1.0 / Math.max(this.hfo_insp_fraction, 0.01) - 1.0);
    }
    if (mode === "HFOV+CMV") this.sle_hfo_activity = this.hfo_activity === "exp" ? 1 : 0;
    this.sle_mode = mode;
    this._last_mode = mode;
  }

  _apply_circuit() {
    // patient circuits (p176): BC6188 (10 mm) and BC6198 (15 mm). Compliance = tubing (1.89 and
    // 3.72 ml/kPa/m over ~2.4 m of limbs) plus the humidifier chamber gas (~200 ml, 0.2 ml/cmH2O):
    // 0.65 and 1.07 ml/cmH2O. The expiratory limb has no valve (p24): its resistance is the limb's
    // own, 6 and 2 mbar/(l/s) at the flows the manual quotes. The demand flow covers a 0.04 s rise.
    const c = this.sle_circuit === 15 ? 1.07 : 0.65; // ml/cmH2O
    if (this._vent_gascircuit) this._vent_gascircuit.el_base = 1.0 / ((c / 1000.0) * 1.35951); // mmHg/L
    const r_mbar = this.sle_circuit === 15 ? 2.0 : 6.0; // mbar/(l/s)
    this.exp_valve_resistance = (r_mbar * MBAR_TO_CMH2O) / 1.35951; // mmHg·s/L
    this.insp_flow = this.sle_circuit === 15 ? 40.0 : 20.0; // l/min
    this.pres_response_tau = PRES_RESPONSE_TAU;
  }

  _calc_o2_boost() {
    if (this.o2_boost_remaining > 0.0) {
      if (this._o2_boost_base === null) {
        this._o2_boost_base = this.sle_o2;
        const boosted = this.sle_o2_boost_inc >= 100 ? 100 : Math.min(100, this.sle_o2 + this.sle_o2_boost_inc);
        this.set_fio2(boosted / 100.0);
      }
      this.o2_boost_remaining = Math.max(0.0, this.o2_boost_remaining - this._t);
      if (this.o2_boost_remaining === 0.0) this._end_o2_boost();
    }
  }

  _end_o2_boost() {
    if (this._o2_boost_base === null) return;
    this._o2_boost_base = null;
    this.set_fio2(this.sle_o2 / 100.0);
  }

  // ------------------------------------------------------------------------------------------------
  // monitored values

  _start_inspiration() {
    // the end-expiratory pressure of the breath just completed, before the new breath raises it
    const peep_meas = this.pres / MBAR_TO_CMH2O;
    super._start_inspiration();
    this._close_breath(peep_meas);
    this._c20 = { p80: null, v80: null };
  }

  _sle_monitoring() {
    const ema = (x, target, tau) => x + (target - x) * Math.min(1.0, this._t / tau);
    this.mon_o2 = ema(this.mon_o2, this.fio2 * 100.0, 15.0); // 45 s to ~95 %
    const q_fg = this._vent_insp_valve && !this._vent_insp_valve.no_flow ? this._vent_insp_valve.flow * 60.0 : 0.0;
    this.mon_fg_flow = ema(this.mon_fg_flow, q_fg, 1.0);
    this.mon_rr = this.rr_meas;
    if (this._hfo_mode()) this._hfo_peak_flow = Math.max(this._hfo_peak_flow, Math.abs(this._vent_ettube?.flow ?? 0.0));
    // HFOV+CMV: PIP is the peak of the CMV breath (its inspiration, oscillation included)
    if (this.vent_mode === "HFOV_CMV") {
      if (this._inspiration !== this._cmv_was_insp) this._cycle_crossed = true;
      if (this._inspiration) this._cmv_p_max = Math.max(this._cmv_p_max, this.pres);
      else if (this._cmv_was_insp) {
        this.mon_pip = this._cmv_p_max / MBAR_TO_CMH2O;
        this._cmv_p_max = -1e9;
      }
      this._cmv_was_insp = this._inspiration;
    }
    this.mon_trig = this.trig_per_min;

    // C20/C sample: pressure and inspired volume at 80 % of the set Ti
    if (this._inspiration && this._c20.p80 === null && this._insp_time_counter >= 0.8 * this.insp_time) {
      this._c20 = { p80: this.pres, v80: this._insp_tidal_volume_counter };
    }

    // CPAP closes out spontaneous breaths without a ventilator inspiration
    if (this.vent_mode === "CPAP" && !this._inspiration && this._breathing_model?.ncc_insp === 1) {
      this._close_breath(this.map_meas / MBAR_TO_CMH2O);
    }
    const now = this._model_engine.model_time_total ?? 0.0;
    while (this._vte_hist.length && now - this._vte_hist[0][0] > 60.0) this._vte_hist.shift();
  }

  _close_breath(peep_meas) {
    // per-breath filters (p175): tau 3 breaths for volumes and mechanics, 5 for MAP; leak averaged
    // over 5 breaths then tau 10
    const first = !this._mon_init;
    const f = (x, v, n) => (first ? v : x + (v - x) / n);
    const vte = this.exp_tidal_volume * 1000.0;
    const vti = this.insp_tidal_volume * 1000.0;
    this.mon_pip = this.p_peak / MBAR_TO_CMH2O;
    this.mon_peep = peep_meas;
    this.mon_map = f(this.mon_map, this.map_meas / MBAR_TO_CMH2O, 5);
    this.mon_vte = f(this.mon_vte, vte, 3);
    this.mon_vti = f(this.mon_vti, vti, 3);
    this._leak_hist.push(this.leak_perc);
    if (this._leak_hist.length > 5) this._leak_hist.shift();
    const leak5 = this._leak_hist.reduce((a, b) => a + b, 0) / this._leak_hist.length;
    this.mon_leak = f(this.mon_leak, leak5, 10);
    if (this.compliance_dynamic > 0.0) this.mon_c = f(this.mon_c, this.compliance_dynamic * MBAR_TO_CMH2O, 3);
    if (this.r_dyn > 0.0) this.mon_r = f(this.mon_r, this.r_dyn / MBAR_TO_CMH2O, 3);
    this.mon_ti = this.ti_meas;
    this.mon_te = this.te_meas;
    this.mon_ie = this.ie_ratio_meas;

    // C20/C: compliance over the last 20 % of the inspiration over the whole-breath compliance, the
    // overdistension index (Fisher 1988). A pressure-limited breath holds its pressure there, so it
    // is only measurable when the pressure still rises over that stretch (slow rise, stiff lung).
    const dp_all = this._c20_p_end - this.peep_cmh2o;
    const dp20 = this._c20.p80 !== null ? this._c20_p_end - this._c20.p80 : 0.0;
    if (this._c20.p80 !== null && dp20 > 0.5 && dp_all > 0.0 && this._c20_v_end > 0.0) {
      const c20 = (this._c20_v_end - this._c20.v80) / dp20;
      const c = this._c20_v_end / dp_all;
      const ratio = Math.min(9.9, Math.max(0.0, c20 / c));
      this.mon_c20c = this.mon_c20c === null || first ? ratio : this.mon_c20c + (ratio - this.mon_c20c) / 3;
    } else {
      this.mon_c20c = null;
    }

    const now = this._model_engine.model_time_total ?? 0.0;
    this._vte_hist.push([now, Math.max(0.0, vte)]);
    this.mon_vmin = this._vte_hist.reduce((a, b) => a + b[1], 0) / 1000.0;
    this._mon_init = true;
  }

  _hfo_cycle_end(f) {
    // HFO monitored values per oscillation (p175): Vte and DCO2 tau 3 cycles, MAP tau 5, ΔP the
    // peak-to-peak pressure, R = ΔP / peak flow, C = Vte / ΔP; Vmin from Vte and the frequency
    const peak_flow = this._hfo_peak_flow;
    this._hfo_peak_flow = 0.0;
    // HFOV+CMV: a cycle across a breath edge carries the PEEP-PIP step, so ΔP, C and R come from
    // the cycles inside one phase only
    const clean = !this._cycle_crossed;
    this._cycle_crossed = false;
    super._hfo_cycle_end(f);
    const first = !this._mon_init;
    const filt = (x, v, n) => (first ? v : x + (v - x) / n);
    const vte = Math.max(this.exp_tidal_volume, 0.0) * 1000.0;
    const dp = this.hfo_amplitude_meas / MBAR_TO_CMH2O;
    this.mon_vte = filt(this.mon_vte, vte, 3);
    this.mon_vti = filt(this.mon_vti, this.insp_tidal_volume * 1000.0, 3);
    this.mon_dco2 = filt(this.mon_dco2, f * vte * vte, 3);
    // MAP: per oscillation in HFOV, per breath (the CMV breath) in HFOV+CMV
    const map = this.vent_mode === "HFOV_CMV" ? this.map_meas : this.hfo_map_meas;
    this.mon_map = filt(this.mon_map, map / MBAR_TO_CMH2O, 5);
    if (clean) this.mon_dp = dp;
    if (this.vent_mode === "HFOV") this.mon_pip = this.p_peak / MBAR_TO_CMH2O;
    this.mon_freq = f;
    this.mon_vmin = (this.mon_vte * f * 60.0) / 1000.0;
    this.mon_leak = filt(this.mon_leak, this.leak_perc, 10);
    if (clean && dp > 0.0 && vte > 0.0) this.mon_c = filt(this.mon_c, vte / dp, 3);
    if (clean && peak_flow > 0.0) this.mon_r = filt(this.mon_r, dp / peak_flow, 3);
    this.mon_ie = this.vent_mode === "HFOV" ? 1.0 / this.hfo_insp_fraction - 1.0 : this.ie_ratio_meas;
    if (this.vent_mode === "HFOV_CMV") {
      this.mon_ti = this.ti_meas;
      this.mon_te = this.te_meas;
    }
    this._mon_init = true;
  }

  _end_inspiration() {
    // the end-inspiratory pressure and volume for C20/C
    this._c20_p_end = this.pres;
    this._c20_v_end = this._insp_tidal_volume_counter;
    super._end_inspiration();
  }

  _reset_monitor() {
    this._mon_init = false;
    this._leak_hist = [];
    this._vte_hist = [];
    for (const k of ["mon_pip", "mon_peep", "mon_map", "mon_vte", "mon_vti", "mon_vmin", "mon_leak", "mon_rr", "mon_c", "mon_r", "mon_ti", "mon_te", "mon_ie", "mon_fg_flow", "mon_dp", "mon_dco2", "mon_freq"]) this[k] = 0.0;
    this.mon_trig = 0;
    this.mon_c20c = null;
  }
}
