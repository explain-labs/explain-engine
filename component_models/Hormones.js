import { BaseModelClass } from "../base_models/BaseModelClass";

/*
  The Hormones class is the long-loop neuro-hormonal volume / osmolality controller — the slow
  counterpart to the fast `Ans` baroreflex. It models the renin–angiotensin–aldosterone system
  (RAAS) plus ADH (vasopressin) as a small set of named, inspectable hormone ACTIVITY LEVELS
  (1.0 = resting baseline), each driven first-order toward a stimulus-set target and each writing
  effector channels that are independent of the ANS (so they compose, never collide).

  It is a controller/process model (like Kidneys autoregulation): it holds no blood, resolves
  references to other models lazily, runs on an update interval, and owns its effector channels
  while enabled (releasing them once on disable). Default config is NEUTRAL — with setpoints
  anchored to the scenario's resting state every (hormone − 1) ≈ 0, so a scenario that ships a
  Hormones model behaves identically at rest and only diverges when perturbed (hemorrhage,
  hyperosmolality) or when a pathway is clamped (SIADH, ACE-inhibitor, hypoaldosteronism).

  SENSORS (lazy refs):
    perfusion  = KID_ART.pres                 → renin / angiotensin (renal perfusion)
    volume     = Circulation.total_blood_volume → renin + non-osmotic ADH
    plasma Na  = AA.solutes.na  (osm ≈ 2·Na)  → ADH (osmotic) ; also drives nothing else
    plasma K   = AA.solutes.k                 → aldosterone (hyperkalemia)

  HORMONES (readouts, 1.0 = baseline):
    angiotensin ← low perfusion + low volume          (renin = its instantaneous drive)
    aldosterone ← angiotensin (cascade) + hyperkalemia (slow tc)
    adh         ← plasma osmolality + low volume       (osmotic + baroregulated)

  EFFECTORS (owned channels; all default-neutral, all independent of Ans `ans_activity`):
    Circulation.svr_factor_art / svr_factor_ven  → systemic arteriolar / venular constriction
    KID_CAP_KID_VEN.r_factor_ps                  → renal EFFERENT constriction (AngII defends GFR)
    Kidneys.reabsorption_factors.na / .k         → aldosterone Na retention / K wasting
    Kidneys.reabs_factor_adh                     → ADH water retention (antidiuresis)
  NOTE the renal afferent (KID_ART.r_factor_ps) is deliberately NOT touched — it is owned by the
  Kidneys autoregulation loop. AngII acts renally through the efferent instead (physiologic).

  NOT in this version: ANP/natriuretic peptides, thirst/intake, direct osmotic water-follows-Na
  coupling (so aldosterone shows mainly as ↓FENa/↓urine-Na rather than large volume shifts —
  ADH and AngII carry the volume/pressure defense). Aldosterone uses a physiologic (slow) tc, so
  its effect only manifests over long runs unless aldosterone_tc is compressed.
*/

export class Hormones extends BaseModelClass {
  // static properties
  static model_type = "Hormones";

