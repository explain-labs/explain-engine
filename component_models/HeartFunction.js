import { BaseModelClass } from "../base_models/BaseModelClass";

export class HeartFunction extends BaseModelClass {
  // static properties
  static model_type = "HeartFunction";

  /*
  HeartFunction — load-induced ventricular contractility compromise.

  Models how a ventricle becomes compromised when it labors against a very high
  pressure (afterload) or is over-dilated by too much volume (preload). The
  unifying signal is the Laplace wall stress

      sigma = P * r / (2 * h)

  computed per ventricle from the per-beat end-systolic and end-diastolic
  pressures/volumes that Heart.analyze() already provides (lv_esp/lv_esv/
  lv_edp/lv_edv and the rv_* equivalents). A single wall-stress signal captures
  both mechanisms: afterload raises sigma through pressure P, dilation raises it
  through cavity radius r.

  Two timescales, mirroring the structure of the Mob (myocardial oxygen balance)
  model:

    1. ACUTE (reversible, seconds-minutes) — afterload mismatch / over-dilation.
       When end-systolic wall stress (afterload) or end-diastolic wall stress
       (over-dilation) exceeds a setpoint, contractility is depressed via the
       chamber's el_max_load_factor. A first-order lag (cont_tc) smooths it and
       it fully recovers (factor -> 1) when the load normalizes.

    2. CHRONIC (remodeling, slow) — driven by the time-averaged wall stress.
       Concentric remodeling (sustained high end-systolic stress) thickens the
       wall, which lowers sigma (compensation), with a maladaptive tail of
       diastolic stiffening (el_k_remodel_factor) and a mild contractility
       decline. Eccentric remodeling (sustained high end-diastolic stress /
       volume overload) dilates the cavity (u_vol_remodel_factor) with a
       contractility decline (el_max_remodel_factor). Partially reversible.

  Geometry is a thin-walled sphere; wall volume is derived from heart weight
  (reusing Mob's hw relation) split by a configurable LV/RV mass fraction, so it
  scales with body weight automatically. Setpoints auto-calibrate to the resting
  wall stress during an initial warm-up window unless an explicit setpoint > 0 is
  provided in the model definition.

  Writes only factor properties onto the LV and RV HeartChambers; it composes
  additively with the ANS and Mob el_max terms. Atria are left untouched.
  */

  constructor(model_ref, name = "") {
    super(model_ref, name);

    // ---- master switch -------------------------------------------------
    this.hf_active = true;

    // ---- geometry ------------------------------------------------------
    // heart weight (g) from body weight: hw = hw_intercept + hw_slope * weight_kg * 1000 (same relation as Mob)
    this.hw_intercept = 7.799;
    this.hw_slope = 0.004296;
    this.wall_density = 1.05; // g/mL myocardium
    this.wall_frac_lv = 0.35; // fraction of heart mass attributed to the LV free wall
    this.wall_frac_rv = 0.15; // fraction of heart mass attributed to the RV free wall
    this.wall_volume_lv = 0.0; // explicit LV wall volume override (mL); <= 0 => derive from heart weight
    this.wall_volume_rv = 0.0; // explicit RV wall volume override (mL); <= 0 => derive from heart weight

    // ---- acute (afterload mismatch / over-dilation) --------------------
    this.cont_tc = 30.0; // time constant of the acute contractility response (s)
    this.cont_floor = 0.2; // lowest the acute factor may drive el_max (fraction of baseline)
    // gains: contractility depression per unit wall stress above the setpoint
    this.g_es_lv = 0.005; // afterload (end-systolic stress) gain, LV
    this.g_ed_lv = 0.02; // over-dilation (end-diastolic stress) gain, LV
    this.g_es_rv = 0.008; // afterload gain, RV (thinner wall, more load-sensitive)
    this.g_ed_rv = 0.03; // over-dilation gain, RV

    // ---- chronic (remodeling) ------------------------------------------
    this.remodel_active = true;
    this.remodel_tc = 86400.0; // remodeling time constant (s); default ~1 day
    this.stress_avg_tc = 300.0; // time constant of the slow wall-stress average feeding remodeling (s)
    this.k_conc = 0.01; // concentric drive per unit sustained end-systolic stress excess
    this.k_ecc = 0.02; // eccentric drive per unit sustained end-diastolic stress excess
    this.mal_conc = 0.15; // maladaptive contractility loss per unit concentric remodeling
    this.mal_ecc = 0.25; // contractility loss per unit eccentric remodeling
    this.stiff_conc = 0.5; // diastolic stiffening (el_k) per unit concentric remodeling
    this.dil_ecc = 0.4; // cavity dilation (u_vol) per unit eccentric remodeling
    this.remodel_floor = 0.3; // lowest the chronic contractility factor may reach

    // ---- setpoints (auto-calibrated when <= 0) -------------------------
    this.setpoint_warmup = 60.0; // window (s of model time) used to learn resting setpoints
    this.sigma_es_ref_lv = 0.0;
    this.sigma_ed_ref_lv = 0.0;
    this.sigma_es_ref_rv = 0.0;
    this.sigma_ed_ref_rv = 0.0;

    // ---- outputs (per ventricle) ---------------------------------------
    this.hw = 0.0; // heart weight (g)
    this.wall_stress_es_lv = 0.0;
    this.wall_stress_ed_lv = 0.0;
    this.wall_stress_es_rv = 0.0;
    this.wall_stress_ed_rv = 0.0;
    this.radius_es_lv = 0.0;
    this.radius_ed_lv = 0.0;
    this.radius_es_rv = 0.0;
    this.radius_ed_rv = 0.0;
    this.wall_thickness_lv = 0.0;
    this.wall_thickness_rv = 0.0;
    this.el_max_load_factor_lv = 1.0;
    this.el_max_load_factor_rv = 1.0;
    this.remodel_concentric_lv = 0.0;
    this.remodel_eccentric_lv = 0.0;
    this.remodel_concentric_rv = 0.0;
    this.remodel_eccentric_rv = 0.0;

    // ---- local state ---------------------------------------------------
    this._heart = null;
    this._lv = null;
    this._rv = null;
    // slow wall-stress averages feeding the remodeling integrators
    this._sigma_es_slow_lv = 0.0;
    this._sigma_ed_slow_lv = 0.0;
    this._sigma_es_slow_rv = 0.0;
    this._sigma_ed_slow_rv = 0.0;
    this._slow_init = false; // have the slow averages been seeded yet
    this._warmup_elapsed = 0.0; // model time elapsed since this model started running (s)
  }

