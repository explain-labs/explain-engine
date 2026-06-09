import { BaseModelClass } from "../base_models/BaseModelClass.js";

/*
  The Kidneys class turns the (otherwise passive) renal vascular bed
  (KID_ART -> KID_CAP -> KID_VEN) into an active filtration unit. It is a
  controller/process model (like Placenta): it does not hold blood itself but
  operates on the existing glomerular-capillary compartment (KID_CAP) and a new
  URINE bladder compartment it owns via the `components` mechanism.

  Scope: FLUID BALANCE & URINE OUTPUT, PER-SOLUTE REABSORPTION, plus optional GFR AUTOREGULATION.
    glomerular Starling filtration -> GFR
    per-solute tubular reabsorption (mass balance): water uses reabsorption_fraction; each
       filterable solute uses its own reabsorption_fractions[s] (fallback = water fraction),
       so urine need not be iso-osmotic with plasma. See _transfer.
    net urine water = GFR * (1 - reabsorption_fraction) leaves the blood into URINE,
       slowly lowering the circulating blood volume (diuresis).
    GFR autoregulation (myogenic + tubuloglomerular feedback) modulates the afferent
       arteriole (the KID_ART BloodVessel -> its AD_KID_ART input resistor) to hold GFR
       and renal blood flow ~constant across renal perfusion pressure. Default off; the
       term_neonate and adult_female scenarios ship with it enabled. See _run_autoregulation.

  NOT in this version: hormonal control of reabsorption (RAAS/ADH), clearance/acid-base,
  tubular load / transport maxima. Albumin & hemoglobin are NOT filtered (retained in blood).
*/

export class Kidneys extends BaseModelClass {
  // static properties
  static model_type = "Kidneys";