  constructor(model_ref, name = "") {
    super(model_ref, name);

    // -----------------------------------------------
    // gating
    this.hormones_running = true; // master gate (false → all channels released to neutral)
    this.raas_enabled = true; // renin/angiotensin + aldosterone pathway
    this.adh_enabled = true; // vasopressin pathway

    // -----------------------------------------------
    // sensor wiring (resolved lazily)
    this.perfusion_model = "KID_ART"; // renal perfusion pressure source (renin driver)
    this.perfusion_prop = "pres";
    this.volume_model = "Circulation"; // circulating volume source (renin + baro-ADH driver)
    this.volume_prop = "total_blood_volume";
    this.plasma_model = "AA"; // representative arterial plasma for solutes (na, k)

    // effector target names (resolved lazily)
    this.circulation_name = "Circulation"; // systemic vasoconstriction fan-out (svr_factor_*)
    this.kidneys_name = "Kidneys"; // renal Na/water reabsorption channels
    this.efferent_name = "KID_CAP_KID_VEN"; // renal efferent arteriole (a Resistor)

    // -----------------------------------------------
    // setpoints — anchor to the scenario's RESTING values so the controller is near-neutral at rest
    this.perfusion_setpoint = 40.0; // mmHg (≈ baseline KID_ART.pres)
    this.volume_setpoint = 0.4; // L   (≈ baseline Circulation.total_blood_volume)
    this.osmo_na_setpoint = 138.0; // mmol/L plasma Na (osmolality proxy setpoint)
    this.k_setpoint = 3.5; // mmol/L plasma K

    // -----------------------------------------------
    // hormone dynamics: input gains, time constants (s), and activity clamps
    this.renin_gain = 3.0; // angiotensin drive per fractional perfusion deficit
    this.renin_vol_gain = 3.0; // angiotensin drive per fractional volume deficit
    this.angiotensin_tc = 30.0; // s — AngII responds over ~tens of seconds

    this.aldo_gain = 1.0; // aldosterone drive per (angiotensin − 1) (cascade)
    this.aldo_k_in_gain = 2.0; // aldosterone drive per fractional hyperkalemia
    this.aldosterone_tc = 1800.0; // s — PHYSIOLOGIC slow (≈30 min); compress for demos

    this.adh_gain_osmo = 4.0; // ADH drive per fractional osmolality (Na) excess
    this.adh_gain_baro = 1.0; // ADH drive per fractional volume deficit (non-osmotic)
    this.adh_tc = 120.0; // s — ADH responds over ~minutes

    this.hormone_min = 0.0; // floor for each hormone activity level
    this.hormone_max = 8.0; // ceiling for each hormone activity level

    // -----------------------------------------------
    // effector sensitivities (map hormone activity → effector factor) + clamps
    this.ang_svr_gain = 0.3; // systemic arteriolar constriction per (ang − 1)
    this.ang_svr_ven_gain = 0.2; // systemic venular constriction per (ang − 1)
    this.ang_efferent_gain = 0.5; // renal efferent constriction per (ang − 1)
    this.aldo_na_gain = 0.01; // Na reabsorption-factor rise per (aldo − 1)
    this.aldo_k_gain = 0.1; // K reabsorption-factor DROP per (aldo − 1) (K wasting)
    this.adh_water_gain = 0.015; // water reabsorption-factor rise per (adh − 1)
    this.adh_svr_gain = 0.05; // mild systemic constriction per (adh − 1) at high ADH

    this.svr_factor_min = 0.5; // clamps on the applied effector factors
    this.svr_factor_max = 5.0;
    this.efferent_factor_min = 0.5;
    this.efferent_factor_max = 5.0;
    this.na_factor_min = 0.95;
    this.na_factor_max = 1.02;
    this.k_factor_min = 0.2;
    this.k_factor_max = 1.5;
    this.water_factor_min = 0.5;
    this.water_factor_max = 1.03;

    // -----------------------------------------------
    // dependent parameters (read-outs, 1.0 = baseline activity)
    this.renin = 1.0; // instantaneous angiotensin DRIVE (un-lagged target)
    this.angiotensin = 1.0; // effective angiotensin II activity (lagged)
    this.aldosterone = 1.0; // aldosterone activity
    this.adh = 1.0; // ADH / vasopressin activity

    // applied effector factors (diagnostic read-outs)
    this.svr_factor = 1.0; // → Circulation.svr_factor_art
    this.svr_ven_factor = 1.0; // → Circulation.svr_factor_ven
    this.efferent_factor = 1.0; // → KID_CAP_KID_VEN.r_factor_ps
    this.na_reabs_factor = 1.0; // → Kidneys.reabsorption_factors.na
    this.k_reabs_factor = 1.0; // → Kidneys.reabsorption_factors.k
    this.water_reabs_factor = 1.0; // → Kidneys.reabs_factor_adh

    // sensed values (diagnostic read-outs)
    this.sensed_perfusion = 0.0;
    this.sensed_volume = 0.0;
    this.sensed_na = 0.0;
    this.sensed_osmolality = 0.0; // ≈ 2 · sensed_na
    this.sensed_k = 0.0;

    // -----------------------------------------------
    // local parameters
    this._update_interval = 1.0; // run the controller every 1 s (hormones are slow)
    this._update_counter = 0.0;
    this._was_active = false; // tracks active→inactive for the one-shot channel release
    this._circ = null;
    this._kidneys = null;
    this._efferent = null;
    this._perf = null;
    this._vol = null;
    this._plasma = null;
  }