  calc_model() {
    if (!this.hf_active) return;

    // cache references (cheap, mirrors Mob)
    this._heart = this._model_engine.models["Heart"];
    this._lv = this._model_engine.models["LV"];
    this._rv = this._model_engine.models["RV"];
    if (!this._heart) return;

    // heart weight and per-ventricle wall volumes (mL)
    this.hw = this.hw_intercept + this.hw_slope * this._model_engine.weight * 1000.0;
    const vwall_lv = this.wall_volume_lv > 0.0 ? this.wall_volume_lv : (this.hw * this.wall_frac_lv) / this.wall_density;
    const vwall_rv = this.wall_volume_rv > 0.0 ? this.wall_volume_rv : (this.hw * this.wall_frac_rv) / this.wall_density;

    // are we still learning resting setpoints? (use elapsed time since this model
    // started, NOT the absolute engine clock — scenarios are saved with a non-zero
    // model_time_total)
    this._warmup_elapsed += this._t;
    const warming_up = this._warmup_elapsed < this.setpoint_warmup;

    if (this._lv) {
      this._process_ventricle(
        this._lv, vwall_lv,
        this._heart.lv_esp, this._heart.lv_esv, this._heart.lv_edp, this._heart.lv_edv,
        "lv", warming_up
      );
    }
    if (this._rv) {
      this._process_ventricle(
        this._rv, vwall_rv,
        this._heart.rv_esp, this._heart.rv_esv, this._heart.rv_edp, this._heart.rv_edv,
        "rv", warming_up
      );
    }
  }