  constructor(model_ref, name = "") {
    super(model_ref, name);

    // -----------------------------------------------
    // independent parameters (config)
    this.kidneys_running = true; // master gate for filtration
    this.kid_cap_name = "KID_CAP"; // glomerular capillary compartment (filtration source)
    this.urine_name = "URINE"; // bladder / urine sink compartment

    this.kf = 6.6e-6; // glomerular filtration coefficient (L/s per mmHg) — SCENARIO-CALIBRATED
    this.p_bowman = 8.0; // Bowman's capsule hydrostatic pressure (mmHg)
    this.oncotic_base = 18.0; // plasma oncotic pressure at reference albumin (mmHg)
    this.albumin_ref = 25.0; // reference plasma albumin the oncotic_base is tied to (g/L)
    this.reabsorption_fraction = 0.985; // WATER reabsorption fraction; urine water = GFR*(1-FR)
    // per-solute reabsorption fractions (fraction of the filtered load reabsorbed). Any solute
    // absent here falls back to the water fraction -> iso-osmotic (identical to single-fraction
    // behaviour). A solute reabsorbed MORE than water concentrates in blood / dilutes in urine;
    // LESS -> concentrates in urine. Modulatable per-key by the scheduler (RAAS-ready).
    this.reabsorption_fractions = {}; // e.g. { na: 0.995, k: 0.92, ... }

    // -----------------------------------------------
    // GFR autoregulation (myogenic + tubuloglomerular feedback). Default OFF so existing
    // scenarios are byte-identical until enabled. A closed-loop controller adjusts the
    // AFFERENT arteriole — the KID_ART BloodVessel — by writing its r_factor_ps; the vessel
    // propagates that to its owned input resistor (AD_KID_ART) each step. Constricting the
    // afferent (r_factor_ps > 1) cuts renal inflow, lowering KID_CAP.pres -> NFP -> GFR, and
    // also lowers KID_ART.pres (more drop upstream): since we SENSE KID_ART.pres, the loop is
    // NEGATIVE feedback (sense high -> constrict -> pressure falls), hence self-correcting.
    this.autoregulation_enabled = false; // master gate for autoregulation
    this.aff_vessel_name = "KID_ART"; // afferent arteriole BloodVessel (the effector)

    // myogenic limb (fast, pressure-sensing). Senses the pressure the afferent feels.
    this.myogenic_input_model = "KID_ART"; // model whose pressure drives the myogenic response
    this.myogenic_input_prop = "pres"; // property read off that model
    this.myogenic_p_set = 35.0; // setpoint pressure -> factor 1.0 (mmHg, SCENARIO-CALIBRATED)
    this.myogenic_p_min = 25.0; // lower edge of the autoregulatory window (mmHg)
    this.myogenic_p_max = 55.0; // upper edge of the autoregulatory window (mmHg)
    this.myogenic_gain_up = 0.06; // resistance gain per mmHg above setpoint
    this.myogenic_gain_down = 0.06; // resistance gain per mmHg below setpoint
    this.myogenic_tc = 4.0; // myogenic time constant (s) — fast

    // tubuloglomerular feedback limb (slow). Senses distal NaCl delivery ~ GFR * plasma Na.
    this.tgf_use_nacl = true; // use GFR*Na as the TGF signal (else GFR alone)
    this.tgf_setpoint = 0.0; // TGF signal setpoint; <= 0 -> auto-seed after a warm-up (see below)
    this.tgf_seed_delay = 30.0; // s of warm-up before the auto-seed fires, so the setpoint
    //                             reflects steady state rather than the startup transient
    this.tgf_gain = 0.8; // resistance gain per fractional deviation of the TGF signal
    this.tgf_tc = 30.0; // TGF time constant (s) — slow

    // applied-factor lag + clamps (stability). The combined factor is low-pass filtered and
    // clamped so the closed loop cannot oscillate or run away / drive r_for_eff to <= 0.
    this.afferent_apply_tc = 6.0; // time constant on the applied afferent factor (s)
    this.afferent_factor_min = 0.5; // min afferent resistance multiplier
    this.afferent_factor_max = 4.0; // max afferent resistance multiplier

    // small solutes that travel into the urine at plasma concentration.
    // albumin & hemoglobin are deliberately EXCLUDED (retained -> hemoconcentration)
    this.filterable_solutes = ["na", "k", "ca", "cl", "lact", "mg", "phosphates", "uma"];

    // factor stack on kf (additive, like Capacitance/Resistor) so it composes with
    // interventions (non-persistent), scenario adjustments (persistent) and ModelScaler
    this.kf_factor = 1.0;
    this.kf_factor_ps = 1.0;
    this.kf_factor_scaling_ps = 1.0;

    // factor stack on the reabsorption fraction (multiplicative, since it is a fraction)
    this.reabs_factor = 1.0;
    this.reabs_factor_ps = 1.0;
    this.reabs_factor_scaling_ps = 1.0;

    // -----------------------------------------------
    // dependent parameters (read-outs, clinical units)
    this.nfp = 0.0; // net filtration pressure (mmHg)
    this.gfr = 0.0; // glomerular filtration rate (mL/min)
    this.urine_flow = 0.0; // urine output (mL/min)
    this.urine_volume = 0.0; // total diuresis = URINE.vol (mL)
    this.fe_na = 0.0; // fractional excretion of sodium (%)

    // autoregulation read-outs (clinical/diagnostic)
    this.myogenic_factor = 1.0; // myogenic limb afferent multiplier
    this.tgf_factor = 1.0; // TGF limb afferent multiplier
    this.afferent_factor = 1.0; // applied (lagged, clamped) afferent r_factor_ps
    this.sensed_pressure = 0.0; // pressure currently driving the myogenic limb (mmHg)
    this.tgf_signal = 0.0; // current TGF signal (GFR*Na or GFR)

    // -----------------------------------------------
    // local parameters
    this._gfr_ls = 0.0; // GFR in L/s (used for the transfer math)
    this._urine_ls = 0.0; // urine flow in L/s
    this._kf_eff = 0.0; // effective filtration coefficient after factors
    this._reabs_eff = 0.0; // effective reabsorption fraction after factors
    this._kid_cap = null; // reference to the glomerular capillary (source)
    this._urine = null; // reference to the URINE bladder (sink)

    // autoregulation locals
    this._aff_vessel = null; // reference to the afferent arteriole BloodVessel (effector)
    this._autoreg_update_interval = 0.015; // run the controller every 15 ms (perf)
    this._autoreg_update_counter = 0.0; // accumulator for the update interval
    this._tgf_setpoint_seeded = false; // whether the TGF setpoint has been auto-seeded
    this._tgf_seed_timer = 0.0; // accumulates controller time toward tgf_seed_delay
    this._tgf_signal_ema = 0.0; // smoothed TGF signal (tames pulsatility) used for the seed
    this._tgf_ema_tc = 5.0; // smoothing time constant for the seed EMA (s)
    this._limb_factor_floor = 0.05; // floor for each limb factor (keeps them physically positive
    //                                 under high gain; the combined clamp does the real limiting)
    this._was_autoreg_active = false; // tracks enabled->disabled transition for one-shot reset
  }