  init_model(args) {
    // base applies args (no components on this model)
    super.init_model(args);
  }

  calc_model() {
    // master gate — release owned channels once, then idle
    if (!this.hormones_running) {
      if (this._was_active) this._release_channels();
      this._was_active = false;
      return;
    }

    // run the (slow) control logic on the update interval, not every step
    this._update_counter += this._t;
    if (this._update_counter >= this._update_interval) {
      const u = this._update_counter; // exact elapsed time since the last update
      this._update_counter = 0.0;
      this._update_hormones(u);
      this._apply_effectors();
    }
    this._was_active = true;
  }

  // resolve sensor / effector references lazily (other models may build after Hormones)
  _resolve_refs() {
    if (!this._circ) this._circ = this._model_engine.models[this.circulation_name] ?? null;
    if (!this._kidneys) this._kidneys = this._model_engine.models[this.kidneys_name] ?? null;
    if (!this._efferent) this._efferent = this._model_engine.models[this.efferent_name] ?? null;
    if (!this._perf) this._perf = this._model_engine.models[this.perfusion_model] ?? null;
    if (!this._vol) this._vol = this._model_engine.models[this.volume_model] ?? null;
    if (!this._plasma) this._plasma = this._model_engine.models[this.plasma_model] ?? null;
  }

  // the hormone control math. u = elapsed time since the last controller update (s).
  _update_hormones(u) {
    this._resolve_refs();

    // --- read sensors (keep last good value if a ref/prop is missing) ---
    if (this._perf) this.sensed_perfusion = this._perf[this.perfusion_prop] ?? this.sensed_perfusion;
    if (this._vol) this.sensed_volume = this._vol[this.volume_prop] ?? this.sensed_volume;
    if (this._plasma?.solutes) {
      this.sensed_na = this._plasma.solutes.na ?? this.sensed_na;
      this.sensed_k = this._plasma.solutes.k ?? this.sensed_k;
    }
    this.sensed_osmolality = 2.0 * this.sensed_na;

    // fractional deficits/excesses relative to setpoint (guard divide-by-zero)
    const perf_err = this.perfusion_setpoint > 0 ? (this.perfusion_setpoint - this.sensed_perfusion) / this.perfusion_setpoint : 0.0;
    const vol_err = this.volume_setpoint > 0 ? (this.volume_setpoint - this.sensed_volume) / this.volume_setpoint : 0.0;
    const osmo_err = this.osmo_na_setpoint > 0 ? (this.sensed_na - this.osmo_na_setpoint) / this.osmo_na_setpoint : 0.0;
    const k_err = this.k_setpoint > 0 ? (this.sensed_k - this.k_setpoint) / this.k_setpoint : 0.0;

    // --- renin / angiotensin II (low perfusion and/or low volume → constrict + retain) ---
    if (this.raas_enabled) {
      this.renin = this._clamp(1.0 + this.renin_gain * perf_err + this.renin_vol_gain * vol_err, this.hormone_min, this.hormone_max);
      this.angiotensin = this._lag(this.angiotensin, this.renin, u, this.angiotensin_tc);

      // --- aldosterone (driven by angiotensin cascade + hyperkalemia; slow) ---
      const aldo_target = this._clamp(1.0 + this.aldo_gain * (this.angiotensin - 1.0) + this.aldo_k_in_gain * k_err, this.hormone_min, this.hormone_max);
      this.aldosterone = this._lag(this.aldosterone, aldo_target, u, this.aldosterone_tc);
    } else {
      this.renin = 1.0;
      this.angiotensin = 1.0;
      this.aldosterone = 1.0;
    }

    // --- ADH / vasopressin (high osmolality and/or low volume → retain water + mild constriction) ---
    if (this.adh_enabled) {
      const adh_target = this._clamp(1.0 + this.adh_gain_osmo * osmo_err + this.adh_gain_baro * vol_err, this.hormone_min, this.hormone_max);
      this.adh = this._lag(this.adh, adh_target, u, this.adh_tc);
    } else {
      this.adh = 1.0;
    }
  }