  // process one ventricle: compute wall stress, the acute factor, and the chronic remodeling
  _process_ventricle(chamber, vwall, esp, esv, edp, edv, tag, warming_up) {
    // --- geometry & wall stress (thin-walled sphere) ---
    const r_es = this._sphere_radius(esv);
    const r_ed = this._sphere_radius(edv);
    const h_es = this._wall_thickness(esv, vwall);
    const h_ed = this._wall_thickness(edv, vwall);

    const sigma_es = h_es > 0.0 ? (esp * r_es) / (2.0 * h_es) : 0.0;
    const sigma_ed = h_ed > 0.0 ? (edp * r_ed) / (2.0 * h_ed) : 0.0;

    // pull current setpoints for this ventricle
    let ref_es = this[`sigma_es_ref_${tag}`];
    let ref_ed = this[`sigma_ed_ref_${tag}`];

    // auto-calibrate setpoints from resting wall stress during warm-up
    if (warming_up) {
      if (ref_es <= 0.0 || sigma_es > ref_es) this[`sigma_es_ref_${tag}`] = sigma_es;
      if (ref_ed <= 0.0 || sigma_ed > ref_ed) this[`sigma_ed_ref_${tag}`] = sigma_ed;
      ref_es = this[`sigma_es_ref_${tag}`];
      ref_ed = this[`sigma_ed_ref_${tag}`];
    }

    // --- acute layer: afterload mismatch (end-systolic) + over-dilation (end-diastolic) ---
    const g_es = this[`g_es_${tag}`];
    const g_ed = this[`g_ed_${tag}`];
    const excess_es = Math.max(0.0, sigma_es - ref_es);
    const excess_ed = Math.max(0.0, sigma_ed - ref_ed);

    let target = 1.0 - (g_es * excess_es + g_ed * excess_ed);
    if (target < this.cont_floor) target = this.cont_floor;
    if (target > 1.0) target = 1.0;

    // no acute effect while learning setpoints
    if (warming_up) target = 1.0;

    // first-order lag toward the target
    let load_factor = this[`el_max_load_factor_${tag}`];
    load_factor += this._t * ((1.0 / this.cont_tc) * (target - load_factor));
    this[`el_max_load_factor_${tag}`] = load_factor;

    // --- chronic layer: remodeling driven by the slow wall-stress average ---
    if (!this._slow_init) {
      // seed the slow averages so they don't ramp from zero
      this[`_sigma_es_slow_${tag}`] = sigma_es;
      this[`_sigma_ed_slow_${tag}`] = sigma_ed;
    }
    let es_slow = this[`_sigma_es_slow_${tag}`];
    let ed_slow = this[`_sigma_ed_slow_${tag}`];
    es_slow += this._t * ((1.0 / this.stress_avg_tc) * (sigma_es - es_slow));
    ed_slow += this._t * ((1.0 / this.stress_avg_tc) * (sigma_ed - ed_slow));
    this[`_sigma_es_slow_${tag}`] = es_slow;
    this[`_sigma_ed_slow_${tag}`] = ed_slow;

    let rc = this[`remodel_concentric_${tag}`];
    let re = this[`remodel_eccentric_${tag}`];

    if (this.remodel_active && !warming_up) {
      const drive_conc = this.k_conc * Math.max(0.0, es_slow - ref_es);
      const drive_ecc = this.k_ecc * Math.max(0.0, ed_slow - ref_ed);
      rc += this._t * ((1.0 / this.remodel_tc) * (drive_conc - rc));
      re += this._t * ((1.0 / this.remodel_tc) * (drive_ecc - re));
      this[`remodel_concentric_${tag}`] = rc;
      this[`remodel_eccentric_${tag}`] = re;
    }

    // map remodeling state onto chamber factors
    let el_max_remodel = 1.0 - this.mal_conc * rc - this.mal_ecc * re;
    if (el_max_remodel < this.remodel_floor) el_max_remodel = this.remodel_floor;
    const el_k_remodel = 1.0 + this.stiff_conc * rc;
    const u_vol_remodel = 1.0 + this.dil_ecc * re;

    // --- write factors onto the chamber ---
    chamber.el_max_load_factor = load_factor;
    chamber.el_max_remodel_factor = el_max_remodel;
    chamber.el_k_remodel_factor = el_k_remodel;
    chamber.u_vol_remodel_factor = u_vol_remodel;

    // wall thickness is reported at the (larger) end-diastolic cavity for display
    if (tag === "lv") {
      this.wall_stress_es_lv = sigma_es;
      this.wall_stress_ed_lv = sigma_ed;
      this.radius_es_lv = r_es;
      this.radius_ed_lv = r_ed;
      this.wall_thickness_lv = h_ed;
    } else {
      this.wall_stress_es_rv = sigma_es;
      this.wall_stress_ed_rv = sigma_ed;
      this.radius_es_rv = r_es;
      this.radius_ed_rv = r_ed;
      this.wall_thickness_rv = h_ed;
    }

    // the slow averages are seeded after the first ventricle of the first step;
    // flag once both ventricles have been visited at least once
    this._slow_init = true;
  }

  // radius (cm) of a sphere holding cavity volume vol (given in L)
  _sphere_radius(vol_l) {
    const v = vol_l * 1000.0; // L -> mL (== cm^3)
    if (v <= 0.0) return 0.0;
    return Math.cbrt((3.0 * v) / (4.0 * Math.PI));
  }

  // wall thickness (cm) of a spherical shell: outer radius minus cavity radius
  _wall_thickness(vol_l, vwall_ml) {
    const v_cav = vol_l * 1000.0; // mL
    if (v_cav <= 0.0 || vwall_ml <= 0.0) return 0.0;
    const r_in = Math.cbrt((3.0 * v_cav) / (4.0 * Math.PI));
    const r_out = Math.cbrt((3.0 * (v_cav + vwall_ml)) / (4.0 * Math.PI));
    return r_out - r_in;
  }
}