  init_model(args) {
    // base applies args and instantiates the URINE component into model.models
    super.init_model(args);

    // URINE is our OWN component (just instantiated by super) — safe to resolve now.
    this._urine = this._model_engine.models[this.urine_name] ?? null;
    // KID_CAP is a component of another model (Circulation) that may be instantiated
    // AFTER us in build order, so it is resolved lazily in calc_model().
  }

  calc_model() {
    // lazy reference resolution: KID_CAP (a Circulation component) may not have existed
    // at init time; by the first step the build is complete and all models are registered
    if (!this._kid_cap) this._kid_cap = this._model_engine.models[this.kid_cap_name] ?? null;
    if (!this._urine) this._urine = this._model_engine.models[this.urine_name] ?? null;

    // gating and wiring guards
    if (!this.kidneys_running) {
      this._zero_outputs();
      return;
    }
    if (!this._kid_cap || !this._urine) return;
    if (this._kid_cap.vol <= 0.0) {
      this._zero_outputs();
      return;
    }

    // effective filtration coefficient (3-layer additive convention)
    this._kf_eff =
      this.kf +
      (this.kf_factor - 1.0) * this.kf +
      (this.kf_factor_ps - 1.0) * this.kf +
      (this.kf_factor_scaling_ps - 1.0) * this.kf;
    this.kf_factor = 1.0; // reset the non-persistent layer

    // effective reabsorption fraction (multiplicative, clamped to a sane fraction)
    this._reabs_eff =
      this.reabsorption_fraction *
      this.reabs_factor *
      this.reabs_factor_ps *
      this.reabs_factor_scaling_ps;
    this.reabs_factor = 1.0;
    if (this._reabs_eff < 0.0) this._reabs_eff = 0.0;
    if (this._reabs_eff > 0.9999) this._reabs_eff = 0.9999;

    // Starling net filtration pressure
    const p_glom = this._kid_cap.pres; // glomerular hydrostatic pressure (mmHg)
    const onc = this._oncotic_pressure(); // plasma oncotic pressure (mmHg)
    this.nfp = p_glom - this.p_bowman - onc;
    if (this.nfp < 0.0) this.nfp = 0.0;

    // GFR and net urine flow (L/s) — only the net leaves the blood. _reabs_eff is the WATER
    // reabsorption fraction; per-solute fractions are handled in _transfer (mass balance).
    this._gfr_ls = this._kf_eff * this.nfp;
    this._urine_ls = this._gfr_ls * (1.0 - this._reabs_eff);

    // conservative per-solute mass transfer this step (filtrate volume Vf, water reabs wr)
    this._transfer(this._gfr_ls * this._t, this._reabs_eff);

    // read-outs in clinical units
    this.gfr = this._gfr_ls * 60000.0; // L/s -> mL/min
    this.urine_flow = this._urine_ls * 60000.0; // L/s -> mL/min
    this.urine_volume = this._urine.vol * 1000.0; // L -> mL (cumulative diuresis)
    // fractional excretion of Na (%) = fraction of filtered Na not reabsorbed
    this.fe_na = (1.0 - this._solute_reabs("na")) * 100.0;

    // GFR autoregulation (adjusts the afferent arteriolar resistance)
    this._run_autoregulation();
  }

  // interval-gated autoregulation controller. Resolves the afferent vessel lazily (like
  // _kid_cap), handles the enabled<->disabled transition, and otherwise runs the myogenic +
  // TGF control logic on a 15 ms tick. Writes only to the afferent vessel's r_factor_ps (the
  // BloodVessel propagates it to its owned input resistor AD_KID_ART each step).
  _run_autoregulation() {
    if (!this._aff_vessel) this._aff_vessel = this._model_engine.models[this.aff_vessel_name] ?? null;

    if (!this.autoregulation_enabled || !this._aff_vessel) {
      // on the enabled->disabled transition, release the afferent factor exactly once so no
      // stale constriction/dilation persists and the model reverts to linear behaviour
      if (this._was_autoreg_active && this._aff_vessel) {
        this._aff_vessel.r_factor_ps = 1.0;
        this.myogenic_factor = 1.0;
        this.tgf_factor = 1.0;
        this.afferent_factor = 1.0;
      }
      this._was_autoreg_active = false;
      return;
    }

    // run the control logic on the update interval, not every step
    this._autoreg_update_counter += this._t;
    if (this._autoreg_update_counter >= this._autoreg_update_interval) {
      this._autoreg_update_counter = 0.0;
      this._update_autoregulation(this._autoreg_update_interval);
    }
    this._was_autoreg_active = true;
  }