  // map hormone levels → effector factors and write the owned channels
  _apply_effectors() {
    // systemic vasoconstriction (AngII + a little ADH) → Circulation master knobs (fan out to vessels)
    this.svr_factor = this._clamp(1.0 + this.ang_svr_gain * (this.angiotensin - 1.0) + this.adh_svr_gain * (this.adh - 1.0), this.svr_factor_min, this.svr_factor_max);
    this.svr_ven_factor = this._clamp(1.0 + this.ang_svr_ven_gain * (this.angiotensin - 1.0), this.svr_factor_min, this.svr_factor_max);
    if (this._circ) {
      this._circ.svr_factor_art = this.svr_factor;
      this._circ.svr_factor_ven = this.svr_ven_factor;
    }

    // renal efferent constriction (AngII defends glomerular pressure / GFR)
    this.efferent_factor = this._clamp(1.0 + this.ang_efferent_gain * (this.angiotensin - 1.0), this.efferent_factor_min, this.efferent_factor_max);
    if (this._efferent) this._efferent.r_factor_ps = this.efferent_factor;

    // renal reabsorption: aldosterone (Na↑, K↓) and ADH (water↑)
    this.na_reabs_factor = this._clamp(1.0 + this.aldo_na_gain * (this.aldosterone - 1.0), this.na_factor_min, this.na_factor_max);
    this.k_reabs_factor = this._clamp(1.0 - this.aldo_k_gain * (this.aldosterone - 1.0), this.k_factor_min, this.k_factor_max);
    this.water_reabs_factor = this._clamp(1.0 + this.adh_water_gain * (this.adh - 1.0), this.water_factor_min, this.water_factor_max);
    if (this._kidneys) {
      if (this._kidneys.reabsorption_factors) {
        this._kidneys.reabsorption_factors.na = this.na_reabs_factor;
        this._kidneys.reabsorption_factors.k = this.k_reabs_factor;
      }
      this._kidneys.reabs_factor_adh = this.water_reabs_factor;
    }
  }

  // release every owned channel back to neutral exactly once (on disable), so no stale hormonal
  // constriction/retention persists and the model reverts to its un-hormonal behaviour
  _release_channels() {
    this._resolve_refs();
    if (this._circ) {
      this._circ.svr_factor_art = 1.0;
      this._circ.svr_factor_ven = 1.0;
    }
    if (this._efferent) this._efferent.r_factor_ps = 1.0;
    if (this._kidneys) {
      if (this._kidneys.reabsorption_factors) {
        this._kidneys.reabsorption_factors.na = 1.0;
        this._kidneys.reabsorption_factors.k = 1.0;
      }
      this._kidneys.reabs_factor_adh = 1.0;
    }
    this.renin = 1.0;
    this.angiotensin = 1.0;
    this.aldosterone = 1.0;
    this.adh = 1.0;
    this.svr_factor = 1.0;
    this.svr_ven_factor = 1.0;
    this.efferent_factor = 1.0;
    this.na_reabs_factor = 1.0;
    this.k_reabs_factor = 1.0;
    this.water_reabs_factor = 1.0;
  }

  // first-order lag of x toward target over elapsed time u with time constant tc (s)
  _lag(x, target, u, tc) {
    if (tc > 0) return x + u * ((1.0 / tc) * (-x + target));
    return target;
  }

  _clamp(v, lo, hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }
}