  // the actual control math. u = elapsed time since the last controller update (s).
  _update_autoregulation(u) {
    // --- myogenic limb (fast) -----------------------------------------------------------
    // sense the pressure the afferent arteriole feels
    const _in = this._model_engine.models[this.myogenic_input_model];
    if (_in) this.sensed_pressure = _in[this.myogenic_input_prop] ?? this.sensed_pressure;
    const p = this.sensed_pressure;

    // piecewise-linear activation: deviation from setpoint, saturated outside the window
    let act;
    if (p > this.myogenic_p_max) act = this.myogenic_p_max - this.myogenic_p_set;
    else if (p < this.myogenic_p_min) act = this.myogenic_p_min - this.myogenic_p_set;
    else act = p - this.myogenic_p_set;

    // rising pressure -> constrict (factor > 1); falling -> dilate (< 1); at setpoint -> 1.0.
    // floor the target so a large downward deviation x high gain can't drive it negative.
    const gain = p >= this.myogenic_p_set ? this.myogenic_gain_up : this.myogenic_gain_down;
    let myo_target = 1.0 + gain * act;
    if (myo_target < this._limb_factor_floor) myo_target = this._limb_factor_floor;
    this.myogenic_factor =
      this.myogenic_tc > 0
        ? this.myogenic_factor + u * ((1.0 / this.myogenic_tc) * (-this.myogenic_factor + myo_target))
        : myo_target;

    // --- tubuloglomerular feedback limb (slow) ------------------------------------------
    // signal ~ distal NaCl delivery: GFR * plasma Na (fallback to GFR alone)
    const na = this._kid_cap.solutes?.na;
    this.tgf_signal = this.tgf_use_nacl && na !== undefined ? this.gfr * na : this.gfr;

    // smooth the signal so the auto-seed captures a clean (non-pulsatile) value
    if (this._tgf_signal_ema <= 0.0) this._tgf_signal_ema = this.tgf_signal;
    else
      this._tgf_signal_ema +=
        u * ((1.0 / this._tgf_ema_tc) * (-this._tgf_signal_ema + this.tgf_signal));

    // auto-seed the setpoint, but only AFTER a warm-up so it reflects the steady state rather
    // than the startup transient (seeding too early biases it low -> standing constriction)
    if (!this._tgf_setpoint_seeded && this.tgf_setpoint <= 0.0) {
      this._tgf_seed_timer += u;
      if (this._tgf_seed_timer >= this.tgf_seed_delay && this.tgf_signal > 0.0) {
        this.tgf_setpoint = this._tgf_signal_ema;
        this._tgf_setpoint_seeded = true;
      }
    }

    if (this.tgf_setpoint > 0.0) {
      const err = (this.tgf_signal - this.tgf_setpoint) / this.tgf_setpoint;
      let tgf_target = 1.0 + this.tgf_gain * err; // high delivery -> constrict
      if (tgf_target < this._limb_factor_floor) tgf_target = this._limb_factor_floor;
      this.tgf_factor =
        this.tgf_tc > 0
          ? this.tgf_factor + u * ((1.0 / this.tgf_tc) * (-this.tgf_factor + tgf_target))
          : tgf_target;
    }

    // --- combine -> clamp -> lag -> write -----------------------------------------------
    let combined = this.myogenic_factor * this.tgf_factor; // multiplicative
    if (combined < this.afferent_factor_min) combined = this.afferent_factor_min;
    if (combined > this.afferent_factor_max) combined = this.afferent_factor_max;

    // first-order lag on the applied factor so the closed loop can't oscillate
    this.afferent_factor =
      this.afferent_apply_tc > 0
        ? this.afferent_factor + u * ((1.0 / this.afferent_apply_tc) * (-this.afferent_factor + combined))
        : combined;
    if (this.afferent_factor < this.afferent_factor_min) this.afferent_factor = this.afferent_factor_min;
    if (this.afferent_factor > this.afferent_factor_max) this.afferent_factor = this.afferent_factor_max;

    // write to the afferent BloodVessel; it composes r_factor_ps and pushes the resulting
    // resistance to its owned input resistor (AD_KID_ART) on its own step this same cycle
    this._aff_vessel.r_factor_ps = this.afferent_factor;
  }

  // plasma oncotic pressure, simple linear approximation tied to albumin so it both
  // opposes filtration at baseline and rises with hemoconcentration (self-limiting)
  _oncotic_pressure() {
    const alb = this._kid_cap.solutes?.albumin ?? this.albumin_ref;
    return this.oncotic_base * (alb / this.albumin_ref);
  }

  // conservative PER-SOLUTE mass transfer from KID_CAP into the URINE bladder. Each filterable
  // solute is reabsorbed by its own fraction (mass balance), so urine need not be iso-osmotic.
  // NOT BloodCapacitance.volume_in (which would copy ALL solutes incl. albumin/Hb and cause
  // artifactual proteinuria + progressive blood protein loss).
  //   Vf = glomerular filtrate volume this step (L); wr = water reabsorption fraction.
  // The reabsorbed water/solute is simply never removed (it returns to blood); only the net
  // excreted water (Uw) and excreted solute mass (mx) leave KID_CAP for URINE.
  _transfer(Vf, wr) {
    if (Vf <= 0.0) return;

    const src = this._kid_cap;
    const vol_before = src.vol;

    // urine water this step; never drain more than available (keep a tiny floor so vol > 0)
    let Uw = Vf * (1.0 - wr);
    if (Uw <= 0.0) return;
    const max_removable = vol_before - 1e-9;
    if (max_removable <= 0.0) return;
    if (Uw > max_removable) Uw = max_removable;
    const vol_after = vol_before - Uw;

    const old_uvol = this._urine.vol;
    const new_uvol = old_uvol + Uw;

    // per-solute mass balance: filtered mass = Vf*C, excreted = filtered*(1-fr[s]) (clamped to
    // the mass present), reabsorbed = the rest (stays in blood). Recompute blood concentration
    // over the reduced volume, and mix the excreted mass into the urine bladder.
    for (const s of this.filterable_solutes) {
      const c = src.solutes?.[s] ?? 0.0;
      const fr = this._solute_reabs(s);
      let mx = Vf * c * (1.0 - fr); // excreted solute mass
      const mass_avail = c * vol_before;
      if (mx > mass_avail) mx = mass_avail; // never remove more than present
      if (mx < 0.0) mx = 0.0;
      if (vol_after > 0.0) src.solutes[s] = (c * vol_before - mx) / vol_after;
      if (new_uvol > 0.0) {
        const existing = this._urine.solutes?.[s] ?? 0.0;
        this._urine.solutes[s] = (existing * old_uvol + mx) / new_uvol;
      }
    }

    // remove the urine water from the blood, add it to the bladder
    src.vol = vol_after < 0.0 ? 0.0 : vol_after;
    this._urine.vol = new_uvol;

    // hemoconcentration: albumin & hemoglobin are NOT filtered (total amount conserved), so
    // their concentration rises as the plasma volume shrank
    if (vol_after > 0.0) {
      const ratio = vol_before / vol_after;
      for (const s of ["albumin", "hemoglobin"]) {
        if (src.solutes?.[s] !== undefined) src.solutes[s] *= ratio;
      }
    }
  }

  // effective per-solute reabsorption fraction: the configured override if present, else the
  // water reabsorption fraction (-> iso-osmotic for that solute). Clamped to a sane fraction.
  _solute_reabs(s) {
    let fr = this.reabsorption_fractions?.[s];
    if (fr === undefined || fr === null) fr = this._reabs_eff;
    if (fr < 0.0) fr = 0.0;
    if (fr > 0.9999) fr = 0.9999;
    return fr;
  }

  // zero the active read-outs while keeping the accumulated bladder volume
  _zero_outputs() {
    this._gfr_ls = 0.0;
    this._urine_ls = 0.0;
    this.nfp = 0.0;
    this.gfr = 0.0;
    this.urine_flow = 0.0;
    if (this._urine) this.urine_volume = this._urine.vol * 1000.0;
  }
}
